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
  metadata: { watched?: boolean; featuring?: string[]; fans?: number | null; label?: string | null; upc?: string | null } | null;
  artist: { id: string; name: string; slug: string; image_url: string | null; popularity?: number | null; lastfm_listeners?: number | null; deezer_id?: number | null } | null;
};

// BARZ_TODAY=2026-10-23 permet de construire le site "comme si" on était à une autre date
export function getToday(): Date {
  const override = process.env.BARZ_TODAY;
  return override ? parseISO(override) : new Date();
}

export { GENRE_CHIPS, chipIdsFor } from './genres';

// Semaines de sorties : du vendredi au jeudi. Le vendredi d'une date : ce jour-là si c'est un vendredi, sinon le précédent
export function fridayOf(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return addDays(d, -((d.getDay() - 5 + 7) % 7));
}

export const currentFriday = () => fridayOf(getToday());

// Page d'une semaine : l'accueil pour la semaine en cours, /semaine/AAAA-MM-JJ (son vendredi) pour les précédentes
export function weekHref(friday: Date): string {
  return friday >= currentFriday() ? '/BARZ-/' : `/BARZ-/semaine/${format(friday, 'yyyy-MM-dd')}`;
}

// Vendredi de la plus ancienne sortie en base : les semaines d'avant n'ont pas de page (lu une fois par build)
let firstFridayPromise: Promise<Date | null> | null = null;
export function firstFriday(supabase: SupabaseClient<any> | null): Promise<Date | null> {
  if (!supabase) return Promise.resolve(null);
  firstFridayPromise ??= (async () => {
    const { data } = await supabase.from('releases').select('release_date').is('metadata->archive', null).order('release_date').limit(1);
    return data?.[0] ? fridayOf(parseISO(data[0].release_date)) : null;
  })();
  return firstFridayPromise;
}

const RELEASE_FIELDS =
  'id, title, slug, release_date, release_type, cover_url, genres, track_count, spotify_id, spotify_url, deezer_url, apple_music_url, metadata, artist:artists!artist_id(id, name, slug, image_url, popularity, lastfm_listeners, deezer_id)';

export async function fetchReleasesBetween(
  supabase: SupabaseClient<any> | null,
  from: Date,
  to: Date
): Promise<ReleaseRow[]> {
  if (!supabase) return [];
  // Par pages de 1 000 lignes, le plafond de PostgREST (sinon un gros vendredi serait tronqué).
  // Sans les anciens disques ajoutés depuis une discographie (metadata.archive) : ni Sorties, ni semaines, ni fiche
  // construite ; ils ont leur page dans le navigateur (src/pages/album.astro)
  const rows: ReleaseRow[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase
      .from('releases')
      .select(RELEASE_FIELDS)
      .gte('release_date', format(from, 'yyyy-MM-dd'))
      .lte('release_date', format(to, 'yyyy-MM-dd'))
      .is('metadata->archive', null)
      .order('release_date', { ascending: false })
      .order('id')
      .range(offset, offset + 999);
    if (error) {
      console.warn('Lecture des sorties impossible :', error.message);
      return rows;
    }
    rows.push(...((data ?? []) as unknown as ReleaseRow[]));
    if (!data || data.length < 1000) return rows;
  }
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
