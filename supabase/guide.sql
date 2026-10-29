-- BARZ¡ — Guide vu ou non par chaque compte
-- À exécuter UNE fois dans Supabase : SQL Editor → New query → coller → Run.
-- Le script peut être relancé sans risque (IF NOT EXISTS).
-- guide_version : dernière version du guide vue (0 = jamais). Un membre dont la version est plus ancienne que celle
-- du site (GUIDE_VERSION dans src/scripts/guide-prompt.ts) est envoyé sur le guide à sa prochaine ouverture de l'appli.
-- Pour remontrer le guide à tout le monde après une grosse nouveauté : augmenter GUIDE_VERSION, rien à faire ici.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS guide_version INT NOT NULL DEFAULT 0;
