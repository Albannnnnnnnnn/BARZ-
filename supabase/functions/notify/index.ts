// Fonction Supabase « notify » (Deno) : envoie les notifications Web Push de BARZ¡.
// - friday : la notification du vendredi, personnalisée pour chaque membre abonné.
//            Appelée par GitHub Actions après la reconstruction du vendredi matin, avec la clé service_role.
// - test   : une notification de test vers ses propres appareils (appelée depuis le profil).
// - feedback : prévient Alban d'un nouveau retour (appelée depuis la page Retours, même sans compte).
// - friend   : demande d'ami reçue ou acceptée (appelée par un déclencheur de la base, supabase/notifications.sql).
// - barz     : un ami a publié un Barz (déclencheur sur barz, supabase/barz-notify.sql).
// - reply    : quelqu'un a répondu à ton Barz ; like : quelqu'un a aimé ton Barz, regroupés par Barz (« Léa et 2 autres
//              ont aimé ton Barz »), téléphone au plus une fois par heure (déclencheurs, supabase/barz-reactions-notify.sql).
// - client-error : erreur JavaScript chez un membre (src/scripts/error-report.ts), relevée dans le salon privé
//              #alertes du Discord (secret DISCORD_ALERTS_WEBHOOK_URL, facultatif).
// - releases : nouvelles sorties des artistes suivis, une seule fois chacune (pg_cron toutes les 15 min, entre 8h et 22h).
//
// Déploiement (par Alban) : supabase functions deploy notify --use-api
// Secrets : VAPID_PUBLIC_KEY et VAPID_PRIVATE_KEY (dans .env) ; SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont fournis
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const admin = createClient(Deno.env.get('SUPABASE_URL')!, SERVICE_KEY, { auth: { persistSession: false } });
const SITE = 'https://albannnnnnnnnn.github.io/BARZ-/';
webpush.setVapidDetails(SITE, Deno.env.get('VAPID_PUBLIC_KEY') ?? '', Deno.env.get('VAPID_PRIVATE_KEY') ?? '');

// Webhook du salon privé #alertes : erreurs JavaScript des membres
const DISCORD_ALERTS_WEBHOOK_URL = Deno.env.get('DISCORD_ALERTS_WEBHOOK_URL') ?? '';
// Garde-fou : la même erreur une fois par heure au plus, et 30 alertes par heure en tout (par instance de la fonction)
const alertSeen = new Map<string, number>();
let alertWindow = { start: 0, count: 0 };

// Alban : reçoit les notifications des retours (même identifiant que is_barz_admin dans supabase/feedback.sql)
const ADMIN_ID = '1b7ffb47-27e0-47ec-8bf2-1d516f3035dd';

const ORIGINS =['https://albannnnnnnnnn.github.io', 'http://127.0.0.1:4322', 'http://localhost:4322'];
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
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(m), { TTL: 6 * 3600, urgency: 'high' });
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

// Appels réservés à la base et à GitHub Actions : la passerelle Supabase a déjà vérifié la signature du jeton,
// il reste à lire son rôle (le texte de la clé injectée dans la fonction diffère de celui du .env)
function isServiceRole(token: string): boolean {
  try {
    return JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).role === 'service_role';
  } catch {
    return false;
  }
}

// Heure, jour de la semaine et date à Paris
function parisNow() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hour: 'numeric', hourCycle: 'h23', weekday: 'short' }).formatToParts(new Date()).map((p) => [p.type, p.value])
  );
  return { hour: Number(parts.hour), weekday: parts.weekday, today: new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date()) };
}

// Boîte de notifications de l'appli (la cloche, supabase/inbox.sql) : écrite pour chaque destinataire,
// qu'il ait activé ou non les notifications du téléphone. On en profite pour oublier celles de plus de 60 jours.
type Kind = 'friend' | 'barz' | 'release' | 'friday' | 'feedback' | 'reply' | 'like';
async function toInbox(kind: Kind, entries: [string, Message][]) {
  if (!entries.length) return;
  const rows = entries.map(([user_id, m]) => ({ user_id, kind, title: m.title, body: m.body, url: m.url }));
  for (let i = 0; i < rows.length; i += 500) await admin.from('notifications').insert(rows.slice(i, i + 500));
  await admin.from('notifications').delete().lt('created_at', new Date(Date.now() - 60 * 86400_000).toISOString());
}

