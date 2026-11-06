-- BARZ¡ — Noter un titre = publier un Barz sur ce titre : il s'affiche partout comme un Barz (fil, profil, ♥, réponses,
-- partage, notifs aux amis), avec le nom du titre. À exécuter UNE fois dans Supabase, après supabase/track-ratings.sql.
-- Le script peut être relancé sans risque.

-- Un Barz vise un disque (track_id vide) ou un titre de ce disque
ALTER TABLE barz ADD COLUMN IF NOT EXISTS track_id UUID REFERENCES tracks(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_barz_track ON barz(track_id) WHERE track_id IS NOT NULL;

-- Un Barz par membre et par disque, et un par membre et par titre (avant : un par membre et par disque)
ALTER TABLE barz DROP CONSTRAINT IF EXISTS barz_user_id_release_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS barz_one_per_release ON barz(user_id, release_id) WHERE track_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS barz_one_per_track ON barz(user_id, track_id) WHERE track_id IS NOT NULL;

-- Les notes de titres déjà données passent en Barz (la table track_ratings n'est plus utilisée)
INSERT INTO barz (user_id, release_id, track_id, score, body, created_at)
SELECT r.user_id, t.release_id, r.track_id, r.score, r.body, r.created_at
FROM track_ratings r JOIN tracks t ON t.id = r.track_id
WHERE t.release_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM barz b WHERE b.user_id = r.user_id AND b.track_id = r.track_id);
