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
  spotify_id: string | null;
  spotify_url: string | null;
  deezer_url: string | null;
  apple_music_url: string | null;
  metadata: { watched?: boolean; featuring?: string[]; fans?: number | null; label?: string | null } | null;
  artist: { id: string; name: string; slug: string; image_url: string | null; popularity?: number | null; lastfm_listeners?: number | null } | null;
};

// BARZ_TODAY=2026-10-23 permet de construire le site "comme si" on était à une autre date
export function getToday(): Date {
  const override = process.env.BARZ_TODAY;
  return override ? parseISO(override) : new Date();
}

export { GENRE_CHIPS, chipIdsFor } from './genres';

const RELEASE_FIELDS =
  'id, title, slug, release_date, release_type, cover_url, genres, track_count, spotify_id, spotify_url, deezer_url, apple_music_url, metadata, artist:artists!artist_id(id, name, slug, image_url, popularity, lastfm_listeners)';

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
