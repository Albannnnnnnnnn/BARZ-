import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './db-types';

// Server-side client (for Astro pages, API routes)
let serverClient: SupabaseClient<Database> | null = null;
let serverClientError: Error | null = null;

function createServerClient(): SupabaseClient<Database> | null {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;

  if (!url || !serviceKey) {
    serverClientError = new Error('Missing Supabase server env vars: SUPABASE_URL, SUPABASE_SERVICE_KEY');
    return null;
  }

  try {
    return createClient<Database>(url, serviceKey, {
      auth: { persistSession: false },
    });
  } catch (e) {
    serverClientError = e instanceof Error ? e : new Error('Failed to create Supabase client');
    return null;
  }
}

export function getSupabaseServer(): SupabaseClient<Database> {
  if (serverClient) return serverClient;

  serverClient = createServerClient();

  if (!serverClient && serverClientError) {
    // During build, return a mock client that returns empty data
    if (process.env.PROD || process.env.SSR) {
      throw serverClientError;
    }
    // Return a mock for dev
    throw serverClientError;
  }

  return serverClient!;
}

// Safe version that returns null instead of throwing
export function getSupabaseServerSafe(): SupabaseClient<Database> | null {
  if (serverClient) return serverClient;

  serverClient = createServerClient();
  return serverClient;
}

// Browser client (for React islands)
let browserClient: SupabaseClient<Database> | null = null;

export function getSupabaseBrowser(): SupabaseClient<Database> {
  if (browserClient) return browserClient;

  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error('Missing Supabase browser env vars: SUPABASE_URL, SUPABASE_ANON_KEY');
  }

  browserClient = createClient<Database>(url, anonKey);

  return browserClient;
}

// Types pour les requêtes communes
export type ReleaseWithArtist = {
  id: string;
  title: string;
  slug: string;
  release_date: string;
  release_type: string;
  cover_url: string | null;
  genres: string[];
  track_count: number;
  artist: {
    name: string;
    slug: string;
    image_url: string | null;
  } | null;
};

export type WeeklyReleases = {
  week_start: string;
  releases: ReleaseWithArtist[];
};

export type Artist = {
  id: string;
  name: string;
  slug: string;
  image_url: string | null;
  genres: string[];
  popularity: number;
};

export type Label = {
  id: string;
  name: string;
  slug: string;
  image_url: string | null;
};