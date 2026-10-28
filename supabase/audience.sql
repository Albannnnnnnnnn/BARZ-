-- BARZ¡ — Audience des artistes : moyenne géométrique des auditeurs Last.fm et des fans Deezer
-- À exécuter UNE fois dans Supabase : SQL Editor → New query → coller → Run.
-- Le script peut être relancé sans risque (IF NOT EXISTS).
-- Deezer surévalue les artistes français, Last.fm les sous-évalue : la moyenne équilibre les deux.
-- Quand une source manque, on l'estime avec l'autre (fans Deezer ≈ auditeurs Last.fm / 0,3).
-- Même calcul que audience() dans src/lib/audience.ts. Colonne calculée : toujours à jour, rien à remplir.

ALTER TABLE artists ADD COLUMN IF NOT EXISTS audience BIGINT GENERATED ALWAYS AS (
  COALESCE(ROUND(SQRT(
    COALESCE(NULLIF(lastfm_listeners, 0), NULLIF(popularity, 0) * 0.3)
    * COALESCE(NULLIF(popularity, 0), NULLIF(lastfm_listeners, 0) / 0.3)
  )), 0)::BIGINT
) STORED;
CREATE INDEX IF NOT EXISTS idx_artists_audience ON artists(audience DESC);
