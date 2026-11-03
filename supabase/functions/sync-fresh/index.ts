// Fonction Supabase « sync-fresh » (Deno), exécutée à Paris (x-region: eu-west-3) et appelée par pg_cron
// (supabase/fresh.sql) :
// - veille  : toutes les 5 min, les sorties du jour des artistes qui comptent le plus (watchlist, artistes suivis
//             par les membres, les plus écoutés, nouveautés Deezer), plus une tranche des autres artistes du
//             catalogue suivis par la synchro complète, à tour de rôle (chacun revu environ toutes les 4 h). Les nouvelles sont enregistrées tout de suite
//             avec une notification immédiate aux membres qui suivent l'artiste, et le site est reconstruit
//             (au plus une fois toutes les 30 min). La synchro complète
//             (scripts/sync-releases.ts) repasse ensuite derrière et complète les lignes.
// - minuit  : lance la synchro complète sur GitHub à minuit heure de Paris, à l'heure (les tâches programmées de
//             GitHub partent avec beaucoup de retard). pg_cron appelle à 22h05 et 23h05 UTC ; seul l'appel qui
//             tombe à 0h à Paris lance la synchro (heure d'été comme d'hiver).
//
// Déploiement : npx supabase@latest functions deploy sync-fresh --use-api
// Secret : GITHUB_DISPATCH_TOKEN (jeton GitHub limité au dépôt BARZ-, droit Actions en écriture)
import { createClient } from 'npm:@supabase/supabase-js@2';
import watchlistFile from '../../../scripts/artist-watchlist.json' with { type: 'json' };
import { appleReleases, normTitle, type AppleAlbum } from './apple.ts';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const REPO = 'Albannnnnnnnnn/BARZ-';
// Les plus écoutés passés en revue à chaque veille (en plus de la watchlist et des artistes suivis)
const TOP_ARTISTS = 300;
// Même seuil que la synchro complète (SYNC_CATALOG_MIN_AUDIENCE) pour les nouveautés Deezer et le roulement
const MIN_AUDIENCE = 30_000;
// Roulement : les artistes du catalogue que suit la synchro complète (environ 7 000), ROTATION_SIZE par passage,
// une tranche différente toutes les 5 min ; sans lui, ceux hors du top et que personne ne suit attendaient minuit
const ROTATION_MIN_AUDIENCE = MIN_AUDIENCE;
const ROTATION_SIZE = 150;
// Sorties datées d'aujourd'hui ou des jours précédents (ajouts tardifs de Deezer)
const DAYS_BACK = 3;
const DEPLOY_EVERY_MS = 30 * 60_000; // la page Sorties montre déjà les nouvelles en direct ; quota GitHub Actions (dépôt privé)
const JUNK_TITLE = /slowed|sped up|reverb|vocals only|instrumental|karaoke|8d audio|nightcore/i;

