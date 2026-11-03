-- BARZ¡ — Recherche d'artistes tolérante (onglet Artistes, page Bienvenue)
-- À exécuter UNE fois dans Supabase : SQL Editor → New query → coller → Run (après supabase/audience.sql).
-- Le script peut être relancé sans risque (IF NOT EXISTS / CREATE OR REPLACE).
-- Ignore majuscules, accents, espaces et ponctuation, et accepte des fautes de frappe :
-- « HJEUNECRACK » ou « h jeune crack » trouvent « H JeuneCrack », « dmaso » trouve « Damso » (deux lettres
-- inversées). Même logique que src/lib/fuzzy.ts.
-- search_name est une colonne calculée : toujours à jour, rien à remplir.
-- Mise à jour du 03/11/2026 : le nom exact passe en premier (« jul » → Jul avant Julia Wolf), et un nom trouvé au
-- milieu d'un mot ne compte que pour une recherche d'au moins 6 lettres (« ninho » ne trouve plus « Toninho »).

CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

-- Nom réduit à ses lettres et chiffres, sans accents : « H JeuneCrack » → « hjeunecrack »
CREATE OR REPLACE FUNCTION barz_compact(t TEXT) RETURNS TEXT
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT regexp_replace(lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(t, ''))), '[^a-z0-9]+', '', 'g')
$$;

ALTER TABLE artists ADD COLUMN IF NOT EXISTS search_name TEXT GENERATED ALWAYS AS (barz_compact(name)) STORED;
-- Le nom avec un | devant chaque mot : « H JeuneCrack » → « |h|jeunecrack »
CREATE OR REPLACE FUNCTION barz_word_marks(t TEXT) RETURNS TEXT
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT '|' || trim(BOTH '|' FROM regexp_replace(lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(t, ''))), '[^a-z0-9]+', '|', 'g'))
$$;

CREATE INDEX IF NOT EXISTS idx_artists_search_trgm ON artists USING gin (search_name extensions.gin_trgm_ops);

-- Les artistes dont le nom contient la recherche ; s'il n'y en a aucun, les noms les plus proches (fautes de frappe).
-- D'abord le nom exact, puis les noms qui commencent par la recherche, puis ceux dont un mot commence par elle
-- (« jeunecrack » → « H JeuneCrack »), puis, pour 6 lettres ou plus, au milieu d'un mot. Ensuite par audience.
-- genre_filter : genres Deezer (comme les puces de genre).
CREATE OR REPLACE FUNCTION search_artists(q TEXT, genre_filter TEXT[] DEFAULT NULL, lim INT DEFAULT 48)
RETURNS SETOF artists
LANGUAGE sql STABLE
SET search_path = public, extensions
AS $$
  WITH needle AS (
    -- word_start : la recherche au début d'un mot, les mots pouvant se suivre (« hjeunecrack » → « |h|jeunecrack »)
    SELECT v, '\|' || regexp_replace(v, '(.)', '\1\|?', 'g') AS word_start FROM (SELECT barz_compact(q) AS v) n
  ),
  contains AS (
    SELECT a.id, a.audience,
      CASE
        WHEN a.search_name = needle.v THEN 0
        WHEN a.search_name LIKE needle.v || '%' THEN 0.05
        WHEN barz_word_marks(a.name) ~ needle.word_start THEN 0.1
        ELSE 0.2
      END::REAL AS distance
    FROM artists a, needle
    WHERE needle.v <> '' AND a.search_name LIKE '%' || needle.v || '%'
      AND (genre_filter IS NULL OR a.genres && genre_filter)
  ),
  exact AS (
    SELECT * FROM contains WHERE distance < 0.2 OR length((SELECT v FROM needle)) >= 6
  ),
  -- Deux lettres voisines inversées (« dmaso » → « damso ») : la recherche avec chaque paire remise dans l'ordre
  swaps AS (
    SELECT substr(v, 1, i - 1) || substr(v, i + 1, 1) || substr(v, i, 1) || substr(v, i + 2) AS s
    FROM needle, generate_series(1, length(v) - 1) AS i
    WHERE length(v) >= 4 AND substr(v, i, 1) <> substr(v, i + 1, 1)
  ),
  swapped AS (
    SELECT DISTINCT a.id, a.audience, 0.3::REAL AS distance FROM artists a JOIN swaps ON a.search_name LIKE '%' || swaps.s || '%'
    WHERE (genre_filter IS NULL OR a.genres && genre_filter)
      AND NOT EXISTS (SELECT 1 FROM exact)
  ),
  close AS (
    SELECT a.id, a.audience, (1 - word_similarity(needle.v, a.search_name))::REAL AS distance FROM artists a, needle
    -- Seuil écrit ici : Supabase refuse que la fonction règle pg_trgm.word_similarity_threshold
    WHERE length(needle.v) >= 4 AND word_similarity(needle.v, a.search_name) >= 0.45
      AND (genre_filter IS NULL OR a.genres && genre_filter)
      AND NOT EXISTS (SELECT 1 FROM exact)
      AND NOT EXISTS (SELECT 1 FROM swapped)
  ),
  found AS (
    SELECT id, audience, min(distance) AS distance
    FROM (SELECT * FROM exact UNION ALL SELECT * FROM close UNION ALL SELECT * FROM swapped) all_found
    GROUP BY id, audience
  )
  SELECT a.* FROM found f JOIN artists a ON a.id = f.id
  ORDER BY f.distance, f.audience DESC NULLS LAST
  LIMIT lim
$$;
