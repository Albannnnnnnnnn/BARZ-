-- BARZ¡ — Connexion Spotify et écoute en direct
-- À exécuter UNE fois dans Supabase : SQL Editor → New query → coller → Run.
-- Le script peut être relancé sans risque (IF NOT EXISTS / DROP POLICY IF EXISTS).
-- Les jetons Spotify ne sont lisibles par personne depuis le navigateur : seule la fonction
-- supabase/functions/spotify (clé service_role) y accède.

-- Partage de l'écoute en direct avec ses amis : désactivé par défaut
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS share_listening BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS spotify_tokens (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  refresh_token TEXT NOT NULL,
  access_token TEXT,
  expires_at TIMESTAMPTZ,
  spotify_name TEXT,
  -- Dernière réponse « en écoute », gardée 10 secondes pour ne pas solliciter Spotify à chaque visite
  now_playing JSONB,
  checked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS activé sans aucune règle : ni anon ni les membres connectés ne peuvent lire ou écrire
ALTER TABLE spotify_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON spotify_tokens FROM anon, authenticated;
