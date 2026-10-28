-- BARZ¡ — Photos de profil
-- À exécuter UNE fois dans Supabase : SQL Editor → New query → coller → Run.
-- Le script peut être relancé sans risque (IF NOT EXISTS / ON CONFLICT / DROP POLICY IF EXISTS).
-- Chaque membre ne peut écrire que dans son propre dossier : avatars/<son id>/…
-- Les photos sont publiques (comme les profils) : n'importe qui peut les afficher.

-- On garde le chemin du fichier dans l'espace « avatars », jamais une adresse libre :
-- impossible d'afficher une image hébergée ailleurs, et le fichier est forcément dans le dossier du membre
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_path TEXT;
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_avatar_path_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_avatar_path_check
  CHECK (avatar_path IS NULL OR avatar_path ~ ('^' || id::text || '/[a-z0-9-]{1,60}\.(webp|jpg|png)$'));

-- Espace de stockage public, images de 2 Mo maximum (le site les réduit avant l'envoi)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('avatars', 'avatars', TRUE, 2097152, ARRAY['image/webp', 'image/jpeg', 'image/png'])
ON CONFLICT (id) DO UPDATE SET public = TRUE, file_size_limit = 2097152, allowed_mime_types = ARRAY['image/webp', 'image/jpeg', 'image/png'];

DROP POLICY IF EXISTS "Avatars are public" ON storage.objects;
CREATE POLICY "Avatars are public" ON storage.objects FOR SELECT USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Users upload their own avatar" ON storage.objects;
CREATE POLICY "Users upload their own avatar" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Users replace their own avatar" ON storage.objects;
CREATE POLICY "Users replace their own avatar" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Users delete their own avatar" ON storage.objects;
CREATE POLICY "Users delete their own avatar" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
