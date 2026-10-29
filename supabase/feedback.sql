-- BARZ¡ — Retours des membres (bugs, idées, remarques)
-- À exécuter UNE fois dans Supabase : SQL Editor → New query → coller → Run.
-- Le script peut être relancé sans risque (IF NOT EXISTS / DROP POLICY IF EXISTS).
-- Une ligne = un retour envoyé depuis la page /retours, avec ou sans compte.
-- Chacun relit ses propres retours ; seul Alban (is_barz_admin) les voit tous et change leur statut.
-- La fonction supabase/functions/notify (action « feedback ») envoie une notification à Alban à chaque nouveau retour.

CREATE OR REPLACE FUNCTION is_barz_admin() RETURNS BOOLEAN
LANGUAGE sql STABLE AS $$ SELECT auth.uid() = '1b7ffb47-27e0-47ec-8bf2-1d516f3035dd'::uuid $$;

CREATE TABLE IF NOT EXISTS feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('bug', 'idee', 'remarque')),
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 5 AND 2000),
  page TEXT CHECK (char_length(page) <= 300),
  device TEXT CHECK (char_length(device) <= 300),
  status TEXT NOT NULL DEFAULT 'nouveau' CHECK (status IN ('nouveau', 'prevu', 'fait', 'ecarte')),
  notified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_feedback_created ON feedback(created_at DESC);

ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;
-- Tout le monde peut envoyer un retour, en son nom ou sans compte, toujours au statut « nouveau »
DROP POLICY IF EXISTS "Anyone sends feedback" ON feedback;
CREATE POLICY "Anyone sends feedback" ON feedback FOR INSERT
  WITH CHECK ((user_id IS NULL OR user_id = auth.uid()) AND status = 'nouveau' AND notified_at IS NULL);
DROP POLICY IF EXISTS "Users read their own feedback" ON feedback;
CREATE POLICY "Users read their own feedback" ON feedback FOR SELECT USING (auth.uid() = user_id OR is_barz_admin());
DROP POLICY IF EXISTS "Admin updates feedback" ON feedback;
CREATE POLICY "Admin updates feedback" ON feedback FOR UPDATE USING (is_barz_admin()) WITH CHECK (is_barz_admin());
DROP POLICY IF EXISTS "Admin deletes feedback" ON feedback;
CREATE POLICY "Admin deletes feedback" ON feedback FOR DELETE USING (is_barz_admin());

-- Garde-fou contre le spam : 5 retours par quart d'heure par membre, 20 par heure pour les visiteurs sans compte
CREATE OR REPLACE FUNCTION feedback_rate_limit() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.user_id IS NOT NULL THEN
    IF (SELECT count(*) FROM feedback WHERE user_id = NEW.user_id AND created_at > NOW() - INTERVAL '15 minutes') >= 5 THEN
      RAISE EXCEPTION 'Trop de retours d’un coup : réessaie dans un quart d’heure.';
    END IF;
  ELSIF (SELECT count(*) FROM feedback WHERE user_id IS NULL AND created_at > NOW() - INTERVAL '1 hour') >= 20 THEN
    RAISE EXCEPTION 'Trop de retours sans compte en ce moment : connecte-toi ou réessaie plus tard.';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS feedback_rate_limit ON feedback;
CREATE TRIGGER feedback_rate_limit BEFORE INSERT ON feedback FOR EACH ROW EXECUTE FUNCTION feedback_rate_limit();
