-- BARZ¡ — Artistes IA : les membres les signalent, Alban tranche
-- À exécuter UNE fois dans Supabase : SQL Editor → New query → coller → Run. Relançable sans risque.
-- Aucune source (Deezer, Spotify, Apple) ne dit qu'un artiste est généré par IA : on se fie aux signalements.
-- Un artiste est masqué (case « Masquer les artistes IA » de Sorties et du mode digest) si Alban l'a marqué IA,
-- ou s'il a reçu au moins 3 signalements et qu'Alban ne l'a pas marqué « pas IA ».

ALTER TABLE artists ADD COLUMN IF NOT EXISTS ai_flag TEXT CHECK (ai_flag IN ('ia', 'pas_ia'));

CREATE TABLE IF NOT EXISTS ai_reports (
  artist_id UUID NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (artist_id, user_id)
);

ALTER TABLE ai_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Members report AI artists" ON ai_reports;
CREATE POLICY "Members report AI artists" ON ai_reports FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Members read their AI reports" ON ai_reports;
CREATE POLICY "Members read their AI reports" ON ai_reports FOR SELECT USING (auth.uid() = user_id OR is_barz_admin());
DROP POLICY IF EXISTS "Members withdraw their AI reports" ON ai_reports;
CREATE POLICY "Members withdraw their AI reports" ON ai_reports FOR DELETE USING (auth.uid() = user_id OR is_barz_admin());

-- Les artistes à masquer, lisibles par tous (même sans compte)
CREATE OR REPLACE FUNCTION ai_artist_ids() RETURNS SETOF UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM artists WHERE ai_flag = 'ia'
  UNION
  SELECT r.artist_id FROM ai_reports r JOIN artists a ON a.id = r.artist_id
  WHERE a.ai_flag IS NULL GROUP BY r.artist_id HAVING count(*) >= 3
$$;
GRANT EXECUTE ON FUNCTION ai_artist_ids() TO anon, authenticated;

-- Nombre de signalements d'un artiste (pour la fiche, vue par Alban)
CREATE OR REPLACE FUNCTION ai_report_count(artist UUID) RETURNS INT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*)::int FROM ai_reports WHERE artist_id = artist
$$;
GRANT EXECUTE ON FUNCTION ai_report_count(UUID) TO authenticated;

-- Décision d'Alban : 'ia', 'pas_ia', ou NULL pour revenir aux signalements
CREATE OR REPLACE FUNCTION set_ai_flag(artist UUID, flag TEXT) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_barz_admin() THEN RAISE EXCEPTION 'Réservé à l’admin.'; END IF;
  UPDATE artists SET ai_flag = flag WHERE id = artist;
END $$;
GRANT EXECUTE ON FUNCTION set_ai_flag(UUID, TEXT) TO authenticated;
