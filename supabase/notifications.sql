-- BARZ¡ — Notifications des demandes d'ami et des sorties des artistes suivis (fonction supabase/functions/notify)
-- À exécuter UNE fois dans Supabase : SQL Editor → New query → coller → Run (après push.sql, friends.sql et fresh.sql).
-- Le script peut être relancé sans risque.
-- - Demande d'ami : notification au destinataire dès l'envoi ; demande acceptée : notification à celui qui l'a envoyée.
-- - Sortie d'un artiste suivi (ou invité en feat) : vérifiée toutes les 15 minutes, envoyée entre 8h et 22h (heure de Paris).
--   Le vendredi matin, c'est la notification du vendredi qui annonce les sorties ; jamais deux fois la même sortie.

-- Sorties déjà annoncées à chaque membre
CREATE TABLE IF NOT EXISTS notified_releases (
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  release_id UUID NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, release_id)
);
ALTER TABLE notified_releases ENABLE ROW LEVEL SECURITY; -- aucune règle : seule la clé service_role y accède

-- Appel de la fonction notify avec la clé service_role du coffre (même clé que fresh.sql)
CREATE OR REPLACE FUNCTION barz_call_notify(payload JSONB) RETURNS BIGINT
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT net.http_post(
    url := 'https://dgqpizfnqrqhjlpkscts.supabase.co/functions/v1/notify',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'barz_service_key'),
      'Content-Type', 'application/json'
    ),
    body := payload,
    timeout_milliseconds := 60000
  );
$$;
REVOKE ALL ON FUNCTION barz_call_notify(JSONB) FROM PUBLIC, anon, authenticated;

-- Demande envoyée ou acceptée
CREATE OR REPLACE FUNCTION barz_friendship_notify() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'pending' THEN
    PERFORM barz_call_notify(jsonb_build_object('action', 'friend', 'event', 'request', 'requester', NEW.requester_id, 'addressee', NEW.addressee_id));
  ELSIF TG_OP = 'UPDATE' AND OLD.status = 'pending' AND NEW.status = 'accepted' THEN
    PERFORM barz_call_notify(jsonb_build_object('action', 'friend', 'event', 'accepted', 'requester', NEW.requester_id, 'addressee', NEW.addressee_id));
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS friendship_notify ON friendships;
CREATE TRIGGER friendship_notify AFTER INSERT OR UPDATE OF status ON friendships FOR EACH ROW EXECUTE FUNCTION barz_friendship_notify();

-- Sorties des artistes suivis, toutes les 15 minutes (la fonction ne notifie qu'entre 8h et 22h)
SELECT cron.schedule('barz-notif-sorties', '*/15 * * * *', $$ SELECT barz_call_notify('{"action": "releases"}'::jsonb) $$);
