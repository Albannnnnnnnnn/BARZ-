// Sync des sorties récentes depuis Deezer + Spotify
//
//   npm run sync:releases              → sorties des 14 derniers jours (et à venir si connues)
//   npm run sync:releases -- --reset   → vide d'abord les tables releases et artists
//
// Chaque source apporte ce qu'elle fait de mieux :
//   Deezer  : sorties des artistes suivis + classements par genre, avec les vrais genres,
//             le nombre de fans, le label et une pochette en grand format (sans clé d'API)
//   Spotify : sorties des artistes suivis + nouveautés, avec le lien d'écoute et la photo d'artiste
// Les doublons sont fusionnés par code-barres (UPC), à défaut par artiste + titre.
// Si une source tombe (ex. blocage Spotify), le sync continue avec l'autre.
//
// MusicBrainz a été abandonné : sa recherche par date ne sait pas distinguer "2026" de "2026-10-23"
// et plafonne à 500 résultats, ce qui remplissait la base de sorties sans rapport avec la semaine.
import 'dotenv/config';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const DAYS_BACK = Number(process.env.SYNC_DAYS_BACK ?? 14);
const DAYS_AHEAD = Number(process.env.SYNC_DAYS_AHEAD ?? 21);
const DEEZER_CHART_SIZE = Number(process.env.SYNC_DEEZER_CHART_SIZE ?? 40);
const RESET = process.argv.includes('--reset');

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`❌ Variable d'environnement manquante : ${name}`);
    process.exit(1);
  }
  return value;
}

const supabase = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_KEY'), {
  auth: { persistSession: false },
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const isoDate = (d: Date) => d.toISOString().slice(0, 10);

// supabase-js renvoie les erreurs au lieu de les lever : on les lève pour ne plus rien perdre en silence
function must<T>(res: { data: T; error: { message: string } | null }, context: string): T {
  if (res.error) throw new Error(`${context} : ${res.error.message}`);
  return res.data;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

// Comparaison tolérante (accents, casse, ponctuation) ; garde les titres non latins tels quels
function normalizeName(text: string): string {
  return slugify(text).replace(/-/g, '') || text.toLowerCase().replace(/\s+/g, '');
}

// Slug stable quelle que soit la source : même sortie → même ligne en base
function stableSlug(text: string, suffix = ''): string {
  const base = slugify(text) || createHash('sha1').update(text).digest('hex').slice(0, 10);
  return suffix ? `${base}-${suffix}` : base;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

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
  upc: string | null;
  artistImage: string | null;
  artistFans: number | null;
  spotify?: { id: string; url: string | null; artistId: string };
  deezer?: { id: number; url: string | null; fans: number | null; label: string | null };
};

function nameKey(artist: string, title: string): string {
  return `${normalizeName(artist)}|${normalizeName(title)}`;
}

// ============================================================
// GENRES (noms Deezer → genres de l'app)
// ============================================================
const GENRE_RULES: [string, RegExp][] = [
  ['rap', /rap|hip.?hop/],
  ['rnb', /r&b/],
  ['soul', /soul|funk|blues/],
  ['electronic', /electro|dance/],
  ['jazz', /jazz/],
  ['metal', /metal/],
  ['rock', /rock|alternative/],
  ['pop', /pop|chanson fran/],
  ['folk', /folk|country/],
  ['classical', /classique/],
  ['reggae', /reggae/],
  ['latin', /latino|br[ée]silienne/],
  ['world', /africaine|arabe|asiatique|indienne/],
];

function mapGenre(name: string): string | null {
  const lower = name.toLowerCase();
  return GENRE_RULES.find(([, re]) => re.test(lower))?.[0] ?? null;
}

// ============================================================
// DEEZER (pas de clé ; limite d'environ 50 requêtes / 5 s)
// ============================================================
const DEEZER_MIN_INTERVAL_MS = 130;
let lastDeezerCall = 0;
let deezerCalls = 0;

async function deezerFetch(endpoint: string): Promise<any | null> {
  for (let attempt = 1; attempt <= 5; attempt++) {
    const wait = lastDeezerCall + DEEZER_MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastDeezerCall = Date.now();
    deezerCalls++;
    const res = await fetch(`https://api.deezer.com${endpoint}`);
    if (res.status >= 500) {
      await sleep(1000 * attempt);
      continue;
    }
    const json = await res.json().catch(() => null);
    // Deezer répond 200 même en cas d'erreur : le détail est dans json.error
    if (json?.error) {
      if (json.error.code === 4) {
        await sleep(5000); // quota dépassé
        continue;
      }
      return null; // ressource introuvable, etc.
    }
    return json;
  }
  throw new Error(`Deezer : abandon après plusieurs essais sur ${endpoint}`);
}

function deezerType(album: any): string | null {
  if (album.record_type === 'album') return 'album';
  if (album.record_type === 'ep') return 'ep';
  if (album.record_type === 'compile') return 'compilation';
  return null;
}

async function deezerResolveArtist(name: string): Promise<any | null> {
  const json = await deezerFetch(`/search/artist?limit=25&q=${encodeURIComponent(name)}`);
  // La recherche Deezer renvoie beaucoup d'homonymes : on garde le nom exact le plus suivi
  const exact = (json?.data || []).filter((a: any) => normalizeName(a.name) === normalizeName(name));
  return exact.sort((a: any, b: any) => b.nb_fan - a.nb_fan)[0] ?? null;
}

async function deezerAlbumDetail(id: number, watched: boolean, from: string, to: string): Promise<Release | null> {
  const a = await deezerFetch(`/album/${id}`);
  const type = a && deezerType(a);
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
    cover: a.cover_xl ?? a.cover_big ?? null,
    tracks: a.nb_tracks ?? 0,
    genres,
    watched,
    featuring: (a.contributors || []).map((c: any) => c.name).filter((n: string) => n !== a.artist.name),
    upc: a.upc ?? null,
    artistImage: a.artist.picture_xl ?? null,
    artistFans: null,
    deezer: { id: a.id, url: a.link ?? null, fans: a.fans ?? null, label: a.label ?? null },
  };
}

