// Fonction Supabase « notify » (Deno) : envoie les notifications Web Push de BARZ¡.
// - friday : la notification du vendredi, personnalisée pour chaque membre abonné.
//            Appelée par GitHub Actions après la reconstruction du vendredi matin, avec la clé service_role.
// - test   : une notification de test vers ses propres appareils (appelée depuis le profil).
//
// Déploiement (par Alban) : supabase functions deploy notify --use-api
// Secrets : VAPID_PUBLIC_KEY et VAPID_PRIVATE_KEY (dans .env) ; SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont fournis
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const admin = createClient(Deno.env.get('SUPABASE_URL')!, SERVICE_KEY, { auth: { persistSession: false } });
const SITE = 'https://albannnnnnnnnn.github.io/BARZ-/';
webpush.setVapidDetails(SITE, Deno.env.get('VAPID_PUBLIC_KEY') ?? '', Deno.env.get('VAPID_PRIVATE_KEY') ?? '');

const ORIGINS = ['https://albannnnnnnnnn.github.io', 'http://127.0.0.1:4322', 'http://localhost:4322'];
type Sub = { endpoint: string; user_id: string; p256dh: string; auth: string };
type Message = { title: string; body: string; url: string; tag: string };

function cors(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? '';
  return {
    'Access-Control-Allow-Origin': ORIGINS.includes(origin) ? origin : ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

// Envoie à chaque appareil ; un appareil désabonné (404/410) est retiré de la table
async function send(subs: Sub[], message: (userId: string) => Message | null): Promise<number> {
  let sent = 0;
  const gone: string[] = [];
  await Promise.all(
    subs.map(async (s) => {
      const m = message(s.user_id);
      if (!m) return;
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(m), { TTL: 6 * 3600 });
        sent++;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) gone.push(s.endpoint);
        else console.warn('Envoi impossible :', status, (err as Error).message);
      }
    })
  );
  if (gone.length) await admin.from('push_subscriptions').delete().in('endpoint', gone);
  return sent;
}

// Nom comparable (mêmes règles que src/lib/feat.ts)
const normName = (name: string) => name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '');
const listNames = (names: string[]) => (names.length > 1 ? `${names.slice(0, -1).join(', ')} et ${names[names.length - 1]}` : names[0] ?? '');

async function fridayMessages(userIds: string[]): Promise<Map<string, Message>> {
  // Date du jour à Paris
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date());
  const [{ data: releases }, { data: follows }] = await Promise.all([
    admin.from('releases').select('slug, artist_id, metadata, artist:artists!artist_id(name)').eq('release_date', today).limit(3000),
    admin.from('follows').select('user_id, artist_id, artist:artists(name)').in('user_id', userIds),
  ]);
  const all = (releases ?? []) as { slug: string; artist_id: string | null; metadata: { featuring?: string[] } | null; artist: { name: string } | null }[];
  const byUser = new Map<string, { ids: Set<string>; names: Map<string, string> }>();
  for (const f of (follows ?? []) as { user_id: string; artist_id: string; artist: { name: string } | null }[]) {
    const u = byUser.get(f.user_id) ?? { ids: new Set(), names: new Map() };
    u.ids.add(f.artist_id);
    if (f.artist?.name) u.names.set(normName(f.artist.name), f.artist.name);
    byUser.set(f.user_id, u);
  }

  const messages = new Map<string, Message>();
  for (const userId of userIds) {
    const u = byUser.get(userId);
    // Ses artistes : sorties à leur nom, ou invités en feat
    const mine = u
      ? all.filter((r) => (r.artist_id && u.ids.has(r.artist_id)) || (r.metadata?.featuring ?? []).some((n) => u.names.has(normName(n))))
      : [];
    // Le nom à afficher : l'artiste principal s'il est suivi, sinon l'artiste suivi invité
    const shownName = (r: (typeof all)[number]) =>
      r.artist_id && u!.ids.has(r.artist_id) ? r.artist?.name : (r.metadata?.featuring ?? []).map((n) => u!.names.get(normName(n))).find(Boolean);
    const artists = [...new Set(mine.map(shownName).filter((n): n is string => !!n))];
    if (mine.length) {
      const shown = artists.slice(0, 3);
      const rest = artists.length - shown.length;
      messages.set(userId, {
        title: `${mine.length} sortie${mine.length > 1 ? 's' : ''} de tes artistes aujourd’hui`,
        body: `${listNames(rest > 0 ? [...shown, `${rest} autre${rest > 1 ? 's' : ''}`] : shown)}. Et ${all.length} nouveautés en tout sur BARZ¡.`,
        url: mine.length === 1 ? `${SITE}releases/${mine[0].slug}` : SITE,
        tag: `friday-${today}`,
      });
    } else if (all.length) {
      messages.set(userId, {
        title: 'C’est vendredi sur BARZ¡',
        body: `${all.length} nouveautés sont sorties cette nuit. Viens voir ce qui te correspond.`,
        url: SITE,
        tag: `friday-${today}`,
      });
    }
  }
  return messages;
}

Deno.serve(async (req) => {
  const headers = { ...cors(req), 'Content-Type': 'application/json' };
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer /, '');
  const body = await req.json().catch(() => ({}));

  if (body.action === 'friday') {
    // Réservé à GitHub Actions (clé service_role)
    if (!token || token !== SERVICE_KEY) return reply({ error: 'Non autorisé.' }, 401);
    const { data } = await admin.from('push_subscriptions').select('endpoint, user_id, p256dh, auth');
    const subs = (data ?? []) as Sub[];
    if (!subs.length) return reply({ sent: 0, subscribers: 0 });
    const messages = await fridayMessages([...new Set(subs.map((s) => s.user_id))]);
    const sent = await send(subs, (userId) => messages.get(userId) ?? null);
    return reply({ sent, subscribers: subs.length });
  }

  if (body.action === 'test') {
    const { data: auth } = await admin.auth.getUser(token);
    const me = auth?.user?.id;
    if (!me) return reply({ error: 'Connecte-toi pour tester les notifications.' }, 401);
    const { data } = await admin.from('push_subscriptions').select('endpoint, user_id, p256dh, auth').eq('user_id', me);
    const sent = await send((data ?? []) as Sub[], () => ({
      title: 'Notifications activées',
      body: 'Tu recevras une notification le vendredi matin pour les sorties de tes artistes.',
      url: `${SITE}profil`,
      tag: 'test',
    }));
    return reply({ sent });
  }

  return reply({ error: 'Action inconnue.' }, 400);
});
