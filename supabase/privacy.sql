-- BARZ¡ — Les artistes importés depuis Last.fm ne sont lisibles que par leur propriétaire.
-- À exécuter UNE fois dans Supabase : SQL Editor → New query → coller → Run.
-- (Déjà inclus dans supabase/discovery.sql pour une nouvelle installation.)
-- Ces données ne servent qu'aux recommandations du membre : personne d'autre n'a besoin de les lire.
-- Le script de sync utilise la clé service_role, qui n'est pas concernée par ces règles.

DROP POLICY IF EXISTS "Lastfm imports are public" ON lastfm_artists;
DROP POLICY IF EXISTS "Users read their own lastfm import" ON lastfm_artists;
CREATE POLICY "Users read their own lastfm import" ON lastfm_artists FOR SELECT USING (auth.uid() = user_id);
