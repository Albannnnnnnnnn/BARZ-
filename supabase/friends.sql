-- BARZ¡ — Amis (demande, puis acceptation)
-- À exécuter UNE fois dans Supabase : SQL Editor → New query → coller → Run.
-- Le script peut être relancé sans risque (IF NOT EXISTS / DROP POLICY IF EXISTS).
-- Une ligne = une demande ; status passe de 'pending' à 'accepted' quand l'autre accepte.
-- Refuser, annuler ou retirer un ami = supprimer la ligne.

CREATE TABLE IF NOT EXISTS friendships (
  requester_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  addressee_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  PRIMARY KEY (requester_id, addressee_id),
  CHECK (requester_id <> addressee_id)
);
-- Une seule ligne par paire, quel que soit celui qui a demandé
CREATE UNIQUE INDEX IF NOT EXISTS idx_friendships_pair ON friendships (LEAST(requester_id, addressee_id), GREATEST(requester_id, addressee_id));
CREATE INDEX IF NOT EXISTS idx_friendships_addressee ON friendships(addressee_id);

ALTER TABLE friendships ENABLE ROW LEVEL SECURITY;
-- Seules les deux personnes concernées voient la demande ou l'amitié
DROP POLICY IF EXISTS "Friendships visible to both sides" ON friendships;
CREATE POLICY "Friendships visible to both sides" ON friendships FOR SELECT USING (auth.uid() IN (requester_id, addressee_id));
DROP POLICY IF EXISTS "Users send requests as themselves" ON friendships;
CREATE POLICY "Users send requests as themselves" ON friendships FOR INSERT WITH CHECK (auth.uid() = requester_id AND status = 'pending');
-- Seul le destinataire accepte
DROP POLICY IF EXISTS "Addressee accepts" ON friendships;
CREATE POLICY "Addressee accepts" ON friendships FOR UPDATE USING (auth.uid() = addressee_id) WITH CHECK (auth.uid() = addressee_id AND status = 'accepted');
DROP POLICY IF EXISTS "Either side removes" ON friendships;
CREATE POLICY "Either side removes" ON friendships FOR DELETE USING (auth.uid() IN (requester_id, addressee_id));

-- Accepter ne peut changer que le statut, pas les personnes
REVOKE UPDATE ON friendships FROM anon, authenticated;
GRANT UPDATE (status, accepted_at) ON friendships TO authenticated;