async function collectDeezer(watched: [string, string[]][], from: string, to: string): Promise<Release[]> {
  const out: Release[] = [];
  const seen = new Set<number>();
  const artistFans = new Map<string, number>();

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
      const albums = await deezerFetch(`/artist/${artist.id}/albums?limit=30`);
      for (const album of albums?.data || []) {
        if (seen.has(album.id) || !album.release_date || album.release_date < from || album.release_date > to) continue;
        seen.add(album.id);
        const release = await deezerAlbumDetail(album.id, true, from, to);
        if (release) {
          release.genres.add(genre);
          out.push(release);
        }
      }
    }
  }
  console.log(`   ${out.length} sorties`);
  if (notFound.length) console.log(`   ⚠️ Introuvables sur Deezer : ${notFound.join(', ')}`);

  console.log('📈 Deezer : classements par genre...');
  const genres = (await deezerFetch('/genre'))?.data || [];
  const charts = [{ id: 0, name: 'Tous' }, ...genres.filter((g: any) => mapGenre(g.name))];
  for (const g of charts) {
    const chart = await deezerFetch(`/chart/${g.id}/albums?limit=${DEEZER_CHART_SIZE}`);
    for (const album of chart?.data || []) {
      if (seen.has(album.id)) continue;
      seen.add(album.id);
      const release = await deezerAlbumDetail(album.id, false, from, to);
      if (release) out.push(release);
    }
  }

  for (const r of out) r.artistFans = artistFans.get(normalizeName(r.artistName)) ?? null;
  console.log(`   ${out.length} sorties au total (${deezerCalls} appels Deezer)`);
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
  const id = process.env.SPOTIFY_CLIENT_ID;
  const secret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!id || !secret) throw new Error('SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET manquants');
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
const SPOTIFY_MIN_INTERVAL_MS = Number(process.env.SYNC_SPOTIFY_INTERVAL_MS ?? 600);
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

function spotifyType(album: any): string | null {
  if (album.album_type === 'album') return 'album';
  if (album.album_type === 'compilation') return 'compilation';
  if (album.album_type === 'single' && album.total_tracks >= 4) return 'ep';
  return null; // les singles ne sont pas des "sorties" au sens de l'app
}

function spotifyInWindow(album: any, from: string, to: string): boolean {
  return album?.release_date_precision === 'day' && album.release_date >= from && album.release_date <= to;
}

