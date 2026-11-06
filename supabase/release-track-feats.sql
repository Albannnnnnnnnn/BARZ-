-- BARZ¡ — Invités titre par titre des albums et EP récents (pour les notifs « X en feat » sur un album)
-- À exécuter UNE fois dans Supabase : SQL Editor → New query → coller → Run. Le script peut être relancé sans risque.
-- Remplie par la fonction notify (action releases, toutes les 15 min) : pour les albums et EP sortis ces derniers jours
-- d'artistes à au moins 30 000 d'audience, les invités de chaque titre lus sur Deezer. Table à part : la synchro des
-- sorties réécrit metadata à chaque passage et effacerait ces invités.
CREATE TABLE IF NOT EXISTS release_track_feats (
  release_id UUID PRIMARY KEY REFERENCES releases(id) ON DELETE CASCADE,
  feats JSONB NOT NULL DEFAULT '[]'::jsonb, -- [{ "name": "Jorja Smith", "track": "Broken Hearts" }, …]
  deezer_album_id BIGINT,                   -- NULL : disque pas (encore) trouvé sur Deezer, réessayé plus tard
  checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE release_track_feats ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Track feats are public" ON release_track_feats;
CREATE POLICY "Track feats are public" ON release_track_feats FOR SELECT USING (true);
-- Écriture : seulement la fonction notify (clé service_role, qui passe outre les règles)
