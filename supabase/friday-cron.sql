-- BARZ¡ — Notification du vendredi à 9h (heure de Paris), lancée par Supabase et plus par GitHub Actions
-- À exécuter UNE fois dans Supabase : SQL Editor → New query → coller → Run (après supabase/notifications.sql).
-- Le script peut être relancé sans risque (cron.schedule remplace une tâche du même nom).
-- Avant, elle partait après la synchro GitHub de 6h UTC, qui prend souvent plusieurs heures de retard :
-- le 30/10/2026, la synchro a tourné vers 14h et la notification a été sautée. Les sorties de la nuit sont en base
-- dès minuit grâce à la veille (fresh.sql), donc rien n'oblige à attendre GitHub.
-- pg_cron compte en UTC : 7h et 8h UTC le vendredi, et la fonction notify n'envoie qu'au passage de 9h à Paris
-- (8h UTC l'été, 7h UTC l'hiver).

SELECT cron.schedule('barz-notif-vendredi', '0 7,8 * * 5', $$ SELECT barz_call_notify('{"action": "friday", "hour": 9}'::jsonb) $$);
