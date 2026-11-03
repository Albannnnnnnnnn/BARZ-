-- BARZ¡ — Notifications des réponses et des ♥ sur tes Barz (fonction supabase/functions/notify, actions « reply » et « like »)
-- À exécuter UNE fois dans Supabase : SQL Editor → New query → coller → Run (après supabase/inbox.sql et barz-replies.sql).
-- Le script peut être relancé sans risque.
-- La fonction ne prévient pas quand on se répond ou s'aime soi-même, et regroupe les ♥ d'un même Barz.

-- La cloche accepte les deux nouveaux types
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_kind_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_kind_check
  CHECK (kind IN ('friend', 'barz', 'release', 'friday', 'feedback', 'reply', 'like'));

-- Nouvelle réponse
CREATE OR REPLACE FUNCTION barz_reply_notify() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM barz_call_notify(jsonb_build_object('action', 'reply', 'reply', NEW.id));
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS barz_reply_notify ON barz_replies;
CREATE TRIGGER barz_reply_notify AFTER INSERT ON barz_replies FOR EACH ROW EXECUTE FUNCTION barz_reply_notify();

-- Nouveau ♥ (retirer son ♥ ne prévient personne)
CREATE OR REPLACE FUNCTION barz_like_notify() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM barz_call_notify(jsonb_build_object('action', 'like', 'barz', NEW.barz_id, 'user', NEW.user_id));
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS barz_like_notify ON barz_likes;
CREATE TRIGGER barz_like_notify AFTER INSERT ON barz_likes FOR EACH ROW EXECUTE FUNCTION barz_like_notify();
