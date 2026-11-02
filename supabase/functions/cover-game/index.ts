// Fonction Supabase « cover-game » (Deno) : jeu du jour « Pochette floue » (src/pages/jeux/pochette.astro).
// Chaque jour, la même pochette pour tout le monde : un album très connu de pool.json (scripts/cover-pool.ts),
// choisi au premier passage de la journée (heure de Paris) et gardé dans daily_games (supabase/daily-games.sql).
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
// Albums connus (au moins 100 000 fans Deezer), préparés par scripts/cover-pool.ts
import pool from './pool.json' with { type: 'json' };

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const ORIGINS = ['https://albannnnnnnnnn.github.io', 'http://127.0.0.1:4322', 'http://localhost:4322'];
const GAME = 'pochette';
const FIRST_DAY = '2026-10-31'; // partie n° 1
// 6 jours sur 10 : rap et R&B. Un album ne revient pas avant un an, un artiste pas avant trois semaines.
const ALBUM_GAP_DAYS = 365;
const ARTIST_GAP_DAYS = 21;

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

type PoolEntry = { albumId: number; title: string; artist: string; artistDeezerId: number; cover: string; year: string; urban: boolean; fans: number };

async function pickAnswer(day: string): Promise<Answer | null> {
  const daysAgo = (n: number) => new Date(Date.parse(day) - n * 86400_000).toISOString().slice(0, 10);
  const { data: recent } = await admin.from('daily_games').select('day, data').eq('game', GAME).gte('day', daysAgo(ALBUM_GAP_DAYS));
  const usedAlbums = new Set((recent ?? []).map((r) => (r.data as Answer).albumId));
  const recentArtists = new Set((recent ?? []).filter((r) => r.day >= daysAgo(ARTIST_GAP_DAYS)).map((r) => (r.data as Answer).artistDeezerId));
  const free = (pool as PoolEntry[]).filter((p) => !usedAlbums.has(p.albumId) && !recentArtists.has(p.artistDeezerId));
  const urbanDay = hash(day) % 10 < 6;
  const candidates = free.filter((p) => p.urban === urbanDay);
  const choice = (candidates.length ? candidates : free).sort((x, y) => hash(day + x.albumId) - hash(day + y.albumId))[0];
  if (!choice) return null;
  const detail = await deezer(`/album/${choice.albumId}`); // le genre, pour l'indice
  return {
    albumId: choice.albumId,
    title: choice.title,
    artist: choice.artist,
    artistDeezerId: choice.artistDeezerId,
    cover: choice.cover,
    year: choice.year,
    genre: detail?.genres?.data?.[0]?.name ?? null,
    link: detail?.link ?? `https://www.deezer.com/album/${choice.albumId}`,
  };
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
