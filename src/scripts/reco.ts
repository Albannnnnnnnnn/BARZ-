// Moteur de recommandation de BARZ¡ (côté navigateur).
//
// 1. Profil de goûts d'un membre, à partir de ce qu'il fait dans BARZ¡ :
//    artistes suivis (fort), genres choisis à l'inscription, écoutés, spin list,
//    notes de ses Barz (un 9/10 compte en positif, un 3/10 en négatif) et import Last.fm.
// 2. Voisins : les artistes similaires (Deezer) de ce qu'il aime, pondérés.
// 3. Score de chaque sortie, réglé par le curseur d'exploration :
//    0 = mes habitudes (proximité), 1 = inconnu total (genres éloignés, artistes moins connus).
// Chaque score vient avec sa raison, affichée à l'utilisateur ("Parce que tu suis X").
import { GENRE_CHIPS } from '../lib/genres';
import { getMyProfile, getSession, supabase } from './social';

export type RecoRelease = {
  id: string;
  artistId: string | null;
  artistName: string;
  genres: string[];
  fans: number | null;
};

export type Taste = {
  empty: boolean;
  followed: Set<string>;
  artistWeights: Map<string, number>;
  relatedWeights: Map<string, number>;
  relatedVia: Map<string, string>; // artiste recommandé → nom de l'artiste aimé qui y mène
  genreWeights: Map<string, number>; // somme = 1
  listened: Set<string>;
  names: Map<string, string>;
};

const RELATED_FROM_TOP = 60; // nombre d'artistes aimés dont on charge les voisins

function chipOf(genre: string): string | null {
  return GENRE_CHIPS.find((c) => c.genres.includes(genre))?.label ?? null;
}

let tastePromise: Promise<Taste | null> | null = null;

export function loadTaste(): Promise<Taste | null> {
  tastePromise ??= buildTaste().catch((err) => {
    console.warn('Profil de goûts indisponible :', err);
    return null;
  });
  return tastePromise;
}

async function buildTaste(): Promise<Taste | null> {
  const session = await getSession();
  if (!session || !supabase) return null;
  const uid = session.user.id;
  const ARTIST = 'artist:artists(id, name, genres)';
  const RELEASE = `release:releases(id, genres, artist:artists!artist_id(id, name, genres))`;

  const [profile, follows, listened, spin, barz, lastfm] = await Promise.all([
    getMyProfile(),
    supabase.from('follows').select(ARTIST).eq('user_id', uid),
    supabase.from('listened').select(RELEASE).eq('user_id', uid),
    supabase.from('spin_list').select(RELEASE).eq('user_id', uid),
    supabase.from('barz').select(`score, ${RELEASE}`).eq('user_id', uid),
    supabase.from('lastfm_artists').select(`playcount, ${ARTIST}`).eq('user_id', uid).not('artist_id', 'is', null),
  ]);

  const taste: Taste = {
    empty: true,
    followed: new Set(),
    artistWeights: new Map(),
    relatedWeights: new Map(),
    relatedVia: new Map(),
    genreWeights: new Map(),
    listened: new Set(),
    names: new Map(),
  };
  const genreRaw = new Map<string, number>();
  const addArtist = (a: any, weight: number) => {
    if (!a?.id) return;
    taste.names.set(a.id, a.name);
    taste.artistWeights.set(a.id, (taste.artistWeights.get(a.id) ?? 0) + weight);
  };
  const addGenres = (genres: string[] | null | undefined, weight: number) => {
    for (const g of genres ?? []) genreRaw.set(g, (genreRaw.get(g) ?? 0) + weight);
  };

  for (const g of profile?.favorite_genres ?? []) genreRaw.set(g, (genreRaw.get(g) ?? 0) + 2);
  for (const f of (follows.data ?? []) as any[]) {
    taste.followed.add(f.artist?.id);
    addArtist(f.artist, 3);
    addGenres(f.artist?.genres, 1);
  }
  for (const l of (listened.data ?? []) as any[]) {
    taste.listened.add(l.release?.id);
    addArtist(l.release?.artist, 1);
    addGenres(l.release?.genres, 1);
  }
  for (const s of (spin.data ?? []) as any[]) {
    addArtist(s.release?.artist, 0.5);
    addGenres(s.release?.genres, 0.5);
  }
  for (const b of (barz.data ?? []) as any[]) {
    const w = (Number(b.score) - 5) / 2.5; // -2 … +2
    addArtist(b.release?.artist, w);
    addGenres(b.release?.genres, w);
  }
  for (const l of (lastfm.data ?? []) as any[]) {
    addArtist(l.artist, Math.min(3, Math.log10((l.playcount ?? 0) + 1)));
    addGenres(l.artist?.genres, 0.5);
  }

  // Genres : on ne garde que les poids positifs, normalisés
  const positive = [...genreRaw.entries()].filter(([, w]) => w > 0);
  const sum = positive.reduce((s, [, w]) => s + w, 0);
  for (const [g, w] of positive) taste.genreWeights.set(g, w / sum);

  // Voisins des artistes aimés
  const liked = [...taste.artistWeights.entries()].filter(([, w]) => w > 0).sort((a, b) => b[1] - a[1]).slice(0, RELATED_FROM_TOP);
  if (liked.length) {
    const likedIds = liked.map(([id]) => id);
    // Dans les deux sens : les artistes cités par ceux qu'on aime, et ceux qui les citent
    const [out, inc] = await Promise.all([
      supabase.from('artist_relations').select('artist_id, related_id, rank').in('artist_id', likedIds),
      supabase.from('artist_relations').select('artist_id, related_id, rank').in('related_id', likedIds),
    ]);
    const edges = [
      ...((out.data ?? []) as any[]),
      ...((inc.data ?? []) as any[]).map((r) => ({ artist_id: r.related_id, related_id: r.artist_id, rank: r.rank })),
    ];
    const weightOf = new Map(liked);
    const bestContribution = new Map<string, number>();
    for (const r of edges) {
      // Plus l'artiste est aimé et plus le voisin est proche (rang faible), plus ça compte
      const w = (weightOf.get(r.artist_id) ?? 0) * 0.6 * (1 - r.rank / 25);
      taste.relatedWeights.set(r.related_id, (taste.relatedWeights.get(r.related_id) ?? 0) + w);
      // "Proche de X" : X = l'artiste aimé qui contribue le plus
      if (w > (bestContribution.get(r.related_id) ?? 0)) {
        bestContribution.set(r.related_id, w);
        taste.relatedVia.set(r.related_id, taste.names.get(r.artist_id) ?? '');
      }
    }
  }

  taste.empty = taste.artistWeights.size === 0 && taste.genreWeights.size === 0;
  return taste;
}

