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
  getSpotifyNewReleases,
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

// MusicBrainz retourne parfois des dates partielles ("2003" ou "2002-08")
// PostgreSQL type date exige du YYYY-MM-DD complet → on complète avec le 1er du mois
function normalizeDate(dateStr: string | undefined | null): string {
  if (!dateStr) return '1970-01-01';
  const parts = dateStr.split('-');
  if (parts.length === 1) return `${dateStr}-01-01`;
  if (parts.length === 2) return `${dateStr}-01`;
  return dateStr;
}

// Normalise pour la déduplication (artist name + title)
function normalizeKey(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '')
    .trim();
}

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

interface UnifiedRelease {
  source: 'spotify' | 'musicbrainz' | 'both';
  mbid?: string;
  spotify_id?: string;
  title: string;
  artist_name: string;
  release_date?: string;
  cover_url?: string | null;
  total_tracks?: number;
  spotify_url?: string | null;
  metadata?: any;
}

async function main() {
  console.log('🚀 Starting hybrid releases sync (Spotify + MusicBrainz)...');

  // 1. Fetch from Spotify (fast batch — no 1 req/sec limit)
  console.log('🔍 Fetching new releases from Spotify...');
  const spotifyReleases = await getSpotifyNewReleases(50);
  console.log(`📦 Spotify: ${spotifyReleases.length} new releases`);

  // 2. Fetch from MusicBrainz with pagination (4 pages × 25 = 100)
  console.log('🔍 Fetching release groups from MusicBrainz...');
  const allMBReleaseGroups: any[] = [];
  const MB_PAGES = 4;
  const MB_PAGE_SIZE = 25;
  for (let offset = 0; offset < MB_PAGES * MB_PAGE_SIZE; offset += MB_PAGE_SIZE) {
    const page = await searchUpcomingReleaseGroups('', '', MB_PAGE_SIZE, offset);
    allMBReleaseGroups.push(...page);
    if (offset < MB_PAGES * MB_PAGE_SIZE - MB_PAGE_SIZE) {
      await new Promise(r => setTimeout(r, 1100));
    }
  }
  console.log(`📦 MusicBrainz: ${allMBReleaseGroups.length} release groups`);

  // 3. Build unified list with Spotify first
  const unified: UnifiedRelease[] = [];

  for (const s of spotifyReleases) {
    unified.push({
      source: 'spotify',
      spotify_id: s.id,
      title: s.name,
      artist_name: s.artists?.[0]?.name || 'Unknown',
      release_date: s.release_date,
      cover_url: s.images?.[0]?.url || null,
      total_tracks: s.total_tracks,
      spotify_url: s.external_urls?.spotify || null,
      metadata: { spotify: s },
    });
  }

  // Add MusicBrainz releases, deduplicating against Spotify
  for (const mb of allMBReleaseGroups) {
    const mbArtist = mb['artist-credit']?.[0]?.artist?.name || '';
    const existing = unified.find(u =>
      u.source !== 'spotify' &&
      normalizeKey(u.artist_name) === normalizeKey(mbArtist) &&
      normalizeKey(u.title) === normalizeKey(mb.title || '')
    );

    if (existing) {
      existing.source = 'both';
      existing.mbid = mb.id;
      if (!existing.release_date) existing.release_date = mb['first-release-date'];
      existing.metadata = { ...existing.metadata, musicbrainz: mb };
    } else {
      unified.push({
        source: 'musicbrainz',
        mbid: mb.id,
        title: mb.title || 'Unknown',
        artist_name: mbArtist || 'Unknown',
        release_date: mb['first-release-date'],
        metadata: { musicbrainz: mb },
      });
    }
  }

  console.log(`📊 Total unique releases: ${unified.length}`);

  // 4. Process each unique release
  let processed = 0;
  let errors = 0;

  for (const release of unified) {
    try {
      let artistId: string | null = null;
      let labelId: string | null = null;
      let coverUrl = release.cover_url ?? null;
      let genres: string[] = ['unknown'];
      let releaseDate = normalizeDate(release.release_date);
      let mbDetails: any = null;
      let spotifyData: any = {};

      // --- MusicBrainz path (for musicbrainz-only or both) ---
      if (release.source === 'musicbrainz' || release.source === 'both') {
        mbDetails = release.metadata?.musicbrainz || (release.mbid ? await getReleaseGroupDetails(release.mbid) : null);

        if (mbDetails) {
          const mainArtist = mbDetails['artist-credit']?.[0]?.artist;
          if (mainArtist) {
            try {
              const mbGenres = mbDetails.tags?.map(t => t.name.toLowerCase()) || [];
              const [artistTags, albumTags, artistInfo] = await Promise.all([
                getArtistTags(mainArtist.name),
                getAlbumTags(mainArtist.name, mbDetails.title),
                getArtistInfo(mainArtist.name),
              ]);
              genres = normalizeGenres([...mbGenres, ...artistTags, ...albumTags]);
              artistId = await upsertArtist({ mbid: mainArtist.id, name: mainArtist.name, genres, popularity: artistInfo?.listeners || 0 });
            } catch (err) {
              console.warn(`⚠️ Artist enrichment failed for ${release.mbid}:`, err instanceof Error ? err.message : err);
            }
          }

          const labelCredit = mbDetails['artist-credit']?.find((ac: any) => ac.artist?.type === 'label')?.artist;
          if (labelCredit) {
            try {
              labelId = await upsertLabel({ mbid: labelCredit.id, name: labelCredit.name });
            } catch (err) {
              console.warn(`⚠️ Label upsert failed:`, err instanceof Error ? err.message : err);
            }
          }

          if (!coverUrl && mbDetails.releases?.[0]?.id) {
            try {
              coverUrl = await getCoverArtUrl(mbDetails.releases[0].id);
            } catch {
              // ignore cover art failures
            }
          }
        }
      }

      // --- Spotify path (for spotify-only or both) ---
      const spotifyRelease = release.metadata?.spotify;
      if (spotifyRelease) {
        spotifyData = {
          spotify_id: spotifyRelease.id,
          spotify_url: spotifyRelease.external_urls?.spotify,
          track_count: spotifyRelease.total_tracks,
          total_duration_ms: spotifyRelease.total_tracks ? spotifyRelease.total_tracks * 60000 : 0,
        };
        if (!coverUrl && spotifyRelease.images?.[0]) {
          coverUrl = spotifyRelease.images[0].url;
        }
      } else if (release.source !== 'spotify' && release.artist_name && release.title) {
        // Try Spotify search for MusicBrainz-only releases
        try {
          const spotifySearch = await searchSpotifyAlbum(release.artist_name, release.title);
          const spotifyAlbum = spotifySearch?.albums?.items?.[0];
          if (spotifyAlbum) {
            const fullAlbum = await getSpotifyAlbum(spotifyAlbum.id);
            if (fullAlbum) {
              spotifyData = {
                spotify_id: fullAlbum.id,
                spotify_url: fullAlbum.external_urls.spotify,
                track_count: fullAlbum.total_tracks,
                total_duration_ms: fullAlbum.tracks?.items.reduce((sum, t) => sum + t.duration_ms, 0),
              };
              if (!coverUrl) coverUrl = fullAlbum.images?.[0]?.url || null;
            }
          }
        } catch {
          // ignore Spotify search failures
        }
      }

      // --- Upsert ---
      const upsertData: any = {
        mbid: release.mbid,
        spotify_id: spotifyData.spotify_id || release.spotify_id,
        title: release.title,
        artist_id: artistId,
        label_id: labelId,
        release_date: releaseDate,
        release_type: release.source === 'musicbrainz' ? mapReleaseType(mbDetails?.['primary-type']) : mapReleaseType(release.metadata?.spotify?.album_type),
        cover_url: coverUrl,
        genres,
        track_count: spotifyData.track_count || 0,
        total_duration_ms: spotifyData.total_duration_ms,
        spotify_url: spotifyData.spotify_url,
        metadata: release.metadata,
      };

      if (upsertData.mbid) {
        await upsertRelease(upsertData);
      } else if (upsertData.spotify_id) {
        // No MBID — try to find existing by spotify_id, else insert
        const { data: existing, error: selErr } = await supabase
          .from('releases')
          .select('id')
          .eq('spotify_id', upsertData.spotify_id)
          .single();
        if (selErr && selErr.code !== 'PGRST116') throw selErr;
        if (existing) {
          const { error: updErr } = await supabase
            .from('releases')
            .update({ ...upsertData, slug: slugify(release.title) })
            .eq('id', existing.id);
          if (updErr) throw updErr;
        } else {
          const { error: insErr } = await supabase
            .from('releases')
            .insert({ ...upsertData, slug: slugify(release.title) })
            .select('id')
            .single();
          if (insErr) throw insErr;
        }
      } else {
        const { error: insErr } = await supabase
          .from('releases')
          .insert({ ...upsertData, slug: slugify(release.title) })
          .select('id')
          .single();
        if (insErr) throw insErr;
      }

      processed++;
      if (processed % 10 === 0) console.log(`📊 Processed ${processed}/${unified.length}...`);
    } catch (err) {
      errors++;
      console.error(`❌ Error processing ${release.title}:`, err instanceof Error ? err.message : err);
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
