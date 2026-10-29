// Sync des sorties récentes depuis Deezer + Spotify
//
//   npm run sync:releases              → sorties des 14 derniers jours (et à venir si connues)
//   npm run sync:releases -- --reset   → vide d'abord les tables releases et artists
//
// Chaque source apporte ce qu'elle fait de mieux :
//   Deezer  : sorties de la watchlist, des artistes suivis par les membres, des artistes du catalogue
//             assez écoutés (SYNC_CATALOG_MIN_AUDIENCE) + classements par genre, avec les vrais genres,
//             le nombre de fans, le label et une pochette en grand format (sans clé d'API)
//   Spotify : sorties des artistes suivis + nouveautés, avec le lien d'écoute et la photo d'artiste
//             (appli Spotify dédiée à la synchro : voir SPOTIFY_ENABLED)
// Les doublons sont fusionnés par code-barres (UPC), à défaut par artiste + titre.
// Si une source tombe (ex. blocage Spotify), le sync continue avec l'autre.
//
// MusicBrainz a été abandonné : sa recherche par date ne sait pas distinguer "2026" de "2026-10-23"
// et plafonne à 500 résultats, ce qui remplissait la base de sorties sans rapport avec la semaine.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import {
  supabase,
  sleep,
  must,
  normalizeName,
  stableSlug,
  chunk,
  readWatchlist,
  mapGenre,
  deezerFetch,
  deezerStats,
  deezerResolveArtist,
  deezerAppGenres,
  saveArtists,
} from './lib/common';

const DAYS_BACK = Number(process.env.SYNC_DAYS_BACK ?? 14);
// 4 mois devant : les albums en pré-sortie et les annonces alimentent le calendrier "À venir"
const DAYS_AHEAD = Number(process.env.SYNC_DAYS_AHEAD ?? 120);
// Annonces MusicBrainz : seulement pour les artistes du catalogue au moins aussi suivis (filtre le bruit)
const UPCOMING_MIN_FANS = Number(process.env.SYNC_UPCOMING_MIN_FANS ?? 50_000);
const MB_USER_AGENT = process.env.MUSICBRAINZ_USER_AGENT || 'BARZ/1.0 (https://albannnnnnnnnn.github.io/BARZ-/)';
const DEEZER_CHART_SIZE = Number(process.env.SYNC_DEEZER_CHART_SIZE ?? 40);
// Requêtes Deezer en cours en même temps pour le catalogue (le débit reste plafonné dans deezerFetch)
const DEEZER_PARALLEL = Number(process.env.SYNC_DEEZER_PARALLEL ?? 6);
// Artistes du catalogue dont on suit aussi les sorties, albums et singles : au moins cette audience
// (artists.audience, moyenne Last.fm / Deezer ; environ 7 000 artistes à 30 000). Assez bas pour les artistes
// moins connus (Makala : 35 000), le tri « Populaires » garde les plus écoutés en tête.
const CATALOG_MIN_AUDIENCE = Number(process.env.SYNC_CATALOG_MIN_AUDIENCE ?? 30_000);
// Singles : toujours pour la watchlist et les artistes suivis par les membres ; pour le catalogue, à partir de cette audience
const SINGLES_MIN_AUDIENCE = Number(process.env.SYNC_SINGLES_MIN_AUDIENCE ?? 30_000);
// L'API iTunes tolère ~20 requêtes/min : on plafonne par sync (le reste passe au sync suivant)
const APPLE_LOOKUPS_PER_RUN = Number(process.env.SYNC_APPLE_LOOKUPS ?? 60);
// Spotify passe par une appli dédiée à la synchronisation (SPOTIFY_SYNC_CLIENT_ID / _SECRET), jamais par celle
// de l'écoute en direct : en mode développement, une rafale de requêtes bloque l'appli 24 h, et le blocage ne doit
// toucher que la synchro. Actif dès que ces identifiants existent ; SYNC_SPOTIFY=0 le coupe.
const SPOTIFY_ENABLED = !!process.env.SPOTIFY_SYNC_CLIENT_ID && process.env.SYNC_SPOTIFY !== '0';
const RESET = process.argv.includes('--reset');

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

