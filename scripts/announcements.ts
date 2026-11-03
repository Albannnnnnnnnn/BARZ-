// Annonces d'albums sans fiche (table announcements, supabase/announcements.sql), lancé après la synchro complète :
// - MusicBrainz : albums et EP annoncés avec une date approximative (« 2027-03 », « 2027 ») d'artistes du catalogue
//   assez suivis. Les dates exactes passent déjà par la synchro complète (scripts/sync-releases.ts). Publiées d'office.
// - Actus : titres des médias du genre « X annonce son nouvel album » qui citent un artiste du catalogue.
//   Jamais publiées d'office : elles attendent la validation d'Alban (page /annonces), qui complète titre et date.
// Chaque annonce n'est ajoutée qu'une fois (external_key) : une annonce écartée ne revient pas.
import { XMLParser } from 'fast-xml-parser';
import { NEWS_FEEDS } from '../src/lib/news-feeds';
import { must, normalizeName, sleep, supabase } from './lib/common';

const MB_USER_AGENT = process.env.MUSICBRAINZ_USER_AGENT || 'BARZ/1.0 (https://albannnnnnnnnn.github.io/BARZ-/)';
// Mêmes seuils que les annonces MusicBrainz de la synchro complète (SYNC_UPCOMING_MIN_FANS)
const MB_MIN_FANS = Number(process.env.SYNC_UPCOMING_MIN_FANS ?? 50_000);
// Actus : artistes assez connus pour qu'un nom cité dans un titre soit bien le leur, ou suivis par un membre
const PRESS_MIN_AUDIENCE = 100_000;
const PRESS_MIN_NAME = 4; // « Dua », « SCH »… trop courts : trop de faux positifs dans un titre
const PRESS_MAX_AGE_DAYS = 7;
const ANNOUNCE = /\b(annonce|annoncent|dévoile|dévoilent|révèle|officialise|tease|announces?|unveils?|reveals?|confirms?|shares? details)\b/i;
const RECORD = /\b(album|albums|EP|mixtape|projet|LP|record)\b/i;
// Pas un nouveau disque : réédition, live, deluxe, anniversaire, tournée
const NOT_NEW = /réédition|reissue|remaster|\blive\b|deluxe|anniversa|\btour\b|tournée/i;

type Artist = { id: string; name: string; popularity: number | null; audience: number | null };

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

async function catalog(): Promise<Artist[]> {
  const out: Artist[] = [];
  for (let offset = 0; ; offset += 1000) {
    const page = must(
      await supabase.from('artists').select('id, name, popularity, audience').or(`popularity.gte.${MB_MIN_FANS},audience.gte.${PRESS_MIN_AUDIENCE}`).range(offset, offset + 999),
      'Lecture catalogue'
    ) as Artist[];
    out.push(...page);
    if (page.length < 1000) break;
  }
  // Artistes suivis par les membres, quelle que soit leur audience
  const follows = must(await supabase.from('follows').select('artist:artists(id, name, popularity, audience)').limit(20000), 'Lecture suivis') as any[];
  for (const f of follows) if (f.artist && !out.some((a) => a.id === f.artist.id)) out.push(f.artist);
  return out;
}

async function mbFetch(url: string): Promise<any | null> {
  for (let attempt = 1; attempt <= 5; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': MB_USER_AGENT, Accept: 'application/json' }, signal: AbortSignal.timeout(20_000) }).catch(() => null);
    await sleep(1100); // 1 requête par seconde maximum
    if (res?.ok) return res.json();
    if (res && res.status !== 503 && res.status !== 429) return null;
    await sleep(2000 * attempt);
  }
  return null;
}

