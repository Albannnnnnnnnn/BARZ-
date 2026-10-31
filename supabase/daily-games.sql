-- BARZ¡ — Jeux du jour (le premier : « Pochette floue », page src/pages/jeux/pochette.astro)
-- À exécuter UNE fois dans Supabase : SQL Editor → New query → coller → Run.
-- Le script peut être relancé sans risque (IF NOT EXISTS / DROP POLICY IF EXISTS).
-- - daily_games : la partie du jour, la même pour tout le monde, choisie et écrite par la fonction
--   supabase/functions/cover-game (clé service_role). La réponse y est : personne d'autre ne la lit.
-- - game_results : une partie par membre, par jeu et par jour. Visible des membres connectés (classement entre amis,
--   série de jours), écrite par chacun pour lui-même, sans retour possible.

CREATE TABLE IF NOT EXISTS daily_games (
  day DATE NOT NULL,
  game TEXT NOT NULL,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (day, game)
);
ALTER TABLE daily_games ENABLE ROW LEVEL SECURITY; -- aucune règle : seule la clé service_role y accède

CREATE TABLE IF NOT EXISTS game_results (
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  game TEXT NOT NULL CHECK (game IN ('pochette')),
  day DATE NOT NULL,
  solved BOOLEAN NOT NULL,
  attempts SMALLINT NOT NULL CHECK (attempts BETWEEN 1 AND 6),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, game, day)
);
CREATE INDEX IF NOT EXISTS idx_game_results_day ON game_results(game, day);

ALTER TABLE game_results ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Members read game results" ON game_results;
CREATE POLICY "Members read game results" ON game_results FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Users save their own result" ON game_results;
-- Seulement la partie du jour (heure de Paris) : pas de résultat antidaté ni pour demain
CREATE POLICY "Users save their own result" ON game_results FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND day = (NOW() AT TIME ZONE 'Europe/Paris')::DATE);