const subsOf = async (userIds: string[]) =>
  ((await admin.from('push_subscriptions').select('endpoint, user_id, p256dh, auth').in('user_id', userIds)).data ?? []) as Sub[];

// Nom comparable (mêmes règles que src/lib/feat.ts)
const normName = (name: string) => name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '');
const listNames = (names: string[]) => (names.length > 1 ? `${names.slice(0, -1).join(', ')} et ${names[names.length - 1]}` : names[0] ?? '');

type ReleaseRow = { id: string; slug: string; title?: string; artist_id: string | null; metadata: { featuring?: string[] } | null; artist: { name: string } | null };

// Artistes suivis par membre : identifiants et noms comparables (pour les feats)
async function followsOf(userIds: string[]) {
  const { data: follows } = await admin.from('follows').select('user_id, artist_id, artist:artists(name)').in('user_id', userIds);
  const byUser = new Map<string, { ids: Set<string>; names: Map<string, string> }>();
  for (const f of (follows ?? []) as unknown as { user_id: string; artist_id: string; artist: { name: string } | null }[]) {
    const u = byUser.get(f.user_id) ?? { ids: new Set(), names: new Map() };
    u.ids.add(f.artist_id);
    if (f.artist?.name) u.names.set(normName(f.artist.name), f.artist.name);
    byUser.set(f.user_id, u);
  }
  return byUser;
}

// Sorties d'un membre : à son artiste suivi, ou avec un artiste suivi en feat ; et le nom suivi à afficher
function matchFollowed(all: ReleaseRow[], u: { ids: Set<string>; names: Map<string, string> } | undefined) {
  if (!u) return { mine: [] as ReleaseRow[], shownName: (_: ReleaseRow) => undefined as string | undefined };
  const mine = all.filter((r) => (r.artist_id && u.ids.has(r.artist_id)) || (r.metadata?.featuring ?? []).some((n) => u.names.has(normName(n))));
  const shownName = (r: ReleaseRow) =>
    r.artist_id && u.ids.has(r.artist_id) ? r.artist?.name : (r.metadata?.featuring ?? []).map((n) => u.names.get(normName(n))).find(Boolean);
  return { mine, shownName };
}

// Plusieurs sorties : la page qui n'affiche qu'elles (src/pages/selection.astro)
function selectionUrl(rows: ReleaseRow[]): string {
  return `${SITE}selection?ids=${rows.slice(0, 100).map((r) => r.id).join(',')}`;
}

// Sorties déjà annoncées, pour ne jamais notifier deux fois
async function markNotified(rows: { user_id: string; release_id: string }[]) {
  for (let i = 0; i < rows.length; i += 500) await admin.from('notified_releases').upsert(rows.slice(i, i + 500), { onConflict: 'user_id,release_id', ignoreDuplicates: true });
}

