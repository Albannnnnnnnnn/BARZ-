-- BARZ Database Schema
-- Run this in Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- ARTISTS
-- ============================================================
CREATE TABLE IF NOT EXISTS artists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mbid VARCHAR(36) UNIQUE,           -- MusicBrainz ID
  spotify_id VARCHAR(22) UNIQUE,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  image_url TEXT,
  genres TEXT[],
  popularity INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_artists_slug ON artists(slug);
CREATE INDEX IF NOT EXISTS idx_artists_mbid ON artists(mbid);
CREATE INDEX IF NOT EXISTS idx_artists_spotify_id ON artists(spotify_id);
CREATE INDEX IF NOT EXISTS idx_artists_genres ON artists USING GIN(genres);

-- RLS
ALTER TABLE artists ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Artists are publicly readable" ON artists;
CREATE POLICY "Artists are publicly readable" ON artists
  FOR SELECT USING (true);

-- ============================================================
-- LABELS
-- ============================================================
CREATE TABLE IF NOT EXISTS labels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mbid VARCHAR(36) UNIQUE,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_labels_slug ON labels(slug);
CREATE INDEX IF NOT EXISTS idx_labels_mbid ON labels(mbid);

ALTER TABLE labels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Labels are publicly readable" ON labels;
CREATE POLICY "Labels are publicly readable" ON labels
  FOR SELECT USING (true);

-- ============================================================
-- RELEASES
-- ============================================================
CREATE TABLE IF NOT EXISTS releases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mbid VARCHAR(36) UNIQUE,                    -- MusicBrainz Release Group ID
  spotify_id VARCHAR(22) UNIQUE,
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  artist_id UUID REFERENCES artists(id) ON DELETE SET NULL,
  label_id UUID REFERENCES labels(id) ON DELETE SET NULL,
  release_date DATE NOT NULL,
  release_type VARCHAR(20) CHECK (release_type IN ('album', 'ep', 'single', 'compilation', 'soundtrack', 'remix', 'live')),
  cover_url TEXT,
  genres TEXT[],
  track_count INT DEFAULT 0,
  total_duration_ms INT,
  spotify_url TEXT,
  apple_music_url TEXT,
  deezer_url TEXT,
  youtube_url TEXT,
  metadata JSONB,                             -- Données brutes APIs pour flexibilité
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes pour performance calendrier
CREATE INDEX IF NOT EXISTS idx_releases_date ON releases(release_date DESC);
CREATE INDEX IF NOT EXISTS idx_releases_genres ON releases USING GIN(genres);
CREATE INDEX IF NOT EXISTS idx_releases_artist ON releases(artist_id);
CREATE INDEX IF NOT EXISTS idx_releases_label ON releases(label_id);
CREATE INDEX IF NOT EXISTS idx_releases_slug ON releases(slug);
CREATE INDEX IF NOT EXISTS idx_releases_mbid ON releases(mbid);
CREATE INDEX IF NOT EXISTS idx_releases_spotify_id ON releases(spotify_id);
CREATE INDEX IF NOT EXISTS idx_releases_type ON releases(release_type);

-- Index pour requêtes hebdo (sans CURRENT_DATE car pas IMMUTABLE)
CREATE INDEX IF NOT EXISTS idx_releases_weekly ON releases(release_date DESC, release_type);

ALTER TABLE releases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Releases are publicly readable" ON releases;
CREATE POLICY "Releases are publicly readable" ON releases
  FOR SELECT USING (true);

-- ============================================================
-- VUE MATÉRIALISÉE : SORTIES HEBDOMADAIRES
-- ============================================================
CREATE MATERIALIZED VIEW IF NOT EXISTS weekly_releases AS
SELECT
  date_trunc('week', release_date)::date AS week_start,
  jsonb_agg(
    jsonb_build_object(
      'id', id,
      'title', title,
      'slug', slug,
      'artist', (
        SELECT jsonb_build_object('name', name, 'slug', slug, 'image_url', image_url)
        FROM artists WHERE id = releases.artist_id
      ),
      'cover_url', cover_url,
      'release_type', release_type,
      'genres', genres,
      'release_date', release_date
    ) ORDER BY release_date, COALESCE((SELECT popularity FROM artists WHERE id = releases.artist_id), 0) DESC
  ) AS releases
FROM releases
WHERE release_date >= CURRENT_DATE - INTERVAL '4 weeks'
  AND release_date <= CURRENT_DATE + INTERVAL '8 weeks'
GROUP BY week_start
ORDER BY week_start;

-- Index sur la vue matérialisée
CREATE UNIQUE INDEX IF NOT EXISTS idx_weekly_releases_week_start ON weekly_releases(week_start);

-- Fonction pour rafraîchir la vue
CREATE OR REPLACE FUNCTION refresh_weekly_releases()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY weekly_releases;
  RETURN NULL;
END $$;

-- Trigger pour auto-refresh (optionnel, on le fait manuellement dans le script sync)
-- CREATE TRIGGER trigger_refresh_weekly_releases
--   AFTER INSERT OR UPDATE OR DELETE ON releases
--   FOR EACH STATEMENT EXECUTE FUNCTION refresh_weekly_releases();

-- ============================================================
-- FONCTIONS UTILITAIRES
-- ============================================================

-- Générer un slug depuis un titre
CREATE OR REPLACE FUNCTION generate_slug(input_text TEXT)
RETURNS TEXT LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  result TEXT;
BEGIN
  result := lower(regexp_replace(input_text, '[^a-z0-9]+', '-', 'g'));
  result := regexp_replace(result, '^-+|-+$', '', 'g');
  RETURN result;
END $$;

-- ============================================================
-- DONNÉES DE TEST (optionnel - à décommenter pour tester)
-- ============================================================
/*
INSERT INTO artists (mbid, name, slug, genres, popularity) VALUES
  ('test-artist-1', 'Kendrick Lamar', 'kendrick-lamar', ARRAY['hip-hop', 'rap'], 95),
  ('test-artist-2', 'Taylor Swift', 'taylor-swift', ARRAY['pop', 'country'], 100),
  ('test-artist-3', 'Radiohead', 'radiohead', ARRAY['alternative', 'rock', 'electronic'], 85)
ON CONFLICT (mbid) DO NOTHING;

INSERT INTO releases (mbid, title, slug, artist_id, release_date, release_type, cover_url, genres, track_count) VALUES
  ('test-release-1', 'GNX', 'gnx', (SELECT id FROM artists WHERE slug = 'kendrick-lamar'), '2024-11-22', 'album', 'https://example.com/gnx.jpg', ARRAY['hip-hop', 'rap'], 12),
  ('test-release-2', 'The Tortured Poets Department', 'the-tortured-poets-department', (SELECT id FROM artists WHERE slug = 'taylor-swift'), '2024-04-19', 'album', 'https://example.com/ttpd.jpg', ARRAY['pop'], 16),
  ('test-release-3', 'A Moon Shaped Pool', 'a-moon-shaped-pool', (SELECT id FROM artists WHERE slug = 'radiohead'), '2016-05-08', 'album', 'https://example.com/amsp.jpg', ARRAY['alternative', 'rock'], 11)
ON CONFLICT (mbid) DO NOTHING;

REFRESH MATERIALIZED VIEW weekly_releases;
*/