async function collectSpotify(watched: [string, string[]][], from: string, to: string): Promise<Release[]> {
  const albums = new Map<string, { album: any; genre?: string; watched: boolean }>();
  const artistImages = new Map<string, string | null>();

  console.log('⭐ Spotify : artistes suivis...');
  for (const [genre, names] of watched) {
    for (const name of names) {
      const json = await spotifyFetch(`/search?type=artist&limit=10&market=FR&q=${encodeURIComponent(`artist:"${name}"`)}`);
      const artist = (json?.artists?.items || []).find((a: any) => normalizeName(a.name) === normalizeName(name));
      if (!artist) continue;
      artistImages.set(artist.id, artist.images?.[0]?.url ?? null);
      for (const group of ['album', 'single']) {
        const list = await spotifyFetch(`/artists/${artist.id}/albums?include_groups=${group}&limit=10&market=FR`);
        for (const album of list?.items || []) {
          if (spotifyInWindow(album, from, to) && spotifyType(album) && !JUNK_TITLE.test(album.name)) {
            albums.set(album.id, { album, genre, watched: true });
          }
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
      type: spotifyType(album)!,
      cover: album.images?.[0]?.url ?? null,
      tracks: album.total_tracks ?? 0,
      genres: new Set(genre ? [genre] : []),
      watched: isWatched,
      featuring: album.artists.slice(1).map((a: any) => a.name),
      upc: detail?.external_ids?.upc ?? null,
      artistImage: artistImages.get(main.id) ?? null,
      artistFans: null,
      spotify: { id: album.id, url: album.external_urls?.spotify ?? null, artistId: main.id },
    });
  }
  console.log(`   ${out.length} sorties (${spotifyCalls} appels Spotify)`);
  return out;
}

// ============================================================
// FUSION
// ============================================================
// Deezer d'abord (genres, fans, grande pochette), puis Spotify complète ou ajoute
function merge(deezer: Release[], spotify: Release[]): Release[] {
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
  };

  deezer.forEach(add);
  spotify.forEach(add);
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

  const watchlist = JSON.parse(readFileSync(new URL('./artist-watchlist.json', import.meta.url), 'utf8'));
  const watched = Object.entries(watchlist).filter(([key]) => !key.startsWith('_')) as [string, string[]][];

  // Chaque source peut échouer sans emporter l'autre
  let deezer: Release[] = [];
  try {
    deezer = await collectDeezer(watched, from, to);
  } catch (err) {
    console.warn(`⚠️ Deezer indisponible : ${err instanceof Error ? err.message : err}`);
  }

  let spotify: Release[] = [];
  const blockedUntil = spotifyBlockedUntil();
  if (blockedUntil) {
    const at = new Date(blockedUntil).toLocaleString('fr-FR', { weekday: 'long', hour: '2-digit', minute: '2-digit' });
    console.warn(`⚠️ Spotify ignoré : l'app est bloquée jusqu'à ${at} environ.`);
  } else {
    try {
      spotify = await collectSpotify(watched, from, to);
    } catch (err) {
      console.warn(`⚠️ Spotify indisponible, on continue sans : ${err instanceof Error ? err.message : err}`);
    }
  }

  const releases = merge(deezer, spotify);
  if (releases.length === 0) throw new Error('Aucune sortie trouvée (Deezer et Spotify) : rien à enregistrer.');

  if (RESET) {
    // Supprimer les sorties effacerait aussi les Barz, spin lists et écoutés qui y sont liés
    for (const table of ['barz', 'spin_list', 'listened']) {
      const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true });
      if (!error && (count ?? 0) > 0) {
        throw new Error(`--reset refusé : la table ${table} contient ${count} ligne(s) d'utilisateurs, qui seraient supprimées. Lance le sync sans --reset.`);
      }
    }
    console.log('🧹 Suppression des anciennes sorties et artistes...');
    must(await supabase.from('releases').delete().not('id', 'is', null), 'Suppression releases');
    must(await supabase.from('artists').delete().not('id', 'is', null), 'Suppression artists');
  }

  // Artistes : une ligne par nom (slug), quelle que soit la source
  const artistRows = new Map<string, any>();
  for (const r of releases) {
    const slug = stableSlug(r.artistName);
    const row = artistRows.get(slug) ?? { slug, name: r.artistName, genres: [] as string[], image_url: null, spotify_id: null, popularity: 0 };
    row.image_url ??= r.artistImage;
    row.spotify_id ??= r.spotify?.artistId ?? null;
    row.popularity = Math.max(row.popularity, r.artistFans ?? 0);
    row.genres = [...new Set([...row.genres, ...r.genres])];
    row.updated_at = new Date().toISOString();
    artistRows.set(slug, row);
  }
  const artistIds = new Map<string, string>();
  for (const part of chunk([...artistRows.values()], 100)) {
    const saved = must(await supabase.from('artists').upsert(part, { onConflict: 'slug' }).select('id, slug'), 'Enregistrement artists');
    for (const a of saved ?? []) artistIds.set(a.slug, a.id);
  }

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
      upc: r.upc,
      sources: [r.deezer && 'deezer', r.spotify && 'spotify'].filter(Boolean),
    },
    updated_at: new Date().toISOString(),
  }));

  // Deux sorties différentes peuvent produire le même slug : on garde la première
  const uniqueRows = [...new Map(releaseRows.map((r) => [r.slug, r])).values()];
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
   Artistes             : ${artistIds.size}
   Par genre            : ${Object.entries(byGenre).map(([g, n]) => `${g} ${n}`).join(', ') || 'aucun'}
   Sans genre           : ${uniqueRows.filter((r) => r.genres.length === 0).length}
`);
}

main().catch((err) => {
  console.error('💥 Échec du sync :', err instanceof Error ? err.message : err);
  process.exit(1);
});
