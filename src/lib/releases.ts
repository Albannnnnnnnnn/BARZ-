// Lecture des sorties groupées par semaine, directement depuis la table releases.
// Remplace la vue matérialisée weekly_releases, qui n'était jamais rafraîchie.
import { format, parseISO, startOfWeek } from 'date-fns';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { WeeklyReleases, ReleaseWithArtist } from './supabase';

export async function fetchWeeklyReleases(
  supabase: SupabaseClient<any> | null,
  from: Date,
  to: Date
): Promise<WeeklyReleases[]> {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('releases')
    .select('id, title, slug, release_date, release_type, cover_url, genres, track_count, artist:artists!artist_id(name, slug, image_url)')
    .gte('release_date', format(from, 'yyyy-MM-dd'))
    .lte('release_date', format(to, 'yyyy-MM-dd'))
    .order('release_date', { ascending: true });

  if (error) {
    console.warn('Lecture des sorties impossible :', error.message);
    return [];
  }

  const weeks = new Map<string, ReleaseWithArtist[]>();
  for (const release of (data ?? []) as unknown as ReleaseWithArtist[]) {
    const weekStart = format(startOfWeek(parseISO(release.release_date), { weekStartsOn: 1 }), 'yyyy-MM-dd');
    if (!weeks.has(weekStart)) weeks.set(weekStart, []);
    weeks.get(weekStart)!.push(release);
  }

  return [...weeks.entries()].map(([week_start, releases]) => ({ week_start, releases }));
}
