-- BARZ¡ — Réponses aux Barz
-- À exécuter UNE fois dans Supabase : SQL Editor → New query → coller → Run (après supabase/social.sql).
-- Le script peut être relancé sans risque (IF NOT EXISTS / DROP POLICY IF EXISTS).
-- Une ligne = une réponse d'un membre sous un Barz. Publiques comme les Barz.
-- Une réponse peut être supprimée par son auteur ou par l'auteur du Barz.

CREATE TABLE IF NOT EXISTS barz_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barz_id UUID NOT NULL REFERENCES barz(id) ON DELETE CASCADE,
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 280),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_barz_replies_barz ON barz_replies(barz_id, created_at);

ALTER TABLE barz_replies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Replies are public" ON barz_replies;
CREATE POLICY "Replies are public" ON barz_replies FOR SELECT USING (true);
DROP POLICY IF EXISTS "Users reply as themselves" ON barz_replies;
CREATE POLICY "Users reply as themselves" ON barz_replies FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Authors or Barz owners delete replies" ON barz_replies;
CREATE POLICY "Authors or Barz owners delete replies" ON barz_replies FOR DELETE
  USING (auth.uid() = user_id OR auth.uid() = (SELECT b.user_id FROM barz b WHERE b.id = barz_id));
