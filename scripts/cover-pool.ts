// Liste des pochettes du jeu « Pochette floue » (supabase/functions/cover-game/pool.json)
//
//   npm run jeux:pochettes   puis   supabase functions deploy cover-game --use-api --no-verify-jwt
//
// Parcourt les artistes du catalogue et garde leurs albums vraiment connus : au moins MIN_FANS fans sur Deezer
// (l'écoute en France surtout, d'où PNL, Damso ou Stromae en tête), jusqu'à MAX_PER_ARTIST par artiste.
// Les rééditions d'un même album (Deluxe, Remastered…) comptent une seule fois. À relancer de temps en temps.
import { writeFileSync } from 'node:fs';
import { sleep, supabase, must } from './lib/common';

const MIN_FANS = Number(process.env.COVER_MIN_FANS ?? 100_000);
const MAX_PER_ARTIST = 3;
const NOT_AN_ALBUM =
  /\blive\b|best of|greatest hits|\bhits\b|\bgold\b|collection|anthology|essentials|karaoke|instrumental|remix|playlist|soundtrack|original .*cast|bande originale|\bost\b|christmas|noël/i;
const URBAN = ['rap', 'rnb'];
const OUT = new URL('../supabase/functions/cover-game/pool.json', import.meta.url);

// Même nettoyage que la fonction cover-game : « Born To Die (Deluxe Version) » → « Born To Die »
const cleanTitle = (s: string) => s.replace(/\s*[([][^)\]]*(deluxe|edition|édition|version|remaster|expanded|bonus|anniversary)[^)\]]*[)\]]/gi, '').trim();
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '');

type Entry = { albumId: number; title: string; artist: string; artistDeezerId: number; cover: string; year: string; urban: boolean; fans: number };

async function main() {
  let artists: { name: string; deezer_id: number; genres: string[] | null }[] = [];
  for (let from = 0; ; from += 1000) {
    const page = must(
      await supabase.from('artists').select('name, deezer_id, genres').not('deezer_id', 'is', null).gte('audience', 30_000).order('audience', { ascending: false }).range(from, from + 999),
      'Lecture artists'
    ) as typeof artists;
    artists = artists.concat(page);
    if (page.length < 1000) break;
  }
  console.log(`🎨 ${artists.length} artistes à parcourir…`);

  const pool: Entry[] = [];
  let next = 0;
  async function worker() {
    while (next < artists.length) {
      const a = artists[next++];
      await sleep(200);
      const res = await fetch(`https://api.deezer.com/artist/${a.deezer_id}/albums?limit=100`).catch(() => null);
      const albums: any[] = (await res?.json().catch(() => null))?.data ?? [];
      const seen = new Set<string>();
      const kept = albums
        .filter((al) => al.record_type === 'album' && al.cover_xl && (al.fans ?? 0) >= MIN_FANS && !NOT_AN_ALBUM.test(al.title))
        .sort((x, y) => y.fans - x.fans)
        .filter((al) => {
          const key = norm(cleanTitle(al.title));
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .slice(0, MAX_PER_ARTIST);
      for (const al of kept) {
        pool.push({
          albumId: al.id,
          title: cleanTitle(al.title),
          artist: a.name,
          artistDeezerId: a.deezer_id,
          cover: al.cover_xl,
          year: (al.release_date ?? '').slice(0, 4),
          urban: (a.genres ?? []).some((g) => URBAN.includes(g)),
          fans: al.fans,
        });
      }
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()]);

  pool.sort((x, y) => y.fans - x.fans);
  writeFileSync(OUT, JSON.stringify(pool, null, 1) + '\n');
  const urban = pool.filter((p) => p.urban).length;
  console.log(`✅ ${pool.length} albums (${urban} rap et R&B, ${pool.length - urban} autres), de ${new Set(pool.map((p) => p.artistDeezerId)).size} artistes.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
