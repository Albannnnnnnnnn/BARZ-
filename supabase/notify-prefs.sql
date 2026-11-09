-- BARZ¡ — Réglages des notifications du téléphone, par type (page Paramètres, fonction notify).
-- Tout est activé par défaut. La cloche de l'appli reçoit tout ; seules les notifications du téléphone suivent ces réglages.
-- À exécuter UNE fois dans Supabase : SQL Editor → New query → coller → Run. Relançable sans risque.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS notify_releases BOOLEAN NOT NULL DEFAULT true;      -- sorties de mes artistes
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS notify_night BOOLEAN NOT NULL DEFAULT true;         -- … aussi entre 22h et 8h
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS notify_friends BOOLEAN NOT NULL DEFAULT true;       -- Barz, réponses et ♥ des amis
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS notify_friday_thread BOOLEAN NOT NULL DEFAULT true; -- discussion du vendredi
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS notify_monday BOOLEAN NOT NULL DEFAULT true;        -- récap du lundi