const JUNK_TITLE = /slowed|sped up|reverb|vocals only|instrumental|karaoke|8d audio|nightcore/i;

// ============================================================
// SORTIE COMMUNE AUX DEUX SOURCES
// ============================================================
type Release = {
  title: string;
  artistName: string;
  date: string;
  type: string;
  cover: string | null;
  tracks: number;
  genres: Set<string>;
  watched: boolean;
  featuring: string[];
  // Invités connus de Deezer : ajoutés au catalogue pour que leur nom mène à leur fiche
  guests?: { name: string; deezerId: number; image: string | null }[];
  upc: string | null;
  artistImage: string | null;
  artistFans: number | null;
  artistDeezerId: number | null;
  spotify?: { id: string; url: string | null; artistId: string };
  deezer?: { id: number; url: string | null; fans: number | null; label: string | null };
};

function nameKey(artist: string, title: string): string {
  return `${normalizeName(artist)}|${normalizeName(title)}`;
}

// ============================================================
// DEEZER
// ============================================================
function deezerType(album: any, allowSingle = false): string | null {
  if (album.record_type === 'album') return 'album';
  if (album.record_type === 'ep') return 'ep';
  if (album.record_type === 'compile') return 'compilation';
  if (album.record_type === 'single' && allowSingle) return 'single';
  return null;
}

async function deezerAlbumDetail(id: number, watched: boolean, from: string, to: string, allowSingle = false): Promise<Release | null> {
  const a = await deezerFetch(`/album/${id}`);
  const type = a && deezerType(a, allowSingle);
  if (!a || !type || !a.release_date || a.release_date < from || a.release_date > to || JUNK_TITLE.test(a.title)) return null;
  const genres = new Set<string>();
  for (const g of a.genres?.data || []) {
    const mapped = mapGenre(g.name);
    if (mapped) genres.add(mapped);
  }
  return {
    title: a.title,
    artistName: a.artist.name,
    date: a.release_date,
    type,
    // Pré-sorties : Deezer laisse cover_xl vide mais donne l'identifiant de l'image, déjà en ligne sur son CDN
    cover: a.cover_xl ?? a.cover_big ?? (a.md5_image ? `https://cdn-images.dzcdn.net/images/cover/${a.md5_image}/1000x1000-000000-80-0-0.jpg` : null),
    tracks: a.nb_tracks ?? 0,
    genres,
    watched,
    featuring: (a.contributors || []).map((c: any) => c.name).filter((n: string) => n !== a.artist.name),
    guests: (a.contributors || [])
      .filter((c: any) => c.id && c.name && c.id !== a.artist.id)
      .map((c: any) => ({ name: c.name, deezerId: c.id, image: c.picture_xl ?? c.picture_big ?? null })),
    upc: a.upc ?? null,
    artistImage: a.artist.picture_xl ?? null,
    artistFans: null,
    artistDeezerId: a.artist.id ?? null,
    deezer: { id: a.id, url: a.link ?? null, fans: a.fans ?? null, label: a.label ?? null },
  };
}

