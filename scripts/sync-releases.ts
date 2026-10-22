// Script de synchronisation des sorties hebdomadaires
// Exécuté via GitHub Action chaque jeudi 18h
// Usage: npm run sync:releases

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
    .upsert(
      {
        mbid: artist.mbid,
        name: artist.name,
        slug,
        genres: artist.genres || null,
        popularity: artist.popularity || 0,
        image_url: artist.image_url || null,
      },
      { onConflict: 'mbid', ignoreDuplicates: false }
    )
    .select('id')
    .single();

  if (error) throw error;
  return data.id;
}

async function upsertLabel(label: { mbid: string; name: string; image_url?: string }) {
  const slug = slugify(label.name);

  const { data, error } = await supabase
    .from('labels')
    .upsert(
      {
        mbid: label.mbid,
        name: label.name,
        slug,
        image_url: label.image_url || null,
      },
      { onConflict: 'mbid', ignoreDuplicates: false }
    )
    .select('id')
    .single();

  if (error) throw error;
  return data.id;
}

async function upsertRelease(release: {
  mbid: string;
  spotify_id?: string;
  title: string;
  artist_id: string | null;
  label_id: string | null;
  release_date: string;
  release_type: 'album' | 'ep' | 'single' | 'compilation' | 'soundtrack' | 'remix' | 'live';
  cover_url?: string;
  genres: string[];
  track_count: number;
  total_duration_ms?: number;
  spotify_url?: string;
  apple_music_url?: string;
  deezer_url?: string;
  youtube_url?: string;
  metadata?: Record<string, unknown>;
}) {
  const slug = slugify(release.title);

  const { data, error } = await supabase
    .from('releases')
    .upsert(
      {
        ...release,
        slug,
      },
      { onConflict: 'mbid', ignoreDuplicates: false }
    )
    .select('id')
    .single();

  if (error) throw error;
  return data.id;
}

async function refreshWeeklyView() {
  try {
    const { error } = await supabase.rpc('refresh_weekly_releases');
    if (error) {
      console.warn('⚠️ Could not refresh materialized view:', error.message);
    } else {
      console.log('✅ Materialized view refreshed');
    }
  } catch (err) {
    console.warn('⚠️ Could not refresh materialized view:', err instanceof Error ? err.message : err);
  }
}

async function main() {
  console.log('🚀 Starting releases sync...');

  const WEEKS_BACK = 4;
  const WEEKS_FORWARD = 8;
  const MAX_RELEASES_PER_RUN = 500;

  function getDateRange() {
    const now = new Date();
    const start = new Date(now);
    start.setDate(start.getDate() - WEEKS_BACK * 7);
    const end = new Date(now);
    end.setDate(end.getDate() + WEEKS_FORWARD * 7);
    return {
      start: start.toISOString().split('T')[0],
      end: end.toISOString().split('T')[0],
    };
  }

  const { start, end } = getDateRange();
  console.log(`📅 Date range: ${start} to ${end}`);

  // 1. Récupérer les Release Groups depuis MusicBrainz
  console.log('🔍 Fetching release groups from MusicBrainz...');
  let releaseGroups;
  try {
    releaseGroups = await searchUpcomingReleaseGroups(start, end, MAX_RELEASES_PER_RUN);
  } catch (err) {
    console.error('❌ Failed to fetch release groups:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
  console.log(`📦 Found ${releaseGroups.length} release groups`);

  // 2. Filtrer par date de sortie
  const filtered = releaseGroups.filter(rg => {
    const date = rg['first-release-date'];
    if (!date) return false;
    return date >= start && date <= end;
  });
  console.log(`✅ ${filtered.length} releases in date range`);

  if (filtered.length === 0) {
    console.log('ℹ️ No releases found for this date range. Exiting.');
    process.exit(0);
  }

  let processed = 0;
  let created = 0;
  let updated = 0;
  let errors = 0;

  // 3. Traiter chaque release group
  for (const rg of filtered) {
    try {
      // Détails complets
      const details = await getReleaseGroupDetails(rg.id);
      if (!details) continue;

      const releaseDate = details['first-release-date'] || rg['first-release-date'];
      if (!releaseDate) continue;

      // Artiste principal
      const mainArtist = details['artist-credit']?.[0]?.artist;
      if (!mainArtist) continue;

      // Genres depuis MusicBrainz tags
      const mbGenres = details.tags?.map(t => t.name.toLowerCase()) || [];

      // Enrichir avec Last.fm (en parallèle pour gagner du temps)
      const [artistTags, albumTags, artistInfo] = await Promise.all([
        getArtistTags(mainArtist.name),
        getAlbumTags(mainArtist.name, details.title),
        getArtistInfo(mainArtist.name),
      ]);

      // Fusionner les genres
      const allGenres = normalizeGenres([...mbGenres, ...artistTags, ...albumTags]);

      // Upsert artiste
      const artistId = await upsertArtist({
        mbid: mainArtist.id,
        name: mainArtist.name,
        genres: allGenres,
        popularity: artistInfo?.listeners || 0,
      });

      // Label (prendre le premier)
      let labelId: string | null = null;
      const labelCredit = details['artist-credit']?.find((ac: any) => ac.artist?.type === 'label')?.artist;
      if (labelCredit) {
        labelId = await upsertLabel({
          mbid: labelCredit.id,
          name: labelCredit.name,
        });
      }

      // Cover art
      let coverUrl: string | null = null;
      const firstRelease = details.releases?.[0];
      if (firstRelease?.id) {
        coverUrl = await getCoverArtUrl(firstRelease.id);
      }

      // Enrichir avec Spotify si configuré
      let spotifyData: {
        spotify_id?: string;
        track_count?: number;
        total_duration_ms?: number;
        spotify_url?: string;
        apple_music_url?: string;
        deezer_url?: string;
        youtube_url?: string;
      } = {};

      const spotifySearch = await searchSpotifyAlbum(mainArtist.name, details.title);
      const spotifyAlbum = spotifySearch?.albums?.items?.[0];
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

      // Upsert release
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
          lastfm: { artist_tags: artistTags, album_tags: albumTags, artist_info: artistInfo },
          spotify: spotifyAlbum,
        },
      });

      processed++;
      if (processed % 10 === 0) {
        console.log(`📊 Processed ${processed}/${filtered.length} releases...`);
      }
    } catch (err) {
      errors++;
      console.error(`❌ Error processing ${rg.id}:`, err instanceof Error ? err.message : err);
    }
  }

  // 4. Rafraîchir la vue matérialisée
  await refreshWeeklyView();

  console.log(`
✅ Sync completed!
   Processed: ${processed}
   Errors: ${errors}
   Date range: ${start} to ${end}
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