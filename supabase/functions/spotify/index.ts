// Fonction Supabase « spotify » (Deno) : connexion Spotify et écoute en direct.
// Elle seule lit la table spotify_tokens (clé service_role) : les jetons ne vont jamais au navigateur.
//
// Appelée par le navigateur avec supabase.functions.invoke('spotify', { body: { action, ... } }) :
// - connect     { code, verifier, redirectUri } : échange le code OAuth (PKCE) et garde les jetons
// - status      : le compte Spotify du membre est-il relié ?
// - disconnect  : oublie les jetons et coupe le partage
// - now-playing { userIds } : ce qu'écoutent ces membres (soi-même, ou des amis qui partagent leur écoute) ; sans
//               Spotify (5 comptes au plus), le morceau en cours sur Last.fm (secret LASTFM_API_KEY, facultatif)
// - playlist    { releaseIds, name } : crée une playlist privée sur son compte avec les titres de ces sorties
//               (scope playlist-modify-private : un compte relié avant le 09/11 doit se reconnecter)
// - import      : ses artistes les plus écoutés et ceux qu'il suit, rapprochés du catalogue (supabase/music-imports.sql)
//
// Déploiement (par Alban) : supabase functions deploy spotify
// Secret : supabase secrets set SPOTIFY_CLIENT_ID=… (SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont fournis)
import { createClient } from 'npm:@supabase/supabase-js@2';

const CLIENT_ID = Deno.env.get('SPOTIFY_CLIENT_ID') ?? '';
const LASTFM_KEY = Deno.env.get('LASTFM_API_KEY') ?? '';
const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

const ORIGINS = ['https://albannnnnnnnnn.github.io', 'http://127.0.0.1:4322'];
const REDIRECTS = ['https://albannnnnnnnnn.github.io/BARZ-/spotify', 'http://127.0.0.1:4322/BARZ-/spotify'];
const CACHE_MS = 10_000;
const UUID = /^[0-9a-f-]{36}$/i;

type TokenRow = { user_id: string; refresh_token: string; access_token: string | null; expires_at: string | null; spotify_name: string | null; now_playing: unknown; checked_at: string | null };
type NowPlaying = { playing: boolean; title?: string; artists?: string; album?: string; image?: string | null; url?: string | null; progressMs?: number; durationMs?: number; agoMin?: number };

