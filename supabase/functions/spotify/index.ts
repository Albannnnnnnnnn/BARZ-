// Fonction Supabase « spotify » (Deno) : connexion Spotify et écoute en direct.
// Elle seule lit la table spotify_tokens (clé service_role) : les jetons ne vont jamais au navigateur.
//
// Appelée par le navigateur avec supabase.functions.invoke('spotify', { body: { action, ... } }) :
// - connect     { code, verifier, redirectUri } : échange le code OAuth (PKCE) et garde les jetons
// - status      : le compte Spotify du membre est-il relié ?
// - disconnect  : oublie les jetons et coupe le partage
// - now-playing { userIds } : ce qu'écoutent ces membres (soi-même, ou des amis qui partagent leur écoute)
//
// Déploiement (par Alban) : supabase functions deploy spotify
// Secret : supabase secrets set SPOTIFY_CLIENT_ID=… (SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont fournis)
import { createClient } from 'npm:@supabase/supabase-js@2';

const CLIENT_ID = Deno.env.get('SPOTIFY_CLIENT_ID') ?? '';
const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

const ORIGINS = ['https://albannnnnnnnnn.github.io', 'http://127.0.0.1:4322'];
const REDIRECTS = ['https://albannnnnnnnnn.github.io/BARZ-/spotify', 'http://127.0.0.1:4322/BARZ-/spotify'];
const CACHE_MS = 10_000;
const UUID = /^[0-9a-f-]{36}$/i;

type TokenRow = { user_id: string; refresh_token: string; access_token: string | null; expires_at: string | null; spotify_name: string | null; now_playing: unknown; checked_at: string | null };
type NowPlaying = { playing: boolean; title?: string; artists?: string; album?: string; image?: string | null; url?: string | null; progressMs?: number; durationMs?: number };

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
    const profile = await fetch('https://api.spotify.com/v1/me', { headers: { Authorization: `Bearer ${data.access_token}` } }).then((r) => (r.ok ? r.json() : null));
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

  if (body.action === 'status') {
    const { data } = await admin.from('spotify_tokens').select('spotify_name').eq('user_id', me).maybeSingle();
    return reply({ connected: !!data, name: data?.spotify_name ?? null });
  }

  if (body.action === 'disconnect') {
    await admin.from('spotify_tokens').delete().eq('user_id', me);
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
    return reply({ listening: Object.fromEntries(entries) });
  }

  return reply({ error: 'Action inconnue.' }, 400);
});
