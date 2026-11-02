// Fonction Supabase « artist-game » (Deno) : jeu du jour « L'artiste mystère » (src/pages/jeux/artiste.astro).
// On propose des artistes ; pour chacun, le jeu compare ses caractéristiques à celles de l'artiste du jour
// (genre, pays, solo ou groupe, premier album, auditeurs) : juste, proche, ou non, avec ↑↓.
// L'artiste du jour, le même pour tout le monde, est tiré parmi les fiches complètes de pool.json
// (scripts/artist-game-pool.ts) et gardé dans daily_games. La comparaison se fait ici : la réponse ne quitte
// la fonction qu'avec l'action « answer », une fois la partie finie.
//
// Appelée par le navigateur, même sans compte : supabase.functions.invoke('artist-game', { body: { action, ... } })
// - today        : numéro du jour et clé de la partie (pour reconnaître une partie gardée sur l'appareil)
// - names        : les artistes qu'on peut proposer
// - guess { id } : la ligne de comparaison de cet artiste, et s'il est trouvé
// - answer       : l'artiste du jour
//
// Déploiement : supabase functions deploy artist-game --use-api --no-verify-jwt
import { createClient } from 'npm:@supabase/supabase-js@2';
import pool from './pool.json' with { type: 'json' };

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const ORIGINS = ['https://albannnnnnnnnn.github.io', 'http://127.0.0.1:4322', 'http://localhost:4322'];
const GAME = 'artiste';
const FIRST_DAY = '2026-11-02'; // partie n° 1
const ARTIST_GAP_DAYS = 120; // un artiste ne revient pas avant
const URBAN = ['rap', 'rnb']; // 6 jours sur 10

type Entry = {
  deezerId: number;
  name: string;
  image: string | null;
  genres: string[];
  country: string | null;
  kind: 'solo' | 'groupe' | null;
  firstAlbum: number | null;
  listeners: number | null;
};
type Status = 'ok' | 'near' | 'no' | 'unknown';
type Cell = { key: string; label: string; status: Status; arrow: 'up' | 'down' | null };

const ARTISTS = pool as Entry[];
const GENRE_LABELS: Record<string, string> = {
  rap: 'Rap', rnb: 'R&B', pop: 'Pop', rock: 'Rock', metal: 'Metal', electronic: 'Électro', jazz: 'Jazz', soul: 'Soul',
  latin: 'Latino', reggae: 'Reggae', world: 'Monde', folk: 'Folk', classical: 'Classique', blues: 'Blues', country: 'Country',
};
// Continent de chaque pays présent dans les fiches : même continent = « proche »
const CONTINENT: Record<string, string> = Object.fromEntries(
  Object.entries({
    europe: 'FR BE CH LU MC GB IE DE AT NL DK SE NO FI IS ES PT IT GR PL CZ SK HU RO BG HR RS SI BA AL MK UA RU BY EE LV LT MT CY',
    'amérique du nord': 'US CA MX',
    caraïbes: 'JM TT BB HT CU DO PR BS GP MQ',
    'amérique du sud': 'BR AR CL CO VE PE EC UY PY BO',
    afrique: 'DZ MA TN EG NG GH CI CM SN ML CD CG GA BF NE TG BJ GN KE ZA ET RW UG TZ AO MZ ZW KM MG MU RE',
    asie: 'KR JP CN TW HK IN PK TH VN PH ID MY SG IL LB TR IR IQ SA AE',
    océanie: 'AU NZ',
  }).flatMap(([continent, codes]) => codes.split(' ').map((code) => [code, continent]))
);

