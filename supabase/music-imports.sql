-- BARZ¡ — Artistes importés de Deezer et de Spotify (pour les recommandations)
-- À exécuter UNE fois dans Supabase : SQL Editor → New query → coller → Run (après discovery.sql et spotify.sql).
-- Le script peut être relancé sans risque (IF NOT EXISTS / DROP POLICY IF EXISTS).
-- - Deezer : le membre donne le lien de son profil ; ses artistes favoris (publics) sont importés.
-- - Spotify : avec le compte déjà relié, ses artistes les plus écoutés et ceux qu'il suit sont importés.
-- Écrit par les fonctions supabase/functions/deezer et spotify (clé service_role) ; seuls les artistes du catalogue
-- sont gardés. Privé, comme l'import Last.fm : ne sert qu'aux recommandations du membre.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS deezer_user_id BIGINT;

CREATE TABLE IF NOT EXISTS imported_artists (
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source IN ('deezer', 'spotify')),
  artist_id UUID NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  weight REAL NOT NULL DEFAULT 1, -- de 1 (favori, suivi) à 3 (tout en haut des plus écoutés)
  imported_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, source, artist_id)
);

ALTER TABLE imported_artists ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users read their own imports" ON imported_artists;
CREATE POLICY "Users read their own imports" ON imported_artists FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users remove their own imports" ON imported_artists;
CREATE POLICY "Users remove their own imports" ON imported_artists FOR DELETE USING (auth.uid() = user_id);
