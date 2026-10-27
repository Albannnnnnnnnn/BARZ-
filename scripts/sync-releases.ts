// Sync des sorties récentes depuis Spotify
//
//   npm run sync:releases              → sorties des 14 derniers jours (et à venir si connues)
//   npm run sync:releases -- --reset   → vide d'abord les tables releases et artists
//
// Trois sources, de la plus précise à la plus large :
//   1. scripts/artist-watchlist.json : artistes suivis, étiquetés par genre
//   2. artistes populaires des genres que la recherche Spotify sait filtrer
//   3. nouveautés générales Spotify (tag:new), sans genre
//
// MusicBrainz a été abandonné : sa recherche par date ne sait pas distinguer "2026" de "2026-10-23"
// et plafonne à 500 résultats, ce qui remplissait la base de sorties sans rapport avec la semaine.
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const DAYS_BACK = Number(process.env.SYNC_DAYS_BACK ?? 14);
const DAYS_AHEAD = Number(process.env.SYNC_DAYS_AHEAD ?? 21);
const GENRE_SEARCH_PAGES = Number(process.env.SYNC_GENRE_PAGES ?? 3);
const RESET = process.argv.includes('--reset');

// Genres que le filtre `genre:` de la recherche d'artistes Spotify renvoie correctement
// (testé : "rap", "house", "afrobeats" ne renvoient rien d'exploitable)
const SEARCHABLE_GENRES: Record<string, string> = {
  electronic: 'electronic',
  pop: 'pop',
  rock: 'rock',
  soul: 'soul',
  rnb: 'r&b',
  jazz: 'jazz',
};

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
const SPOTIFY_CLIENT_ID = requireEnv('SPOTIFY_CLIENT_ID');
const SPOTIFY_CLIENT_SECRET = requireEnv('SPOTIFY_CLIENT_SECRET');

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

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// ============================================================
// SPOTIFY
// ============================================================
let spotifyToken: string | null = null;
let spotifyTokenExpires = 0;
let spotifyCalls = 0;

async function getSpotifyToken(): Promise<string> {
  if (spotifyToken && Date.now() < spotifyTokenExpires - 60_000) return spotifyToken;
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64')}`,
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) throw new Error(`Spotify : authentification refusée (${res.status}). Vérifie SPOTIFY_CLIENT_ID / SECRET.`);
  const data = await res.json();
  spotifyToken = data.access_token;
  spotifyTokenExpires = Date.now() + data.expires_in * 1000;
  return spotifyToken!;
}

// Les apps Spotify en mode développement ont une limite stricte sur une fenêtre glissante de 30 s :
// on espace les appels plutôt que de se faire bloquer
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
      if (retryAfter > 600) throw new Error(`Spotify bloque les requêtes pendant ${Math.round(retryAfter / 60)} min. Réessaie plus tard.`);
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

type Artist = { id: string; name: string; image: string | null; genres: Set<string> };
type Found = { album: any; genres: Set<string>; watched: boolean };

const JUNK_TITLE = /slowed|sped up|reverb|vocals only|instrumental|karaoke|8d audio|nightcore/i;

function releaseType(album: any): string | null {
  if (album.album_type === 'album') return 'album';
  if (album.album_type === 'compilation') return 'compilation';
  if (album.album_type === 'single' && album.total_tracks >= 4) return 'ep';
  return null; // les singles ne sont pas des "sorties" au sens de l'app
}

function inWindow(album: any, from: string, to: string): boolean {
  return album?.release_date_precision === 'day' && album.release_date >= from && album.release_date <= to;
}

function normalizeName(name: string): string {
  return slugify(name).replace(/-/g, '');
}

async function resolveArtist(name: string): Promise<any | null> {
  const json = await spotifyFetch(`/search?type=artist&limit=10&market=FR&q=${encodeURIComponent(`artist:"${name}"`)}`);
  const items: any[] = json?.artists?.items || [];
  return items.find((a) => normalizeName(a.name) === normalizeName(name)) ?? null;
}

