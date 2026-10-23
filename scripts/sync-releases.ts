import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import {
  searchUpcomingReleaseGroups,
  getReleaseGroupDetails,
  getCoverArtUrl,
  getArtistTags,
  getAlbumTags,
  getArtistInfo,
  searchSpotifyAlbum,
  getSpotifyAlbum,
  mapReleaseType,
  normalizeGenres,
  slugify,
} from '../src/lib/api.js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function upsertArtist(artist: { mbid: string; name: string; genres?: string[]; popularity?: number; image_url?: string }) {
  const slug = slugify(artist.name);
  const { data, error } = await supabase
    .from('artists')
    .upsert({ mbid: artist.mbid, name: artist.name, slug, genres: artist.genres || null, popularity: artist.popularity || 0, image_url: artist.image_url || null },
      { onConflict: 'mbid', ignoreDuplicates: false })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

async function upsertLabel(label: { mbid: string; name: string; image_url?: string }) {
  const slug = slugify(label.name);
  const { data, error } = await supabase.from('labels').upsert(
    { mbid: label.mbid, name: label.name, slug, image_url: label.image_url || null },
    { onConflict: 'mbid', ignoreDuplicates: false }
  ).select('id').single();
  if (error) throw error;
  return data.id;
}

async function upsertRelease(release: any) {
  const slug = slugify(release.title);
  const { data, error } = await supabase.from('releases').upsert(
    { ...release, slug },
    { onConflict: 'mbid', ignoreDuplicates: false }
  ).select('id').single();
  if (error) throw error;
  return data.id;
}

async function refreshWeeklyView() {
  try {
    const { error } = await supabase.rpc('refresh_weekly_releases');
    if (error) console.warn('⚠️ Could not refresh materialized view:', error.message);
    else console.log('✅ Materialized view refreshed');
  } catch (err) {
    console.warn('⚠️ Could not refresh materialized view:', err instanceof Error ? err.message : err);
  }
}

async function main() {
  console.log('🚀 Starting releases sync...');

  const MAX_RELEASES_PER_RUN = 200;

  console.log('🔍 Fetching release groups from MusicBrainz...');
  let releaseGroups: any[] = [];
  try {
    releaseGroups = await searchUpcomingReleaseGroups('', '', MAX_RELEASES_PER_RUN);
  } catch (err) {
    console.error('❌ Failed to fetch release groups:', err instanceof Error ? err.message : err);
    console.log('ℹ️ MusicBrainz may be busy. Try again later.');
    process.exit(0);
  }
  console.log(`📦 Found ${releaseGroups.length} release groups`);

  if (releaseGroups.length === 0) {
    console.log('ℹ️ No releases found. Exiting.');
    process.exit(0);
  }

  let processed = 0;
  let errors = 0;

  for (const rg of releaseGroups) {
    try {
      const details = await getReleaseGroupDetails(rg.id);

      // No details from MusicBrainz? Still upsert with basic listing info — never skip.
      if (!details) {
        await upsertRelease({
          mbid: rg.id,
          title: rg.title || 'Unknown',
          artist_id: null,
          label_id: null,
          release_date: rg['first-release-date'] || '1970-01-01',
          release_type: mapReleaseType(rg['primary-type']),
          cover_url: null,
          genres: ['unknown'],
          track_count: 0,
          metadata: { musicbrainz: rg },
        });
        processed++;
        continue;
      }

      const releaseDate = details['first-release-date'] || rg['first-release-date'] || '1970-01-01';

      const mainArtist = details['artist-credit']?.[0]?.artist;
      let artistId: string | null = null;
      let allGenres: string[] = ['unknown'];

      if (mainArtist) {
        try {
          const mbGenres = details.tags?.map(t => t.name.toLowerCase()) || [];
          const [artistTags, albumTags, artistInfo] = await Promise.all([
            getArtistTags(mainArtist.name),
            getAlbumTags(mainArtist.name, details.title),
            getArtistInfo(mainArtist.name),
          ]);
          allGenres = normalizeGenres([...mbGenres, ...artistTags, ...albumTags]);
          artistId = await upsertArtist({ mbid: mainArtist.id, name: mainArtist.name, genres: allGenres, popularity: artistInfo?.listeners || 0 });
        } catch (err) {
          console.warn(`⚠️ Artist enrichment failed for ${rg.id}:`, err instanceof Error ? err.message : err);
        }
      }

      let labelId: string | null = null;
      const labelCredit = details['artist-credit']?.find((ac: any) => ac.artist?.type === 'label')?.artist;
      if (labelCredit) {
        try {
          labelId = await upsertLabel({ mbid: labelCredit.id, name: labelCredit.name });
        } catch (err) {
          console.warn(`⚠️ Label upsert failed for ${rg.id}:`, err instanceof Error ? err.message : err);
        }
      }

      let coverUrl: string | null = null;
      const firstRelease = details.releases?.[0];
      if (firstRelease?.id) {
        try {
          coverUrl = await getCoverArtUrl(firstRelease.id);
        } catch {
          // ignore cover art failures
        }
      }

      let spotifyData: any = {};
      let spotifyAlbum: any = null;
      try {
        const spotifySearch = await searchSpotifyAlbum(mainArtist?.name || 'Unknown', details.title);
        spotifyAlbum = spotifySearch?.albums?.items?.[0];
        if (spotifyAlbum) {
          const fullAlbum = await getSpotifyAlbum(spotifyAlbum.id);
          if (fullAlbum) {
            spotifyData = {
              spotify_id: fullAlbum.id,
              track_count: fullAlbum.total_tracks,
              total_duration_ms: fullAlbum.tracks?.items.reduce((sum, t) => sum + t.duration_ms, 0),
              spotify_url: fullAlbum.external_urls.spotify,
            };
          }
        }
      } catch {
        // ignore Spotify failures
      }

      await upsertRelease({
        mbid: rg.id,
        spotify_id: spotifyData.spotify_id,
        title: details.title,
        artist_id: artistId,
        label_id: labelId,
        release_date: releaseDate,
        release_type: mapReleaseType(details['primary-type']),
        cover_url: coverUrl,
        genres: allGenres,
        track_count: spotifyData.track_count || 0,
        total_duration_ms: spotifyData.total_duration_ms,
        spotify_url: spotifyData.spotify_url,
        apple_music_url: spotifyData.apple_music_url,
        deezer_url: spotifyData.deezer_url,
        youtube_url: spotifyData.youtube_url,
        metadata: {
          musicbrainz: details,
          lastfm: { artist_tags: [], album_tags: [], artist_info: null },
          spotify: spotifyAlbum || null,
        },
      });

      processed++;
      if (processed % 10 === 0) console.log(`📊 Processed ${processed}/${releaseGroups.length}...`);
    } catch (err) {
      errors++;
      console.error(`❌ Error processing ${rg.id}:`, err instanceof Error ? err.message : err);
    }
  }

  await refreshWeeklyView();

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
