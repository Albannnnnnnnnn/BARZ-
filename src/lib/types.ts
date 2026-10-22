// Types TypeScript partagés entre Astro et React

// ============================================================
// BASE
// ============================================================

export interface Artist {
  id: string;
  name: string;
  slug: string;
  image_url: string | null;
  genres: string[];
  popularity: number;
}

export interface Label {
  id: string;
  name: string;
  slug: string;
  image_url: string | null;
}

export interface Release {
  id: string;
  mbid: string | null;
  spotify_id: string | null;
  title: string;
  slug: string;
  artist_id: string | null;
  label_id: string | null;
  release_date: string;
  release_type: 'album' | 'ep' | 'single' | 'compilation' | 'soundtrack' | 'remix' | 'live';
  cover_url: string | null;
  genres: string[];
  track_count: number;
  total_duration_ms: number | null;
  spotify_url: string | null;
  apple_music_url: string | null;
  deezer_url: string | null;
  youtube_url: string | null;
  metadata: Record<string, unknown> | null;
  artist?: Artist | null;
  label?: Label | null;
}

export interface ReleaseWithArtist extends Release {
  artist: Artist | null;
}

export interface WeeklyReleases {
  week_start: string;
  releases: ReleaseWithArtist[];
}

// ============================================================
// UI STATE
// ============================================================

export interface FilterState {
  genres: string[];
  week: string; // ISO date string (week start)
  type: 'all' | 'album' | 'ep' | 'single' | 'compilation';
}

export interface CalendarDay {
  date: Date;
  isCurrentMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  releases: ReleaseWithArtist[];
}

export interface CalendarWeek {
  weekStart: Date;
  days: CalendarDay[];
}

// ============================================================
// API RESPONSES
// ============================================================

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface SearchResult {
  releases: ReleaseWithArtist[];
  artists: Artist[];
  total: number;
}

// ============================================================
// COMPONENT PROPS
// ============================================================

export interface ReleaseCardProps {
  release: ReleaseWithArtist;
  variant?: 'default' | 'compact' | 'featured';
  onClick?: () => void;
}

export interface CalendarViewProps {
  currentWeek: string;
  weeklyData: WeeklyReleases[];
  onWeekChange: (weekStart: string) => void;
  onDayClick: (date: string, releases: ReleaseWithArtist[]) => void;
  selectedGenres: string[];
  onGenreFilterChange: (genres: string[]) => void;
  availableGenres: string[];
}

export interface GenreFilterProps {
  selectedGenres: string[];
  availableGenres: string[];
  onChange: (genres: string[]) => void;
  maxVisible?: number;
}

export interface ReleaseGridProps {
  releases: ReleaseWithArtist[];
  loading?: boolean;
  emptyMessage?: string;
}

// ============================================================
// STREAMING LINKS
// ============================================================

export interface StreamingLinks {
  spotify?: string;
  appleMusic?: string;
  deezer?: string;
  youtube?: string;
}

export function getStreamingLinks(release: Release): StreamingLinks {
  return {
    spotify: release.spotify_url || undefined,
    appleMusic: release.apple_music_url || undefined,
    deezer: release.deezer_url || undefined,
    youtube: release.youtube_url || undefined,
  };
}