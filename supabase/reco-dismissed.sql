-- BARZ¡ — « Pas pour moi » sur les recommandations (src/scripts/reco.ts)
-- À exécuter UNE fois dans Supabase : SQL Editor → New query → coller → Run.
-- Le script peut être relancé sans risque (IF NOT EXISTS / DROP POLICY IF EXISTS).
-- Sans cette table, le choix est gardé sur l'appareil (localStorage).

CREATE TABLE IF NOT EXISTS reco_dismissed (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  artist_id UUID NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, artist_id)
);

ALTER TABLE reco_dismissed ENABLE ROW LEVEL SECURITY;

-- Chaque membre ne voit et ne modifie que ses propres choix
DROP POLICY IF EXISTS "reco_dismissed own rows" ON reco_dismissed;
CREATE POLICY "reco_dismissed own rows" ON reco_dismissed
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
