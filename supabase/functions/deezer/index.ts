// Fonction Supabase « deezer » (Deno) : import des artistes favoris d'un profil Deezer (supabase/music-imports.sql).
// Deezer n'accepte plus de nouvelles applis : pas de connexion, mais les favoris d'un profil public sont lisibles.
//
// Appelée par le navigateur avec supabase.functions.invoke('deezer', { body: { action, ... } }) :
// - link    { profile } : lien du profil (deezer.com/…/profile/123, lien de partage) ou numéro ; importe ses favoris
// - refresh : réimporte les favoris du profil déjà relié
// - unlink  : oublie le profil et ses artistes importés
// - artist  { name } : fiche d'un artiste absent du catalogue (un invité en feat., une recherche) : trouvé sur Deezer
//                      sous ce nom exact, ajouté au catalogue, et son slug renvoyé. Ouvert aux visiteurs sans compte.
//
// Déploiement : supabase functions deploy deezer --use-api (SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont fournis)
import { createClient } from 'npm:@supabase/supabase-js@2';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const ORIGINS = ['https://albannnnnnnnnn.github.io', 'http://127.0.0.1:4322', 'http://localhost:4322'];
const MAX_FAVORITES = 500;

function cors(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? '';
  return {
    'Access-Control-Allow-Origin': ORIGINS.includes(origin) ? origin : ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

// Numéro du profil : « 123 », « deezer.com/fr/profile/123 », ou un lien de partage (link.deezer.com/…) qu'on suit
async function profileId(input: string): Promise<number | null> {
  const text = input.trim();
  if (/^\d{1,12}$/.test(text)) return Number(text);
  const direct = text.match(/deezer\.com\/(?:[a-z]{2}\/)?profile\/(\d+)/i);
  if (direct) return Number(direct[1]);
  if (/^https?:\/\/([a-z0-9-]+\.)*(deezer\.com|deezer\.page\.link)\//i.test(text)) {
    const res = await fetch(text, { redirect: 'follow' }).catch(() => null);
    const found = res?.url.match(/profile\/(\d+)/) ?? (await res?.text().catch(() => ''))?.match(/profile\/(\d+)/);
    if (found) return Number(found[1]);
  }
  return null;
}

async function deezerJson(path: string): Promise<any> {
  const res = await fetch(`https://api.deezer.com${path}`);
  return res.json().catch(() => null);
}

// Favoris importés, gardés seulement s'ils sont dans le catalogue (rapprochés par leur numéro Deezer)
async function importFavorites(me: string, id: number): Promise<{ favorites: number; matched: number } | { error: string }> {
  const user = await deezerJson(`/user/${id}`);
  if (!user || user.error) return { error: 'Profil Deezer introuvable : vérifie le lien.' };
  const ids: number[] = [];
  for (let index = 0; index < MAX_FAVORITES; index += 100) {
    const page = await deezerJson(`/user/${id}/artists?limit=100&index=${index}`);
    if (page?.error) return { error: 'Les favoris de ce profil ne sont pas publics. Dans Deezer : Paramètres → Confidentialité, rends tes favoris publics.' };
    for (const a of page?.data ?? []) ids.push(a.id);
    if (!page?.next) break;
  }
  const matched: string[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await admin.from('artists').select('id').in('deezer_id', ids.slice(i, i + 200));
    for (const a of data ?? []) matched.push(a.id);
  }
  await admin.from('imported_artists').delete().eq('user_id', me).eq('source', 'deezer');
  if (matched.length) {
    const { error } = await admin.from('imported_artists').insert(matched.map((artist_id) => ({ user_id: me, source: 'deezer', artist_id, weight: 2 })));
    if (error) return { error: error.message };
  }
  await admin.from('profiles').update({ deezer_user_id: id }).eq('id', me);
  return { favorites: ids.length, matched: matched.length };
}

// Mêmes règles que slugify / stableSlug de scripts/lib/common.ts : le même artiste garde la même ligne
const slugify = (text: string) =>
  text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
const compact = (text: string) => slugify(text).replace(/-/g, '');

// Artiste Deezer portant exactement ce nom (aux accents et à la ponctuation près), le plus suivi s'il y en a plusieurs
async function addArtist(name: string): Promise<{ slug: string } | { error: string }> {
  const wanted = compact(name);
  if (!wanted) return { error: 'Nom d’artiste invalide.' };
  const known = await admin.from('artists').select('slug').eq('search_name', wanted).order('audience', { ascending: false }).limit(1).maybeSingle();
  if (known.data) return { slug: known.data.slug };
  const found = await deezerJson(`/search/artist?q=${encodeURIComponent(name)}&limit=10`);
  const match = ((found?.data ?? []) as any[]).filter((a) => compact(a.name) === wanted).sort((a, b) => (b.nb_fan ?? 0) - (a.nb_fan ?? 0))[0];
  if (!match) return { error: `« ${name} » est introuvable sur Deezer.` };
  // Déjà au catalogue sous une autre graphie
  const same = await admin.from('artists').select('slug').eq('deezer_id', match.id).maybeSingle();
  if (same.data) return { slug: same.data.slug };
  const slug = slugify(match.name) || `artiste-${match.id}`;
  const { error } = await admin
    .from('artists')
    .upsert({ slug, name: match.name, deezer_id: match.id, image_url: match.picture_xl ?? match.picture_big ?? null, popularity: match.nb_fan ?? null, genres: [], updated_at: new Date().toISOString() }, { onConflict: 'slug', ignoreDuplicates: true });
  if (error) return { error: error.message };
  return { slug };
}

Deno.serve(async (req) => {
  const headers = { ...cors(req), 'Content-Type': 'application/json' };
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });

  const body = await req.json().catch(() => ({}));
  if (body.action === 'artist') {
    const result = await addArtist(String(body.name ?? '').slice(0, 120));
    return 'error' in result ? reply(result, 404) : reply(result);
  }

  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer /, '');
  const { data: auth } = await admin.auth.getUser(jwt);
  const me = auth?.user?.id;
  if (!me) return reply({ error: 'Connecte-toi pour relier Deezer.' }, 401);

  if (body.action === 'link' || body.action === 'refresh') {
    let id: number | null = null;
    if (body.action === 'link') id = await profileId(String(body.profile ?? '').slice(0, 300));
    else id = ((await admin.from('profiles').select('deezer_user_id').eq('id', me).maybeSingle()).data?.deezer_user_id as number | null) ?? null;
    if (!id) return reply({ error: body.action === 'link' ? 'Lien de profil Deezer non reconnu. Exemple : https://www.deezer.com/fr/profile/123456789' : 'Aucun profil Deezer relié.' }, 400);
    const result = await importFavorites(me, id);
    return 'error' in result ? reply(result, 400) : reply({ linked: true, ...result });
  }

  if (body.action === 'unlink') {
    await admin.from('imported_artists').delete().eq('user_id', me).eq('source', 'deezer');
    await admin.from('profiles').update({ deezer_user_id: null }).eq('id', me);
    return reply({ linked: false });
  }

  return reply({ error: 'Action inconnue.' }, 400);
});
