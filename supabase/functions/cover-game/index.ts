// Fonction Supabase « cover-game » (Deno) : jeu du jour « Pochette floue » (src/pages/jeux/pochette.astro).
// Chaque jour, la même pochette pour tout le monde : l'album le plus populaire sur Deezer d'un grand artiste du
// catalogue, choisi au premier passage de la journée (heure de Paris) et gardé dans daily_games (supabase/daily-games.sql).
// La réponse ne quitte la fonction qu'avec l'action « answer », appelée par la page une fois la partie finie.
//
// Appelée par le navigateur, même sans compte : supabase.functions.invoke('cover-game', { body: { action, ... } })
// - today            : numéro du jour, pochette et indices (année, genre, initiale de l'artiste)
// - search { q }     : albums Deezer qui correspondent, pour proposer les réponses
// - guess { id, title, artist } : bonne réponse ? bon artiste ?
// - answer           : l'album du jour
//
// Déploiement : supabase functions deploy cover-game --use-api --no-verify-jwt
import { createClient } from 'npm:@supabase/supabase-js@2';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const ORIGINS = ['https://albannnnnnnnnn.github.io', 'http://127.0.0.1:4322', 'http://localhost:4322'];
const GAME = 'pochette';
const FIRST_DAY = '2026-10-31'; // partie n° 1
// 6 jours sur 10 : rap et R&B (dès 300 000 auditeurs) ; les autres jours, les très grands noms des autres genres
const URBAN = ['rap', 'rnb'];
const MIN_AUDIENCE_URBAN = 300_000;
const MIN_AUDIENCE_OTHER = 1_000_000;
const MIN_FANS = 40_000; // fans Deezer de l'album : assez connu (en France surtout) pour qu'on ait une chance de le reconnaître
const NOT_AN_ALBUM = /\blive\b|best of|greatest hits|\bhits\b|\bgold\b|collection|anthology|essentials|karaoke|instrumental|remix|playlist/i;

type Answer = { albumId: number; title: string; artist: string; artistDeezerId: number; cover: string; year: string; genre: string | null; link: string };

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

// Comparable : minuscules, sans accents ni ponctuation
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '');
// Titre sans la mention d'édition : « Born To Die (Deluxe Version) » → « Born To Die »
const cleanTitle = (s: string) => s.replace(/\s*[([][^)\]]*(deluxe|edition|édition|version|remaster|expanded|bonus|anniversary)[^)\]]*[)\]]/gi, '').trim();

async function deezer(path: string): Promise<any | null> {
  const res = await fetch(`https://api.deezer.com${path}`).catch(() => null);
  const data = res?.ok ? await res.json().catch(() => null) : null;
  return data && !data.error ? data : null;
}

// Petit hachage stable : l'ordre des artistes change chaque jour, mais il est le même pour tous les appels du jour
function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

async function pickAnswer(day: string): Promise<Answer | null> {
  const since = new Date(Date.parse(day) - 120 * 86400_000).toISOString().slice(0, 10);
  const [{ data: artists }, { data: recent }] = await Promise.all([
    admin.from('artists').select('id, name, deezer_id, genres, audience').gte('audience', MIN_AUDIENCE_URBAN).not('deezer_id', 'is', null).limit(5000),
    admin.from('daily_games').select('data').eq('game', GAME).gte('day', since),
  ]);
  const used = new Set((recent ?? []).map((r) => (r.data as Answer).artistDeezerId));
  const urbanDay = hash(day) % 10 < 6;
  const pool = ((artists ?? []) as { id: string; deezer_id: number; genres: string[] | null; audience: number }[])
    .filter((a) => {
      const genres = a.genres ?? [];
      const urban = genres.some((g) => URBAN.includes(g));
      if (used.has(a.deezer_id) || genres.includes('classical')) return false;
      return urbanDay ? urban : !urban && a.audience >= MIN_AUDIENCE_OTHER;
    })
    .sort((a, b) => hash(day + a.id) - hash(day + b.id));

  for (const artist of pool.slice(0, 12)) {
    const albums: any[] = (await deezer(`/artist/${artist.deezer_id}/albums?limit=100`))?.data ?? [];
    const best = albums
      .filter((al) => al.record_type === 'album' && al.cover_xl && (al.fans ?? 0) >= MIN_FANS && !NOT_AN_ALBUM.test(al.title))
      .sort((x, y) => y.fans - x.fans)[0];
    if (!best) continue;
    const detail = await deezer(`/album/${best.id}`);
    if (!detail?.artist?.name || detail.artist.id !== artist.deezer_id) continue; // album d'un autre artiste (feat., compilation)
    return {
      albumId: best.id,
      title: cleanTitle(best.title),
      artist: detail.artist.name,
      artistDeezerId: artist.deezer_id,
      cover: best.cover_xl,
      year: (best.release_date ?? '').slice(0, 4),
      genre: detail.genres?.data?.[0]?.name ?? null,
      link: best.link ?? `https://www.deezer.com/album/${best.id}`,
    };
  }
  return null;
}

// La partie du jour : lue, ou choisie au premier passage (deux premiers passages simultanés gardent le même choix)
async function today(): Promise<{ day: string; answer: Answer } | null> {
  const day = parisDay();
  const read = async () => (await admin.from('daily_games').select('data').eq('day', day).eq('game', GAME).maybeSingle()).data?.data as Answer | undefined;
  const existing = await read();
  if (existing) return { day, answer: existing };
  const answer = await pickAnswer(day);
  if (!answer) return null;
  await admin.from('daily_games').upsert({ day, game: GAME, data: answer }, { onConflict: 'day,game', ignoreDuplicates: true });
  const saved = await read();
  return saved ? { day, answer: saved } : null;
}

Deno.serve(async (req) => {
  const headers = { ...cors(req), 'Content-Type': 'application/json' };
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
  const body = await req.json().catch(() => ({}));

  if (body.action === 'search') {
    const q = String(body.q ?? '').trim().slice(0, 80);
    if (q.length < 2) return reply({ results: [] });
    const found: any[] = (await deezer(`/search/album?limit=12&q=${encodeURIComponent(q)}`))?.data ?? [];
    const seen = new Set<string>();
    const results = found
      .filter((al) => al.record_type === 'album' || al.record_type === 'ep')
      .map((al) => ({ id: al.id, title: cleanTitle(al.title), artist: al.artist?.name ?? '', cover: al.cover_small ?? null }))
      .filter((al) => {
        const key = norm(al.title) + '|' + norm(al.artist);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 8);
    return reply({ results });
  }

  const game = await today();
  if (!game) return reply({ error: 'La pochette du jour n’a pas pu être choisie. Réessaie dans un moment.' }, 503);
  const { day, answer } = game;

  if (body.action === 'today') {
    const number = Math.round((Date.parse(day) - Date.parse(FIRST_DAY)) / 86400_000) + 1;
    return reply({ day, number, cover: answer.cover, hints: { year: answer.year, genre: answer.genre, initial: answer.artist.charAt(0).toUpperCase() } });
  }

  if (body.action === 'guess') {
    const sameArtist = norm(String(body.artist ?? '')) === norm(answer.artist);
    const correct = Number(body.id) === answer.albumId || (sameArtist && norm(cleanTitle(String(body.title ?? ''))) === norm(answer.title));
    return reply({ correct, sameArtist });
  }

  if (body.action === 'answer') return reply({ day, title: answer.title, artist: answer.artist, year: answer.year, cover: answer.cover, link: answer.link });

  return reply({ error: 'Action inconnue.' }, 400);
});
