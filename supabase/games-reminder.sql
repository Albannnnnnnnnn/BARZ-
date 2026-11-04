-- BARZ¡ — Rappel des jeux du jour à 18h (heure de Paris), tous les jours (fonction notify, action « games »)
-- À exécuter UNE fois dans Supabase : SQL Editor → New query → coller → Run (après daily-games.sql, inbox.sql et
-- announcements.sql). Le script peut être relancé sans risque (cron.schedule remplace une tâche du même nom).
-- Seulement aux membres qui ont joué ces 7 derniers jours, qui n'ont pas encore joué aujourd'hui, et qui n'ont pas
-- coupé le rappel dans Paramètres › Notifications (profiles.notify_games).

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS notify_games BOOLEAN NOT NULL DEFAULT TRUE;

-- La cloche accepte les rappels des jeux
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_kind_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_kind_check
  CHECK (kind IN ('friend', 'barz', 'release', 'friday', 'feedback', 'reply', 'like', 'announcement', 'games'));

-- pg_cron compte en UTC : 16h et 17h UTC, et la fonction n'envoie qu'au passage de 18h à Paris (été comme hiver)
SELECT cron.schedule('barz-notif-jeux', '0 16,17 * * *', $$ SELECT barz_call_notify('{"action": "games", "hour": 18}'::jsonb) $$);