async function collectDeezer(
  watched: [string, string[]][],
  followedIds: number[],
  catalog: Map<number, { fans: number; audience: number }>, // id Deezer → fans Deezer et audience
  from: string,
  to: string
): Promise<Release[]> {
  const out: Release[] = [];
  const seen = new Set<number>();
  const artistFans = new Map<string, number>();
  const doneArtists = new Set<number>();

  // Sorties d'un artiste dans la fenêtre de dates
  async function artistReleases(id: number, isWatched: boolean, allowSingle: boolean, genre?: string) {
    if (doneArtists.has(id)) return;
    doneArtists.add(id);
    const albums = await deezerFetch(`/artist/${id}/albums?limit=30`);
    for (const album of albums?.data || []) {
      if (seen.has(album.id) || !album.release_date || album.release_date < from || album.release_date > to) continue;
      // La liste indique déjà le type : inutile de demander le détail d'un single qu'on ne garde pas
      if (!deezerType(album, allowSingle)) continue;
      seen.add(album.id);
      const release = await deezerAlbumDetail(album.id, isWatched, from, to, allowSingle);
      if (release) {
        if (genre) release.genres.add(genre);
        out.push(release);
      }
    }
  }

  console.log('⭐ Deezer : artistes suivis...');
  const notFound: string[] = [];
  for (const [genre, names] of watched) {
    for (const name of names) {
      const artist = await deezerResolveArtist(name);
      if (!artist) {
        notFound.push(name);
        continue;
      }
      artistFans.set(normalizeName(artist.name), artist.nb_fan);
      await artistReleases(artist.id, true, true, genre);
    }
  }
  console.log(`   ${out.length} sorties`);
  if (notFound.length) console.log(`   ⚠️ Introuvables sur Deezer : ${notFound.join(', ')}`);

  // Artistes suivis par les membres : leurs sorties entrent dans BARZ¡ et sont marquées "suivies"
  if (followedIds.length) console.log(`👥 Deezer : ${followedIds.length} artistes suivis par les membres...`);
  for (const id of followedIds) await artistReleases(id, true, true);

  // Artistes du catalogue assez écoutés : leurs sorties notables, même si personne ne les suit encore
  const before = out.length;
  console.log(`📚 Deezer : ${catalog.size} artistes du catalogue (audience ≥ ${CATALOG_MIN_AUDIENCE.toLocaleString('fr-FR')})...`);
  // Plusieurs artistes à la fois : on attend surtout les réponses de Deezer, pas sa limite de débit
  // (deezerFetch espace les départs de requêtes)
  const queue = [...catalog];
  await Promise.all(
    Array.from({ length: DEEZER_PARALLEL }, async () => {
      for (let next = queue.shift(); next; next = queue.shift()) await artistReleases(next[0], false, next[1].audience >= SINGLES_MIN_AUDIENCE);
    })
  );
  console.log(`   ${out.length - before} sorties en plus`);

  console.log('📈 Deezer : classements par genre...');
  const charts = [{ id: 0, name: 'Tous' }, ...(await deezerAppGenres())];
  for (const g of charts) {
    const chart = await deezerFetch(`/chart/${g.id}/albums?limit=${DEEZER_CHART_SIZE}`);
    for (const album of chart?.data || []) {
      if (seen.has(album.id)) continue;
      seen.add(album.id);
      const release = await deezerAlbumDetail(album.id, false, from, to);
      if (release) out.push(release);
    }
  }

  for (const r of out) r.artistFans = artistFans.get(normalizeName(r.artistName)) ?? (r.artistDeezerId ? catalog.get(r.artistDeezerId)?.fans : null) ?? null;
  console.log(`   ${out.length} sorties au total (${deezerStats.calls} appels Deezer)`);
  return out;
}

// ============================================================
// SPOTIFY (limite stricte en mode développement)
// ============================================================
// Quand Spotify impose un long blocage, on note sa fin ici pour ne pas le relancer en réessayant trop tôt
const BLOCK_FILE = new URL('../.spotify-blocked-until', import.meta.url);

function spotifyBlockedUntil(): number | null {
  if (!existsSync(BLOCK_FILE)) return null;
  const until = Number(readFileSync(BLOCK_FILE, 'utf8'));
  return Date.now() < until ? until : null;
}

let spotifyToken: string | null = null;
let spotifyTokenExpires = 0;
let spotifyCalls = 0;

