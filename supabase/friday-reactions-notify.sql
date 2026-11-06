-- BARZ¡ — Notifications des ♥ et des réponses sur les messages du fil du vendredi (fonction supabase/functions/notify,
-- actions « friday-like » et « friday-reply »). À exécuter UNE fois dans Supabase : SQL Editor → New query → coller → Run
-- (après supabase/friday-reactions.sql et supabase/notifications.sql). Le script peut être relancé sans risque.
-- Réponse : prévient l'auteur du message et ceux qui ont déjà répondu dessous. ♥ : regroupés par message, comme les Barz.

CREATE OR REPLACE FUNCTION friday_reply_notify() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM barz_call_notify(jsonb_build_object('action', 'friday-reply', 'reply', NEW.id));
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS friday_reply_notify ON friday_post_replies;
CREATE TRIGGER friday_reply_notify AFTER INSERT ON friday_post_replies FOR EACH ROW EXECUTE FUNCTION friday_reply_notify();

-- Retirer son ♥ ne prévient personne
CREATE OR REPLACE FUNCTION friday_like_notify() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM barz_call_notify(jsonb_build_object('action', 'friday-like', 'post', NEW.post_id, 'user', NEW.user_id));
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS friday_like_notify ON friday_post_likes;
CREATE TRIGGER friday_like_notify AFTER INSERT ON friday_post_likes FOR EACH ROW EXECUTE FUNCTION friday_like_notify();