// Enregistrements live (concert, Tiny Desk, session…) : classés « live », même si Deezer les donne en album ou EP.
// Le titre du disque le dit, ou chacun de ses morceaux porte la mention « (Live…) ».
const LIVE_TITLE = /\blive (at|from|in|on|à|au|aux|@|las|symphonique|acoustique|acoustic|\d)|[(\[]\s*live\b|\blive\s*[)\]]|\blive$|tiny desk|unplugged|\ben concert\b|\blive sessions?\b|colors show/i;
const LIVE_TRACK = /[(\[-]\s*live\b/i;
function isLive(album: any): boolean {
  const tracks: any[] = album.tracks?.data ?? [];
  return LIVE_TITLE.test(album.title ?? '') || (tracks.length >= 2 && tracks.every((t) => LIVE_TRACK.test(t.title ?? '')));
}

// Mêmes règles que scripts/lib/common.ts (slugify, stableSlug, mapGenre) : les lignes doivent avoir le même slug
// que celles de la synchro complète, qui les met à jour ensuite
function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

async function stableSlug(text: string, suffix: string): Promise<string> {
  let base = slugify(text);
  if (!base) {
    const hash = new Uint8Array(await crypto.subtle.digest('SHA-1', new TextEncoder().encode(text)));
    base = [...hash].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 10);
  }
  return `${base}-${suffix}`;
}

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
const mapGenre = (name: string) => GENRE_RULES.find(([, re]) => re.test(name.toLowerCase()))?.[0] ?? null;

function deezerType(recordType: string): string | null {
  return ({ album: 'album', ep: 'ep', compile: 'compilation', single: 'single' } as Record<string, string>)[recordType] ?? null;
}

// Deezer : un départ de requête toutes les 110 ms au plus, comme dans la synchro complète
let nextSlot = 0;
async function deezer(endpoint: string): Promise<any | null> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const slot = Math.max(Date.now(), nextSlot);
    nextSlot = slot + 110;
    if (slot > Date.now()) await new Promise((r) => setTimeout(r, slot - Date.now()));
    try {
      const json = await fetch(`https://api.deezer.com${endpoint}`, { signal: AbortSignal.timeout(10_000) }).then((r) => r.json());
      if (json?.error?.code === 4) {
        await new Promise((r) => setTimeout(r, 5000)); // quota dépassé
        continue;
      }
      return json?.error ? null : json;
    } catch {
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
  return null;
}

function parisDate(offsetDays = 0): string {
  return new Date(Date.now() + offsetDays * 86_400_000).toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
}

// Lance un workflow GitHub (workflow_dispatch)
async function dispatch(workflow: string, inputs?: Record<string, string>): Promise<boolean> {
  const token = Deno.env.get('GITHUB_DISPATCH_TOKEN');
  if (!token) throw new Error('GITHUB_DISPATCH_TOKEN manquant');
  const res = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/${workflow}/dispatches`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'BARZ-sync-fresh' },
    body: JSON.stringify({ ref: 'main', ...(inputs ? { inputs } : {}) }),
  });
  if (!res.ok) console.error(`GitHub ${workflow} : HTTP ${res.status} ${await res.text()}`);
  return res.ok;
}

type Artist = { id: string; name: string; deezer_id: number; watched: boolean };

// Tranche du roulement pour ce passage : les artistes rangés par identifiant, découpés en tranches de ROTATION_SIZE,
// la tranche choisie d'après l'heure (une nouvelle toutes les 5 min, puis on recommence)
async function rotationSlice(): Promise<{ rows: any[]; slice: number; slices: number }> {
  const eligible = () => admin.from('artists').select('id, name, deezer_id', { count: 'exact' }).not('deezer_id', 'is', null).gte('audience', ROTATION_MIN_AUDIENCE);
  const { count } = await eligible().limit(1);
  if (!count) return { rows: [], slice: 0, slices: 0 };
  const slices = Math.ceil(count / ROTATION_SIZE);
  const slice = Math.floor(Date.now() / (5 * 60_000)) % slices;
  const { data } = await eligible().order('id').range(slice * ROTATION_SIZE, slice * ROTATION_SIZE + ROTATION_SIZE - 1);
  return { rows: data ?? [], slice, slices };
}

// Table release_seen : une ligne par sortie (artiste + titre réduit), avec la première vue chez Deezer et chez Apple.
// Sans la table (SQL pas encore lancé), rien n'est noté.
async function recordSeen(deezerSeen: Map<string, { artist_id: string; title: string; release_date: string }>, apple: AppleAlbum[]) {
  const now = new Date().toISOString();
  const appleSeen = new Map(apple.map((a) => [`${a.artistId}|${normTitle(a.title)}`, { artist_id: a.artistId, title: a.title, release_date: a.releaseDate }]));
  const keys = [...new Set([...deezerSeen.keys(), ...appleSeen.keys()])];
  if (!keys.length) return;
  const existing = new Map<string, any>();
  for (let i = 0; i < keys.length; i += 200) {
    const { data, error } = await admin.from('release_seen').select('key, deezer_seen_at, apple_seen_at').in('key', keys.slice(i, i + 200));
    if (error) return;
    for (const row of data ?? []) existing.set(row.key, row);
  }
  const rows = keys
    .map((key) => {
      const old = existing.get(key);
      const info = deezerSeen.get(key) ?? appleSeen.get(key)!;
      const deezer_seen_at = old?.deezer_seen_at ?? (deezerSeen.has(key) ? now : null);
      const apple_seen_at = old?.apple_seen_at ?? (appleSeen.has(key) ? now : null);
      if (old && old.deezer_seen_at === deezer_seen_at && old.apple_seen_at === apple_seen_at) return null;
      return { key, ...info, deezer_seen_at, apple_seen_at };
    })
    .filter((row): row is NonNullable<typeof row> => !!row);
  for (let i = 0; i < rows.length; i += 500) await admin.from('release_seen').upsert(rows.slice(i, i + 500), { onConflict: 'key' });
}

async function veille() {
  const from = parisDate(-DAYS_BACK);
  const today = parisDate();

  // Artistes passés en revue : watchlist, suivis par les membres, les plus écoutés (une entrée par artiste Deezer)
  const artists = new Map<number, Artist>();
  const add = (rows: any[] | null, watched: boolean) => {
    for (const a of rows ?? []) {
      if (!a?.deezer_id) continue;
      const prev = artists.get(a.deezer_id);
      artists.set(a.deezer_id, { id: a.id, name: a.name, deezer_id: a.deezer_id, watched: watched || !!prev?.watched });
    }
  };
  const watchNames = Object.entries(watchlistFile as Record<string, unknown>)
    .filter(([key]) => !key.startsWith('_'))
    .flatMap(([, names]) => names as string[]);
  add((await admin.from('artists').select('id, name, deezer_id').in('name', watchNames)).data, true);
  add(((await admin.from('follows').select('artist:artists(id, name, deezer_id)')).data ?? []).map((f: any) => f.artist), true);
  add((await admin.from('artists').select('id, name, deezer_id').not('deezer_id', 'is', null).order('audience', { ascending: false }).limit(TOP_ARTISTS)).data, false);
  const rotation = await rotationSlice().catch(() => ({ rows: [], slice: 0, slices: 0 }));
  add(rotation.rows, false);

  // Apple Music en parallèle (sa propre limite de débit) : artistes de la watchlist et suivis par les membres
  const applePromise = appleReleases(admin, [...artists.values()].filter((a) => a.watched).map((a) => a.id), from, today).catch((err) => {
    console.error('Apple :', err);
    return null;
  });

  // Albums candidats : sortis dans la fenêtre, d'un type gardé par la synchro complète
  const candidates = new Map<number, Artist>();
  // Sorties vues chez Deezer pendant ce passage (artiste BARZ¡ + titre réduit), pour la mesure Deezer / Apple
  const seenOnDeezer = new Map<string, { artist_id: string; title: string; release_date: string }>();
  const queue = [...artists.values()];
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      for (let a = queue.shift(); a; a = queue.shift()) {
        const list = await deezer(`/artist/${a.deezer_id}/albums?limit=100`);
        for (const album of list?.data ?? []) {
          if (album.release_date >= from && album.release_date <= today && deezerType(album.record_type)) {
            candidates.set(album.id, a);
            seenOnDeezer.set(`${a.id}|${normTitle(album.title)}`, { artist_id: a.id, title: album.title, release_date: album.release_date });
          }
        }
      }
    })
  );

  // Nouveautés Deezer (France) : gardées si l'artiste est au catalogue avec assez d'audience
  const editorial = (await deezer('/editorial/0/releases?limit=100'))?.data ?? [];
  const editorialIds = [...new Set(editorial.filter((al: any) => !candidates.has(al.id) && al.release_date >= from && al.release_date <= today).map((al: any) => al.artist?.id).filter(Boolean))];
  if (editorialIds.length) {
    const known = (await admin.from('artists').select('id, name, deezer_id').in('deezer_id', editorialIds).gte('audience', MIN_AUDIENCE)).data ?? [];
    const byDeezer = new Map(known.map((k: any) => [k.deezer_id as number, { ...k, watched: false } as Artist]));
    for (const al of editorial) {
      const a = byDeezer.get(al.artist?.id);
      if (a && al.release_date >= from && al.release_date <= today && !candidates.has(al.id)) candidates.set(al.id, artists.get(a.deezer_id) ?? a);
    }
  }

  // Détail des albums, puis seulement ceux qui ne sont pas déjà en base (même slug que la synchro complète)
  const rows: any[] = [];
  const ids = [...candidates.keys()];
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      for (let id = ids.shift(); id; id = ids.shift()) {
        const a = await deezer(`/album/${id}`);
        const type = a && deezerType(a.record_type);
        if (!a || !type || !a.release_date || a.release_date < from || a.release_date > today || JUNK_TITLE.test(a.title)) continue;
        const artist = candidates.get(id)!;
        const genres = [...new Set((a.genres?.data ?? []).map((g: any) => mapGenre(g.name)).filter(Boolean))];
        rows.push({
          title: a.title,
          slug: await stableSlug(`${a.artist.name} ${a.title}`, a.release_date.slice(0, 4)),
          artist_id: artist.id,
          release_date: a.release_date,
          release_type: isLive(a) ? 'live' : type,
          cover_url: a.cover_xl ?? a.cover_big ?? (a.md5_image ? `https://cdn-images.dzcdn.net/images/cover/${a.md5_image}/1000x1000-000000-80-0-0.jpg` : null),
          genres,
          track_count: a.nb_tracks ?? 0,
          deezer_url: a.link ?? null,
          metadata: {
            featuring: (a.contributors ?? []).map((c: any) => c.name).filter((n: string) => n !== a.artist.name),
            watched: artist.watched,
            fans: a.fans ?? null,
            label: a.label ?? null,
            upc: a.upc ?? null,
            sources: ['deezer'],
          },
        });
      }
    })
  );
  // Apple : seulement ce que Deezer n'a pas (encore) ; Deezer garde la priorité, ses fiches sont plus complètes
  const apple: AppleAlbum[] = (await applePromise) ?? [];
  for (const al of apple) {
    if (seenOnDeezer.has(`${al.artistId}|${normTitle(al.title)}`) || JUNK_TITLE.test(al.title)) continue;
    rows.push({
      title: al.title,
      slug: await stableSlug(`${al.artistName} ${al.title}`, al.releaseDate.slice(0, 4)),
      artist_id: al.artistId,
      release_date: al.releaseDate,
      release_type: LIVE_TITLE.test(al.title) ? 'live' : al.type,
      cover_url: al.cover,
      genres: [mapGenre(al.genre ?? '')].filter(Boolean),
      track_count: al.trackCount,
      deezer_url: null,
      apple_music_url: al.url,
      metadata: { featuring: [], watched: true, fans: null, label: null, upc: null, sources: ['apple'] },
    });
  }

  // Déjà en base : même slug, ou même artiste et même titre réduit (la même sortie vue par l'autre source)
  const unique = [...new Map(rows.map((r) => [r.slug, r])).values()];
  const known = new Set(((await admin.from('releases').select('slug').in('slug', unique.map((r) => r.slug))).data ?? []).map((r: any) => r.slug));
  const artistIds = [...new Set(unique.map((r) => r.artist_id))];
  const sameTitle = new Set(
    ((await admin.from('releases').select('artist_id, title').in('artist_id', artistIds).gte('release_date', parisDate(-DAYS_BACK - 7))).data ?? []).map(
      (r: any) => `${r.artist_id}|${normTitle(r.title)}`
    )
  );
  const fresh = unique.filter((r) => !known.has(r.slug) && !sameTitle.has(`${r.artist_id}|${normTitle(r.title)}`));

  // Mesure Deezer / Apple (supabase/apple-source.sql) : première heure où chaque sortie est vue sur chaque plateforme
  await recordSeen(seenOnDeezer, apple).catch((err) => console.error('Mesure :', err));
  let notified: unknown = null;
  if (fresh.length) {
    const { error } = await admin.from('releases').upsert(fresh, { onConflict: 'slug', ignoreDuplicates: true });
    if (error) throw new Error(`Enregistrement : ${error.message}`);
    // Notification tout de suite à ceux qui suivent l'artiste, sans attendre le passage de notify (toutes les 15 min).
    // notify garde ses règles (pas la nuit, vendredi matin réservé à la notification de 9h, une seule fois par sortie).
    notified = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/notify`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'releases' }),
    })
      .then((r) => r.json())
      .catch((err) => ({ error: String(err) }));
  }

  // Reconstruction du site : dès qu’il y a du nouveau, au plus une fois toutes les 30 min (minutes GitHub comptées)
  const { data: state } = await admin.from('sync_state').select('last_deploy, pending').eq('id', 1).maybeSingle();
  const pending = !!state?.pending || fresh.length > 0;
  let deployed = false;
  if (pending && Date.now() - new Date(state?.last_deploy ?? 0).getTime() >= DEPLOY_EVERY_MS) {
    deployed = await dispatch('deploy.yml');
  }
  await admin.from('sync_state').upsert({ id: 1, pending: pending && !deployed, ...(deployed ? { last_deploy: new Date().toISOString() } : {}) });

  return {
    artistes: artists.size,
    roulement: `${rotation.slice + 1}/${rotation.slices}`,
    candidats: candidates.size,
    apple: apple.length,
    nouvelles: fresh.map((r) => (r.metadata.sources[0] === 'apple' ? `${r.title} (Apple)` : r.title)),
    notifications: notified,
    site_reconstruit: deployed,
  };
}

// Rôle du jeton : sa signature est déjà vérifiée par la passerelle Supabase (verify_jwt, actif par défaut)
function jwtRole(token: string): string | null {
  try {
    return JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).role ?? null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  // Réservé à pg_cron (clé service_role)
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer /, '');
  if (jwtRole(token) !== 'service_role') return reply({ error: 'Non autorisé.' }, 401);
  const body = await req.json().catch(() => ({}));

  try {
    if (body.action === 'veille') return reply(await veille());
    if (body.action === 'minuit') {
      const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hour: 'numeric', hourCycle: 'h23' }).format(new Date()));
      if (hour !== 0 && !body.force) return reply({ lancee: false, raison: `${hour}h à Paris` });
      return reply({ lancee: await dispatch('sync-releases.yml', { mode: 'minuit' }) });
    }
    return reply({ error: 'Action inconnue.' }, 400);
  } catch (err) {
    return reply({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