async function getSpotifyToken(): Promise<string> {
  if (spotifyToken && Date.now() < spotifyTokenExpires - 60_000) return spotifyToken;
  const id = process.env.SPOTIFY_SYNC_CLIENT_ID;
  const secret = process.env.SPOTIFY_SYNC_CLIENT_SECRET;
  if (!id || !secret) throw new Error('SPOTIFY_SYNC_CLIENT_ID / SPOTIFY_SYNC_CLIENT_SECRET manquants');
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`,
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) throw new Error(`authentification refusée (${res.status})`);
  const data = await res.json();
  spotifyToken = data.access_token;
  spotifyTokenExpires = Date.now() + data.expires_in * 1000;
  return spotifyToken!;
}

// On espace les appels plutôt que de se faire bloquer (fenêtre glissante de 30 s)
const SPOTIFY_MIN_INTERVAL_MS = Number(process.env.SYNC_SPOTIFY_INTERVAL_MS ?? 1000);
let lastSpotifyCall = 0;

async function spotifyFetch(endpoint: string): Promise<any | null> {
  for (let attempt = 1; attempt <= 4; attempt++) {
    const wait = lastSpotifyCall + SPOTIFY_MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastSpotifyCall = Date.now();
    spotifyCalls++;
    const res = await fetch(`https://api.spotify.com/v1${endpoint}`, {
      headers: { Authorization: `Bearer ${await getSpotifyToken()}` },
    });
    if (res.ok) return res.json();
    if (res.status === 429) {
      const retryAfter = Number(res.headers.get('Retry-After') ?? 5);
      if (retryAfter > 600) {
        writeFileSync(BLOCK_FILE, String(Date.now() + retryAfter * 1000));
        throw new Error(`Spotify bloque les requêtes pendant ${Math.round(retryAfter / 60)} min`);
      }
      console.log(`   ⏳ Spotify demande d'attendre ${retryAfter}s (après ${spotifyCalls} appels)`);
      await sleep(retryAfter * 1000);
      continue;
    }
    if (res.status === 404) return null;
    if (res.status >= 500) {
      await sleep(1000 * attempt);
      continue;
    }
    throw new Error(`Spotify ${res.status} sur ${endpoint}`);
  }
  throw new Error(`Spotify : abandon après plusieurs essais sur ${endpoint}`);
}

function spotifyType(album: any, allowSingle = false): string | null {
  if (album.album_type === 'album') return 'album';
  if (album.album_type === 'compilation') return 'compilation';
  if (album.album_type === 'single' && album.total_tracks >= 4) return 'ep';
  if (album.album_type === 'single' && allowSingle) return 'single';
  return null; // singles : seulement pour les artistes de la watchlist (voir collectSpotify)
}

function spotifyInWindow(album: any, from: string, to: string): boolean {
  return album?.release_date_precision === 'day' && album.release_date >= from && album.release_date <= to;
}

// Watchlist et artistes suivis par les membres (singles compris). knownIds : identifiants Spotify déjà en base
// (nom normalisé → id), qui évitent une recherche par artiste et donc la moitié des appels.
async function collectSpotify(watched: [string, string[]][], followedNames: string[], knownIds: Map<string, string>, from: string, to: string): Promise<Release[]> {
  const albums = new Map<string, { album: any; genre?: string; watched: boolean }>();
  const artistImages = new Map<string, string | null>();
  const watchedNames = new Set(watched.flatMap(([, names]) => names.map(normalizeName)));
  const targets = [
    ...watched.flatMap(([genre, names]) => names.map((name) => ({ name, genre, isWatched: true }))),
    ...followedNames.filter((n) => !watchedNames.has(normalizeName(n))).map((name) => ({ name, genre: undefined, isWatched: false })),
  ];

  console.log(`⭐ Spotify : ${targets.length} artistes (watchlist et suivis)...`);
  for (const { name, genre, isWatched } of targets) {
    let artistId = knownIds.get(normalizeName(name));
    if (!artistId) {
      const json = await spotifyFetch(`/search?type=artist&limit=10&market=FR&q=${encodeURIComponent(`artist:"${name}"`)}`);
      const artist = (json?.artists?.items || []).find((a: any) => normalizeName(a.name) === normalizeName(name));
      if (!artist) continue;
      artistId = artist.id as string;
      artistImages.set(artistId, artist.images?.[0]?.url ?? null);
    }
    for (const group of ['album', 'single']) {
      const list = await spotifyFetch(`/artists/${artistId}/albums?include_groups=${group}&limit=10&market=FR`);
      for (const album of list?.items || []) {
        if (spotifyInWindow(album, from, to) && spotifyType(album, true) && !JUNK_TITLE.test(album.name)) {
          albums.set(album.id, { album, genre, watched: isWatched });
        }
      }
    }
  }

  console.log('🆕 Spotify : nouveautés...');
  for (let offset = 0; offset < 100; offset += 10) {
    const json = await spotifyFetch(`/search?type=album&limit=10&offset=${offset}&market=FR&q=tag:new`);
    const items: any[] = json?.albums?.items || [];
    if (!items.length) break;
    for (const album of items) {
      if (album && !albums.has(album.id) && spotifyInWindow(album, from, to) && spotifyType(album) && !JUNK_TITLE.test(album.name)) {
        albums.set(album.id, { album, watched: false });
      }
    }
  }

  // Le code-barres (UPC) n'est que dans le détail de l'album : sert à fusionner avec Deezer
  const out: Release[] = [];
  for (const { album, genre, watched: isWatched } of albums.values()) {
    const detail = await spotifyFetch(`/albums/${album.id}?market=FR`);
    const main = album.artists[0];
    out.push({
      title: album.name,
      artistName: main.name,
      date: album.release_date,
      type: spotifyType(album, isWatched)!,
      cover: album.images?.[0]?.url ?? null,
      tracks: album.total_tracks ?? 0,
      genres: new Set(genre ? [genre] : []),
      watched: isWatched,
      featuring: album.artists.slice(1).map((a: any) => a.name),
      upc: detail?.external_ids?.upc ?? null,
      artistImage: artistImages.get(main.id) ?? null,
      artistFans: null,
      artistDeezerId: null,
      spotify: { id: album.id, url: album.external_urls?.spotify ?? null, artistId: main.id },
    });
  }
  console.log(`   ${out.length} sorties (${spotifyCalls} appels Spotify)`);
  return out;
}