async function fridayMessages(userIds: string[]): Promise<{ messages: Map<string, Message>; announced: { user_id: string; release_id: string }[] }> {
  // Date du jour à Paris
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date());
  const [{ data: releases }, byUser] = await Promise.all([
    admin.from('releases').select('id, slug, artist_id, metadata, artist:artists!artist_id(name)').eq('release_date', today).limit(3000),
    followsOf(userIds),
  ]);
  const all = (releases ?? []) as unknown as ReleaseRow[];
  const announced: { user_id: string; release_id: string }[] = [];

  const messages = new Map<string, Message>();
  for (const userId of userIds) {
    // Ses artistes : sorties à leur nom, ou invités en feat ; le nom affiché est celui de l'artiste suivi
    const { mine, shownName } = matchFollowed(all, byUser.get(userId));
    for (const r of mine) announced.push({ user_id: userId, release_id: r.id });
    const artists = [...new Set(mine.map(shownName).filter((n): n is string => !!n))];
    if (mine.length) {
      const shown = artists.slice(0, 3);
      const rest = artists.length - shown.length;
      messages.set(userId, {
        title: `${mine.length} sortie${mine.length > 1 ? 's' : ''} de tes artistes aujourd’hui`,
        body: `${listNames(rest > 0 ? [...shown, `${rest} autre${rest > 1 ? 's' : ''}`] : shown)}. Et ${all.length} nouveautés en tout sur BARZ¡.`,
        url: mine.length === 1 ? `${SITE}releases/${mine[0].slug}` : selectionUrl(mine),
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
  return { messages, announced };
}

// Nouvelles sorties des artistes suivis (enregistrées ces 3 derniers jours, déjà sorties), pas encore annoncées
async function releaseMessages(userIds: string[], today: string): Promise<{ messages: Map<string, Message>; announced: { user_id: string; release_id: string }[] }> {
  const since = new Date(Date.now() - 3 * 86400_000).toISOString();
  const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10);
  const [{ data: releases }, byUser] = await Promise.all([
    admin
      .from('releases')
      .select('id, slug, title, artist_id, metadata, artist:artists!artist_id(name)')
      .gte('created_at', since)
      .gte('release_date', weekAgo)
      .lte('release_date', today)
      .limit(5000),
    followsOf(userIds),
  ]);
  const all = (releases ?? []) as unknown as ReleaseRow[];
  const messages = new Map<string, Message>();
  const announced: { user_id: string; release_id: string }[] = [];
  if (!all.length) return { messages, announced };
  const { data: done } = await admin.from('notified_releases').select('user_id, release_id').in('user_id', userIds).gte('created_at', new Date(Date.now() - 10 * 86400_000).toISOString());
  const seen = new Set(((done ?? []) as { user_id: string; release_id: string }[]).map((d) => `${d.user_id}:${d.release_id}`));

  for (const userId of userIds) {
    const { mine, shownName } = matchFollowed(all, byUser.get(userId));
    const fresh = mine.filter((r) => !seen.has(`${userId}:${r.id}`));
    if (!fresh.length) continue;
    for (const r of fresh) announced.push({ user_id: userId, release_id: r.id });
    if (fresh.length === 1) {
      const r = fresh[0];
      const feat = !(r.artist_id && byUser.get(userId)?.ids.has(r.artist_id));
      messages.set(userId, {
        title: feat ? `${shownName(r)} en feat` : `Nouveau : ${shownName(r) ?? r.artist?.name}`,
        body: `« ${r.title ?? 'Nouvelle sortie'} »${feat && r.artist?.name ? ` de ${r.artist.name}` : ''} vient de sortir. À écouter sur BARZ¡.`,
        url: `${SITE}releases/${r.slug}`,
        tag: `release-${r.id}`,
      });
    } else {
      const artists = [...new Set(fresh.map(shownName).filter((n): n is string => !!n))];
      const shown = artists.slice(0, 3);
      const rest = artists.length - shown.length;
      messages.set(userId, {
        title: `${fresh.length} nouvelles sorties de tes artistes`,
        body: `${listNames(rest > 0 ? [...shown, `${rest} autre${rest > 1 ? 's' : ''}`] : shown)}.`,
        url: selectionUrl(fresh),
        tag: `releases-${today}`,
      });
    }
  }
  return { messages, announced };
}

Deno.serve(async (req) => {
  const headers = { ...cors(req), 'Content-Type': 'application/json' };
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer /, '');
  const body = await req.json().catch(() => ({}));

  if (body.action === 'friday') {
    // pg_cron le vendredi à 7h et 8h UTC (supabase/friday-cron.sql) : seul le passage de 9h à Paris envoie,
    // ce qui suit le changement d'heure. Sans « hour », envoi immédiat (test à la main).
    if (!isServiceRole(token)) return reply({ error: 'Non autorisé.' }, 401);
    const { hour, weekday } = parisNow();
    if (typeof body.hour === 'number' && (weekday !== 'Fri' || hour !== body.hour)) return reply({ skipped: `${weekday} ${hour}h à Paris` });
    // Abonnés au téléphone, et tous les membres qui suivent des artistes (pour la cloche)
    const [{ data }, { data: followers }] = await Promise.all([
      admin.from('push_subscriptions').select('endpoint, user_id, p256dh, auth'),
      admin.from('follows').select('user_id').limit(20000),
    ]);
    const subs = (data ?? []) as Sub[];
    const userIds = [...new Set([...subs.map((s) => s.user_id), ...(followers ?? []).map((f) => f.user_id as string)])];
    if (!userIds.length) return reply({ sent: 0, subscribers: 0 });
    const { messages, announced } = await fridayMessages(userIds);
    const sent = await send(subs, (userId) => messages.get(userId) ?? null);
    await markNotified(announced); // la vérification des sorties ne les annoncera pas une deuxième fois
    const withArtists = new Set(announced.map((a) => a.user_id)); // dans la cloche : seulement les sorties de ses artistes
    await toInbox('friday', [...messages].filter(([userId]) => withArtists.has(userId)));
    return reply({ sent, subscribers: subs.length });
  }

  if (body.action === 'friend') {
    // Déclencheur de la table friendships (supabase/notifications.sql)
    if (!isServiceRole(token)) return reply({ error: 'Non autorisé.' }, 401);
    const accepted = body.event === 'accepted';
    const from = String(accepted ? body.addressee : body.requester); // celui qui agit
    const to = String(accepted ? body.requester : body.addressee); // celui qu'on prévient
    const { data: who } = await admin.from('profiles').select('username, display_name').eq('id', from).maybeSingle();
    if (!who) return reply({ sent: 0 });
    const message: Message = {
      title: accepted ? 'Demande acceptée' : 'Nouvelle demande d’ami',
      body: accepted ? `${who.display_name} (@${who.username}) a accepté ta demande d’ami.` : `${who.display_name} (@${who.username}) veut être ton ami sur BARZ¡.`,
      url: accepted ? `${SITE}profil?u=${encodeURIComponent(who.username)}` : `${SITE}profil`,
      tag: `friend-${from}`,
    };
    const sent = await send(await subsOf([to]), () => message);
    await toInbox('friend', [[to, message]]);
    return reply({ sent });
  }

  if (body.action === 'barz') {
    // Déclencheur de la table barz : prévient les amis de l'auteur
    if (!isServiceRole(token)) return reply({ error: 'Non autorisé.' }, 401);
    const { data: b } = await admin
      .from('barz')
      .select('user_id, score, body, author:profiles!barz_user_id_fkey(username, display_name), release:releases(slug, title)')
      .eq('id', String(body.barz))
      .maybeSingle();
    const barz = b as unknown as { user_id: string; score: number; body: string; author: { username: string; display_name: string } | null; release: { slug: string; title: string } | null } | null;
    if (!barz?.author || !barz.release) return reply({ sent: 0 });
    const { data: links } = await admin
      .from('friendships')
      .select('requester_id, addressee_id')
      .eq('status', 'accepted')
      .or(`requester_id.eq.${barz.user_id},addressee_id.eq.${barz.user_id}`);
    const friends = (links ?? []).map((f) => (f.requester_id === barz.user_id ? f.addressee_id : f.requester_id));
    if (!friends.length) return reply({ sent: 0 });
    const text = barz.body.length > 110 ? `${barz.body.slice(0, 109)}…` : barz.body;
    const message: Message = {
      title: `${barz.author!.display_name} a publié un Barz`,
      body: `${barz.release!.title} · ${Number(barz.score).toFixed(1)}/10 — « ${text} »`,
      url: `${SITE}releases/${barz.release!.slug}`,
      tag: `barz-${String(body.barz)}`,
    };
    const sent = await send(await subsOf(friends), () => message);
    await toInbox('barz', friends.map((f) => [f, message] as [string, Message]));
    return reply({ sent, friends: friends.length });
  }

  if (body.action === 'reply') {
    // Déclencheur de la table barz_replies : prévient l'auteur du Barz (pas quand il se répond à lui-même)
    if (!isServiceRole(token)) return reply({ error: 'Non autorisé.' }, 401);
    const { data } = await admin
      .from('barz_replies')
      .select('user_id, body, author:profiles!barz_replies_user_id_fkey(display_name), barz:barz(user_id, release:releases(slug, title))')
      .eq('id', String(body.reply))
      .maybeSingle();
    const r = data as unknown as { user_id: string; body: string; author: { display_name: string } | null; barz: { user_id: string; release: { slug: string; title: string } | null } | null } | null;
    if (!r?.author || !r.barz?.release || r.barz.user_id === r.user_id) return reply({ sent: 0 });
    const text = r.body.length > 110 ? `${r.body.slice(0, 109)}…` : r.body;
    const message: Message = {
      title: `${r.author.display_name} a répondu à ton Barz`,
      body: `${r.barz.release.title} — « ${text} »`,
      url: `${SITE}releases/${r.barz.release.slug}`,
      tag: `reply-${String(body.reply)}`,
    };
    const sent = await send(await subsOf([r.barz.user_id]), () => message);
    await toInbox('reply', [[r.barz.user_id, message]]);
    return reply({ sent });
  }

  if (body.action === 'like') {
    // Déclencheur de la table barz_likes : une seule notification par Barz dans la cloche, remplacée à chaque ♥
    // (« Léa et 2 autres… ») ; sur le téléphone, au plus une par heure et par Barz
    if (!isServiceRole(token)) return reply({ error: 'Non autorisé.' }, 401);
    const barzId = String(body.barz);
    const [{ data: b }, { data: liker }, { data: likes }] = await Promise.all([
      admin.from('barz').select('user_id, body, release:releases(slug, title)').eq('id', barzId).maybeSingle(),
      admin.from('profiles').select('display_name').eq('id', String(body.user)).maybeSingle(),
      admin.from('barz_likes').select('user_id').eq('barz_id', barzId),
    ]);
    const barz = b as unknown as { user_id: string; body: string; release: { slug: string; title: string } | null } | null;
    if (!barz?.release || !liker || barz.user_id === String(body.user)) return reply({ sent: 0 });
    const others = (likes ?? []).filter((l) => l.user_id !== barz.user_id && l.user_id !== String(body.user)).length;
    const name = (liker as { display_name: string }).display_name;
    const text = barz.body.length > 80 ? `${barz.body.slice(0, 79)}…` : barz.body;
    const message: Message = {
      title: others ? `${name} et ${others} autre${others > 1 ? 's' : ''} ont aimé ton Barz` : `${name} a aimé ton Barz`,
      body: `${barz.release.title} — « ${text} »`,
      url: `${SITE}releases/${barz.release.slug}`,
      tag: `like-${barzId}`,
    };
    // La notification non lue de ce Barz est remplacée ; si elle a moins d'une heure, pas de nouvelle alerte sur le téléphone
    const { data: previous } = await admin
      .from('notifications')
      .delete()
      .eq('user_id', barz.user_id)
      .eq('kind', 'like')
      .eq('url', message.url)
      .is('read_at', null)
      .select('created_at');
    const recent = (previous ?? []).some((n) => Date.now() - Date.parse(n.created_at) < 3600_000);
    const sent = recent ? 0 : await send(await subsOf([barz.user_id]), () => message);
    await toInbox('like', [[barz.user_id, message]]);
    return reply({ sent, grouped: recent });
  }

  if (body.action === 'releases') {
    // pg_cron toutes les 15 minutes (supabase/notifications.sql)
    if (!isServiceRole(token)) return reply({ error: 'Non autorisé.' }, 401);
    const { hour, weekday, today } = parisNow();
    // Pas la nuit (les sorties de minuit attendent 8h) ; le vendredi, la notification de 9h annonce d'abord les sorties de la nuit
    if (hour < 8 || hour >= 22) return reply({ skipped: 'nuit' });
    if (weekday === 'Fri' && hour < 10) return reply({ skipped: 'vendredi matin' });
    // Tous les membres qui suivent des artistes : la cloche pour tous, le téléphone pour ceux qui l'ont activé
    const [{ data }, { data: followers }] = await Promise.all([
      admin.from('push_subscriptions').select('endpoint, user_id, p256dh, auth'),
      admin.from('follows').select('user_id').limit(20000),
    ]);
    const subs = (data ?? []) as Sub[];
    const userIds = [...new Set((followers ?? []).map((f) => f.user_id as string))];
    if (!userIds.length) return reply({ sent: 0 });
    const { messages, announced } = await releaseMessages(userIds, today);
    if (!announced.length) return reply({ sent: 0 });
    await markNotified(announced); // avant l'envoi : deux passages rapprochés n'enverront pas deux fois
    const sent = await send(subs, (userId) => messages.get(userId) ?? null);
    await toInbox('release', [...messages]);
    return reply({ sent, releases: announced.length });
  }

  if (body.action === 'test') {
    const { data: auth } = await admin.auth.getUser(token);
    const me = auth?.user?.id;
    if (!me) return reply({ error: 'Connecte-toi pour tester les notifications.' }, 401);
    const { data } = await admin.from('push_subscriptions').select('endpoint, user_id, p256dh, auth').eq('user_id', me);
    const sent = await send((data ?? []) as Sub[], () => ({
      title: 'Notifications activées',
      body: 'Tu seras prévenu des sorties de tes artistes, des demandes d’ami, des Barz de tes amis et des nouveautés du vendredi.',
      url: `${SITE}profil`,
      tag: 'test',
    }));
    return reply({ sent });
  }

  if (body.action === 'client-error') {
    // Appelée par le navigateur des membres, sans compte : seulement depuis le site, et jamais en rafale
    if (!ORIGINS.includes(req.headers.get('Origin') ?? '') || !DISCORD_ALERTS_WEBHOOK_URL) return reply({ ok: false });
    const clip = (v: unknown, n: number) => String(v ?? '').slice(0, n);
    const message = clip(body.message, 300);
    if (!message) return reply({ ok: false }, 400);
    const now = Date.now();
    if (now - alertWindow.start > 3600_000) alertWindow = { start: now, count: 0 };
    const key = `${message}|${clip(body.source, 200)}`;
    if ((alertSeen.get(key) ?? 0) > now - 3600_000 || alertWindow.count >= 30) return reply({ ok: false, skipped: true });
    alertSeen.set(key, now);
    alertWindow.count++;
    const field = (name: string, value: string) => (value ? [{ name, value: value.slice(0, 1000) }] : []);
    const res = await fetch(DISCORD_ALERTS_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'BARZ¡ alertes',
        allowed_mentions: { parse: [] },
        embeds: [
          {
            title: `Erreur : ${message}`.slice(0, 256),
            color: 0xe0533b,
            fields: [
              ...field('Page', clip(body.page, 300)),
              ...field('Fichier', clip(body.source, 300)),
              ...field('Pile', body.stack ? `\`\`\`\n${clip(body.stack, 900)}\n\`\`\`` : ''),
              ...field('Appareil', clip(body.device, 300)),
              ...field('Version', clip(body.version, 40)),
            ],
          },
        ],
      }),
    }).catch(() => null);
    return reply({ ok: !!res?.ok });
  }

  if (body.action === 'feedback') {
    // Appelée par la page Retours juste après l'envoi : prévient Alban, une seule fois par retour récent
    const id = String(body.id ?? '');
    if (!/^[0-9a-f-]{36}$/.test(id)) return reply({ error: 'Retour inconnu.' }, 400);
    const since = new Date(Date.now() - 10 * 60_000).toISOString();
    const { data: claimed } = await admin
      .from('feedback')
      .update({ notified_at: new Date().toISOString() })
      .eq('id', id)
      .is('notified_at', null)
      .gte('created_at', since)
      .select('kind, body')
      .maybeSingle();
    if (!claimed) return reply({ sent: 0 });
    const { data } = await admin.from('push_subscriptions').select('endpoint, user_id, p256dh, auth').eq('user_id', ADMIN_ID);
    const label = { bug: 'Bug signalé', idee: 'Nouvelle idée', remarque: 'Nouvelle remarque' }[claimed.kind as string] ?? 'Nouveau retour';
    const text = String(claimed.body);
    const message: Message = { title: label, body: text.length > 140 ? `${text.slice(0, 139)}…` : text, url: `${SITE}retours`, tag: `feedback-${id}` };
    const sent = await send((data ?? []) as Sub[], () => message);
    await toInbox('feedback', [[ADMIN_ID, message]]);
    return reply({ sent });
  }

  return reply({ error: 'Action inconnue.' }, 400);
});
