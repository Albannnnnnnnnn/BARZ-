-- BARZ¡ — Deuxième jeu du jour : « L'artiste mystère » (page src/pages/jeux/artiste.astro)
-- À exécuter UNE fois dans Supabase : SQL Editor → New query → coller → Run (après supabase/daily-games.sql).
-- Le script peut être relancé sans risque.
-- Les résultats vont dans la même table game_results : on y autorise ce jeu, et jusqu'à 50 essais
-- (on propose des artistes jusqu'à trouver, au lieu de 6 essais comme Pochette floue).

ALTER TABLE game_results DROP CONSTRAINT IF EXISTS game_results_game_check;
ALTER TABLE game_results ADD CONSTRAINT game_results_game_check CHECK (game IN ('pochette', 'artiste'));
ALTER TABLE game_results DROP CONSTRAINT IF EXISTS game_results_attempts_check;
ALTER TABLE game_results ADD CONSTRAINT game_results_attempts_check CHECK (attempts BETWEEN 1 AND 50);
