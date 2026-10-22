// Utilitaires communs
import { format, parseISO, startOfWeek, endOfWeek, addWeeks, subWeeks, isSameDay, isToday, isFuture, isPast, differenceInDays } from 'date-fns';
import { fr } from 'date-fns/locale';

// ============================================================
// DATES
// ============================================================

export function formatDate(date: string | Date, pattern = 'EEEE d MMMM'): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, pattern, { locale: fr });
}

export function formatShortDate(date: string | Date): string {
  return formatDate(date, 'EEE d MMM');
}

export function formatDayMonth(date: string | Date): string {
  return formatDate(date, 'd MMM');
}

export function formatWeekRange(weekStart: string | Date): string {
  const start = typeof weekStart === 'string' ? parseISO(weekStart) : weekStart;
  const end = endOfWeek(start, { weekStartsOn: 1 }); // Lundi
  return `${format(start, 'd MMM', { locale: fr })} – ${format(end, 'd MMM', { locale: fr })}`;
}

export function getWeekStart(date: string | Date): Date {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return startOfWeek(d, { weekStartsOn: 1 });
}

export function getCurrentWeekStart(): Date {
  return getWeekStart(new Date());
}

export function getWeekNavigation(currentWeekStart: Date): { prev: Date; next: Date } {
  return {
    prev: subWeeks(currentWeekStart, 1),
    next: addWeeks(currentWeekStart, 1),
  };
}

export function isReleaseToday(releaseDate: string): boolean {
  return isToday(parseISO(releaseDate));
}

export function isReleaseThisWeek(releaseDate: string): boolean {
  const release = parseISO(releaseDate);
  const now = new Date();
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
  return release >= weekStart && release <= weekEnd;
}

export function isReleaseThisFriday(releaseDate: string): boolean {
  const release = parseISO(releaseDate);
  return release.getDay() === 5; // Vendredi = 5 (0=Dimanche)
}

export function daysUntilRelease(releaseDate: string): number {
  const release = parseISO(releaseDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return differenceInDays(release, today);
}

export function getReleaseStatus(releaseDate: string): 'past' | 'today' | 'upcoming' {
  if (isToday(parseISO(releaseDate))) return 'today';
  if (isPast(parseISO(releaseDate))) return 'past';
  return 'upcoming';
}

// ============================================================
// SLUG & URLS
// ============================================================

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function createReleaseUrl(slug: string): string {
  return `/releases/${slug}`;
}

export function createArtistUrl(slug: string): string {
  return `/artists/${slug}`;
}

export function createGenreUrl(genre: string): string {
  return `/genres/${slugify(genre)}`;
}

// ============================================================
// GENRES
// ============================================================

export const GENRE_COLORS: Record<string, string> = {
  'hip-hop': '#e11d48',
  'rap': '#e11d48',
  'rnb': '#db2777',
  'pop': '#f97316',
  'rock': '#ef4444',
  'alternative': '#8b5cf6',
  'indie': '#a855f7',
  'electronic': '#06b6d4',
  'house': '#06b6d4',
  'techno': '#06b6d4',
  'ambient': '#6366f1',
  'jazz': '#84cc16',
  'blues': '#3b82f6',
  'classical': '#64748b',
  'folk': '#f59e0b',
  'country': '#f97316',
  'reggae': '#22c55e',
  'metal': '#78716c',
  'punk': '#ef4444',
  'soul': '#ec4899',
  'funk': '#f97316',
  'world': '#14b8a6',
  'latin': '#eab308',
  'experimental': '#a855f7',
  'soundtrack': '#64748b',
};

export function getGenreColor(genre: string): string {
  return GENRE_COLORS[genre.toLowerCase()] || '#71717a';
}

export function getGenreStyles(genre: string): string {
  const color = getGenreColor(genre);
  return `background: ${color}20; color: ${color}; border-color: ${color}40;`;
}

// ============================================================
// RELEASE TYPES
// ============================================================

export const RELEASE_TYPE_LABELS: Record<string, string> = {
  album: 'Album',
  ep: 'EP',
  single: 'Single',
  compilation: 'Compilation',
  soundtrack: 'Bande originale',
  remix: 'Remix',
  live: 'Live',
};

export const RELEASE_TYPE_COLORS: Record<string, string> = {
  album: '#3b82f6',
  ep: '#8b5cf6',
  single: '#f97316',
  compilation: '#6366f1',
  soundtrack: '#64748b',
  remix: '#ec4899',
  live: '#22c55e',
};

export function getReleaseTypeLabel(type: string): string {
  return RELEASE_TYPE_LABELS[type] || type;
}

export function getReleaseTypeColor(type: string): string {
  return RELEASE_TYPE_COLORS[type] || '#71717a';
}

// ============================================================
// FORMATTING
// ============================================================

export function formatDuration(ms: number): string {
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${h}h${minutes.toString().padStart(2, '0')}`;
  return `${minutes}min`;
}

export function formatTrackCount(count: number): string {
  return `${count} titre${count > 1 ? 's' : ''}`;
}

export function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}k`;
  return num.toString();
}

// ============================================================
// URL STATE (pour filtres partageables)
// ============================================================

export function parseFilterParams(searchParams: URLSearchParams) {
  return {
    genres: searchParams.get('genres')?.split(',').filter(Boolean) || [],
    week: searchParams.get('week') || format(getCurrentWeekStart(), 'yyyy-MM-dd'),
    type: searchParams.get('type') || 'all',
  };
}

export function buildFilterUrl(params: { genres?: string[]; week?: string; type?: string }): string {
  const url = new URL(window.location.origin + window.location.pathname);
  if (params.genres?.length) url.searchParams.set('genres', params.genres.join(','));
  else url.searchParams.delete('genres');
  if (params.week) url.searchParams.set('week', params.week);
  else url.searchParams.delete('week');
  if (params.type && params.type !== 'all') url.searchParams.set('type', params.type);
  else url.searchParams.delete('type');
  return url.pathname + url.search;
}

// ============================================================
// IMAGE HELPERS
// ============================================================

export function getOptimizedImageUrl(url: string | null | undefined, width = 400): string {
  if (!url) return '/placeholder-release.svg';
  // Pour Cover Art Archive, on peut ajouter des paramètres de redimensionnement
  if (url.includes('coverartarchive.org')) {
    return url.replace('/front', `/front-${width}`);
  }
  return url;
}

export function getPlaceholderSvg(width = 400, height = 400, text = 'BARZ'): string {
  return `data:image/svg+xml,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <rect width="100%" height="100%" fill="#1c1c1f"/>
      <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="system-ui" font-size="24" fill="#52525b">${text}</text>
    </svg>
  `)}`;
}