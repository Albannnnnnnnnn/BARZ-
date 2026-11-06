-- BARZ¡ — Noter un titre : une page par titre (src/pages/son.astro, son?id=<id Deezer du titre>), une note sur 10
-- et un mot facultatif par membre, comme un Barz mais pour un seul morceau.
-- À exécuter UNE fois dans Supabase : SQL Editor → New query → coller → Run. Le script peut être relancé sans risque.

-- Titres notés au moins une fois : ajoutés par la fonction deezer (action import-track), avec leur disque
CREATE TABLE IF NOT EXISTS tracks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deezer_id BIGINT NOT NULL UNIQUE,
  release_id UUID REFERENCES releases(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  position INT,
  duration INT,
  artist_name TEXT,
  feats JSONB NOT NULL DEFAULT '[]'::jsonb, -- noms des invités
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tracks_release ON tracks(release_id);

ALTER TABLE tracks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tracks are public" ON tracks;
CREATE POLICY "Tracks are public" ON tracks FOR SELECT USING (true);
-- Écriture : seulement la fonction deezer (clé service_role)

CREATE TABLE IF NOT EXISTS track_ratings (
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  track_id UUID NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  score NUMERIC(3,1) NOT NULL CHECK (score >= 0 AND score <= 10),
  body TEXT NOT NULL DEFAULT '' CHECK (char_length(body) <= 280),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, track_id)
);
CREATE INDEX IF NOT EXISTS idx_track_ratings_track ON track_ratings(track_id);
CREATE INDEX IF NOT EXISTS idx_track_ratings_created ON track_ratings(created_at DESC);

ALTER TABLE track_ratings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Track ratings are public" ON track_ratings;
CREATE POLICY "Track ratings are public" ON track_ratings FOR SELECT USING (true);
DROP POLICY IF EXISTS "Members rate as themselves" ON track_ratings;
CREATE POLICY "Members rate as themselves" ON track_ratings FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Members edit their ratings" ON track_ratings;
CREATE POLICY "Members edit their ratings" ON track_ratings FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Members delete their ratings" ON track_ratings;
CREATE POLICY "Members delete their ratings" ON track_ratings FOR DELETE USING (auth.uid() = user_id OR is_barz_admin());
