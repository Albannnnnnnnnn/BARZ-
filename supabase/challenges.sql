-- BARZ¡ — Défi de la semaine « Sors de ta bulle »
-- À exécuter UNE fois dans Supabase : SQL Editor → New query → coller → Run.
-- Le script peut être relancé sans risque (IF NOT EXISTS / DROP POLICY IF EXISTS).
-- Une ligne = un disque proposé à un membre. Pour en proposer un nouveau dès que le précédent est relevé,
-- lancer ensuite supabase/challenges-chain.sql.
-- Le défi est relevé quand le membre a marqué le disque comme écouté ou l'a noté (tables listened / barz).

CREATE TABLE IF NOT EXISTS challenges (
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  release_id UUID NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, week_start)
);

ALTER TABLE challenges ENABLE ROW LEVEL SECURITY;
-- Publics comme les écoutés : ils apparaissent dans le bilan du mois d'un membre
DROP POLICY IF EXISTS "Challenges are public" ON challenges;
CREATE POLICY "Challenges are public" ON challenges FOR SELECT USING (true);
DROP POLICY IF EXISTS "Users get their own challenge" ON challenges;
CREATE POLICY "Users get their own challenge" ON challenges FOR INSERT WITH CHECK (auth.uid() = user_id);
