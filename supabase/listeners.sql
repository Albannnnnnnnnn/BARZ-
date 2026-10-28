-- BARZ¡ — Auditeurs Last.fm des artistes (popularité mesurée sur toutes les plateformes)
-- À exécuter UNE fois dans Supabase : SQL Editor → New query → coller → Run.
-- Le script peut être relancé sans risque (IF NOT EXISTS).
-- Rempli par scripts/sync-listeners.ts (GitHub Actions, clé Last.fm côté serveur).

ALTER TABLE artists ADD COLUMN IF NOT EXISTS lastfm_listeners BIGINT;
ALTER TABLE artists ADD COLUMN IF NOT EXISTS lastfm_checked_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_artists_lastfm_checked ON artists(lastfm_checked_at NULLS FIRST);