// ============================================================
// MUSICBRAINZ : sorties annoncées (calendrier "À venir")
// ============================================================
// Sa recherche par date est bruitée (on l'avait écartée pour les sorties de la semaine) :
// on ne garde que les dates exactes à venir, d'artistes du catalogue avec assez de fans.
async function mbFetch(url: string): Promise<any | null> {
  for (let attempt = 1; attempt <= 5; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': MB_USER_AGENT, Accept: 'application/json' }, signal: AbortSignal.timeout(20_000) }).catch(() => null);
    await sleep(1100); // 1 requête par seconde maximum
    if (res?.ok) return res.json();
    if (res && res.status !== 503 && res.status !== 429) return null;
    await sleep(2000 * attempt);
  }
  return null;
}

async function collectMusicBrainzUpcoming(): Promise<Release[]> {
  const tomorrow = isoDate(new Date(Date.now() + 86_400_000));
  const until = isoDate(new Date(Date.now() + DAYS_AHEAD * 86_400_000));

  // Catalogue : nom normalisé → artiste (on ne garde que les artistes assez suivis)
  const catalog = new Map<string, { name: string; image_url: string | null; popularity: number; genres: string[] }>();
  for (let offset = 0; ; offset += 1000) {
    const page = must(
      await supabase.from('artists').select('name, image_url, popularity, genres').gte('popularity', UPCOMING_MIN_FANS).range(offset, offset + 999),
      'Lecture catalogue'
    ) as any[];
    for (const a of page) catalog.set(normalizeName(a.name), a);
    if (page.length < 1000) break;
  }

  const query = encodeURIComponent(`firstreleasedate:[${tomorrow} TO ${until}] AND (primarytype:album OR primarytype:ep)`);
  const out: Release[] = [];
  // La recherche MusicBrainz plafonne à 500 résultats
  for (let offset = 0; offset < 500; offset += 100) {
    const json = await mbFetch(`https://musicbrainz.org/ws/2/release-group?fmt=json&limit=100&offset=${offset}&query=${query}`);
    if (!json) break;
    for (const rg of json['release-groups'] || []) {
      const date: string = rg['first-release-date'] || '';
      const artistName: string | undefined = rg['artist-credit']?.[0]?.name;
      if (date.length !== 10 || date < tomorrow || !artistName) continue;
      const artist = catalog.get(normalizeName(artistName));
      if (!artist) continue;
      const type = rg['primary-type'] === 'EP' ? 'ep' : 'album';
      if ((rg['secondary-types'] || []).some((t: string) => ['Live', 'Compilation', 'Interview', 'Audiobook', 'Spokenword'].includes(t))) continue;
      // Pochette déjà déposée sur Cover Art Archive ? (rare pour une annonce, mais ça arrive)
      const coverUrl = `https://coverartarchive.org/release-group/${rg.id}/front-500`;
      const cover = await fetch(coverUrl, { method: 'HEAD', signal: AbortSignal.timeout(10_000) }).then((r) => (r.ok ? coverUrl : null)).catch(() => null);
      out.push({
        title: rg.title,
        artistName: artist.name,
        date,
        type,
        cover,
        tracks: 0,
        genres: new Set(artist.genres ?? []),
        watched: false,
        featuring: [],
        upc: null,
        artistImage: artist.image_url,
        artistFans: artist.popularity,
        artistDeezerId: null,
      });
    }
    if (offset + 100 >= (json.count ?? 0)) break;
  }
  console.log(`📅 MusicBrainz : ${out.length} sorties annoncées (artistes du catalogue à plus de ${UPCOMING_MIN_FANS.toLocaleString('fr-FR')} fans)`);
  return out;
}

