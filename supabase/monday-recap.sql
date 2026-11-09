-- BARZ¡ — Récap du lundi à 10h (heure de Paris) : les sorties de la semaine de tes artistes, pas encore écoutées
-- (fonction notify, action « monday »). À exécuter UNE fois dans Supabase : SQL Editor → New query → coller → Run.
-- Relançable sans risque. pg_cron compte en UTC : 8h et 9h UTC le lundi, la fonction n'envoie qu'au passage de 10h à Paris.

SELECT cron.unschedule('barz-recap-lundi') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'barz-recap-lundi');
SELECT cron.schedule('barz-recap-lundi', '0 8,9 * * 1', $$ SELECT barz_call_notify('{"action": "monday", "hour": 10}'::jsonb) $$);
