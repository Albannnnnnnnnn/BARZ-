-- BARZ¡ — Chacun peut supprimer ses propres retours (page /retours), image jointe comprise.
-- À exécuter UNE fois dans Supabase : SQL Editor → New query → coller → Run (après feedback.sql et feedback-images.sql).
-- Le script peut être relancé sans risque. Alban (is_barz_admin) pouvait déjà tout supprimer.

DROP POLICY IF EXISTS "Admin deletes feedback" ON feedback;
DROP POLICY IF EXISTS "Authors or admin delete feedback" ON feedback;
CREATE POLICY "Authors or admin delete feedback" ON feedback FOR DELETE USING (auth.uid() = user_id OR is_barz_admin());

-- L'image d'un retour : supprimée par son auteur (avant le retour lui-même) ou par Alban
DROP POLICY IF EXISTS "Admin deletes feedback images" ON storage.objects;
DROP POLICY IF EXISTS "Authors or admin delete feedback images" ON storage.objects;
CREATE POLICY "Authors or admin delete feedback images" ON storage.objects FOR DELETE
  USING (bucket_id = 'feedback' AND (is_barz_admin() OR EXISTS (SELECT 1 FROM feedback f WHERE f.image_path = name AND f.user_id = auth.uid())));