// ============================================================
// FUSION
// ============================================================
// Deezer d'abord (genres, fans, grande pochette), puis Spotify, puis les annonces MusicBrainz
function merge(deezer: Release[], spotify: Release[], announced: Release[] = []): Release[] {
  const byUpc = new Map<string, Release>();
  const byName = new Map<string, Release>();
  const all: Release[] = [];

  const add = (r: Release) => {
    const existing = (r.upc && byUpc.get(r.upc)) || byName.get(nameKey(r.artistName, r.title));
    if (!existing) {
      all.push(r);
      if (r.upc) byUpc.set(r.upc, r);
      byName.set(nameKey(r.artistName, r.title), r);
      return;
    }
    existing.spotify ??= r.spotify;
    existing.deezer ??= r.deezer;
    existing.upc ??= r.upc;
    existing.cover ??= r.cover;
    // Les photos d'artiste Spotify sont de meilleure qualité
    existing.artistImage = r.spotify && r.artistImage ? r.artistImage : existing.artistImage ?? r.artistImage;
    existing.watched ||= r.watched;
    for (const g of r.genres) existing.genres.add(g);
    if (!existing.featuring.length) existing.featuring = r.featuring;
    if (!existing.guests?.length) existing.guests = r.guests;
  };

  deezer.forEach(add);
  spotify.forEach(add);
  announced.forEach(add);
  return all;
}

