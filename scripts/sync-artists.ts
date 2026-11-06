// Catalogue d'artistes (Deezer) et liens "artistes similaires", base des recommandations
//
//   npm run sync:artists
//
// 1. Graines : artistes des classements d'albums de chaque genre (genre connu), + la watchlist,
//    + les artistes suivis par les membres
// 2. Pour chaque graine : ses artistes similaires (Deezer), ajoutés au catalogue en héritant
//    des genres de la graine ; les liens sont enregistrés dans artist_relations
//
// 3. Import Last.fm : pour chaque membre qui a renseigné son pseudo Last.fm, ses artistes les plus
//    écoutés (12 derniers mois) sont rapprochés du catalogue (ajoutés via Deezer si besoin) et
//    enregistrés dans lastfm_artists. La clé Last.fm reste côté serveur (secret LASTFM_API_KEY).
//
// Nécessite supabase/discovery.sql (colonne deezer_id, tables artist_relations, follows, lastfm_artists).
import {
  supabase,
  sleep,
  must,
  chunk,
  stableSlug,
  readWatchlist,
  deezerFetch,
  deezerStats,
  deezerResolveArtist,
  normalizeName,
  deezerAppGenres,
  saveArtists,
  type ArtistInput,
} from './lib/common';

const CHART_SIZE = Number(process.env.SYNC_CATALOG_CHART_SIZE ?? 100);
const RELATED_PER_ARTIST = Number(process.env.SYNC_CATALOG_RELATED ?? 20);
const LASTFM_TOP = Number(process.env.SYNC_LASTFM_TOP ?? 60);

type LastfmImport = { userId: string; artists: { name: string; playcount: number }[] };

// Artistes les plus écoutés d'un membre sur Last.fm (null si clé absente ou invalide)
async function lastfmTopArtists(username: string): Promise<{ name: string; playcount: number }[] | null> {
  const key = process.env.LASTFM_API_KEY;
  if (!key) return null;
  const params = new URLSearchParams({ method: 'user.gettopartists', user: username, period: '12month', limit: String(LASTFM_TOP), api_key: key, format: 'json' });
  await sleep(250); // Last.fm demande de rester sous 5 requêtes par seconde
  const res = await fetch(`https://ws.audioscrobbler.com/2.0/?${params}`, { headers: { 'User-Agent': 'BARZ/1.0' } });
  const json = await res.json().catch(() => null);
  if (json?.error === 10 || json?.error === 26) throw new Error('clé LASTFM_API_KEY invalide : à renouveler sur last.fm/api');
  if (json?.error) {
    console.warn(`   ⚠️ Last.fm « ${username} » : ${json.message}`);
    return [];
  }
  return (json?.topartists?.artist ?? []).map((a: any) => ({ name: a.name, playcount: Number(a.playcount) || 0 }));
}

// Artistes similaires selon Last.fm (noms comparables), pour départager des homonymes Deezer
async function lastfmSimilar(name: string): Promise<Set<string>> {
  const key = process.env.LASTFM_API_KEY;
  if (!key) return new Set();
  const params = new URLSearchParams({ method: 'artist.getsimilar', artist: name, limit: '40', autocorrect: '0', api_key: key, format: 'json' });
  await sleep(250);
  const res = await fetch(`https://ws.audioscrobbler.com/2.0/?${params}`, { headers: { 'User-Agent': 'BARZ/1.0' } });
  const json = await res.json().catch(() => null);
  return new Set(((json?.similarartists?.artist ?? []) as any[]).map((a) => normalizeName(a.name)));
}

// Nom Last.fm → artiste Deezer. Plusieurs artistes Deezer portent souvent ce nom (« Dylan », « Juice », « LinLin ») :
// le plus suivi gagne seulement s'il écrase les autres ; sinon, celui dont les artistes proches sur Deezer
// recoupent le plus les artistes similaires sur Last.fm (sans recoupement, le plus suivi).
async function resolveLastfmArtist(name: string): Promise<any | null> {
  const json = await deezerFetch(`/search/artist?limit=25&q=${encodeURIComponent(name)}`);
  const exact = ((json?.data || []) as any[]).filter((a) => normalizeName(a.name) === normalizeName(name)).sort((a, b) => b.nb_fan - a.nb_fan);
  if (exact.length <= 1) return exact[0] ?? (await deezerResolveArtist(name));
  if (exact[0].nb_fan >= 20 * Math.max(1, exact[1].nb_fan)) return exact[0];
  const similar = await lastfmSimilar(name);
  if (!similar.size) return exact[0];
  let best = exact[0];
  let bestOverlap = 0;
  for (const candidate of exact.slice(0, 4)) {
    const related = await deezerFetch(`/artist/${candidate.id}/related?limit=40`);
    const overlap = ((related?.data || []) as any[]).filter((r) => similar.has(normalizeName(r.name))).length;
    if (overlap > bestOverlap) {
      best = candidate;
      bestOverlap = overlap;
    }
  }
  if (best !== exact[0]) console.log(`   🔀 « ${name} » : homonyme choisi ${best.id} (${best.nb_fan} fans) plutôt que ${exact[0].id} (${exact[0].nb_fan} fans)`);
  return best;
}