export type Scored<T> = { item: T; score: number; reason: string; familiar: boolean };

// explore : 0 = mes habitudes … 1 = inconnu total
export function scoreRelease<T extends RecoRelease>(r: T, taste: Taste, explore = 0.15): Scored<T> {
  const followed = !!r.artistId && taste.followed.has(r.artistId);
  const direct = Math.max(0, r.artistId ? taste.artistWeights.get(r.artistId) ?? 0 : 0);
  const related = r.artistId ? taste.relatedWeights.get(r.artistId) ?? 0 : 0;
  const genre = Math.min(1, r.genres.reduce((s, g) => s + (taste.genreWeights.get(g) ?? 0), 0) * 1.5);
  const pop = Math.min(1, Math.log10((r.fans ?? 0) + 1) / 7);

  const familiarity = (followed ? 4 : 0) + Math.min(3, direct) + Math.min(2, related) + genre * 2;
  const novelty = (1 - genre) * 2 + (1 - pop) * 1 + (related > 0 ? 0.4 : 0) - (followed || direct > 0 ? 3 : 0);
  const seenPenalty = taste.listened.has(r.id) ? 1.5 : 0;
  const score = (1 - explore) * (familiarity + pop * 0.6) + explore * novelty - seenPenalty;

  let reason = '';
  if (explore >= 0.5 && genre < 0.15) {
    const label = r.genres.map(chipOf).find(Boolean);
    reason = label ? `Hors de ta bulle : ${label.toLowerCase()}` : 'Hors de ta bulle';
  } else if (followed) reason = `Tu suis ${r.artistName}`;
  else if (direct > 0) reason = `Tu as aimé ${r.artistName}`;
  else if (related > 0 && taste.relatedVia.get(r.artistId!)) reason = `Proche de ${taste.relatedVia.get(r.artistId!)}`;
  else if (genre > 0.2) {
    const best = r.genres.filter((g) => taste.genreWeights.has(g)).sort((a, b) => (taste.genreWeights.get(b) ?? 0) - (taste.genreWeights.get(a) ?? 0))[0];
    const label = best && chipOf(best);
    reason = label ? `Parce que tu aimes le ${label.toLowerCase()}` : '';
  }

  return { item: r, score, reason, familiar: followed || direct > 0 || related > 0 || genre > 0.2 };
}

export function rank<T extends RecoRelease>(items: T[], taste: Taste, explore = 0.15): Scored<T>[] {
  return items.map((r) => scoreRelease(r, taste, explore)).sort((a, b) => b.score - a.score);
}
