-- BARZ¡ — Annonces d'albums et d'EP qui n'ont pas encore de fiche (ni pré-sortie Deezer, ni date exacte)
-- À exécuter UNE fois dans Supabase : SQL Editor → New query → coller → Run (après feedback.sql, inbox.sql et
-- barz-reactions-notify.sql). Le script peut être relancé sans risque.
--
-- D'où viennent les annonces (colonne source) :
-- - apple       : précommande Apple Music, date exacte (veille, supabase/functions/sync-fresh) — publiée d'office
-- - musicbrainz : date approximative (mois ou année) sur MusicBrainz (scripts/announcements.ts) — publiée d'office
-- - press       : titre d'actu du genre « X annonce son album » (scripts/announcements.ts) — à valider par Alban
-- - member      : signalée par un membre depuis la fiche artiste, avec le lien de la source — à valider par Alban
-- - admin       : ajoutée par Alban (page /annonces)
-- Statuts : pending (à valider), published (visible), rejected (écartée), done (le disque est sorti ou a sa fiche :
-- la veille la relie à la sortie, release_id). Une annonce sans lien vers sa source n'est jamais publiée.

CREATE TABLE IF NOT EXISTS announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id UUID NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  title TEXT CHECK (title IS NULL OR char_length(title) BETWEEN 1 AND 200),
  kind TEXT NOT NULL DEFAULT 'album' CHECK (kind IN ('album', 'ep')),
  release_date DATE, -- premier jour du mois ou de l'année quand la précision est month, season ou year
  date_precision TEXT NOT NULL DEFAULT 'soon' CHECK (date_precision IN ('day', 'month', 'season', 'year', 'soon')),
  source TEXT NOT NULL CHECK (source IN ('apple', 'musicbrainz', 'press', 'member', 'admin')),
  source_url TEXT NOT NULL CHECK (source_url ~ '^https?://' AND char_length(source_url) <= 600),
  note TEXT CHECK (char_length(note) <= 500), -- titre de l'actu, ou message du membre
  cover_url TEXT CHECK (cover_url IS NULL OR cover_url ~ '^https://'),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'published', 'rejected', 'done')),
  release_id UUID REFERENCES releases(id) ON DELETE SET NULL,
  external_key TEXT UNIQUE, -- apple:<id>, mb:<release-group>, press:<lien> : une seule fois chacune
  created_by UUID DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE SET NULL,
  notified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CHECK (date_precision = 'soon' OR release_date IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_announcements_status ON announcements(status, release_date);
CREATE INDEX IF NOT EXISTS idx_announcements_artist ON announcements(artist_id);

ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Published announcements are public" ON announcements;
CREATE POLICY "Published announcements are public" ON announcements FOR SELECT
  USING (status = 'published' OR is_barz_admin() OR created_by = auth.uid());
-- Un membre signale une annonce : toujours à valider, toujours à son nom
DROP POLICY IF EXISTS "Members suggest announcements" ON announcements;
CREATE POLICY "Members suggest announcements" ON announcements FOR INSERT TO authenticated
  WITH CHECK (
    (source = 'member' AND status = 'pending' AND created_by = auth.uid() AND release_id IS NULL AND external_key IS NULL AND notified_at IS NULL)
    OR is_barz_admin()
  );
DROP POLICY IF EXISTS "Admin manages announcements" ON announcements;
CREATE POLICY "Admin manages announcements" ON announcements FOR UPDATE USING (is_barz_admin()) WITH CHECK (is_barz_admin());
DROP POLICY IF EXISTS "Admin deletes announcements" ON announcements;
CREATE POLICY "Admin deletes announcements" ON announcements FOR DELETE USING (is_barz_admin());

-- Garde-fou contre le spam : 5 signalements par heure et par membre
CREATE OR REPLACE FUNCTION announcements_rate_limit() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.source = 'member' AND (SELECT count(*) FROM announcements WHERE created_by = NEW.created_by AND source = 'member' AND created_at > NOW() - INTERVAL '1 hour') >= 5 THEN
    RAISE EXCEPTION 'Trop de signalements d’un coup : réessaie dans une heure.';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS announcements_rate_limit ON announcements;
CREATE TRIGGER announcements_rate_limit BEFORE INSERT ON announcements FOR EACH ROW EXECUTE FUNCTION announcements_rate_limit();

-- Notifications (fonction notify, action « announcement ») : à Alban quand une annonce attend sa validation,
-- aux membres qui suivent l'artiste quand elle est publiée (une seule fois, notified_at)
CREATE OR REPLACE FUNCTION announcements_notify() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'pending' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'pending') THEN
    PERFORM barz_call_notify(jsonb_build_object('action', 'announcement', 'event', 'pending', 'id', NEW.id));
  ELSIF NEW.status = 'published' AND NEW.notified_at IS NULL AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'published') THEN
    PERFORM barz_call_notify(jsonb_build_object('action', 'announcement', 'event', 'published', 'id', NEW.id));
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS announcements_notify ON announcements;
CREATE TRIGGER announcements_notify AFTER INSERT OR UPDATE OF status ON announcements FOR EACH ROW EXECUTE FUNCTION announcements_notify();

-- La cloche accepte les annonces
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_kind_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_kind_check
  CHECK (kind IN ('friend', 'barz', 'release', 'friday', 'feedback', 'reply', 'like', 'announcement'));
