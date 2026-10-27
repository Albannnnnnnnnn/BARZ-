// Actus musicales : flux RSS de médias, lus au moment du build (pas de base de données).
// On n'affiche que le titre, la source, la date et l'image fournie par le flux,
// avec un lien vers l'article original : jamais le contenu de l'article.
import { XMLParser } from 'fast-xml-parser';
import { getToday } from './releases';

export type NewsItem = {
  title: string;
  link: string;
  source: string;
  category: string | null;
  date: string; // ISO
  image: string | null;
};

// Ajoute ou retire des médias ici : seuls les flux RSS publics sont utilisés
export const NEWS_FEEDS = [
  { source: 'Tsugi', url: 'https://www.tsugi.fr/feed/' },
  { source: 'Booska-P', url: 'https://www.booska-p.com/feed/' },
  { source: 'L’Abcdr du Son', url: 'https://www.abcdrduson.com/feed/' },
  { source: 'Rolling Stone', url: 'https://www.rollingstone.fr/feed/' },
  { source: 'Les Inrocks', url: 'https://www.lesinrocks.com/musique/feed/' },
  { source: 'Pitchfork', url: 'https://pitchfork.com/feed/feed-news/rss' },
  { source: 'NME', url: 'https://www.nme.com/news/music/feed' },
];

const MAX_AGE_DAYS = 14;
// Certains médias publient beaucoup plus que d'autres : on plafonne pour garder de la variété
const MAX_PER_SOURCE = 8;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  removeNSPrefix: true, // media:content → content, etc. (et tolère les préfixes non déclarés)
  processEntities: true,
  htmlEntities: true,
});

const asArray = <T>(v: T | T[] | undefined): T[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);

function text(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'object') return text((value as any)['#text']);
  return String(value)
    .replace(/<[^>]+>/g, '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#?\w+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function imageOf(item: any): string | null {
  const candidates = [
    ...asArray(item.content).map((m: any) => m?.['@url']),
    ...asArray(item.thumbnail).map((m: any) => m?.['@url']),
    ...asArray(item.group?.content).map((m: any) => m?.['@url']),
    ...asArray(item.enclosure).filter((e: any) => !e?.['@type'] || String(e['@type']).startsWith('image')).map((e: any) => e?.['@url']),
  ].filter((u): u is string => typeof u === 'string' && u.startsWith('http'));
  if (candidates.length) return candidates[0];
  // Sinon, première image dans le résumé HTML
  const html = String(item.encoded ?? item.description ?? '');
  return html.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1] ?? null;
}

async function readFeed(feed: (typeof NEWS_FEEDS)[number]): Promise<NewsItem[]> {
  try {
    const res = await fetch(feed.url, {
      headers: { 'User-Agent': 'BARZ/1.0 (+https://albannnnnnnnnn.github.io/BARZ-/)' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = parser.parse(await res.text());
    return asArray(xml?.rss?.channel?.item)
      .map((item: any): NewsItem | null => {
        const title = text(item.title);
        const link = text(item.link);
        const date = new Date(text(item.pubDate));
        if (!title || !link.startsWith('http') || Number.isNaN(date.getTime())) return null;
        return {
          title,
          link,
          source: feed.source,
          category: text(asArray(item.category)[0]) || null,
          date: date.toISOString(),
          image: imageOf(item),
        };
      })
      .filter((n): n is NewsItem => n !== null);
  } catch (err) {
    console.warn(`Actus : flux ${feed.source} ignoré (${err instanceof Error ? err.message : err})`);
    return [];
  }
}

let newsPromise: Promise<NewsItem[]> | null = null;

export function getNews(): Promise<NewsItem[]> {
  newsPromise ??= (async () => {
    const minDate = getToday().getTime() - MAX_AGE_DAYS * 86_400_000;
    const all = (await Promise.all(NEWS_FEEDS.map(readFeed))).flat();
    const seen = new Set<string>();
    return all
      .filter((n) => Date.parse(n.date) >= minDate && Date.parse(n.date) <= getToday().getTime() + 86_400_000)
      .filter((n) => !seen.has(n.link) && seen.add(n.link))
      .sort((a, b) => b.date.localeCompare(a.date))
      .filter((n, _, list) => list.filter((m) => m.source === n.source).indexOf(n) < MAX_PER_SOURCE);
  })();
  return newsPromise;
}
