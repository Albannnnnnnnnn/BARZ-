-- BARZ¡ — Noter sans écrire : un Barz peut n'avoir qu'une note (texte vide)
-- À exécuter UNE fois dans Supabase : SQL Editor → New query → coller → Run. Le script peut être relancé sans risque.
-- Une note seule ne prévient pas les amis (pas de notification « a publié un Barz ») ; elle compte dans les moyennes.
ALTER TABLE barz DROP CONSTRAINT IF EXISTS barz_body_check;
ALTER TABLE barz ADD CONSTRAINT barz_body_check CHECK (char_length(body) BETWEEN 0 AND 1000);
ALTER TABLE barz ALTER COLUMN body SET DEFAULT '';

CREATE OR REPLACE FUNCTION barz_new_barz_notify() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF btrim(NEW.body) <> '' THEN
    PERFORM barz_call_notify(jsonb_build_object('action', 'barz', 'barz', NEW.id));
  END IF;
  RETURN NEW;
END $$;
