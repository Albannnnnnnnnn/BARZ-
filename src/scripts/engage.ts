// Ce qui donne envie de revenir sur BARZ¡ (côté navigateur) :
// - « Depuis ta dernière visite » : nouvelles sorties des artistes suivis, Barz des amis, demandes d'ami ;
// - le défi de la semaine « Sors de ta bulle » (supabase/challenges.sql).
// Le bilan du mois (src/pages/bilan.astro) réutilise challengesOf().
import { getSession, myFollows, myFriendships, supabase } from './social';
import { loadTaste, rank, recentReleases, scoreRelease, type RecentRelease, type Taste } from './reco';

// Date locale au format AAAA-MM-JJ (toISOString passerait en UTC)
export function localDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ============================================================
// DERNIÈRE VISITE
// ============================================================
const LAST_KEY = 'barz-last-visit';
const SINCE_KEY = 'barz-visit-since';

// Visite précédente, figée pour la session de navigation : le bandeau ne disparaît pas au rechargement.
// Stockée dans ce navigateur seulement ; sans stockage disponible, pas de bandeau.
export function previousVisit(): Date | null {
  try {
    let since = sessionStorage.getItem(SINCE_KEY);
    if (since === null) {
      since = localStorage.getItem(LAST_KEY) ?? '';
      sessionStorage.setItem(SINCE_KEY, since);
    }
    localStorage.setItem(LAST_KEY, new Date().toISOString());
    return since ? new Date(since) : null;
  } catch {
    return null;
  }
}

export type VisitNews = {
  releases: { title: string; slug: string; artistName: string }[];
  friendBarz: number;
  friendNames: string[];
  requests: number;
};

export async function newsSince(since: Date): Promise<VisitNews | null> {
  const session = await getSession();
  if (!session || !supabase) return null;
  const [follows, friendships] = await Promise.all([myFollows().catch(() => []), myFriendships().catch(() => [])]);
  const followIds = follows.map((a) => a.id).slice(0, 300);
  const friends = friendships.filter((f) => f.status === 'friends');
  const names = new Map(friends.map((f) => [f.profile.id, f.profile.display_name]));

  const [releases, barz] = await Promise.all([
    followIds.length
      ? supabase
          .from('releases')
          .select('title, slug, artist:artists!artist_id(name)')
          .in('artist_id', followIds)
          .gt('release_date', localDay(since))
          .lte('release_date', localDay(new Date()))
          .order('release_date', { ascending: false })
          .limit(20)
      : Promise.resolve({ data: [] }),
    friends.length
      ? supabase.from('barz').select('user_id').in('user_id', [...names.keys()]).gt('created_at', since.toISOString())
      : Promise.resolve({ data: [] }),
  ]);
  const authors = [...new Set(((barz.data ?? []) as { user_id: string }[]).map((b) => b.user_id))];
  return {
    releases: ((releases.data ?? []) as any[]).map((r) => ({ title: r.title, slug: r.slug, artistName: r.artist?.name ?? '' })),
    friendBarz: (barz.data ?? []).length,
    friendNames: authors.map((id) => names.get(id)!).filter(Boolean),
    requests: friendships.filter((f) => f.status === 'received').length,
  };
}

// ============================================================
// DÉFI DE LA SEMAINE
// ============================================================
// Lundi de la semaine en cours
export function weekStart(d = new Date()): string {
  const monday = new Date(d);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return localDay(monday);
}

export type Challenge = { week: string; release: RecentRelease; reason: string; done: boolean; doneCount: number };

const hash = (text: string) => [...text].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7) >>> 0;

// Un disque déjà sorti, hors de la bulle : ni écouté, ni d'un artiste suivi ou aimé
async function pickRelease(uid: string, week: string, taste: Taste): Promise<RecentRelease | null> {
  const today = localDay(new Date());
  const pool = (await recentReleases()).filter(
    (r) => r.release_date <= today && r.cover_url && !taste.listened.has(r.id) && !(r.artistId && (taste.followed.has(r.artistId) || (taste.artistWeights.get(r.artistId) ?? 0) > 0))
  );
  const ranked = rank(pool, taste, 0.85).slice(0, 12);
  if (!ranked.length) return null;
  // Parmi les meilleurs candidats, un choix qui varie d'un membre et d'une semaine à l'autre
  return ranked[hash(uid + week) % ranked.length]!.item;
}

async function releaseById(id: string): Promise<RecentRelease | null> {
  const cached = (await recentReleases()).find((r) => r.id === id);
  if (cached || !supabase) return cached ?? null;
  const { data } = await supabase.from('releases').select('id, title, slug, cover_url, release_type, release_date, genres, metadata, artist:artists!artist_id(id, name)').eq('id', id).maybeSingle();
  const r = data as any;
  return r ? { ...r, artistId: r.artist?.id ?? null, artistName: r.artist?.name ?? '', genres: r.genres ?? [], fans: r.metadata?.fans ?? null } : null;
}

// Défis d'un membre (du plus récent au plus ancien), relevés ou non
export async function challengesOf(uid: string): Promise<{ week: string; releaseId: string; done: boolean }[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('challenges').select('week_start, release_id').eq('user_id', uid).order('week_start', { ascending: false });
  if (error || !data?.length) return [];
  const ids = data.map((c) => c.release_id as string);
  const [listened, barz] = await Promise.all([
    supabase.from('listened').select('release_id').eq('user_id', uid).in('release_id', ids),
    supabase.from('barz').select('release_id').eq('user_id', uid).in('release_id', ids),
  ]);
  const done = new Set([...(listened.data ?? []), ...(barz.data ?? [])].map((r) => r.release_id as string));
  return data.map((c) => ({ week: c.week_start as string, releaseId: c.release_id as string, done: done.has(c.release_id as string) }));
}

export async function weeklyChallenge(): Promise<Challenge | null> {
  const session = await getSession();
  if (!session || !supabase) return null;
  const taste = await loadTaste();
  if (!taste || taste.empty) return null;
  const uid = session.user.id;
  const week = weekStart();

  // Le disque de la semaine est enregistré au premier affichage ; sans la table, il est recalculé à chaque fois
  const existing = await supabase.from('challenges').select('release_id').eq('user_id', uid).eq('week_start', week).maybeSingle();
  const stored = !existing.error;
  let release = existing.data?.release_id ? await releaseById(existing.data.release_id) : null;
  if (!release) {
    release = await pickRelease(uid, week, taste);
    if (!release) return null;
    if (stored) await supabase.from('challenges').insert({ user_id: uid, week_start: week, release_id: release.id });
  }

  const history = stored ? await challengesOf(uid) : [];
  const done = history.find((c) => c.week === week)?.done ?? false;
  return {
    week,
    release,
    reason: scoreRelease(release, taste, 0.85).reason,
    done,
    doneCount: history.filter((c) => c.done).length,
  };
}