function cors(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? '';
  return {
    'Access-Control-Allow-Origin': ORIGINS.includes(origin) ? origin : ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

async function spotifyToken(params: Record<string, string>) {
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID, ...params }),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

// Appli Spotify en mode développement : seuls les comptes ajoutés à la main dans le tableau de bord Spotify (User
// Management, 5 au plus) peuvent s'en servir. Les autres se connectent sans erreur, puis chaque appel répond 403
// « User not registered in the Developer Dashboard ». Se reconnecter n'y change rien, d'où un message à part.
const NOT_ALLOWED = 'Spotify limite pour l’instant BARZ¡ à quelques comptes, et ton compte n’en fait pas partie. Relie plutôt Deezer, ou Last.fm (qui peut enregistrer tes écoutes Spotify) : tes recommandations s’appuieront dessus.';
async function notAllowed(res: Response): Promise<boolean> {
  if (res.status !== 403) return false;
  const text = await res.clone().text().catch(() => '');
  return /not registered|developer dashboard/i.test(text);
}

// Jeton d'accès valide pour ce membre (renouvelé si besoin) ; null si l'accès a été retiré
async function accessTokenOf(row: TokenRow): Promise<string | null> {
  if (row.access_token && row.expires_at && Date.parse(row.expires_at) > Date.now() + 60_000) return row.access_token;
  const { ok, data } = await spotifyToken({ grant_type: 'refresh_token', refresh_token: row.refresh_token });
  if (!ok) {
    // Accès révoqué depuis Spotify : on oublie les jetons
    if (data?.error === 'invalid_grant') await admin.from('spotify_tokens').delete().eq('user_id', row.user_id);
    return null;
  }
  const update = {
    access_token: data.access_token,
    expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
    // Avec PKCE, Spotify peut renvoyer un nouveau refresh token : l'ancien ne marche plus
    ...(data.refresh_token ? { refresh_token: data.refresh_token } : {}),
  };
  await admin.from('spotify_tokens').update(update).eq('user_id', row.user_id);
  return data.access_token;
}

// Morceau en cours sur Last.fm (« scrobblé » depuis Spotify, Deezer, Apple Music…). Toutes les applis ne signalent pas
// le morceau en cours : sinon, le dernier morceau enregistré s'il date de moins de 15 minutes (agoMin) ; null au-delà.
const LASTFM_RECENT_MIN = 15;
async function lastfmNowPlaying(username: string): Promise<NowPlaying | null> {
  if (!LASTFM_KEY) return null;
  const url = `https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&user=${encodeURIComponent(username)}&limit=1&format=json&api_key=${LASTFM_KEY}`;
  const data = await fetch(url, { signal: AbortSignal.timeout(8000) }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const track = [data?.recenttracks?.track ?? []].flat()[0];
  if (!track) return null;
  const playing = track['@attr']?.nowplaying === 'true';
  const agoMin = playing ? undefined : Math.round((Date.now() / 1000 - Number(track.date?.uts ?? 0)) / 60);
  if (!playing && !(agoMin! >= 0 && agoMin! <= LASTFM_RECENT_MIN)) return null;
  const images = (track.image ?? []) as { '#text': string }[];
  return {
    playing,
    ...(playing ? {} : { agoMin }),
    title: track.name,
    artists: track.artist?.['#text'] ?? track.artist?.name ?? '',
    album: track.album?.['#text'] ?? '',
    image: images.at(-1)?.['#text'] || null,
    url: track.url ?? null,
  };
}

async function nowPlayingOf(row: TokenRow): Promise<NowPlaying | null> {
  if (row.checked_at && Date.now() - Date.parse(row.checked_at) < CACHE_MS) return row.now_playing as NowPlaying | null;
  const token = await accessTokenOf(row);
  if (!token) return null;
  const res = await fetch('https://api.spotify.com/v1/me/player/currently-playing?additional_types=episode', { headers: { Authorization: `Bearer ${token}` } });
  // Trop de requêtes : on garde la dernière réponse connue
  if (res.status === 429) return row.now_playing as NowPlaying | null;
  let result: NowPlaying = { playing: false };
  if (res.status === 200) {
    const data = await res.json();
    const item = data.item;
    if (item) {
      const images = item.album?.images ?? item.images ?? [];
      result = {
        playing: !!data.is_playing,
        title: item.name,
        artists: (item.artists ?? []).map((a: { name: string }) => a.name).join(', ') || item.show?.name || '',
        album: item.album?.name ?? item.show?.name ?? '',
        image: (images[1] ?? images[0])?.url ?? null,
        url: item.external_urls?.spotify ?? null,
        progressMs: data.progress_ms ?? 0,
        durationMs: item.duration_ms ?? 0,
      };
    }
  }
  await admin.from('spotify_tokens').update({ now_playing: result, checked_at: new Date().toISOString() }).eq('user_id', row.user_id);
  return result;
}

// Nom réduit à ses lettres et chiffres, sans accents (même règle que barz_compact dans supabase/artist-search.sql)
const compact = (name: string) => name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '');

// Artistes Spotify du membre → catalogue BARZ¡ (par nom), avec un poids : 3 pour le plus écouté, 2 pour un artiste suivi
async function importArtists(row: TokenRow): Promise<{ found: number; matched: number } | { error: string; reconnect?: boolean }> {
  const token = await accessTokenOf(row);
  if (!token) return { error: 'Accès Spotify retiré : reconnecte ton compte.', reconnect: true };
  const get = (url: string) => fetch(url, { headers: { Authorization: `Bearer ${token}` } });

  const weights = new Map<string, number>(); // nom réduit → poids
  const add = (name: string, weight: number) => {
    const key = compact(name);
    if (key) weights.set(key, Math.max(weights.get(key) ?? 0, weight));
  };
  const top = await get('https://api.spotify.com/v1/me/top/artists?limit=50&time_range=medium_term');
  if (await notAllowed(top)) return { error: NOT_ALLOWED };
  // Compte relié avant l'ajout de ces autorisations : il faut se reconnecter une fois
  if (top.status === 401 || top.status === 403) return { error: 'Reconnecte Spotify pour autoriser l’import de tes artistes.', reconnect: true };
  const topItems = ((await top.json().catch(() => ({})))?.items ?? []) as { name: string }[];
  topItems.forEach((a, i) => add(a.name, 3 - (i / Math.max(1, topItems.length)) * 1.5));
  let next: string | null = 'https://api.spotify.com/v1/me/following?type=artist&limit=50';
  for (let page = 0; next && page < 6; page++) {
    const res = await get(next);
    if (!res.ok) break;
    const data = (await res.json().catch(() => ({})))?.artists;
    for (const a of data?.items ?? []) add(a.name, 2);
    next = data?.next ?? null;
  }

  // Rapprochement par nom réduit ; à nom égal, l'artiste le plus écouté du catalogue
  const keys = [...weights.keys()];
  const best = new Map<string, { id: string; audience: number }>();
  for (let i = 0; i < keys.length; i += 100) {
    const { data } = await admin.from('artists').select('id, search_name, audience').in('search_name', keys.slice(i, i + 100));
    for (const a of (data ?? []) as { id: string; search_name: string; audience: number | null }[]) {
      const current = best.get(a.search_name);
      if (!current || (a.audience ?? 0) > current.audience) best.set(a.search_name, { id: a.id, audience: a.audience ?? 0 });
    }
  }
  const rows = [...best.entries()].map(([key, a]) => ({ user_id: row.user_id, source: 'spotify', artist_id: a.id, weight: weights.get(key)! }));
  await admin.from('imported_artists').delete().eq('user_id', row.user_id).eq('source', 'spotify');
  if (rows.length) {
    const { error } = await admin.from('imported_artists').insert(rows);
    if (error) return { error: error.message };
  }
  return { found: weights.size, matched: rows.length };
}

Deno.serve(async (req) => {
  const headers = { ...cors(req), 'Content-Type': 'application/json' };
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });

  // Le membre qui appelle (jeton de session envoyé par supabase-js)
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer /, '');
  const { data: auth } = await admin.auth.getUser(jwt);
  const me = auth?.user?.id;
  if (!me) return reply({ error: 'Connecte-toi pour utiliser Spotify.' }, 401);
  if (!CLIENT_ID) return reply({ error: 'SPOTIFY_CLIENT_ID manquant côté serveur.' }, 500);

  const body = await req.json().catch(() => ({}));

  if (body.action === 'connect') {
    if (!REDIRECTS.includes(body.redirectUri) || !body.code || !body.verifier) return reply({ error: 'Demande de connexion invalide.' }, 400);
    const { ok, data } = await spotifyToken({ grant_type: 'authorization_code', code: body.code, redirect_uri: body.redirectUri, code_verifier: body.verifier });
    if (!ok) return reply({ error: `Spotify a refusé la connexion (${data?.error_description ?? data?.error ?? 'erreur inconnue'}).` }, 400);
    const account = await fetch('https://api.spotify.com/v1/me', { headers: { Authorization: `Bearer ${data.access_token}` } });
    if (await notAllowed(account)) return reply({ error: NOT_ALLOWED, notAllowed: true }, 403);
    const profile = account.ok ? await account.json().catch(() => null) : null;
    const { error } = await admin.from('spotify_tokens').upsert({
      user_id: me,
      refresh_token: data.refresh_token,
      access_token: data.access_token,
      expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
      spotify_name: profile?.display_name ?? profile?.id ?? null,
      now_playing: null,
      checked_at: null,
    });
    if (error) return reply({ error: error.message }, 500);
    return reply({ connected: true, name: profile?.display_name ?? null });
  }

  if (body.action === 'playlist') {
    const ids = (Array.isArray(body.releaseIds) ? body.releaseIds : []).filter((x: unknown) => typeof x === 'string' && UUID.test(x)).slice(0, 60);
    if (!ids.length) return reply({ error: 'Aucune sortie à mettre dans la playlist.' }, 400);
    const { data: row } = await admin.from('spotify_tokens').select('*').eq('user_id', me).maybeSingle();
    if (!row) return reply({ error: 'Relie d’abord ton compte Spotify.', reconnect: true }, 400);
    const token = await accessTokenOf(row as TokenRow);
    if (!token) return reply({ error: 'Spotify ne répond plus pour ton compte : reconnecte-le.', reconnect: true }, 400);
    const api = (path: string, init: RequestInit = {}) =>
      fetch(`https://api.spotify.com/v1${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) } });
    const { data: releases } = await admin.from('releases').select('id, title, spotify_id, artist:artists!artist_id(name)').in('id', ids);
    // L'album de chaque sortie : identifiant Spotify connu, sinon recherche artiste + titre ; puis ses titres (100 au plus en tout)
    const uris: string[] = [];
    let missing = 0;
    for (const r of (releases ?? []) as unknown as { id: string; title: string; spotify_id: string | null; artist: { name: string } | null }[]) {
      if (uris.length >= 100) break;
      let albumId = r.spotify_id;
      if (!albumId) {
        const q = encodeURIComponent(`album:${r.title} artist:${r.artist?.name ?? ''}`);
        const found = await api(`/search?type=album&limit=1&q=${q}`).then((x) => (x.ok ? x.json() : null)).catch(() => null);
        albumId = found?.albums?.items?.[0]?.id ?? null;
      }
      if (!albumId) {
        missing++;
        continue;
      }
      const tracks = await api(`/albums/${albumId}/tracks?limit=50`).then((x) => (x.ok ? x.json() : null)).catch(() => null);
      for (const t of tracks?.items ?? []) if (t?.uri && uris.length < 100) uris.push(t.uri);
    }
    if (!uris.length) return reply({ error: 'Aucune de ces sorties n’a été trouvée sur Spotify.' }, 404);
    const name = String(body.name ?? 'Mon vendredi BARZ¡').slice(0, 100);
    const payload = JSON.stringify({ name, public: false, description: 'Les sorties de tes artistes, réunies par BARZ¡.' });
    // Création : /me/playlists (nouvelle adresse), sinon l'ancienne /users/{id}/playlists
    let created = await api('/me/playlists', { method: 'POST', body: payload });
    if (created.status === 404 || created.status === 405) {
      const meInfo = await api('/me').then((x) => (x.ok ? x.json() : null)).catch(() => null);
      if (meInfo?.id) created = await api(`/users/${encodeURIComponent(meInfo.id)}/playlists`, { method: 'POST', body: payload });
    }
    if (created.status === 401 || created.status === 403) return reply({ error: 'Spotify demande une nouvelle autorisation pour créer des playlists : reconnecte ton compte.', reconnect: true }, 403);
    if (!created.ok) return reply({ error: `Spotify a refusé la création (${created.status}).` }, 502);
    const playlist = await created.json();
    for (let i = 0; i < uris.length; i += 100) {
      const add = JSON.stringify({ uris: uris.slice(i, i + 100) });
      let res = await api(`/playlists/${playlist.id}/items`, { method: 'POST', body: add });
      if (res.status === 404 || res.status === 405) res = await api(`/playlists/${playlist.id}/tracks`, { method: 'POST', body: add });
      if (!res.ok) return reply({ error: `Playlist créée, mais Spotify a refusé les titres (${res.status}).`, url: playlist.external_urls?.spotify ?? null }, 502);
    }
    return reply({ url: playlist.external_urls?.spotify ?? null, tracks: uris.length, missing });
  }

  if (body.action === 'status') {
    const [{ data }, { data: last }] = await Promise.all([
      admin.from('spotify_tokens').select('spotify_name').eq('user_id', me).maybeSingle(),
      admin.from('imported_artists').select('imported_at').eq('user_id', me).eq('source', 'spotify').order('imported_at', { ascending: false }).limit(1).maybeSingle(),
    ]);
    return reply({ connected: !!data, name: data?.spotify_name ?? null, importedAt: last?.imported_at ?? null });
  }

  if (body.action === 'import') {
    const { data: row } = await admin.from('spotify_tokens').select('*').eq('user_id', me).maybeSingle();
    if (!row) return reply({ error: 'Connecte d’abord ton compte Spotify.', reconnect: true }, 400);
    const result = await importArtists(row as TokenRow);
    return 'error' in result ? reply(result, 400) : reply(result);
  }

  if (body.action === 'disconnect') {
    await admin.from('spotify_tokens').delete().eq('user_id', me);
    await admin.from('imported_artists').delete().eq('user_id', me).eq('source', 'spotify');
    await admin.from('profiles').update({ share_listening: false }).eq('id', me);
    return reply({ connected: false });
  }

  if (body.action === 'now-playing') {
    const ids: string[] = (Array.isArray(body.userIds) ? body.userIds : []).filter((id: unknown) => typeof id === 'string' && UUID.test(id)).slice(0, 20);
    if (!ids.length) return reply({ listening: {} });
    // Autorisés : soi-même, et les amis (demande acceptée) qui ont activé le partage
    const others = ids.filter((id) => id !== me);
    const allowed = new Set(ids.includes(me) ? [me] : []);
    if (others.length) {
      const list = others.join(',');
      const [{ data: friends }, { data: sharing }] = await Promise.all([
        admin.from('friendships').select('requester_id, addressee_id').eq('status', 'accepted')
          .or(`and(requester_id.eq.${me},addressee_id.in.(${list})),and(addressee_id.eq.${me},requester_id.in.(${list}))`),
        admin.from('profiles').select('id').in('id', others).eq('share_listening', true),
      ]);
      const friendIds = new Set((friends ?? []).map((f) => (f.requester_id === me ? f.addressee_id : f.requester_id)));
      for (const p of sharing ?? []) if (friendIds.has(p.id)) allowed.add(p.id);
    }
    if (!allowed.size) return reply({ listening: {} });
    const { data: rows } = await admin.from('spotify_tokens').select('*').in('user_id', [...allowed]);
    const entries = await Promise.all(((rows ?? []) as TokenRow[]).map(async (row) => [row.user_id, await nowPlayingOf(row).catch(() => null)] as const));
    const listening: Record<string, NowPlaying | null> = Object.fromEntries(entries);
    // Sans Spotify, ou rien en cours sur Spotify : Last.fm, pour ceux qui y ont relié leur compte
    const rest = [...allowed].filter((id) => !listening[id]?.title);
    if (rest.length && LASTFM_KEY) {
      const { data: profiles } = await admin.from('profiles').select('id, lastfm_username').in('id', rest).not('lastfm_username', 'is', null);
      await Promise.all(
        (profiles ?? []).map(async (p) => {
          const np = await lastfmNowPlaying(p.lastfm_username as string);
          if (np) listening[p.id as string] = np;
        })
      );
    }
    return reply({ listening });
  }

  return reply({ error: 'Action inconnue.' }, 400);
});
