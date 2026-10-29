-- BARZ¡ — Notification aux amis quand un membre publie un Barz (fonction supabase/functions/notify, action « barz »)
-- À exécuter UNE fois dans Supabase : SQL Editor → New query → coller → Run (après supabase/notifications.sql).
-- Le script peut être relancé sans risque.
-- Seulement pour un nouveau Barz : modifier son Barz (même disque) passe par une mise à jour et ne prévient personne.

CREATE OR REPLACE FUNCTION barz_new_barz_notify() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM barz_call_notify(jsonb_build_object('action', 'barz', 'barz', NEW.id));
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS barz_notify ON barz;
CREATE TRIGGER barz_notify AFTER INSERT ON barz FOR EACH ROW EXECUTE FUNCTION barz_new_barz_notify();
