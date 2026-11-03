-- BARZ¡ — Barz plus longs : 1 000 caractères au lieu de 280 (src/pages/album.astro, releases/[slug].astro, commu.astro)
-- À exécuter UNE fois dans Supabase : SQL Editor → New query → coller → Run. Le script peut être relancé sans risque.
-- Les réponses aux Barz restent limitées à 280 caractères (supabase/barz-replies.sql).
ALTER TABLE barz DROP CONSTRAINT IF EXISTS barz_body_check;
ALTER TABLE barz ADD CONSTRAINT barz_body_check CHECK (char_length(body) BETWEEN 1 AND 1000);
