-- BARZ¡ — Comptes et fonctions sociales (profils, Barz, spin list, écoutés, j'aime)
-- À exécuter UNE fois dans Supabase : SQL Editor → New query → coller → Run.
-- Le script peut être relancé sans risque (IF NOT EXISTS / DROP POLICY IF EXISTS).

-- ============================================================
-- PROFILS (un par compte, créé automatiquement à l'inscription)
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL CHECK (username ~ '^[a-z0-9._]{3,24}$'),
  display_name TEXT NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 40),
  bio TEXT CHECK (char_length(bio) <= 160),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Profiles are public" ON profiles;
CREATE POLICY "Profiles are public" ON profiles FOR SELECT USING (true);
DROP POLICY IF EXISTS "Users update their own profile" ON profiles;
CREATE POLICY "Users update their own profile" ON profiles FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- À l'inscription : pseudo choisi (métadonnée "username") ou tiré de l'e-mail, rendu unique si besoin
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  base TEXT;
  candidate TEXT;
BEGIN
  base := lower(regexp_replace(coalesce(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)), '[^a-z0-9._]', '', 'gi'));
  IF char_length(base) < 3 THEN base := 'membre'; END IF;
  base := left(base, 18);
  candidate := base;
  WHILE EXISTS (SELECT 1 FROM profiles WHERE username = candidate) LOOP
    candidate := base || floor(random() * 10000)::int;
  END LOOP;
  INSERT INTO profiles (id, username, display_name)
  VALUES (NEW.id, candidate, left(coalesce(NULLIF(NEW.raw_user_meta_data->>'display_name', ''), candidate), 40));
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- BARZ (avis courts notés sur 10)
-- ============================================================
CREATE TABLE IF NOT EXISTS barz (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  release_id UUID NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
  score NUMERIC(3,1) NOT NULL CHECK (score >= 0 AND score <= 10),
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 280),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, release_id) -- un Barz par personne et par sortie (modifiable)
);
CREATE INDEX IF NOT EXISTS idx_barz_created ON barz(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_barz_release ON barz(release_id);

ALTER TABLE barz ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Barz are public" ON barz;
CREATE POLICY "Barz are public" ON barz FOR SELECT USING (true);
DROP POLICY IF EXISTS "Users write their own barz" ON barz;
CREATE POLICY "Users write their own barz" ON barz FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users edit their own barz" ON barz;
CREATE POLICY "Users edit their own barz" ON barz FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users delete their own barz" ON barz;
CREATE POLICY "Users delete their own barz" ON barz FOR DELETE USING (auth.uid() = user_id);

-- ============================================================
-- J'AIME sur les Barz
-- ============================================================
CREATE TABLE IF NOT EXISTS barz_likes (
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  barz_id UUID NOT NULL REFERENCES barz(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, barz_id)
);

ALTER TABLE barz_likes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Likes are public" ON barz_likes;
CREATE POLICY "Likes are public" ON barz_likes FOR SELECT USING (true);
DROP POLICY IF EXISTS "Users like as themselves" ON barz_likes;
CREATE POLICY "Users like as themselves" ON barz_likes FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users unlike as themselves" ON barz_likes;
CREATE POLICY "Users unlike as themselves" ON barz_likes FOR DELETE USING (auth.uid() = user_id);

-- ============================================================
-- SPIN LIST (à écouter) et ÉCOUTÉS
-- ============================================================
CREATE TABLE IF NOT EXISTS spin_list (
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  release_id UUID NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, release_id)
);

CREATE TABLE IF NOT EXISTS listened (
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  release_id UUID NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, release_id)
);

ALTER TABLE spin_list ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Spin lists are public" ON spin_list;
CREATE POLICY "Spin lists are public" ON spin_list FOR SELECT USING (true);
DROP POLICY IF EXISTS "Users manage their spin list" ON spin_list;
CREATE POLICY "Users manage their spin list" ON spin_list FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

ALTER TABLE listened ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Listened are public" ON listened;
CREATE POLICY "Listened are public" ON listened FOR SELECT USING (true);
DROP POLICY IF EXISTS "Users manage their listened" ON listened;
CREATE POLICY "Users manage their listened" ON listened FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
