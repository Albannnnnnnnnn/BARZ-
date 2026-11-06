-- BARZ¡ — Artistes IA supprimés de l'appli : un artiste qu'Alban marque « IA » (bouton de la fiche, ou page /tri-ia)
-- disparaît pour tout le monde, avec ses sorties : Sorties, semaines, calendrier, recherche, fiches, Barz, notifs.
-- À exécuter UNE fois dans Supabase : SQL Editor → New query → coller → Run (après supabase/ai-flags.sql).
-- Le script peut être relancé sans risque.
-- Rien n'est effacé : l'artiste reste en base, invisible. Alban le voit encore (pour revenir en arrière avec « Pas IA »).
-- Les signalements des membres (3 ou plus) ne suppriment rien : ils font remonter l'artiste en tête de /tri-ia,
-- et la case « Masquer les artistes IA » de Sorties les masque toujours pour qui la coche.
-- Le site est construit avec la clé anon : ces règles s'appliquent aussi à la construction des pages.
-- Les synchros (clé service_role) continuent d'enregistrer leurs sorties, qui restent invisibles ; la fonction
-- notify les écarte d'elle-même.

CREATE INDEX IF NOT EXISTS idx_artists_ai_flag ON artists(id) WHERE ai_flag = 'ia';

-- Artistes : tous lisibles, sauf ceux marqués IA (l'admin les voit encore)
DROP POLICY IF EXISTS "Artists are publicly readable" ON artists;
CREATE POLICY "Artists are publicly readable" ON artists
  FOR SELECT USING (ai_flag IS DISTINCT FROM 'ia' OR is_barz_admin());

-- Artistes marqués IA, lus en passant outre la règle ci-dessus (sinon la règle des sorties ne les verrait pas)
CREATE OR REPLACE FUNCTION ai_hidden_artist_ids() RETURNS SETOF UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM artists WHERE ai_flag = 'ia'
$$;
GRANT EXECUTE ON FUNCTION ai_hidden_artist_ids() TO anon, authenticated;

-- Sorties : toutes lisibles, sauf celles d'un artiste marqué IA (la sous-requête est calculée une fois par requête)
DROP POLICY IF EXISTS "Releases are publicly readable" ON releases;
CREATE POLICY "Releases are publicly readable" ON releases
  FOR SELECT USING (
    artist_id IS NULL
    OR artist_id NOT IN (SELECT ai_hidden_artist_ids())
    OR is_barz_admin()
  );

-- Page /tri-ia : les signalements de chaque artiste, pour l'admin seulement
CREATE OR REPLACE FUNCTION ai_report_counts() RETURNS TABLE (artist_id UUID, reports INT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_barz_admin() THEN RAISE EXCEPTION 'Réservé à l’admin.'; END IF;
  RETURN QUERY SELECT r.artist_id, count(*)::int FROM ai_reports r GROUP BY r.artist_id;
END $$;
GRANT EXECUTE ON FUNCTION ai_report_counts() TO authenticated;