async function recentAlbumsOf(artistId: string, from: string, to: string, groups: string[]): Promise<any[]> {
  const out: any[] = [];
  for (const group of groups) {
    const json = await spotifyFetch(`/artists/${artistId}/albums?include_groups=${group}&limit=10&market=FR`);
    for (const album of json?.items || []) {
      if (inWindow(album, from, to) && releaseType(album) && !JUNK_TITLE.test(album.name)) out.push(album);
    }
  }
  return out;
}

// ============================================================
// MAIN
// ============================================================
async function main() {
  const today = new Date();
  const from = isoDate(new Date(today.getTime() - DAYS_BACK * 86_400_000));
  const to = isoDate(new Date(today.getTime() + DAYS_AHEAD * 86_400_000));
  console.log(`🚀 Sync des sorties du ${from} au ${to}`);

  await getSpotifyToken();

  const artists = new Map<string, Artist>();
  const found = new Map<string, Found>();

  const rememberArtist = (a: any, genre?: string) => {
    const known = artists.get(a.id) ?? { id: a.id, name: a.name, image: a.images?.[0]?.url ?? null, genres: new Set<string>() };
    known.image ??= a.images?.[0]?.url ?? null;
    if (genre) known.genres.add(genre);
    artists.set(a.id, known);
  };
  const rememberAlbum = (album: any, genre?: string, watched = false) => {
    const entry = found.get(album.id) ?? { album, genres: new Set<string>(), watched: false };
    if (genre) entry.genres.add(genre);
    entry.watched ||= watched;
    found.set(album.id, entry);
  };

  // 1. Artistes suivis
  const watchlist = JSON.parse(readFileSync(new URL('./artist-watchlist.json', import.meta.url), 'utf8'));
  const watched = Object.entries(watchlist).filter(([key]) => !key.startsWith('_')) as [string, string[]][];
  const notFound: string[] = [];
  console.log(`⭐ Artistes suivis (${watched.reduce((n, [, names]) => n + names.length, 0)})...`);
  for (const [genre, names] of watched) {
    for (const name of names) {
      const artist = await resolveArtist(name);
      if (!artist) {
        notFound.push(name);
        continue;
      }
      rememberArtist(artist, genre);
      for (const album of await recentAlbumsOf(artist.id, from, to, ['album', 'single'])) rememberAlbum(album, genre, true);
    }
  }
  console.log(`   ${found.size} sorties trouvées`);
  if (notFound.length) console.log(`   ⚠️ Introuvables sur Spotify : ${notFound.join(', ')}`);

  // 2. Artistes populaires par genre
  console.log('🎛  Artistes populaires par genre...');
  for (const [genre, spotifyGenre] of Object.entries(SEARCHABLE_GENRES)) {
    for (let page = 0; page < GENRE_SEARCH_PAGES; page++) {
      const json = await spotifyFetch(
        `/search?type=artist&limit=10&offset=${page * 10}&market=FR&q=${encodeURIComponent(`genre:${spotifyGenre}`)}`
      );
      for (const artist of json?.artists?.items || []) {
        rememberArtist(artist, genre);
        for (const album of await recentAlbumsOf(artist.id, from, to, ['album'])) rememberAlbum(album, genre);
      }
    }
  }
  console.log(`   ${found.size} sorties au total`);

  // 3. Nouveautés générales (le genre vient de l'artiste s'il est déjà connu)
  console.log('🆕 Nouveautés Spotify...');
  for (let offset = 0; offset < 100; offset += 10) {
    const json = await spotifyFetch(`/search?type=album&limit=10&offset=${offset}&market=FR&q=tag:new`);
    const items: any[] = json?.albums?.items || [];
    if (!items.length) break;
    for (const album of items) {
      if (album && inWindow(album, from, to) && releaseType(album) && !JUNK_TITLE.test(album.name)) rememberAlbum(album);
    }
  }
  console.log(`   ${found.size} sorties au total`);
  if (found.size === 0) throw new Error('Aucune sortie trouvée : rien à enregistrer.');

  // Photos des artistes principaux qu'on n'a pas encore (ceux venant des nouveautés)
  for (const { album } of found.values()) {
    const main = album.artists[0];
    if (!artists.get(main.id)?.image) {
      const full = await spotifyFetch(`/artists/${main.id}`);
      rememberArtist(full ?? main);
    }
    const artist = artists.get(main.id)!;
    for (const g of found.get(album.id)!.genres) artist.genres.add(g);
  }

  if (RESET) {
    console.log('🧹 Suppression des anciennes sorties et artistes...');
    must(await supabase.from('releases').delete().not('id', 'is', null), 'Suppression releases');
    must(await supabase.from('artists').delete().not('id', 'is', null), 'Suppression artists');
  }

  // Enregistrement des artistes
  const usedArtistIds = new Set([...found.values()].map(({ album }) => album.artists[0].id));
  const artistRows = [...usedArtistIds].map((id) => {
    const a = artists.get(id)!;
    return {
      spotify_id: a.id,
      name: a.name,
      slug: `${slugify(a.name) || 'artiste'}-${a.id.slice(0, 6).toLowerCase()}`,
      image_url: a.image,
      genres: [...a.genres],
      updated_at: new Date().toISOString(),
    };
  });
  const artistIds = new Map<string, string>();
  for (const part of chunk(artistRows, 100)) {
    const saved = must(
      await supabase.from('artists').upsert(part, { onConflict: 'spotify_id' }).select('id, spotify_id'),
      'Enregistrement artists'
    );
    for (const a of saved ?? []) artistIds.set(a.spotify_id, a.id);
  }

  // Enregistrement des sorties
  const releaseRows = [...found.values()].map(({ album, genres, watched }) => {
    const main = album.artists[0];
    const allGenres = new Set([...genres, ...(artists.get(main.id)?.genres ?? [])]);
    return {
      spotify_id: album.id,
      title: album.name,
      slug: `${slugify(`${main.name} ${album.name}`) || 'sortie'}-${album.id.slice(0, 6).toLowerCase()}`,
      artist_id: artistIds.get(main.id) ?? null,
      release_date: album.release_date,
      release_type: releaseType(album),
      cover_url: album.images?.[0]?.url ?? null,
      genres: [...allGenres],
      track_count: album.total_tracks ?? 0,
      spotify_url: album.external_urls?.spotify ?? null,
      // watched : la sortie vient d'un artiste de la watchlist (section "Tes artistes ont sorti")
      metadata: { featuring: album.artists.slice(1).map((a: any) => a.name), watched },
      updated_at: new Date().toISOString(),
    };
  });

  let saved = 0;
  for (const part of chunk(releaseRows, 100)) {
    const rows = must(
      await supabase.from('releases').upsert(part, { onConflict: 'spotify_id' }).select('id'),
      'Enregistrement releases'
    );
    saved += rows?.length ?? 0;
  }

  const byGenre: Record<string, number> = {};
  for (const r of releaseRows) for (const g of r.genres) byGenre[g] = (byGenre[g] ?? 0) + 1;
  console.log(`
✅ Sync terminée (${spotifyCalls} appels Spotify)
   Sorties enregistrées : ${saved}
   Artistes             : ${artistIds.size}
   Par genre            : ${Object.entries(byGenre).map(([g, n]) => `${g} ${n}`).join(', ') || 'aucun'}
   Sans genre           : ${releaseRows.filter((r) => r.genres.length === 0).length}
`);
}

main().catch((err) => {
  console.error('💥 Échec du sync :', err instanceof Error ? err.message : err);
  process.exit(1);
});
