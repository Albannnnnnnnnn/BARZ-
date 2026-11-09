-- BARZ¡ — Relevé de vitesse des sorties, chaque vendredi à 12h (heure de Paris), dans le salon privé #alertes
-- (fonction notify, action « speed-report », webhook DISCORD_ALERTS_WEBHOOK_URL déjà en place).
-- À exécuter UNE fois dans Supabase : SQL Editor → New query → coller → Run. Relançable sans risque.
-- pg_cron compte en UTC : 10h et 11h UTC le vendredi, et la fonction ne poste qu'au passage de 12h à Paris.

SELECT cron.unschedule('barz-releve-vitesse') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'barz-releve-vitesse');
SELECT cron.schedule('barz-releve-vitesse', '0 10,11 * * 5', $$ SELECT barz_call_notify('{"action": "speed-report", "hour": 12}'::jsonb) $$);
