// Apple Music (API iTunes, gratuite et sans clé, environ 20 requêtes par minute) : deuxième source de la veille,
// pour les sorties qu'Apple met en ligne avant Deezer, ou que Deezer n'a pas.
// - Chaque artiste suivi ou de la watchlist reçoit son identifiant Apple (colonne artists.apple_id, 0 = introuvable),
//   quelques-uns par passage (supabase/apple-source.sql).
// - Ensuite, une requête couvre 40 artistes : leurs 5 sorties les plus récentes chez Apple.
// Sans la colonne apple_id (SQL pas encore lancé), Apple est simplement ignoré.

export type AppleAlbum = {
  artistId: string; // id BARZ¡ de l'artiste
  artistName: string;
  title: string; // sans « - Single » ni « - EP »
  type: 'album' | 'ep' | 'single';
  releaseDate: string; // AAAA-MM-JJ
  cover: string | null;
  url: string | null;
  genre: string | null;
  trackCount: number;
  explicit: boolean;
};

const MAP_PER_PASS = 5; // recherches d'identifiants Apple par passage (~60 passages pour 300 artistes)
const BATCH = 40; // artistes par requête (5 sorties chacun : 200 résultats, le plafond d'Apple)

// Une requête toutes les 3,1 s au plus, pour rester sous la limite d'Apple
let nextSlot = 0;
async function itunes(path: string): Promise<any[] | null> {
  const slot = Math.max(Date.now(), nextSlot);
  nextSlot = slot + 3100;
  if (slot > Date.now()) await new Promise((r) => setTimeout(r, slot - Date.now()));
  try {
    const res = await fetch(`https://itunes.apple.com/${path}`, { headers: { 'User-Agent': 'BARZ/1.0' }, signal: AbortSignal.timeout(15_000) });
    return res.ok ? (await res.json())?.results ?? [] : null;
  } catch {
    return null;
  }
}

// Même règle que normTitle dans scripts/sync-releases.ts : sert à reconnaître la même sortie chez Deezer et Apple
export function normTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+-\s+(single|ep)$/, '')
    .replace(/[([](feat|ft|with|avec)\b[^)\]]*[)\]]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

const compactName = (name: string) => name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '');

type Row = { id: string; name: string; apple_id: number | null };

// Identifiants Apple manquants : recherche par nom, gardée seulement si le nom correspond exactement
async function mapArtists(admin: any, missing: Row[]) {
  for (const a of missing.slice(0, MAP_PER_PASS)) {
    const results = await itunes(`search?term=${encodeURIComponent(a.name)}&entity=musicArtist&country=fr&limit=5`);
    if (results === null) continue; // Apple indisponible : on réessaiera
    const match = results.find((r) => compactName(r.artistName ?? '') === compactName(a.name));
    await admin.from('artists').update({ apple_id: match?.artistId ?? 0 }).eq('id', a.id);
    if (match) a.apple_id = match.artistId;
  }
}

function toAlbum(c: any, artist: Row): AppleAlbum | null {
  const name = String(c.collectionName ?? '');
  if (!name || !c.releaseDate) return null;
  const type = / - Single$/.test(name) ? 'single' : / - EP$/.test(name) ? 'ep' : (c.trackCount ?? 0) <= 3 ? 'single' : 'album';
  return {
    artistId: artist.id,
    artistName: artist.name,
    title: name.replace(/ - (Single|EP)$/, ''),
    type,
    releaseDate: String(c.releaseDate).slice(0, 10),
    cover: c.artworkUrl100 ? String(c.artworkUrl100).replace(/\/\d+x\d+bb\./, '/1000x1000bb.') : null,
    url: c.collectionViewUrl ? String(c.collectionViewUrl).split('?')[0] : null,
    genre: c.primaryGenreName ?? null,
    trackCount: c.trackCount ?? 0,
    explicit: c.collectionExplicitness === 'explicit',
  };
}

// Sorties Apple des artistes donnés, datées entre from et today (inclus)
export async function appleReleases(admin: any, artistIds: string[], from: string, today: string): Promise<AppleAlbum[] | null> {
  const rows: Row[] = [];
  for (let i = 0; i < artistIds.length; i += 200) {
    const { data, error } = await admin.from('artists').select('id, name, apple_id').in('id', artistIds.slice(i, i + 200));
    if (error) return null; // colonne apple_id absente : SQL pas encore lancé
    rows.push(...(data ?? []));
  }
  await mapArtists(admin, rows.filter((r) => r.apple_id === null));
  const byApple = new Map(rows.filter((r) => r.apple_id).map((r) => [Number(r.apple_id), r]));
  const ids = [...byApple.keys()];
  const albums: AppleAlbum[] = [];
  for (let i = 0; i < ids.length; i += BATCH) {
    const results = await itunes(`lookup?id=${ids.slice(i, i + BATCH).join(',')}&entity=album&sort=recent&limit=5&country=fr`);
    for (const c of results ?? []) {
      const artist = c.wrapperType === 'collection' ? byApple.get(Number(c.artistId)) : undefined;
      const album = artist && toAlbum(c, artist);
      if (album && album.releaseDate >= from && album.releaseDate <= today) albums.push(album);
    }
  }
  // Versions explicite et censurée : une seule
  return [...new Map(albums.map((a) => [`${a.artistId}|${normTitle(a.title)}`, a])).values()];
}
