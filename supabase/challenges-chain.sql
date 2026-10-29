-- BARZ¡ — Défis à la chaîne : un nouveau défi dès que le précédent est relevé
-- À exécuter UNE fois dans Supabase : SQL Editor → New query → coller → Run (après supabase/challenges.sql).
-- Le script peut être relancé sans risque.
-- Avant : un seul défi par membre et par semaine (clé user_id + week_start). Après : autant de défis que le membre
-- en relève, chacun avec son identifiant ; week_start reste la semaine (vendredi) où il a été proposé.
-- Un même disque n'est jamais proposé deux fois au même membre.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'challenges' AND column_name = 'id') THEN
    ALTER TABLE challenges ADD COLUMN id UUID NOT NULL DEFAULT gen_random_uuid();
    ALTER TABLE challenges DROP CONSTRAINT IF EXISTS challenges_pkey;
    ALTER TABLE challenges ADD PRIMARY KEY (id);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS challenges_user_release ON challenges(user_id, release_id);
CREATE INDEX IF NOT EXISTS idx_challenges_user_created ON challenges(user_id, created_at DESC);
