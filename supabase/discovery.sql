-- BARZ¡ — Catalogue d'artistes, suivis, goûts et import Last.fm (pour les recommandations)
-- À exécuter UNE fois dans Supabase : SQL Editor → New query → coller → Run.
-- Nécessite d'avoir déjà exécuté supabase/schema.sql et supabase/social.sql.
-- Le script peut être relancé sans risque.

-- ============================================================
-- CATALOGUE : identifiant Deezer des artistes
-- ============================================================
ALTER TABLE artists ADD COLUMN IF NOT EXISTS deezer_id BIGINT;
CREATE UNIQUE INDEX IF NOT EXISTS artists_deezer_id_key ON artists(deezer_id);
CREATE INDEX IF NOT EXISTS idx_artists_popularity ON artists(popularity DESC);

-- Artistes similaires (fournis par Deezer) : la base de l'algorithme de recommandation
CREATE TABLE IF NOT EXISTS artist_relations (
  artist_id UUID NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  related_id UUID NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  rank SMALLINT NOT NULL DEFAULT 0, -- 0 = le plus proche
  PRIMARY KEY (artist_id, related_id)
);
CREATE INDEX IF NOT EXISTS idx_artist_relations_related ON artist_relations(related_id);

ALTER TABLE artist_relations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Relations are public" ON artist_relations;
CREATE POLICY "Relations are public" ON artist_relations FOR SELECT USING (true);

-- ============================================================
-- SUIVRE DES ARTISTES
-- ============================================================
CREATE TABLE IF NOT EXISTS follows (
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  artist_id UUID NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, artist_id)
);
CREATE INDEX IF NOT EXISTS idx_follows_artist ON follows(artist_id);

ALTER TABLE follows ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Follows are public" ON follows;
CREATE POLICY "Follows are public" ON follows FOR SELECT USING (true);
DROP POLICY IF EXISTS "Users follow as themselves" ON follows;
CREATE POLICY "Users follow as themselves" ON follows FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users unfollow as themselves" ON follows;
CREATE POLICY "Users unfollow as themselves" ON follows FOR DELETE USING (auth.uid() = user_id);

-- ============================================================
-- GOÛTS DÉCLARÉS (choisis à l'inscription) et pseudo Last.fm
-- ============================================================
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS favorite_genres TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS onboarded BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS lastfm_username TEXT CHECK (char_length(lastfm_username) <= 40);

-- ============================================================
-- IMPORT LAST.FM : artistes les plus écoutés de chaque membre
-- ============================================================
CREATE TABLE IF NOT EXISTS lastfm_artists (
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  artist_name TEXT NOT NULL,
  playcount INT NOT NULL DEFAULT 0,
  artist_id UUID REFERENCES artists(id) ON DELETE SET NULL, -- rapproché du catalogue si trouvé
  imported_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, artist_name)
);

ALTER TABLE lastfm_artists ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Lastfm imports are public" ON lastfm_artists;
CREATE POLICY "Lastfm imports are public" ON lastfm_artists FOR SELECT USING (true);
DROP POLICY IF EXISTS "Users manage their lastfm import" ON lastfm_artists;
CREATE POLICY "Users manage their lastfm import" ON lastfm_artists FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
