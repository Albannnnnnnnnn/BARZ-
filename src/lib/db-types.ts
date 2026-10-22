// Types générés depuis Supabase (à régénérer avec `npm run db:types` une fois le projet Supabase créé)
// Pour l'instant, types manuels basés sur schema.sql

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export interface Database {
  public: {
    Tables: {
      artists: {
        Row: {
          id: string;
          mbid: string | null;
          spotify_id: string | null;
          name: string;
          slug: string;
          image_url: string | null;
          genres: string[] | null;
          popularity: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          mbid?: string | null;
          spotify_id?: string | null;
          name: string;
          slug: string;
          image_url?: string | null;
          genres?: string[] | null;
          popularity?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          mbid?: string | null;
          spotify_id?: string | null;
          name?: string;
          slug?: string;
          image_url?: string | null;
          genres?: string[] | null;
          popularity?: number;
          created_at?: string;
          updated_at?: string;
        };
      };
      labels: {
        Row: {
          id: string;
          mbid: string | null;
          name: string;
          slug: string;
          image_url: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          mbid?: string | null;
          name: string;
          slug: string;
          image_url?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          mbid?: string | null;
          name?: string;
          slug?: string;
          image_url?: string | null;
          created_at?: string;
        };
      };
      releases: {
        Row: {
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
          genres: string[] | null;
          track_count: number;
          total_duration_ms: number | null;
          spotify_url: string | null;
          apple_music_url: string | null;
          deezer_url: string | null;
          youtube_url: string | null;
          metadata: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          mbid?: string | null;
          spotify_id?: string | null;
          title: string;
          slug: string;
          artist_id?: string | null;
          label_id?: string | null;
          release_date: string;
          release_type: 'album' | 'ep' | 'single' | 'compilation' | 'soundtrack' | 'remix' | 'live';
          cover_url?: string | null;
          genres?: string[] | null;
          track_count?: number;
          total_duration_ms?: number | null;
          spotify_url?: string | null;
          apple_music_url?: string | null;
          deezer_url?: string | null;
          youtube_url?: string | null;
          metadata?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          mbid?: string | null;
          spotify_id?: string | null;
          title?: string;
          slug?: string;
          artist_id?: string | null;
          label_id?: string | null;
          release_date?: string;
          release_type?: 'album' | 'ep' | 'single' | 'compilation' | 'soundtrack' | 'remix' | 'live';
          cover_url?: string | null;
          genres?: string[] | null;
          track_count?: number;
          total_duration_ms?: number | null;
          spotify_url?: string | null;
          apple_music_url?: string | null;
          deezer_url?: string | null;
          youtube_url?: string | null;
          metadata?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
      };
    };
    Views: {
      weekly_releases: {
        Row: {
          week_start: string;
          releases: Json;
        };
      };
    };
    Functions: {
      generate_slug: {
        Args: { input_text: string };
        Returns: string;
      };
      refresh_weekly_releases: {
        Args: Record<PropertyKey, never>;
        Returns: unknown;
      };
    };
    Enums: {};
  };
}