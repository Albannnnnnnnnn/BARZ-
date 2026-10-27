// Outils partagés par les scripts de sync (sorties et catalogue d'artistes)
import 'dotenv/config';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`❌ Variable d'environnement manquante : ${name}`);
    process.exit(1);
  }
  return value;
}

export const supabase = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_KEY'), {
  auth: { persistSession: false },
});

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// supabase-js renvoie les erreurs au lieu de les lever : on les lève pour ne plus rien perdre en silence
export function must<T>(res: { data: T; error: { message: string } | null }, context: string): T {
  if (res.error) throw new Error(`${context} : ${res.error.message}`);
  return res.data;
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

// Comparaison tolérante (accents, casse, ponctuation) ; garde les noms non latins tels quels
export function normalizeName(text: string): string {
  return slugify(text).replace(/-/g, '') || text.toLowerCase().replace(/\s+/g, '');
}

// Slug stable quelle que soit la source : même artiste / même sortie → même ligne en base
export function stableSlug(text: string, suffix = ''): string {
  const base = slugify(text) || createHash('sha1').update(text).digest('hex').slice(0, 10);
  return suffix ? `${base}-${suffix}` : base;
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export function readWatchlist(): [string, string[]][] {
  const watchlist = JSON.parse(readFileSync(new URL('../artist-watchlist.json', import.meta.url), 'utf8'));
  return Object.entries(watchlist).filter(([key]) => !key.startsWith('_')) as [string, string[]][];
}

// ============================================================
// GENRES (noms Deezer → genres de l'app)
// ============================================================
const GENRE_RULES: [string, RegExp][] = [
  ['rap', /rap|hip.?hop/],
  ['rnb', /r&b/],
  ['soul', /soul|funk|blues/],
  ['electronic', /electro|dance/],
  ['jazz', /jazz/],
  ['metal', /metal/],
  ['rock', /rock|alternative/],
  ['pop', /pop|chanson fran/],
  ['folk', /folk|country/],
  ['classical', /classique/],
  ['reggae', /reggae/],
  ['latin', /latino|br[ée]silienne/],
  ['world', /africaine|arabe|asiatique|indienne/],
];

export function mapGenre(name: string): string | null {
  const lower = name.toLowerCase();
  return GENRE_RULES.find(([, re]) => re.test(lower))?.[0] ?? null;
}

// ============================================================
// DEEZER (pas de clé ; limite d'environ 50 requêtes / 5 s)
// ============================================================
const DEEZER_MIN_INTERVAL_MS = 130;
let lastDeezerCall = 0;
export const deezerStats = { calls: 0 };

export async function deezerFetch(endpoint: string): Promise<any | null> {
  for (let attempt = 1; attempt <= 5; attempt++) {
    const wait = lastDeezerCall + DEEZER_MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastDeezerCall = Date.now();
    deezerStats.calls++;
    let res: Response;
    try {
      res = await fetch(`https://api.deezer.com${endpoint}`, { signal: AbortSignal.timeout(15_000) });
    } catch {
      await sleep(1000 * attempt); // coupure réseau ou délai dépassé
      continue;
    }
    if (res.status >= 500) {
      await sleep(1000 * attempt);
      continue;
    }
    const json = await res.json().catch(() => null);
    // Deezer répond 200 même en cas d'erreur : le détail est dans json.error
    if (json?.error) {
      if (json.error.code === 4) {
        await sleep(5000); // quota dépassé
        continue;
      }
      return null; // ressource introuvable, etc.
    }
    return json;
  }
  throw new Error(`Deezer : abandon après plusieurs essais sur ${endpoint}`);
}

export async function deezerResolveArtist(name: string): Promise<any | null> {
  const json = await deezerFetch(`/search/artist?limit=25&q=${encodeURIComponent(name)}`);
  // La recherche Deezer renvoie beaucoup d'homonymes : on garde le nom exact le plus suivi
  const exact = (json?.data || []).filter((a: any) => normalizeName(a.name) === normalizeName(name));
  return exact.sort((a: any, b: any) => b.nb_fan - a.nb_fan)[0] ?? null;
}

// Genres Deezer qu'on sait rattacher à un genre de l'app (pour les classements par genre)
export async function deezerAppGenres(): Promise<{ id: number; name: string; genre: string }[]> {
  const genres = (await deezerFetch('/genre'))?.data || [];
  return genres.map((g: any) => ({ id: g.id, name: g.name, genre: mapGenre(g.name) })).filter((g: any) => g.genre);
}

// ============================================================
// ENREGISTREMENT DES ARTISTES
// ============================================================
export type ArtistInput = {
  name: string;
  deezer_id?: number | null;
  spotify_id?: string | null;
  image_url?: string | null;
  popularity?: number | null;
  genres?: string[];
};

// Fusionne avec les lignes existantes (un sync ne doit pas effacer la photo ou les fans trouvés par un autre)
// et renvoie l'id de chaque artiste, par slug.
// replaceGenres : le catalogue fait autorité sur les genres (le sync des sorties, lui, les cumule)
export async function saveArtists(inputs: ArtistInput[], options: { replaceGenres?: boolean } = {}): Promise<Map<string, string>> {
  const bySlug = new Map<string, ArtistInput & { slug: string }>();
  for (const a of inputs) {
    const slug = stableSlug(a.name);
    const prev = bySlug.get(slug);
    bySlug.set(slug, {
      slug,
      name: prev?.name ?? a.name,
      deezer_id: prev?.deezer_id ?? a.deezer_id ?? null,
      spotify_id: prev?.spotify_id ?? a.spotify_id ?? null,
      image_url: prev?.image_url ?? a.image_url ?? null,
      popularity: Math.max(prev?.popularity ?? 0, a.popularity ?? 0),
      genres: [...new Set([...(prev?.genres ?? []), ...(a.genres ?? [])])],
    });
  }

  const ids = new Map<string, string>();
  for (const part of chunk([...bySlug.values()], 200)) {
    const existing = must(
      await supabase.from('artists').select('id, slug, deezer_id, spotify_id, image_url, popularity, genres').in('slug', part.map((p) => p.slug)),
      'Lecture artists'
    ) as any[];
    const old = new Map(existing.map((e) => [e.slug, e]));
    const usedDeezer = new Set<number>();
    const rows = part.map((a) => {
      const e = old.get(a.slug);
      let deezerId = a.deezer_id ?? e?.deezer_id ?? null;
      // deezer_id est unique : deux noms différents rattachés au même artiste Deezer → on n'en garde qu'un
      if (deezerId && usedDeezer.has(deezerId)) deezerId = e?.deezer_id ?? null;
      if (deezerId) usedDeezer.add(deezerId);
      return {
        slug: a.slug,
        name: a.name,
        deezer_id: deezerId,
        spotify_id: a.spotify_id ?? e?.spotify_id ?? null,
        image_url: a.image_url ?? e?.image_url ?? null,
        popularity: Math.max(a.popularity ?? 0, e?.popularity ?? 0),
        genres: options.replaceGenres && a.genres?.length
          ? a.genres
          : [...new Set([...(e?.genres ?? []).filter((g: string) => g !== 'unknown'), ...(a.genres ?? [])])],
        updated_at: new Date().toISOString(),
      };
    });
    const saved = must(await supabase.from('artists').upsert(rows, { onConflict: 'slug' }).select('id, slug'), 'Enregistrement artists');
    for (const s of saved ?? []) ids.set(s.slug, s.id);
  }
  return ids;
}
