// Fonction Supabase « links » (Deno) : liens exacts Spotify et Apple Music d'une sortie, retrouvés par son code-barres
// (UPC, donné par Deezer) puis enregistrés dans releases. Sans lien exact, le bouton « Écouter » ouvre une recherche.
//
// Appelée par la fiche d'une sortie (src/pages/releases/[slug].astro), même sans compte :
//   supabase.functions.invoke('links', { body: { release: '<id>' } }) → { spotify, apple }
// Une seule recherche par sortie et par semaine (metadata.links_checked_at) : rien de plus vers Spotify, dont
// l'appli en mode développement est bloquée au moindre afflux d'appels (voir scripts/sync-releases.ts).
//
// Déploiement : supabase functions deploy links --use-api
// Secrets : SPOTIFY_CLIENT_ID et SPOTIFY_CLIENT_SECRET (SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont fournis)
import { createClient } from 'npm:@supabase/supabase-js@2';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const CLIENT_ID = Deno.env.get('SPOTIFY_CLIENT_ID') ?? '';
const CLIENT_SECRET = Deno.env.get('SPOTIFY_CLIENT_SECRET') ?? '';
const ORIGINS = ['https://albannnnnnnnnn.github.io', 'http://127.0.0.1:4322', 'http://localhost:4322'];
const UUID = /^[0-9a-f-]{36}$/i;
const RETRY_MS = 7 * 86400_000;

function cors(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? '';
  return {
    'Access-Control-Allow-Origin': ORIGINS.includes(origin) ? origin : ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

// Jeton de l'appli (sans membre), gardé tant que l'instance de la fonction vit
let appToken: { value: string; until: number } | null = null;
async function spotifyAppToken(): Promise<string | null> {
  if (appToken && appToken.until > Date.now()) return appToken.value;
  if (!CLIENT_ID || !CLIENT_SECRET) return null;
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${btoa(`${CLIENT_ID}:${CLIENT_SECRET}`)}` },
    body: 'grant_type=client_credentials',
  }).catch(() => null);
  const data = await res?.json().catch(() => null);
  if (!data?.access_token) return null;
  appToken = { value: data.access_token, until: Date.now() + (data.expires_in - 60) * 1000 };
  return appToken.value;
}

async function spotifyByUpc(upc: string): Promise<string | null> {
  const token = await spotifyAppToken();
  if (!token) return null;
  const res = await fetch(`https://api.spotify.com/v1/search?type=album&limit=1&market=FR&q=upc:${upc}`, { headers: { Authorization: `Bearer ${token}` } }).catch(() => null);
  const data = res?.ok ? await res.json().catch(() => null) : null;
  return data?.albums?.items?.[0]?.external_urls?.spotify ?? null;
}

async function appleByUpc(upc: string): Promise<string | null> {
  const res = await fetch(`https://itunes.apple.com/lookup?upc=${upc}&country=FR&entity=album`).catch(() => null);
  const data = res?.ok ? await res.json().catch(() => null) : null;
  const url: string | undefined = data?.results?.find((r: any) => r.collectionViewUrl)?.collectionViewUrl;
  return url ? url.replace(/[?&]uo=\d+/, '') : null;
}

Deno.serve(async (req) => {
  const headers = { ...cors(req), 'Content-Type': 'application/json' };
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });

  const body = await req.json().catch(() => ({}));
  if (typeof body.release !== 'string' || !UUID.test(body.release)) return reply({ error: 'Sortie inconnue.' }, 400);

  const { data: release } = await admin.from('releases').select('id, spotify_url, apple_music_url, metadata').eq('id', body.release).maybeSingle();
  if (!release) return reply({ error: 'Sortie inconnue.' }, 404);
  const metadata = (release.metadata ?? {}) as Record<string, unknown>;
  const done = { spotify: release.spotify_url, apple: release.apple_music_url };
  const upc = typeof metadata.upc === 'string' && /^\d{8,14}$/.test(metadata.upc) ? metadata.upc : null;
  const checkedAt = typeof metadata.links_checked_at === 'string' ? Date.parse(metadata.links_checked_at) : 0;
  if ((done.spotify && done.apple) || !upc || Date.now() - checkedAt < RETRY_MS) return reply(done);

  const [spotify, apple] = await Promise.all([done.spotify ? done.spotify : spotifyByUpc(upc), done.apple ? done.apple : appleByUpc(upc)]);
  // Sans le secret Spotify, la recherche Spotify n'a pas eu lieu : on ne note pas la sortie comme déjà cherchée
  const searched = !!spotify || !!(await spotifyAppToken());
  await admin
    .from('releases')
    .update({ spotify_url: spotify, apple_music_url: apple, ...(searched ? { metadata: { ...metadata, links_checked_at: new Date().toISOString() } } : {}) })
    .eq('id', release.id);
  return reply({ spotify, apple });
});
