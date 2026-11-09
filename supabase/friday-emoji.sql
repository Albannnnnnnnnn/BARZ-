-- BARZ¡ — Réactions rapides sur le fil du vendredi : ♥, 🔥, 😴, 🤯 (une de chaque au plus par membre et par message)
-- À exécuter UNE fois dans Supabase : SQL Editor → New query → coller → Run. Relançable sans risque.
-- Les ♥ déjà posés gardent leur valeur (emoji '♥' par défaut).

ALTER TABLE friday_post_likes ADD COLUMN IF NOT EXISTS emoji TEXT NOT NULL DEFAULT '♥';
ALTER TABLE friday_post_likes DROP CONSTRAINT IF EXISTS friday_post_likes_emoji_check;
ALTER TABLE friday_post_likes ADD CONSTRAINT friday_post_likes_emoji_check CHECK (emoji IN ('♥', '🔥', '😴', '🤯'));
-- Clé : membre + message + réaction (avant : membre + message)
ALTER TABLE friday_post_likes DROP CONSTRAINT IF EXISTS friday_post_likes_pkey;
ALTER TABLE friday_post_likes ADD PRIMARY KEY (user_id, post_id, emoji);

-- La notification dit quelle réaction (fonction notify, action friday-like)
CREATE OR REPLACE FUNCTION friday_like_notify() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM barz_call_notify(jsonb_build_object('action', 'friday-like', 'post', NEW.post_id, 'user', NEW.user_id, 'emoji', NEW.emoji));
  RETURN NEW;
END $$;
