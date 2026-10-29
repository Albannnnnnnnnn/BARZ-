-- BARZ¡ — Notifications dans l'appli (la cloche en haut à droite)
-- À exécuter UNE fois dans Supabase : SQL Editor → New query → coller → Run (après supabase/notifications.sql).
-- Le script peut être relancé sans risque (IF NOT EXISTS / DROP POLICY IF EXISTS).
-- Une ligne = une notification pour un membre, écrite par la fonction supabase/functions/notify (clé service_role)
-- en même temps que la notification du téléphone, même si le membre n'a pas activé celles-ci.
-- Chacun ne voit que les siennes, les marque comme lues ou les supprime. Gardées 60 jours.

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('friend', 'barz', 'release', 'friday', 'feedback')),
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at DESC);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users read their notifications" ON notifications;
CREATE POLICY "Users read their notifications" ON notifications FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users mark their notifications read" ON notifications;
CREATE POLICY "Users mark their notifications read" ON notifications FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users delete their notifications" ON notifications;
CREATE POLICY "Users delete their notifications" ON notifications FOR DELETE USING (auth.uid() = user_id);

-- Marquer comme lu ne peut changer que read_at
REVOKE UPDATE ON notifications FROM anon, authenticated;
GRANT UPDATE (read_at) ON notifications TO authenticated;
