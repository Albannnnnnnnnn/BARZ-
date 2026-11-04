-- BARZ¡ — Communauté : invitations, discussion du vendredi, listes de disques, top de la semaine
-- À exécuter UNE fois dans Supabase : SQL Editor → New query → coller → Run (après friends.sql, notifications.sql,
-- inbox.sql et games-reminder.sql). Le script peut être relancé sans risque.

-- ============================================================
-- INVITATIONS : un lien personnel ; qui s'inscrit avec devient ami de celui qui l'a envoyé
-- ============================================================
-- Le code n'est lisible que par son propriétaire (les profils, eux, sont publics : on ne peut pas l'y mettre)
CREATE TABLE IF NOT EXISTS invite_codes (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE CHECK (code ~ '^[a-f0-9]{12}$'),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE invite_codes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users read their invite code" ON invite_codes;
CREATE POLICY "Users read their invite code" ON invite_codes FOR SELECT USING (auth.uid() = user_id);

-- Son code d'invitation (créé à la première demande)
CREATE OR REPLACE FUNCTION my_invite_code() RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE result TEXT;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Connecte-toi pour inviter un ami.'; END IF;
  SELECT code INTO result FROM invite_codes WHERE user_id = auth.uid();
  IF result IS NULL THEN
    result := encode(gen_random_bytes(6), 'hex');
    INSERT INTO invite_codes (user_id, code) VALUES (auth.uid(), result);
  END IF;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION my_invite_code() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION my_invite_code() TO authenticated;

-- Qui invite (pour l'écran de connexion) : seulement son nom affiché et son pseudo
CREATE OR REPLACE FUNCTION invite_info(invite TEXT) RETURNS TABLE (display_name TEXT, username TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.display_name, p.username FROM invite_codes i JOIN profiles p ON p.id = i.user_id WHERE i.code = lower(invite)
$$;
GRANT EXECUTE ON FUNCTION invite_info(TEXT) TO anon, authenticated;

-- Accepter une invitation : amitié directe avec celui qui invite (ou acceptation d'une demande en attente entre les deux),
-- et il est prévenu. Renvoie le nom de celui qui invite, ou NULL si le code est inconnu.
CREATE OR REPLACE FUNCTION accept_invite(invite TEXT) RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE inviter UUID; inviter_name TEXT;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NULL; END IF;
  SELECT i.user_id, p.display_name INTO inviter, inviter_name FROM invite_codes i JOIN profiles p ON p.id = i.user_id WHERE i.code = lower(invite);
  IF inviter IS NULL OR inviter = auth.uid() THEN RETURN NULL; END IF;
  IF EXISTS (SELECT 1 FROM friendships WHERE (requester_id = inviter AND addressee_id = auth.uid()) OR (requester_id = auth.uid() AND addressee_id = inviter)) THEN
    UPDATE friendships SET status = 'accepted', accepted_at = COALESCE(accepted_at, NOW())
      WHERE ((requester_id = inviter AND addressee_id = auth.uid()) OR (requester_id = auth.uid() AND addressee_id = inviter)) AND status = 'pending';
  ELSE
    INSERT INTO friendships (requester_id, addressee_id, status, accepted_at) VALUES (inviter, auth.uid(), 'accepted', NOW());
    -- Celui qui a invité est prévenu (« … a accepté ta demande d'ami »)
    PERFORM barz_call_notify(jsonb_build_object('action', 'friend', 'event', 'accepted', 'requester', inviter, 'addressee', auth.uid()));
  END IF;
  RETURN inviter_name;
END $$;
REVOKE ALL ON FUNCTION accept_invite(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION accept_invite(TEXT) TO authenticated;
