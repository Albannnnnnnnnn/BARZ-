-- BARZ¡ — Notifications (Web Push)
-- À exécuter UNE fois dans Supabase : SQL Editor → New query → coller → Run.
-- Le script peut être relancé sans risque (IF NOT EXISTS / DROP POLICY IF EXISTS).
-- Une ligne = un appareil (navigateur ou appli installée) qui a accepté les notifications.
-- La fonction supabase/functions/notify (clé service_role) lit ces lignes pour envoyer les notifications.

CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint TEXT PRIMARY KEY CHECK (endpoint ~ '^https://' AND char_length(endpoint) <= 1000),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  p256dh TEXT NOT NULL CHECK (char_length(p256dh) <= 200),
  auth TEXT NOT NULL CHECK (char_length(auth) <= 100),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_push_user ON push_subscriptions(user_id);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
-- Chaque membre ne voit et ne gère que ses propres appareils
DROP POLICY IF EXISTS "Users read their own subscriptions" ON push_subscriptions;
CREATE POLICY "Users read their own subscriptions" ON push_subscriptions FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users add their own subscriptions" ON push_subscriptions;
CREATE POLICY "Users add their own subscriptions" ON push_subscriptions FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users update their own subscriptions" ON push_subscriptions;
CREATE POLICY "Users update their own subscriptions" ON push_subscriptions FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users remove their own subscriptions" ON push_subscriptions;
CREATE POLICY "Users remove their own subscriptions" ON push_subscriptions FOR DELETE USING (auth.uid() = user_id);
