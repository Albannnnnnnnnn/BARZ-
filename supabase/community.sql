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

-- ============================================================
-- DISCUSSION DU VENDREDI : un fil par semaine sur les sorties, ouvert du vendredi au dimanche (heure de Paris)
-- ============================================================
CREATE TABLE IF NOT EXISTS friday_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week DATE NOT NULL CHECK (EXTRACT(ISODOW FROM week) = 5), -- le vendredi de la semaine
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 1000),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_friday_posts_week ON friday_posts(week, created_at);

-- Le vendredi en cours (vendredi, samedi ou dimanche à Paris), sinon NULL : le fil est fermé
CREATE OR REPLACE FUNCTION friday_open_week() RETURNS DATE
LANGUAGE sql STABLE AS $$
  SELECT CASE WHEN EXTRACT(ISODOW FROM d) IN (5, 6, 7) THEN d - ((EXTRACT(ISODOW FROM d)::INT - 5)) END
  FROM (SELECT (NOW() AT TIME ZONE 'Europe/Paris')::DATE AS d) t
$$;

ALTER TABLE friday_posts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Friday posts are public" ON friday_posts;
CREATE POLICY "Friday posts are public" ON friday_posts FOR SELECT USING (true);
DROP POLICY IF EXISTS "Members post on the open Friday" ON friday_posts;
CREATE POLICY "Members post on the open Friday" ON friday_posts FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND week = friday_open_week());
DROP POLICY IF EXISTS "Authors or admin delete Friday posts" ON friday_posts;
CREATE POLICY "Authors or admin delete Friday posts" ON friday_posts FOR DELETE USING (auth.uid() = user_id OR is_barz_admin());

-- Garde-fou : 20 messages par heure et par membre
CREATE OR REPLACE FUNCTION friday_posts_rate_limit() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (SELECT count(*) FROM friday_posts WHERE user_id = NEW.user_id AND created_at > NOW() - INTERVAL '1 hour') >= 20 THEN
    RAISE EXCEPTION 'Doucement : réessaie dans un moment.';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS friday_posts_rate_limit ON friday_posts;
CREATE TRIGGER friday_posts_rate_limit BEFORE INSERT ON friday_posts FOR EACH ROW EXECUTE FUNCTION friday_posts_rate_limit();

-- ============================================================
-- LISTES DE DISQUES : « Mes classiques du rap FR », « À écouter en voiture »… publiques, modifiables par leur auteur
-- ============================================================
-- Chaque disque : { id (Deezer), title, artist, artistId, cover }, comme les tops du profil
CREATE TABLE IF NOT EXISTS lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 80),
  description TEXT CHECK (char_length(description) <= 500),
  items JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(items) = 'array' AND jsonb_array_length(items) <= 100),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lists_user ON lists(user_id, updated_at DESC);

ALTER TABLE lists ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Lists are public" ON lists;
CREATE POLICY "Lists are public" ON lists FOR SELECT USING (true);
DROP POLICY IF EXISTS "Users create their lists" ON lists;
CREATE POLICY "Users create their lists" ON lists FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users edit their lists" ON lists;
CREATE POLICY "Users edit their lists" ON lists FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users delete their lists" ON lists;
CREATE POLICY "Users delete their lists" ON lists FOR DELETE USING (auth.uid() = user_id);
-- 30 listes au plus par membre
CREATE OR REPLACE FUNCTION lists_limit() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (SELECT count(*) FROM lists WHERE user_id = NEW.user_id) >= 30 THEN RAISE EXCEPTION 'Tu as déjà 30 listes : supprime-en une pour en créer une autre.'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS lists_limit ON lists;
CREATE TRIGGER lists_limit BEFORE INSERT ON lists FOR EACH ROW EXECUTE FUNCTION lists_limit();

-- ============================================================
-- TOP DE LA SEMAINE : notification le dimanche à 11h (heure de Paris), fonction notify (action « week-top »)
-- ============================================================
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_kind_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_kind_check
  CHECK (kind IN ('friend', 'barz', 'release', 'friday', 'feedback', 'reply', 'like', 'announcement', 'games', 'week'));
-- pg_cron compte en UTC : 9h et 10h UTC le dimanche, et la fonction n'envoie qu'au passage de 11h à Paris
SELECT cron.schedule('barz-notif-top-semaine', '0 9,10 * * 0', $$ SELECT barz_call_notify('{"action": "week-top", "hour": 11}'::jsonb) $$);
