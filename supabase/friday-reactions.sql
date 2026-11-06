-- BARZ¡ — ♥ et réponses sur les messages du fil du vendredi (src/pages/vendredi.astro), comme sur les Barz
-- À exécuter UNE fois dans Supabase : SQL Editor → New query → coller → Run (après supabase/community.sql).
-- Le script peut être relancé sans risque.

CREATE TABLE IF NOT EXISTS friday_post_likes (
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  post_id UUID NOT NULL REFERENCES friday_posts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, post_id)
);
CREATE INDEX IF NOT EXISTS idx_friday_post_likes_post ON friday_post_likes(post_id);

ALTER TABLE friday_post_likes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Friday likes are public" ON friday_post_likes;
CREATE POLICY "Friday likes are public" ON friday_post_likes FOR SELECT USING (true);
DROP POLICY IF EXISTS "Members like as themselves" ON friday_post_likes;
CREATE POLICY "Members like as themselves" ON friday_post_likes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Members unlike as themselves" ON friday_post_likes;
CREATE POLICY "Members unlike as themselves" ON friday_post_likes FOR DELETE USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS friday_post_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES friday_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 280),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_friday_post_replies_post ON friday_post_replies(post_id, created_at);

ALTER TABLE friday_post_replies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Friday replies are public" ON friday_post_replies;
CREATE POLICY "Friday replies are public" ON friday_post_replies FOR SELECT USING (true);
DROP POLICY IF EXISTS "Members reply as themselves" ON friday_post_replies;
CREATE POLICY "Members reply as themselves" ON friday_post_replies FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Authors, post owners or admin delete Friday replies" ON friday_post_replies;
CREATE POLICY "Authors, post owners or admin delete Friday replies" ON friday_post_replies FOR DELETE
  USING (auth.uid() = user_id OR auth.uid() = (SELECT p.user_id FROM friday_posts p WHERE p.id = post_id) OR is_barz_admin());

-- Garde-fou : 30 réponses par heure et par membre
CREATE OR REPLACE FUNCTION friday_replies_rate_limit() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (SELECT count(*) FROM friday_post_replies WHERE user_id = NEW.user_id AND created_at > NOW() - INTERVAL '1 hour') >= 30 THEN
    RAISE EXCEPTION 'Trop de réponses d’un coup : réessaie dans un moment.';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS friday_replies_rate_limit ON friday_post_replies;
CREATE TRIGGER friday_replies_rate_limit BEFORE INSERT ON friday_post_replies FOR EACH ROW EXECUTE FUNCTION friday_replies_rate_limit();
