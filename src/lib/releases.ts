// Lecture des sorties depuis la table releases (groupées par semaine, à venir, filtres de genre).
// Remplace la vue matérialisée weekly_releases, qui n'était jamais rafraîchie.
import { addDays, format, parseISO, startOfWeek } from 'date-fns';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { WeeklyReleases } from './supabase';
import { getSupabaseServerSafe } from './supabase';

export type ReleaseRow = {
  id: string;
  title: string;
  slug: string;
  release_date: string;
  release_type: string;
  cover_url: string | null;
  genres: string[];
  track_count: number;
  spotify_url: string | null;
  deezer_url: string | null;
  metadata: { watched?: boolean; featuring?: string[]; fans?: number | null; label?: string | null } | null;
  artist: { name: string; slug: string; image_url: string | null } | null;
};

// BARZ_TODAY=2026-10-23 permet de construire le site "comme si" on était à une autre date
export function getToday(): Date {
  const override = process.env.BARZ_TODAY;
  return override ? parseISO(override) : new Date();
}

export { GENRE_CHIPS, chipIdsFor } from './genres';

const RELEASE_FIELDS =
  'id, title, slug, release_date, release_type, cover_url, genres, track_count, spotify_url, deezer_url, metadata, artist:artists!artist_id(name, slug, image_url)';

export async function fetchReleasesBetween(
  supabase: SupabaseClient<any> | null,
  from: Date,
  to: Date
): Promise<ReleaseRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('releases')
    .select(RELEASE_FIELDS)
    .gte('release_date', format(from, 'yyyy-MM-dd'))
    .lte('release_date', format(to, 'yyyy-MM-dd'))
    .order('release_date', { ascending: false });
  if (error) {
    console.warn('Lecture des sorties impossible :', error.message);
    return [];
  }
  return (data ?? []) as unknown as ReleaseRow[];
}

export async function fetchWeeklyReleases(
  supabase: SupabaseClient<any> | null,
  from: Date,
  to: Date
): Promise<WeeklyReleases[]> {
  const rows = await fetchReleasesBetween(supabase, from, to);
  const weeks = new Map<string, ReleaseRow[]>();
  for (const release of [...rows].reverse()) {
    const weekStart = format(startOfWeek(parseISO(release.release_date), { weekStartsOn: 1 }), 'yyyy-MM-dd');
    if (!weeks.has(weekStart)) weeks.set(weekStart, []);
    weeks.get(weekStart)!.push(release);
  }
  return [...weeks.entries()].map(([week_start, releases]) => ({ week_start, releases })) as unknown as WeeklyReleases[];
}

// Données de la barre latérale, partagées par toutes les pages : une seule requête par build
type SidebarData = {
  followed: { name: string; slug: string; image_url: string | null; isNew: boolean }[];
  upcoming: ReleaseRow[];
};
let sidebarPromise: Promise<SidebarData> | null = null;

export function getSidebarData(): Promise<SidebarData> {
  sidebarPromise ??= (async () => {
    const today = getToday();
    const rows = await fetchReleasesBetween(getSupabaseServerSafe(), addDays(today, -14), addDays(today, 60));
    const todayIso = format(today, 'yyyy-MM-dd');
    const upcoming = rows.filter((r) => r.release_date > todayIso).reverse();

    const followed = new Map<string, SidebarData['followed'][number]>();
    for (const r of rows) {
      if (!r.artist || !r.metadata?.watched || followed.has(r.artist.slug)) continue;
      followed.set(r.artist.slug, { ...r.artist, isNew: r.release_date >= format(addDays(today, -7), 'yyyy-MM-dd') });
    }
    return { followed: [...followed.values()].slice(0, 4), upcoming };
  })();
  return sidebarPromise;
}
