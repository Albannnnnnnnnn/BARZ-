// Fiches des artistes du jeu « L'artiste mystère » (supabase/functions/artist-game/pool.json)
//
//   npm run jeux:artistes   puis   supabase functions deploy artist-game --use-api --no-verify-jwt
//
// Les artistes : ceux de la liste de Pochette floue (supabase/functions/cover-game/pool.json), donc des artistes
// dont au moins un album est très connu. Chaque fiche ne contient que des données vérifiées :
// - genres et auditeurs Last.fm : le catalogue BARZ¡ ;
// - pays et solo / groupe : MusicBrainz, trouvé par le lien vers la page Deezer de l'artiste (sinon par nom exact,
//   seulement si un seul artiste porte ce nom) ;
// - premier album : MusicBrainz, la première sortie de ses albums studio (sans lives, compilations ni mixtapes).
//   Pas Deezer, qui date souvent la version mise en ligne (les Beatles y commenceraient en 1993). Pas de nombre
//   d'albums : même sur MusicBrainz, il est faussé par les éditions pirates ou promotionnelles.
// Une donnée introuvable reste vide (null) : le jeu affiche « ? », il n'invente rien.
import { readFileSync, writeFileSync } from 'node:fs';
import { sleep, supabase, must } from './lib/common';

const MB_USER_AGENT = process.env.MUSICBRAINZ_USER_AGENT || 'BARZ/1.0 (https://albannnnnnnnnn.github.io/BARZ-/)';
const NOT_AN_ALBUM = /\blive\b|best of|greatest hits|\bhits\b|\bgold\b|collection|anthology|essentials|karaoke|instrumental|remix|playlist|soundtrack|music from|inspired by|motion picture|original .*cast|bande originale|\bost\b|christmas|noël/i;
const COVER_POOL = new URL('../supabase/functions/cover-game/pool.json', import.meta.url);
const OUT = new URL('../supabase/functions/artist-game/pool.json', import.meta.url);

type Entry = {
  deezerId: number;
  name: string;
  image: string | null;
  genres: string[];
  country: string | null; // code ISO, « FR »
  kind: 'solo' | 'groupe' | null;
  firstAlbum: number | null;
  listeners: number | null;
};

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '');

// MusicBrainz demande une requête par seconde au plus
async function musicbrainz(path: string): Promise<any | null> {
  await sleep(1100);
  const res = await fetch(`https://musicbrainz.org/ws/2/${path}`, { headers: { 'User-Agent': MB_USER_AGENT, Accept: 'application/json' } }).catch(() => null);
  return res?.ok ? res.json().catch(() => null) : null;
}

async function mbArtist(deezerId: number, name: string): Promise<{ id: string; type?: string; country?: string } | null> {
  const byLink = await musicbrainz(`url?resource=${encodeURIComponent(`https://www.deezer.com/artist/${deezerId}`)}&inc=artist-rels&fmt=json`);
  const linked = (byLink?.relations ?? []).map((r: any) => r.artist).filter(Boolean);
  if (linked.length === 1) return linked[0];
  const search = await musicbrainz(`artist?query=${encodeURIComponent(`artist:"${name}"`)}&limit=10&fmt=json`);
  const exact = (search?.artists ?? []).filter((a: any) => norm(a.name) === norm(name) && (a.score ?? 0) >= 90);
  return exact.length === 1 ? exact[0] : null;
}

async function deezer(path: string): Promise<any | null> {
  await sleep(150);
  const res = await fetch(`https://api.deezer.com${path}`).catch(() => null);
  const data = res?.ok ? await res.json().catch(() => null) : null;
  return data && !data.error ? data : null;
}

async function main() {
  const cover = JSON.parse(readFileSync(COVER_POOL, 'utf8')) as { artist: string; artistDeezerId: number }[];
  const names = new Map<number, string>();
  for (const c of cover) if (!names.has(c.artistDeezerId)) names.set(c.artistDeezerId, c.artist);
  const ids = [...names.keys()];
  const catalog = must(await supabase.from('artists').select('deezer_id, genres, audience').in('deezer_id', ids), 'Lecture artists') as { deezer_id: number; genres: string[] | null; audience: number | null }[];
  const byId = new Map(catalog.map((a) => [a.deezer_id, a]));
  console.log(`🕵️ ${ids.length} artistes à renseigner (environ ${Math.ceil((ids.length * 2.5) / 60)} min, MusicBrainz est lent)…`);

  const pool: Entry[] = [];
  for (const [i, deezerId] of ids.entries()) {
    const name = names.get(deezerId)!;
    const [artist, mb] = [await deezer(`/artist/${deezerId}`), await mbArtist(deezerId, name)];
    // Albums studio : type « Album » sans type secondaire (Live, Compilation, Mixtape/Street, Soundtrack…)
    const groups: any[] = mb ? ((await musicbrainz(`release-group?artist=${mb.id}&type=album&limit=100&fmt=json`))?.['release-groups'] ?? []) : [];
    const years = groups
      .filter((g) => !(g['secondary-types'] ?? []).length && !NOT_AN_ALBUM.test(g.title ?? ''))
      .map((g) => Number(String(g['first-release-date'] ?? '').slice(0, 4)))
      .filter((y) => y > 1900);
    const type = mb?.type;
    pool.push({
      deezerId,
      name,
      image: artist?.picture_medium ?? null,
      genres: byId.get(deezerId)?.genres ?? [],
      country: mb?.country ?? null,
      kind: type === 'Person' ? 'solo' : type === 'Group' || type === 'Orchestra' || type === 'Choir' ? 'groupe' : null,
      firstAlbum: years.length ? Math.min(...years) : null,
      listeners: byId.get(deezerId)?.audience ?? null,
    });
    if ((i + 1) % 25 === 0) console.log(`  ${i + 1}/${ids.length}`);
  }

  pool.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  writeFileSync(OUT, JSON.stringify(pool, null, 1) + '\n');
  const complete = pool.filter((p) => p.country && p.kind && p.firstAlbum && p.listeners != null && p.genres.length).length;
  console.log(`✅ ${pool.length} artistes, dont ${complete} avec une fiche complète (les seuls tirés comme artiste du jour).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