// ============================================================
// MAIN
// ============================================================
async function main() {
  const today = new Date();
  const from = isoDate(new Date(today.getTime() - DAYS_BACK * 86_400_000));
  const to = isoDate(new Date(today.getTime() + DAYS_AHEAD * 86_400_000));
  console.log(`🚀 Sync des sorties du ${from} au ${to}`);
  // Deezer met les sorties en ligne à minuit selon le pays de la requête : on note celui du serveur et l'heure de départ
  const infos = await deezerFetch('/infos');
  console.log(`🌍 Deezer voit ce serveur en ${infos?.country ?? '?'} (${infos?.country_iso ?? '?'}), départ à ${today.toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })} (heure de Paris)`);

  const watched = readWatchlist();
  // Artistes suivis par au moins un membre (table follows de supabase/discovery.sql, absente avant)
  const followsRes = await supabase.from('follows').select('artist:artists(deezer_id, name)');
  const followedIds = followsRes.error
    ? []
    : [...new Set((followsRes.data as any[]).map((f) => f.artist?.deezer_id).filter((id): id is number => !!id))];
  const followedNames = followsRes.error ? [] : [...new Set((followsRes.data as any[]).map((f) => f.artist?.name).filter((n): n is string => !!n))];

  // Artistes du catalogue au-dessus du seuil d'audience (par pages de 1 000, plafond de PostgREST)
  const catalog = new Map<number, { fans: number; audience: number }>();
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase
      .from('artists')
      .select('deezer_id, popularity, audience')
      .not('deezer_id', 'is', null)
      .gte('audience', CATALOG_MIN_AUDIENCE)
      .order('audience', { ascending: false })
      .range(offset, offset + 999);
    if (error || !data?.length) break;
    for (const a of data as { deezer_id: number; popularity: number | null; audience: number }[]) catalog.set(a.deezer_id, { fans: a.popularity ?? 0, audience: a.audience });
    if (data.length < 1000) break;
  }

  // Chaque source peut échouer sans emporter l'autre
  let deezer: Release[] = [];
  try {
    deezer = await collectDeezer(watched, followedIds, catalog, from, to);
  } catch (err) {
    console.warn(`⚠️ Deezer indisponible : ${err instanceof Error ? err.message : err}`);
  }

  let spotify: Release[] = [];
  const blockedUntil = spotifyBlockedUntil();
  if (!SPOTIFY_ENABLED) {
    console.log('⏭️  Spotify ignoré : pas d’appli Spotify de synchronisation (SPOTIFY_SYNC_CLIENT_ID).');
  } else if (blockedUntil) {
    const at = new Date(blockedUntil).toLocaleString('fr-FR', { weekday: 'long', hour: '2-digit', minute: '2-digit' });
    console.warn(`⚠️ Spotify ignoré : l'app est bloquée jusqu'à ${at} environ.`);
  } else {
    try {
      const known = must(await supabase.from('artists').select('name, spotify_id').not('spotify_id', 'is', null), 'Lecture spotify_id') as { name: string; spotify_id: string }[];
      spotify = await collectSpotify(watched, followedNames, new Map(known.map((a) => [normalizeName(a.name), a.spotify_id])), from, to);
    } catch (err) {
      console.warn(`⚠️ Spotify indisponible, on continue sans : ${err instanceof Error ? err.message : err}`);
    }
  }

  let announced: Release[] = [];
  try {
    announced = await collectMusicBrainzUpcoming();
  } catch (err) {
    console.warn(`⚠️ Annonces MusicBrainz indisponibles : ${err instanceof Error ? err.message : err}`);
  }

  const releases = merge(deezer, spotify, announced);
  if (releases.length === 0) throw new Error('Aucune sortie trouvée (Deezer et Spotify) : rien à enregistrer.');

  if (RESET) {
    // Supprimer les sorties effacerait aussi les Barz, spin lists et écoutés qui y sont liés
    for (const table of ['barz', 'spin_list', 'listened', 'follows', 'lastfm_artists']) {
      const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true });
      if (!error && (count ?? 0) > 0) {
        throw new Error(`--reset refusé : la table ${table} contient ${count} ligne(s) d'utilisateurs, qui seraient supprimées. Lance le sync sans --reset.`);
      }
    }
    console.log('🧹 Suppression des anciennes sorties et artistes...');
    must(await supabase.from('releases').delete().not('id', 'is', null), 'Suppression releases');
    must(await supabase.from('artists').delete().not('id', 'is', null), 'Suppression artists');
  }

  // Artistes : une ligne par nom (slug), fusionnée avec ce que le catalogue connaît déjà.
  // Les invités (feat.) aussi, sans genre (celui de la sortie n'est pas forcément le leur)
  const artistIds = await saveArtists([
    ...releases.map((r) => ({
      name: r.artistName,
      deezer_id: r.artistDeezerId,
      spotify_id: r.spotify?.artistId ?? null,
      image_url: r.artistImage,
      popularity: r.artistFans,
      genres: [...r.genres],
    })),
    ...releases.flatMap((r) => (r.guests ?? []).map((g) => ({ name: g.name, deezer_id: g.deezerId, image_url: g.image, genres: [] as string[] }))),
  ]);

  // Sorties : slug stable (artiste + titre + année) pour que Deezer et Spotify mettent à jour la même ligne
  const releaseRows = releases.map((r) => ({
    title: r.title,
    slug: stableSlug(`${r.artistName} ${r.title}`, r.date.slice(0, 4)),
    artist_id: artistIds.get(stableSlug(r.artistName)) ?? null,
    release_date: r.date,
    release_type: r.type,
    cover_url: r.cover,
    genres: [...r.genres],
    track_count: r.tracks,
    spotify_id: r.spotify?.id ?? null,
    spotify_url: r.spotify?.url ?? null,
    deezer_url: r.deezer?.url ?? null,
    // watched : la sortie vient d'un artiste de la watchlist (section "Tes artistes ont sorti")
    metadata: {
      featuring: r.featuring,
      watched: r.watched,
      fans: r.deezer?.fans ?? null,
      label: r.deezer?.label ?? null,
      upc: r.upc as string | null,
      sources: [r.deezer && 'deezer', r.spotify && 'spotify', !r.deezer && !r.spotify && 'musicbrainz'].filter(Boolean),
    },
    updated_at: new Date().toISOString(),
  }));

  // Deux sorties différentes peuvent produire le même slug : on garde la première
  const uniqueRows: (typeof releaseRows[number] & { apple_music_url?: string | null })[] = [...new Map(releaseRows.map((r) => [r.slug, r])).values()];

  // On ne perd jamais un lien déjà trouvé : un sync où Spotify est bloqué ne doit pas effacer
  // les liens Spotify de la veille (l'upsert réécrit toute la ligne)
  const existing = new Map<string, any>();
  for (const part of chunk(uniqueRows.map((r) => r.slug), 200)) {
    const rows = must(
      await supabase.from('releases').select('slug, spotify_id, spotify_url, deezer_url, apple_music_url, cover_url, genres, metadata').in('slug', part),
      'Lecture releases existantes'
    ) as any[];
    for (const row of rows) existing.set(row.slug, row);
  }
  for (const row of uniqueRows) {
    const old = existing.get(row.slug);
    if (!old) continue;
    row.spotify_id ??= old.spotify_id;
    row.spotify_url ??= old.spotify_url;
    row.deezer_url ??= old.deezer_url;
    row.cover_url ??= old.cover_url;
    row.apple_music_url = old.apple_music_url;
    row.genres = [...new Set([...row.genres, ...(old.genres ?? [])])];
    row.metadata.upc ??= old.metadata?.upc ?? null;
    row.metadata.watched ||= !!old.metadata?.watched;
  }

  // Apple Music : recherche par code-barres (API iTunes, gratuite et sans clé ; ~20 requêtes/min)
  const toLookup = uniqueRows.filter((r) => !r.apple_music_url && r.metadata.upc).slice(0, APPLE_LOOKUPS_PER_RUN);
  if (toLookup.length) console.log(`🍎 Apple Music : ${toLookup.length} sorties à rapprocher...`);
  let appleFound = 0;
  for (const row of toLookup) {
    try {
      const res = await fetch(`https://itunes.apple.com/lookup?country=FR&entity=album&upc=${encodeURIComponent(row.metadata.upc!)}`, {
        headers: { 'User-Agent': 'BARZ/1.0' },
        signal: AbortSignal.timeout(15_000),
      });
      const album = res.ok ? (await res.json())?.results?.find((x: any) => x.wrapperType === 'collection') : null;
      if (album?.collectionViewUrl) {
        row.apple_music_url = String(album.collectionViewUrl).split('?')[0];
        appleFound++;
      }
    } catch {
      // Apple indisponible : on réessaiera au prochain sync
    }
    await sleep(3200);
  }

  let saved = 0;
  for (const part of chunk(uniqueRows, 100)) {
    const rows = must(await supabase.from('releases').upsert(part, { onConflict: 'slug' }).select('id'), 'Enregistrement releases');
    saved += rows?.length ?? 0;
  }

  const both = releases.filter((r) => r.deezer && r.spotify).length;
  const byGenre: Record<string, number> = {};
  for (const r of uniqueRows) for (const g of r.genres) byGenre[g] = (byGenre[g] ?? 0) + 1;
  console.log(`
✅ Sync terminée
   Sorties enregistrées : ${saved}  (Deezer ${deezer.length}, Spotify ${spotify.length}, trouvées sur les deux ${both})
   Apple Music          : ${appleFound} nouveau(x) lien(s)
   Artistes             : ${artistIds.size}
   Par genre            : ${Object.entries(byGenre).map(([g, n]) => `${g} ${n}`).join(', ') || 'aucun'}
   Sans genre           : ${uniqueRows.filter((r) => r.genres.length === 0).length}
`);
}

main().catch((err) => {
  console.error('💥 Échec du sync :', err instanceof Error ? err.message : err);
  process.exit(1);
});
