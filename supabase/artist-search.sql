-- BARZ¡ — Recherche d'artistes tolérante (onglet Artistes, page Bienvenue)
-- À exécuter UNE fois dans Supabase : SQL Editor → New query → coller → Run (après supabase/audience.sql).
-- Le script peut être relancé sans risque (IF NOT EXISTS / CREATE OR REPLACE).
-- Ignore majuscules, accents, espaces et ponctuation, et accepte des fautes de frappe :
-- « HJEUNECRACK » ou « h jeune crack » trouvent « H JeuneCrack », « dmaso » trouve « Damso » (deux lettres
-- inversées). Même logique que src/lib/fuzzy.ts.
-- search_name est une colonne calculée : toujours à jour, rien à remplir.

CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

-- Nom réduit à ses lettres et chiffres, sans accents : « H JeuneCrack » → « hjeunecrack »
CREATE OR REPLACE FUNCTION barz_compact(t TEXT) RETURNS TEXT
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT regexp_replace(lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(t, ''))), '[^a-z0-9]+', '', 'g')
$$;

ALTER TABLE artists ADD COLUMN IF NOT EXISTS search_name TEXT GENERATED ALWAYS AS (barz_compact(name)) STORED;
CREATE INDEX IF NOT EXISTS idx_artists_search_trgm ON artists USING gin (search_name extensions.gin_trgm_ops);

-- Les artistes dont le nom contient la recherche ; s'il n'y en a aucun, les noms les plus proches (fautes de frappe).
-- Du plus pertinent au moins pertinent, puis par audience. genre_filter : genres Deezer (comme les puces de genre).
CREATE OR REPLACE FUNCTION search_artists(q TEXT, genre_filter TEXT[] DEFAULT NULL, lim INT DEFAULT 48)
RETURNS SETOF artists
LANGUAGE sql STABLE
SET search_path = public, extensions
SET pg_trgm.word_similarity_threshold = 0.45
AS $$
  WITH needle AS (SELECT barz_compact(q) AS v),
  exact AS (
    SELECT a.id, a.audience, 0::REAL AS distance FROM artists a, needle
    WHERE needle.v <> '' AND a.search_name LIKE '%' || needle.v || '%'
      AND (genre_filter IS NULL OR a.genres && genre_filter)
  ),
  close AS (
    SELECT a.id, a.audience, (1 - word_similarity(needle.v, a.search_name))::REAL AS distance FROM artists a, needle
    WHERE length(needle.v) >= 4 AND needle.v <% a.search_name
      AND (genre_filter IS NULL OR a.genres && genre_filter)
      AND NOT EXISTS (SELECT 1 FROM exact)
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
  found AS (
    SELECT id, audience, min(distance) AS distance
    FROM (SELECT * FROM exact UNION ALL SELECT * FROM close UNION ALL SELECT * FROM swapped) all_found
    GROUP BY id, audience
  )
  SELECT a.* FROM found f JOIN artists a ON a.id = f.id
  ORDER BY f.distance, f.audience DESC NULLS LAST
  LIMIT lim
$$;
