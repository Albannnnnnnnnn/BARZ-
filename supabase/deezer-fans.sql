-- BARZ¡ — Date de la dernière lecture des fans Deezer d'un artiste (colonne popularity)
-- À exécuter UNE fois dans Supabase : SQL Editor → New query → coller → Run.
-- Le script peut être relancé sans risque (IF NOT EXISTS).
-- Rempli par scripts/sync-fans.ts (GitHub Actions, après la synchro des sorties).
-- Sans cette date, un artiste arrivé en invité (fans inconnus, donc 0) ne voyait jamais ses fans relus,
-- et un artiste qui a vraiment 0 fan serait redemandé à Deezer à chaque passage.

ALTER TABLE artists ADD COLUMN IF NOT EXISTS deezer_checked_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_artists_deezer_checked ON artists(deezer_checked_at NULLS FIRST) WHERE deezer_id IS NOT NULL;
