import 'dotenv/config';

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;
const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID!;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) {
  console.error('❌ Missing Supabase or Spotify credentials');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

let spotifyToken: string | null = null;

async function getSpotifyToken(): Promise<string> {
  if (spotifyToken) return spotifyToken;

  const auth = Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64');
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!res.ok) throw new Error(`Spotify auth failed: ${res.status}`);

  const data = await res.json();
  spotifyToken = data.access_token;
  return spotifyToken;
}

async function fetchNewReleases(token: string): Promise<any[]> {
  const res = await fetch('https://api.spotify.com/v1/browse/new-releases?limit=50', {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new Error(`Spotify API error: ${res.status}`);
  }

  const data = await res.json();
  return data.albums.items || [];
}

async function upsertRelease(release: any) {
  const slug = release.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

  const { data, error } = await supabase.from('releases').upsert(
    {
      id: release.id,
      mbid: release.id,
      title: release.name,
      slug,
      release_date: release.release_date,
      release_type: release.album_type,
      cover_url: release.images?.[0]?.url || null,
      genres: release.genres || [],
      track_count: 0,
      artist_id: null,
    },
    { onConflict: 'mbid', ignoreDuplicates: false }
  ).select('id').single();

  if (error) throw error;
  return data.id;
}

async function main() {
  console.log('🚀 Starting releases sync from Spotify...');

  const token = await getSpotifyToken();
  console.log('✅ Spotify token obtained');

  console.log('🔍 Fetching new releases from Spotify...');
  const releases = await fetchNewReleases(token);
  console.log(`📦 Found ${releases.length} releases`);

  if (releases.length === 0) {
    console.log('ℹ️ No releases found. Exiting.');
    process.exit(0);
  }

  let processed = 0;
  let errors = 0;

  for (const release of releases) {
    try {
      await upsertRelease(release);
      processed++;
      if (processed % 10 === 0) console.log(`📊 Processed ${processed}/${releases.length}...`);
    } catch (err) {
      errors++;
      console.error(`❌ Error processing ${release.id}:`, err instanceof Error ? err.message : err);
    }
  }

  console.log(`
✅ Sync completed!
   Processed: ${processed}
   Errors: ${errors}
  `);

  if (errors > processed * 0.5) {
    console.error('⚠️ High error rate, check logs');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('💥 Fatal error:', err);
  process.exit(1);
});