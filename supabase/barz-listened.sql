-- BARZ¡ — Les disques déjà notés passent dans « Écouté » (depuis le 03/11/2026, publier un Barz le fait tout seul,
-- src/scripts/social.ts saveBarz). À exécuter UNE fois dans Supabase : SQL Editor → New query → coller → Run.
-- Le script peut être relancé sans risque : un disque déjà dans « Écouté » garde sa date.
INSERT INTO listened (user_id, release_id)
SELECT user_id, release_id FROM barz
ON CONFLICT DO NOTHING;
