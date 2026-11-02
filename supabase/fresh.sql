-- BARZ¡ — Veille des sorties et synchro de minuit à l'heure (fonction supabase/functions/sync-fresh)
-- À exécuter UNE fois dans Supabase : SQL Editor → New query → coller → Run.
-- AVANT : remplacer COLLER_ICI_LA_CLE_SERVICE_ROLE par la clé service_role (SUPABASE_SERVICE_KEY du .env).
-- Le script peut être relancé sans risque.

-- État de la veille : dernière reconstruction du site lancée, nouvelles sorties en attente de reconstruction
CREATE TABLE IF NOT EXISTS sync_state (
  id INT PRIMARY KEY CHECK (id = 1),
  last_deploy TIMESTAMPTZ,
  pending BOOLEAN NOT NULL DEFAULT false
);
ALTER TABLE sync_state ENABLE ROW LEVEL SECURITY; -- aucune règle : seule la clé service_role y accède

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Clé service_role rangée dans le coffre de Supabase (Vault), lue par les tâches ci-dessous
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'barz_service_key') THEN
    PERFORM vault.create_secret('COLLER_ICI_LA_CLE_SERVICE_ROLE', 'barz_service_key');
  END IF;
END $$;

-- Appel de la fonction à Paris (x-region) : Deezer doit voir la France
CREATE OR REPLACE FUNCTION barz_call_sync_fresh(action TEXT) RETURNS BIGINT
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT net.http_post(
    url := 'https://dgqpizfnqrqhjlpkscts.supabase.co/functions/v1/sync-fresh',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'barz_service_key'),
      'Content-Type', 'application/json',
      'x-region', 'eu-west-3'
    ),
    body := jsonb_build_object('action', action),
    timeout_milliseconds := 150000
  );
$$;
REVOKE ALL ON FUNCTION barz_call_sync_fresh(TEXT) FROM PUBLIC, anon, authenticated;

-- Veille toutes les 5 minutes (un passage dure environ une minute pour ~530 artistes)
SELECT cron.schedule('barz-veille', '*/5 * * * *', $$ SELECT barz_call_sync_fresh('veille') $$);
-- Synchro complète à 0h05 heure de Paris : 23h05 UTC en hiver, 22h05 UTC en été (la fonction ne lance que celle qui tombe à 0h)
SELECT cron.schedule('barz-minuit', '5 22,23 * * *', $$ SELECT barz_call_sync_fresh('minuit') $$);