// direct : genres certains (classement du genre, watchlist) ; votes : genres des graines qui citent l'artiste
type Node = ArtistInput & { deezer_id: number; genres: string[]; direct: Set<string>; votes: Map<string, number>; related: number[] };

async function main() {
  const started = Date.now();
  const check = await supabase.from('artist_relations').select('*', { count: 'exact', head: true });
  if (check.error) throw new Error('Tables du catalogue absentes : exécute supabase/discovery.sql dans Supabase (SQL Editor).');

  const nodes = new Map<number, Node>();
  const seeds = new Set<number>();
  const addNode = (a: any, direct: string[] = [], voted: string[] = []): Node => {
    const node = nodes.get(a.id) ?? {
      name: a.name,
      deezer_id: a.id,
      image_url: a.picture_xl ?? a.picture_big ?? null,
      popularity: a.nb_fan ?? null,
      genres: [],
      direct: new Set<string>(),
      votes: new Map<string, number>(),
      related: [],
    };
    node.image_url ??= a.picture_xl ?? a.picture_big ?? null;
    if (a.nb_fan) node.popularity = Math.max(node.popularity ?? 0, a.nb_fan);
    for (const g of direct) node.direct.add(g);
    for (const g of voted) node.votes.set(g, (node.votes.get(g) ?? 0) + 1);
    nodes.set(a.id, node);
    return node;
  };

  // Genres finaux : ceux qui sont certains ; sinon le genre le plus voté par les graines qui citent l'artiste
  // (hériter de TOUS les genres les propageait de proche en proche : Ed Sheeran finissait en jazz)
  const finalGenres = (node: Node): string[] => {
    if (node.direct.size) return [...node.direct];
    const ranked = [...node.votes.entries()].sort((a, b) => b[1] - a[1]);
    if (!ranked.length) return [];
    const [top, topVotes] = ranked[0];
    return [top, ...ranked.slice(1).filter(([, v]) => v >= Math.max(2, topVotes * 0.6)).map(([g]) => g)].slice(0, 2);
  };

  // 1a. Classements d'albums par genre : les seuls listes Deezer vraiment filtrées par genre
  console.log('📈 Graines : classements par genre...');
  for (const g of await deezerAppGenres()) {
    const chart = await deezerFetch(`/chart/${g.id}/albums?limit=${CHART_SIZE}`);
    for (const album of chart?.data || []) {
      if (!album.artist?.id) continue;
      addNode(album.artist, [g.genre]);
      seeds.add(album.artist.id);
    }
  }
  console.log(`   ${seeds.size} artistes`);

  // 1b. Watchlist éditoriale
  console.log('⭐ Graines : watchlist...');
  for (const [genre, names] of readWatchlist()) {
    for (const name of names) {
      const artist = await deezerResolveArtist(name);
      if (!artist) continue;
      addNode(artist, [genre]);
      seeds.add(artist.id);
    }
  }

  // 1c. Artistes suivis par les membres (pour que leurs recommandations aient des voisins)
  const follows = must(await supabase.from('follows').select('artist:artists(name, deezer_id, genres, image_url, popularity)'), 'Lecture follows') as any[];
  for (const f of follows) {
    const a = f.artist;
    if (!a?.deezer_id) continue;
    addNode({ id: a.deezer_id, name: a.name, picture_xl: a.image_url, nb_fan: a.popularity }, [], a.genres ?? []);
    seeds.add(a.deezer_id);
  }
  // 1d. Import Last.fm des membres
  const imports: LastfmImport[] = [];
  const resolved = new Map<string, any | null>(); // nom Last.fm (minuscules) → artiste Deezer retenu
  const profiles = await supabase.from('profiles').select('id, lastfm_username').not('lastfm_username', 'is', null);
  if (!profiles.error && profiles.data?.length) {
    console.log(`🎧 Last.fm : ${profiles.data.length} membre(s)...`);
    try {
      for (const p of profiles.data as any[]) {
        const top = await lastfmTopArtists(p.lastfm_username);
        if (top === null) {
          console.warn('   ⚠️ LASTFM_API_KEY absente : import Last.fm ignoré.');
          break;
        }
        imports.push({ userId: p.id, artists: top });
        for (const a of top) {
          const key = a.name.toLowerCase();
          if (!resolved.has(key)) resolved.set(key, await resolveLastfmArtist(a.name));
          const artist = resolved.get(key);
          if (artist) {
            addNode(artist);
            seeds.add(artist.id);
          }
        }
      }
    } catch (err) {
      console.warn(`   ⚠️ Import Last.fm interrompu : ${err instanceof Error ? err.message : err}`);
    }
  }
  console.log(`   ${seeds.size} graines au total`);

  // 2. Artistes similaires de chaque graine
  console.log(`🕸  Artistes similaires (${seeds.size} appels)...`);
  let done = 0;
  for (const id of seeds) {
    const seed = nodes.get(id)!;
    const related = await deezerFetch(`/artist/${id}/related?limit=${RELATED_PER_ARTIST}`);
    // Le voisin reçoit un vote pour les genres certains de la graine (Deezer ne donne pas le genre d'un artiste)
    const seedGenres = seed.direct.size ? [...seed.direct] : finalGenres(seed);
    for (const r of related?.data || []) {
      addNode(r, [], seedGenres);
      seed.related.push(r.id);
    }
    if (++done % 200 === 0) console.log(`   ${done}/${seeds.size} (${nodes.size} artistes)`);
  }

  // Enregistrement des artistes
  console.log(`💾 Enregistrement de ${nodes.size} artistes...`);
  for (const node of nodes.values()) node.genres = finalGenres(node);
  const ids = await saveArtists([...nodes.values()], { replaceGenres: true });
  const idOf = (deezerId: number) => ids.get(`deezer:${deezerId}`) ?? ids.get(stableSlug(nodes.get(deezerId)!.name));

  // Enregistrement des liens (on remplace ceux des graines, les autres restent)
  const relations: { artist_id: string; related_id: string; rank: number }[] = [];
  for (const id of seeds) {
    const from = idOf(id);
    if (!from) continue;
    nodes.get(id)!.related.forEach((relatedDeezerId, rank) => {
      const to = idOf(relatedDeezerId);
      if (to && to !== from) relations.push({ artist_id: from, related_id: to, rank });
    });
  }
  const unique = [...new Map(relations.map((r) => [`${r.artist_id}|${r.related_id}`, r])).values()];
  for (const part of chunk(unique, 500)) {
    must(await supabase.from('artist_relations').upsert(part, { onConflict: 'artist_id,related_id' }), 'Enregistrement artist_relations');
  }

  // Import Last.fm : on remplace l'import précédent de chaque membre (rattaché à l'artiste Deezer retenu, pas à un homonyme)
  const idOfName = (name: string) => {
    const deezerId = resolved.get(name.toLowerCase())?.id;
    return (deezerId ? ids.get(`deezer:${deezerId}`) : undefined) ?? ids.get(stableSlug(name)) ?? null;
  };
  for (const imp of imports) {
    const rows = imp.artists.map((a) => ({ user_id: imp.userId, artist_name: a.name, playcount: a.playcount, artist_id: idOfName(a.name) }));
    const unique = [...new Map(rows.map((r) => [r.artist_name, r])).values()];
    must(await supabase.from('lastfm_artists').delete().eq('user_id', imp.userId), 'Nettoyage lastfm_artists');
    if (unique.length) must(await supabase.from('lastfm_artists').insert(unique), 'Enregistrement lastfm_artists');
    console.log(`   Last.fm : ${unique.filter((r) => r.artist_id).length}/${unique.length} artistes rapprochés du catalogue`);
  }

  const { count: total } = await supabase.from('artists').select('*', { count: 'exact', head: true });
  console.log(`
✅ Catalogue à jour en ${Math.round((Date.now() - started) / 60_000)} min (${deezerStats.calls} appels Deezer)
   Artistes vus      : ${nodes.size} (dont ${seeds.size} graines)
   Liens similaires  : ${unique.length}
   Artistes en base  : ${total ?? '?'}
`);
}

main().catch((err) => {
  console.error('💥 Échec du catalogue :', err instanceof Error ? err.message : err);
  process.exit(1);
});
