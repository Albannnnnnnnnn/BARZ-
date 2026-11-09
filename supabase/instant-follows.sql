-- BARZ¡ — « Dès la sortie » : jusqu'à 5 artistes suivis dont les sorties sont notifiées tout de suite, même la nuit
-- et le vendredi avant 9h (fonction notify, action releases). Les autres attendent toujours 8h / 9h le vendredi.
-- À exécuter UNE fois dans Supabase : SQL Editor → New query → coller → Run. Relançable sans risque.

ALTER TABLE follows ADD COLUMN IF NOT EXISTS instant BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_follows_instant ON follows(user_id) WHERE instant;

-- Chacun change seulement ses propres suivis
DROP POLICY IF EXISTS "Users update their follows" ON follows;
CREATE POLICY "Users update their follows" ON follows FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 5 artistes au plus en « Dès la sortie »
CREATE OR REPLACE FUNCTION follows_instant_limit() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.instant AND (SELECT count(*) FROM follows WHERE user_id = NEW.user_id AND instant AND artist_id <> NEW.artist_id) >= 5 THEN
    RAISE EXCEPTION 'Cinq artistes au plus en « Dès la sortie ».';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS follows_instant_limit ON follows;
CREATE TRIGGER follows_instant_limit BEFORE INSERT OR UPDATE OF instant ON follows FOR EACH ROW EXECUTE FUNCTION follows_instant_limit();
