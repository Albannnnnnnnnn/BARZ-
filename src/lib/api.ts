// API Wrappers pour MusicBrainz, Last.fm, Spotify Web API

import { z } from 'zod';

// ============================================================
// MUSIC BRAINZ
// ============================================================

const MB_BASE = 'https://musicbrainz.org/ws/2';
const MB_UA = import.meta.env.MUSICBRAINZ_USER_AGENT || 'BARZ/1.0';

async function mbFetch<T>(endpoint: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`${MB_BASE}${endpoint}`);
  url.searchParams.set('fmt', 'json');
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const res = await fetch(url.toString(), {
    headers: { 'User-Agent': MB_UA, Accept: 'application/json' },
  });

  if (!res.ok) {
    throw new Error(`MusicBrainz ${res.status}: ${await res.text()}`);
  }

  // Rate limit: 1 req/sec
  await new Promise(r => setTimeout(r, 1100));
  return res.json();
}

// Release Group search pour les sorties à venir
export const MBReleaseGroupSchema = z.object({
  id: z.string(),
  title: z.string(),
  'first-release-date': z.string().optional(),
  'primary-type': z.enum(['Album', 'EP', 'Single', 'Compilation', 'Soundtrack', 'Remix', 'Live', 'Other']).optional(),
  'secondary-types': z.array(z.string()).optional(),
  'artist-credit': z.array(z.object({
    artist: z.object({
      id: z.string(),
      name: z.string(),
    }),
  })),
  releases: z.array(z.object({
    id: z.string(),
    'cover-art-archive': z.object({ artwork: z.boolean() }).optional(),
  })).optional(),
  tags: z.array(z.object({ name: z.string(), count: z.number() })).optional(),
});

export type MBReleaseGroup = z.infer<typeof MBReleaseGroupSchema>;

export async function searchUpcomingReleaseGroups(
  startDate: string,
  endDate: string,
  limit = 100
): Promise<MBReleaseGroup[]> {
  // MusicBrainz ne supporte pas de filtre par date directement sur release-group
  // On utilise une recherche large et on filtre côté client
  // Alternative: utiliser l'API de recherche avec date range sur releases puis grouper
  const query = `primarytype:album OR primarytype:ep OR primarytype:single`;
  const data = await mbFetch<{ 'release-groups': MBReleaseGroup[]; count: number }>('/release-group', {
    query,
    limit: String(limit),
    offset: '0',
  });
  return data['release-groups'] || [];
}

// Récupérer les détails d'un Release Group avec ses artistes
export async function getReleaseGroupDetails(mbid: string): Promise<MBReleaseGroup | null> {
  try {
    return await mbFetch<MBReleaseGroup>(`/release-group/${mbid}`, {
      inc: 'artists+releases+tags+labels',
    });
  } catch {
    return null;
  }
}

// Récupérer l'image de couverture via Cover Art Archive
export async function getCoverArtUrl(releaseMbid: string): Promise<string | null> {
  try {
    const data = await fetch(`https://coverartarchive.org/release/${releaseMbid}/front`, {
      headers: { 'User-Agent': MB_UA },
      redirect: 'manual',
    });
    if (data.status === 302 || data.status === 200) {
      return data.headers.get('location') || `https://coverartarchive.org/release/${releaseMbid}/front-250.jpg`;
    }
  } catch {
    // ignore
  }
  return null;
}

// Rechercher un artiste par nom
export async function searchArtist(name: string): Promise<{ id: string; name: string } | null> {
  const data = await mbFetch<{ artists: Array<{ id: string; name: string }> }>('/artist', {
    query: `artist:"${name}"`,
    limit: '1',
  });
  return data.artists?.[0] || null;
}

// ============================================================
// LAST.FM
// ============================================================

const LF_BASE = 'https://ws.audioscrobbler.com/2.0/';
const LF_KEY = import.meta.env.LASTFM_API_KEY;

