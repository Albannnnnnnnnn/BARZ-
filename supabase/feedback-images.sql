-- BARZ¡ — Image jointe aux retours (page /retours), après supabase/feedback.sql
-- À exécuter UNE fois dans Supabase : SQL Editor → New query → coller → Run.
-- Le script peut être relancé sans risque (IF NOT EXISTS / ON CONFLICT / DROP POLICY IF EXISTS).
-- Une capture d'écran par retour, rangée sous <id du retour>.webp dans l'espace privé « feedback » :
-- seul Alban (is_barz_admin) et l'auteur du retour peuvent l'afficher.

ALTER TABLE feedback ADD COLUMN IF NOT EXISTS image_path TEXT;
ALTER TABLE feedback DROP CONSTRAINT IF EXISTS feedback_image_path_check;
ALTER TABLE feedback ADD CONSTRAINT feedback_image_path_check CHECK (image_path IS NULL OR image_path = id::text || '.webp');

-- Espace privé, images de 3 Mo maximum (le site les réduit en WebP avant l'envoi, ce qui retire aussi les métadonnées)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('feedback', 'feedback', FALSE, 3145728, ARRAY['image/webp'])
ON CONFLICT (id) DO UPDATE SET public = FALSE, file_size_limit = 3145728, allowed_mime_types = ARRAY['image/webp'];

-- Envoi avec ou sans compte (comme les retours), jamais en remplacement d'une image existante
DROP POLICY IF EXISTS "Anyone uploads a feedback image" ON storage.objects;
CREATE POLICY "Anyone uploads a feedback image" ON storage.objects FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'feedback' AND name ~ '^[0-9a-f-]{36}\.webp$');

DROP POLICY IF EXISTS "Feedback images for admin and author" ON storage.objects;
CREATE POLICY "Feedback images for admin and author" ON storage.objects FOR SELECT
  USING (bucket_id = 'feedback' AND (is_barz_admin() OR EXISTS (SELECT 1 FROM feedback f WHERE f.image_path = name AND f.user_id = auth.uid())));

DROP POLICY IF EXISTS "Admin deletes feedback images" ON storage.objects;
CREATE POLICY "Admin deletes feedback images" ON storage.objects FOR DELETE USING (bucket_id = 'feedback' AND is_barz_admin());
