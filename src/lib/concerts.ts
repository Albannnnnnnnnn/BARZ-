// Concerts près de toi : API Discovery de Ticketmaster, lue au build.
// Sans TICKETMASTER_API_KEY, getConcerts() renvoie null et les pages gardent les concerts de démonstration.
import { readFileSync } from 'node:fs';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { getToday } from './releases';

export type Concert = {
  artist: string;
  day: string;
  month: string;
  venue: string;
  price: string | null;
  image: string | null;
  url: string;
  watched: boolean;
};

export const CONCERTS_CITY = process.env.CONCERTS_CITY ?? 'Paris';

function watchlistNames(): Set<string> {
  try {
    const list = JSON.parse(readFileSync(new URL('../../scripts/artist-watchlist.json', import.meta.url), 'utf8'));
    return new Set(
      Object.entries(list)
        .filter(([key]) => !key.startsWith('_'))
        .flatMap(([, names]) => names as string[])
        .map((n) => n.toLowerCase())
    );
  } catch {
    return new Set();
  }
}

// La plus grande image au format 16:9
function bestImage(images: any[] = []): string | null {
  const wide = images.filter((i) => i.ratio === '16_9').sort((a, b) => b.width - a.width);
  return (wide[0] ?? images[0])?.url ?? null;
}

function priceOf(event: any): string | null {
  const range = event.priceRanges?.[0];
  if (!range?.min) return null;
  const amount = Math.round(range.min);
  return range.currency === 'EUR' || !range.currency ? `${amount} €` : `${amount} ${range.currency}`;
}

// Concerts réels si la clé est configurée, sinon ceux de la démo (même forme)
export async function getConcertsOrDemo(demo: { artist: string; day: string; month: string; venue: string; price: string }[]): Promise<{ concerts: Concert[]; real: boolean }> {
  const real = await getConcerts();
  if (real && real.length > 0) return { concerts: real, real: true };
  return { concerts: demo.map((c) => ({ ...c, image: null, url: '', watched: false })), real: false };
}

let concertsPromise: Promise<Concert[] | null> | null = null;

export function getConcerts(): Promise<Concert[] | null> {
  concertsPromise ??= (async () => {
    const key = process.env.TICKETMASTER_API_KEY;
    if (!key) return null;

    const params = new URLSearchParams({
      apikey: key,
      countryCode: 'FR',
      city: CONCERTS_CITY,
      classificationName: 'music',
      sort: 'date,asc',
      size: '100',
      // Format exigé par Ticketmaster : sans millisecondes
      startDateTime: getToday().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    });

    try {
      const res = await fetch(`https://app.ticketmaster.com/discovery/v2/events.json?${params}`, {
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const watched = watchlistNames();
      const seenArtists = new Set<string>();
      const concerts: Concert[] = [];

      for (const event of json?._embedded?.events ?? []) {
        const artist: string = event._embedded?.attractions?.[0]?.name ?? event.name;
        const date: string | undefined = event.dates?.start?.localDate;
        const venue = event._embedded?.venues?.[0];
        // Une tournée = plusieurs dates : on ne garde que la première par artiste
        if (!artist || !date || seenArtists.has(artist.toLowerCase())) continue;
        seenArtists.add(artist.toLowerCase());
        const d = parseISO(date);
        concerts.push({
          artist,
          day: format(d, 'dd'),
          month: format(d, 'MMM', { locale: fr }).replace('.', '').toUpperCase(),
          venue: [venue?.name, venue?.city?.name].filter(Boolean).join(', '),
          price: priceOf(event),
          image: bestImage(event.images),
          url: event.url,
          watched: watched.has(artist.toLowerCase()),
        });
      }

      // Les artistes suivis d'abord, puis par date (déjà triés par l'API)
      return concerts.sort((a, b) => Number(b.watched) - Number(a.watched));
    } catch (err) {
      console.warn(`Concerts : Ticketmaster indisponible (${err instanceof Error ? err.message : err})`);
      return null;
    }
  })();
  return concertsPromise;
}