async function lfFetch<T>(method: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(LF_BASE);
  url.searchParams.set('method', method);
  url.searchParams.set('api_key', LF_KEY || '');
  url.searchParams.set('format', 'json');
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Last.fm ${res.status}: ${await res.text()}`);
  return res.json();
}

// Obtenir les tags/top genres d'un artiste
export async function getArtistTags(artistName: string): Promise<string[]> {
  try {
    const data = await lfFetch<{ toptags: { tag: Array<{ name: string; count: number }> } }>(
      'artist.gettoptags',
      { artist: artistName, autocorrect: '1' }
    );
    return data.toptags?.tag?.slice(0, 5).map(t => t.name.toLowerCase()) || [];
  } catch {
    return [];
  }
}

// Obtenir les tags d'un album
export async function getAlbumTags(artistName: string, albumName: string): Promise<string[]> {
  try {
    const data = await lfFetch<{ toptags: { tag: Array<{ name: string; count: number }> } }>(
      'album.gettoptags',
      { artist: artistName, album: albumName, autocorrect: '1' }
    );
    return data.toptags?.tag?.slice(0, 5).map(t => t.name.toLowerCase()) || [];
  } catch {
    return [];
  }
}

// Obtenir la popularité (listeners) d'un artiste
export async function getArtistInfo(artistName: string): Promise<{ listeners: number; playcount: number } | null> {
  try {
    const data = await lfFetch<{ artist: { stats: { listeners: string; playcount: string } } }>(
      'artist.getinfo',
      { artist: artistName, autocorrect: '1' }
    );
    return {
      listeners: parseInt(data.artist?.stats?.listeners || '0'),
      playcount: parseInt(data.artist?.stats?.playcount || '0'),
    };
  } catch {
    return null;
  }
}

// ============================================================
// SPOTIFY WEB API (Client Credentials Flow)
// ============================================================

const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';
const SPOTIFY_API_BASE = 'https://api.spotify.com/v1';

let spotifyToken: { access_token: string; expires_at: number } | null = null;

async function getSpotifyToken(): Promise<string | null> {
  const clientId = import.meta.env.SPOTIFY_CLIENT_ID;
  const clientSecret = import.meta.env.SPOTIFY_CLIENT_SECRET;

  if (!clientId || !clientSecret) return null;

  if (spotifyToken && Date.now() < spotifyToken.expires_at - 60000) {
    return spotifyToken.access_token;
  }

  const res = await fetch(SPOTIFY_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
    },
    body: 'grant_type=client_credentials',
  });

  if (!res.ok) {
    console.error('Spotify token error:', await res.text());
    return null;
  }

  const data = await res.json();
  spotifyToken = {
    access_token: data.access_token,
    expires_at: Date.now() + data.expires_in * 1000,
  };
  return spotifyToken.access_token;
}

async function spotifyFetch<T>(endpoint: string): Promise<T | null> {
  const token = await getSpotifyToken();
  if (!token) return null;

  const res = await fetch(`${SPOTIFY_API_BASE}${endpoint}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.status === 429) {
    // Rate limited
    const retryAfter = parseInt(res.headers.get('retry-after') || '1');
    await new Promise(r => setTimeout(r, retryAfter * 1000));
    return spotifyFetch(endpoint);
  }

  if (!res.ok) {
    console.error(`Spotify ${res.status} ${endpoint}:`, await res.text());
    return null;
  }

  return res.json();
}

// Rechercher un album sur Spotify
export async function searchSpotifyAlbum(artistName: string, albumName: string) {
  const query = encodeURIComponent(`album:"${albumName}" artist:"${artistName}"`);
  return spotifyFetch<{ albums: { items: SpotifyAlbum[] } }>(`/search?q=${query}&type=album&limit=1`);
}

// Types Spotify
export interface SpotifyAlbum {
  id: string;
  name: string;
  release_date: string;
  release_date_precision: string;
  total_tracks: number;
  images: Array<{ url: string; height: number; width: number }>;
  external_urls: { spotify: string };
  artists: Array<{ id: string; name: string }>;
  album_type: 'album' | 'single' | 'compilation';
  tracks?: { items: SpotifyTrack[] };
}

export interface SpotifyTrack {
  id: string;
  name: string;
  duration_ms: number;
  track_number: number;
  external_urls: { spotify: string };
  artists: Array<{ id: string; name: string }>;
}

// Récupérer les détails d'un album (avec tracklist)
export async function getSpotifyAlbum(albumId: string): Promise<SpotifyAlbum | null> {
  return spotifyFetch<SpotifyAlbum>(`/albums/${albumId}`);
}

// Récupérer les détails d'un artiste
export async function getSpotifyArtist(artistId: string) {
  return spotifyFetch<{ id: string; name: string; genres: string[]; popularity: number; images: Array<{ url: string }> }>(`/artists/${artistId}`);
}

// ============================================================
// UTILITAIRES COMMUNS
// ============================================================

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function mapReleaseType(mbType?: string): 'album' | 'ep' | 'single' | 'compilation' | 'soundtrack' | 'remix' | 'live' {
  const t = (mbType || '').toLowerCase();
  if (t.includes('ep')) return 'ep';
  if (t.includes('single')) return 'single';
  if (t.includes('compilation')) return 'compilation';
  if (t.includes('soundtrack')) return 'soundtrack';
  if (t.includes('remix')) return 'remix';
  if (t.includes('live')) return 'live';
  return 'album';
}

export function normalizeGenres(tags: string[]): string[] {
  const genreMap: Record<string, string> = {
    'hip hop': 'hip-hop',
    'hip-hop': 'hip-hop',
    'rap': 'hip-hop',
    'r&b': 'rnb',
    'rnb': 'rnb',
    'electronic': 'electronic',
    'edm': 'electronic',
    'house': 'electronic',
    'techno': 'electronic',
    'ambient': 'electronic',
    'rock': 'rock',
    'indie rock': 'rock',
    'alternative rock': 'rock',
    'pop': 'pop',
    'indie pop': 'pop',
    'k-pop': 'pop',
    'jazz': 'jazz',
    'blues': 'blues',
    'classical': 'classical',
    'folk': 'folk',
    'country': 'country',
    'reggae': 'reggae',
    'metal': 'metal',
    'punk': 'punk',
    'soul': 'soul',
    'funk': 'funk',
    'world': 'world',
    'latin': 'latin',
    'experimental': 'experimental',
    'soundtrack': 'soundtrack',
  };

  const normalized = tags
    .map(t => genreMap[t.toLowerCase()] || t.toLowerCase())
    .filter((v, i, a) => a.indexOf(v) === i)
    .slice(0, 5);

  return normalized.length > 0 ? normalized : ['unknown'];
}