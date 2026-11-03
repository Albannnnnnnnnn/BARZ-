-- BARZ¡ — Tops sur le profil (src/pages/profil.astro) : 3 artistes, 10 albums, 10 singles
-- À exécuter dans Supabase : SQL Editor → New query → coller → Run. Le script peut être relancé sans risque
-- (il remplace l'ancien top-albums.sql, qui limitait les albums à 5).
-- Chaque élément : { id (Deezer), title, artist, artistId (Deezer), cover } ; pour un artiste, title est son nom ;
-- pour un single, albumId est le disque qui le contient. Lisible par tous comme le reste du profil, modifiable
-- seulement par son membre (règles existantes de la table profiles).
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS top_albums JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS top_artists JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS top_singles JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_top_albums_max5;
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_top_albums_max10;
ALTER TABLE profiles ADD CONSTRAINT profiles_top_albums_max10 CHECK (jsonb_typeof(top_albums) = 'array' AND jsonb_array_length(top_albums) <= 10);
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_top_artists_max3;
ALTER TABLE profiles ADD CONSTRAINT profiles_top_artists_max3 CHECK (jsonb_typeof(top_artists) = 'array' AND jsonb_array_length(top_artists) <= 3);
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_top_singles_max10;
ALTER TABLE profiles ADD CONSTRAINT profiles_top_singles_max10 CHECK (jsonb_typeof(top_singles) = 'array' AND jsonb_array_length(top_singles) <= 10);
