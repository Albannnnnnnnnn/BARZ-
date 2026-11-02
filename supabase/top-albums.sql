-- BARZ¡ — Top 5 albums sur le profil (src/pages/profil.astro)
-- À exécuter UNE fois dans Supabase : SQL Editor → New query → coller → Run. Le script peut être relancé sans risque.
-- Chaque album : { id (Deezer), title, artist, artistId (Deezer), cover }. Lisible par tous comme le reste du profil,
-- modifiable seulement par son membre (règles existantes de la table profiles).
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS top_albums JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_top_albums_max5;
ALTER TABLE profiles ADD CONSTRAINT profiles_top_albums_max5 CHECK (jsonb_typeof(top_albums) = 'array' AND jsonb_array_length(top_albums) <= 5);
