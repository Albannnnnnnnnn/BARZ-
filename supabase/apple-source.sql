-- BARZ¡ — Apple Music comme deuxième source de la veille, et mesure Deezer / Apple
-- (supabase/functions/sync-fresh/apple.ts). À exécuter UNE fois dans Supabase : SQL Editor → New query → coller → Run.
-- Le script peut être relancé sans risque (IF NOT EXISTS / DROP POLICY IF EXISTS).

-- Identifiant de l'artiste chez Apple Music : NULL = pas encore cherché, 0 = introuvable
ALTER TABLE artists ADD COLUMN IF NOT EXISTS apple_id BIGINT;

-- Première heure où chaque sortie (artiste + titre réduit) a été vue par la veille chez Deezer et chez Apple
CREATE TABLE IF NOT EXISTS release_seen (
  key TEXT PRIMARY KEY,
  artist_id UUID REFERENCES artists(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  release_date DATE,
  deezer_seen_at TIMESTAMPTZ,
  apple_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_release_seen_date ON release_seen (release_date);

-- Lecture publique (rien de personnel : des sorties et des heures), écriture réservée à la veille (service_role)
ALTER TABLE release_seen ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "release_seen lecture" ON release_seen;
CREATE POLICY "release_seen lecture" ON release_seen FOR SELECT USING (true);

-- Bilan, une fois un vendredi passé : qui a publié en premier, et de combien de minutes
-- SELECT
--   count(*) FILTER (WHERE apple_seen_at < deezer_seen_at) AS apple_avant,
--   count(*) FILTER (WHERE deezer_seen_at < apple_seen_at) AS deezer_avant,
--   count(*) FILTER (WHERE deezer_seen_at IS NULL) AS apple_seulement,
--   count(*) FILTER (WHERE apple_seen_at IS NULL) AS deezer_seulement,
--   round(avg(extract(epoch FROM deezer_seen_at - apple_seen_at) / 60) FILTER (WHERE apple_seen_at < deezer_seen_at)) AS minutes_avance_apple
-- FROM release_seen WHERE created_at > now() - interval '7 days';