// MusicBrainz : dates partielles à venir (mois ou année), jusqu'à un an
async function musicBrainz(byName: Map<string, Artist>) {
  const now = new Date();
  const month = isoDate(now).slice(0, 7);
  const until = isoDate(new Date(Date.now() + 365 * 86_400_000));
  const query = encodeURIComponent(`firstreleasedate:[${month} TO ${until}] AND (primarytype:album OR primarytype:ep)`);
  const rows: any[] = [];
  for (let offset = 0; offset < 500; offset += 100) {
    const json = await mbFetch(`https://musicbrainz.org/ws/2/release-group?fmt=json&limit=100&offset=${offset}&query=${query}`);
    if (!json) break;
    for (const rg of json['release-groups'] || []) {
      const date: string = rg['first-release-date'] || '';
      const artist = byName.get(normalizeName(rg['artist-credit']?.[0]?.name ?? ''));
      if (!artist || (artist.popularity ?? 0) < MB_MIN_FANS) continue;
      if ((rg['secondary-types'] || []).some((t: string) => ['Live', 'Compilation', 'Interview', 'Audiobook', 'Spokenword', 'Remix'].includes(t))) continue;
      // Seulement les dates partielles, pas encore passées
      const precision = date.length === 7 ? 'month' : date.length === 4 ? 'year' : null;
      if (!precision || (precision === 'month' ? date < month : date < month.slice(0, 4))) continue;
      rows.push({
        artist_id: artist.id,
        title: rg.title,
        kind: rg['primary-type'] === 'EP' ? 'ep' : 'album',
        release_date: precision === 'month' ? `${date}-01` : `${date}-01-01`,
        date_precision: precision,
        source: 'musicbrainz',
        source_url: `https://musicbrainz.org/release-group/${rg.id}`,
        status: 'published',
        external_key: `mb:${rg.id}`,
      });
    }
    if (offset + 100 >= (json.count ?? 0)) break;
  }
  return rows;
}

// Actus : titres récents qui annoncent un disque et citent un artiste (nom entier, pas au milieu d'un mot)
const parser = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true, processEntities: true, htmlEntities: true });
const asArray = <T>(v: T | T[] | undefined): T[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);
const plain = (v: unknown): string =>
  v == null ? '' : typeof v === 'object' ? plain((v as any)['#text']) : String(v).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function press(artists: Artist[], followed: Set<string>) {
  const minDate = Date.now() - PRESS_MAX_AGE_DAYS * 86_400_000;
  const candidates = artists
    .filter((a) => a.name.length >= PRESS_MIN_NAME && ((a.audience ?? 0) >= PRESS_MIN_AUDIENCE || followed.has(a.id)))
    .map((a) => ({ a, re: new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegex(a.name)}($|[^\\p{L}\\p{N}])`, 'iu') }));
  const rows: any[] = [];
  for (const feed of NEWS_FEEDS) {
    try {
      const res = await fetch(feed.url, { headers: { 'User-Agent': 'BARZ/1.0 (+https://albannnnnnnnnn.github.io/BARZ-/)' }, signal: AbortSignal.timeout(10_000) });
      if (!res.ok) continue;
      for (const item of asArray(parser.parse(await res.text())?.rss?.channel?.item) as any[]) {
        const title = plain(item.title);
        const link = plain(item.link);
        if (!title || !link.startsWith('http') || Date.parse(plain(item.pubDate)) < minDate) continue;
        if (!ANNOUNCE.test(title) || !RECORD.test(title) || NOT_NEW.test(title)) continue;
        // Le nom le plus long d'abord : « Damso » plutôt que « Dam »
        const hit = candidates.filter((c) => c.re.test(title)).sort((x, y) => y.a.name.length - x.a.name.length)[0];
        if (!hit) continue;
        rows.push({
          artist_id: hit.a.id,
          title: null,
          date_precision: 'soon',
          source: 'press',
          source_url: link.slice(0, 600),
          note: `${feed.source} : ${title}`.slice(0, 500),
          status: 'pending',
          external_key: `press:${link}`.slice(0, 1000),
        });
      }
    } catch (err) {
      console.warn(`Actus : flux ${feed.source} ignoré (${err instanceof Error ? err.message : err})`);
    }
  }
  return rows;
}

async function main() {
  const { error } = await supabase.from('announcements').select('id').limit(1);
  if (error) {
    console.log('Table announcements absente (supabase/announcements.sql pas encore lancé) : rien à faire.');
    return;
  }
  const artists = await catalog();
  const byName = new Map(artists.map((a) => [normalizeName(a.name), a]));
  const followed = new Set(
    (must(await supabase.from('follows').select('artist_id').limit(20000), 'Lecture suivis') as { artist_id: string }[]).map((f) => f.artist_id)
  );
  const mb = await musicBrainz(byName).catch((err) => (console.warn(`MusicBrainz indisponible : ${err}`), []));
  const news = await press(artists, followed);
  for (const rows of [mb, news]) {
    if (rows.length) must(await supabase.from('announcements').upsert(rows, { onConflict: 'external_key', ignoreDuplicates: true }), 'Enregistrement annonces');
  }
  console.log(`📣 Annonces : ${mb.length} MusicBrainz (dates approximatives), ${news.length} proposées depuis les actus (à valider)`);
}

main().catch((err) => {
  console.error('💥 Annonces :', err instanceof Error ? err.message : err);
  process.exit(1);
});