function cors(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? '';
  return {
    'Access-Control-Allow-Origin': ORIGINS.includes(origin) ? origin : ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

const parisDay = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date());

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

const complete = (a: Entry) => !!(a.country && a.kind && a.firstAlbum && a.listeners != null && a.genres.length);
const urban = (a: Entry) => a.genres.some((g) => URBAN.includes(g));

const regionNames = new Intl.DisplayNames(['fr'], { type: 'region' });
const flag = (code: string) => String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
const countryLabel = (code: string) => `${flag(code)} ${regionNames.of(code) ?? code}`;
const listenersLabel = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1).replace('.', ',').replace(',0', '')} M` : `${Math.round(n / 1000)} k`);

// Nombre : juste, proche (écart au plus « near »), sinon non ; la flèche dit si la réponse est plus haut ou plus bas
function compareNumber(key: string, label: (n: number) => string, guess: number | null, answer: number, near: (g: number, a: number) => boolean, ok = (g: number, a: number) => g === a): Cell {
  if (guess == null) return { key, label: '?', status: 'unknown', arrow: null };
  const status: Status = ok(guess, answer) ? 'ok' : near(guess, answer) ? 'near' : 'no';
  return { key, label: label(guess), status, arrow: status === 'ok' ? null : answer > guess ? 'up' : 'down' };
}

function compare(guess: Entry, answer: Entry): Cell[] {
  const sameGenres = guess.genres.length && guess.genres.length === answer.genres.length && guess.genres.every((g) => answer.genres.includes(g));
  const sharedGenre = guess.genres.some((g) => answer.genres.includes(g));
  return [
    {
      key: 'genre',
      label: guess.genres.map((g) => GENRE_LABELS[g] ?? g).join(' / ') || '?',
      status: !guess.genres.length ? 'unknown' : sameGenres ? 'ok' : sharedGenre ? 'near' : 'no',
      arrow: null,
    },
    {
      key: 'country',
      label: guess.country ? countryLabel(guess.country) : '?',
      status: !guess.country ? 'unknown' : guess.country === answer.country ? 'ok' : CONTINENT[guess.country] && CONTINENT[guess.country] === CONTINENT[answer.country!] ? 'near' : 'no',
      arrow: null,
    },
    { key: 'kind', label: guess.kind === 'solo' ? 'Solo' : guess.kind === 'groupe' ? 'Groupe' : '?', status: !guess.kind ? 'unknown' : guess.kind === answer.kind ? 'ok' : 'no', arrow: null },
    compareNumber('firstAlbum', String, guess.firstAlbum, answer.firstAlbum!, (g, a) => Math.abs(g - a) <= 3),
    compareNumber('listeners', listenersLabel, guess.listeners, answer.listeners!, (g, a) => Math.abs(g - a) <= a * 0.35, (g, a) => Math.abs(g - a) <= a * 0.1),
  ];
}

async function pickAnswer(day: string): Promise<number | null> {
  const since = new Date(Date.parse(day) - ARTIST_GAP_DAYS * 86400_000).toISOString().slice(0, 10);
  const { data: recent } = await admin.from('daily_games').select('data').eq('game', GAME).gte('day', since);
  const used = new Set((recent ?? []).map((r) => (r.data as { deezerId: number }).deezerId));
  const free = ARTISTS.filter((a) => complete(a) && !used.has(a.deezerId));
  const urbanDay = hash(day) % 10 < 6;
  const candidates = free.filter((a) => urban(a) === urbanDay);
  const choice = (candidates.length ? candidates : free).sort((x, y) => hash(day + x.deezerId) - hash(day + y.deezerId))[0];
  return choice?.deezerId ?? null;
}

// L'artiste du jour : lu, ou tiré au premier passage (deux premiers passages simultanés gardent le même)
async function today(): Promise<{ day: string; answer: Entry } | null> {
  const day = parisDay();
  const read = async () => (await admin.from('daily_games').select('data').eq('day', day).eq('game', GAME).maybeSingle()).data?.data as { deezerId: number } | undefined;
  let saved = await read();
  if (!saved) {
    const deezerId = await pickAnswer(day);
    if (!deezerId) return null;
    await admin.from('daily_games').upsert({ day, game: GAME, data: { deezerId } }, { onConflict: 'day,game', ignoreDuplicates: true });
    saved = await read();
  }
  const answer = saved && ARTISTS.find((a) => a.deezerId === saved!.deezerId);
  return answer ? { day, answer } : null;
}

Deno.serve(async (req) => {
  const headers = { ...cors(req), 'Content-Type': 'application/json' };
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
  const body = await req.json().catch(() => ({}));

  if (body.action === 'names') return reply({ artists: ARTISTS.map((a) => ({ id: a.deezerId, name: a.name, image: a.image })) });

  const game = await today();
  if (!game) return reply({ error: 'L’artiste du jour n’a pas pu être choisi. Réessaie dans un moment.' }, 503);
  const { day, answer } = game;

  if (body.action === 'today') {
    const number = Math.round((Date.parse(day) - Date.parse(FIRST_DAY)) / 86400_000) + 1;
    return reply({ day, number, key: String(hash(`${day}:${answer.deezerId}`)) });
  }

  if (body.action === 'guess') {
    const guess = ARTISTS.find((a) => a.deezerId === Number(body.id));
    if (!guess) return reply({ error: 'Cet artiste ne fait pas partie du jeu.' }, 400);
    return reply({ id: guess.deezerId, name: guess.name, image: guess.image, correct: guess.deezerId === answer.deezerId, cells: compare(guess, answer) });
  }

  if (body.action === 'answer') return reply({ id: answer.deezerId, name: answer.name, image: answer.image, link: `https://www.deezer.com/artist/${answer.deezerId}` });

  return reply({ error: 'Action inconnue.' }, 400);
});
