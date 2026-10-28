// Auditeurs Last.fm des artistes du catalogue (supabase/listeners.sql)
//
//   npm run sync:listeners
//
// Last.fm compte les auditeurs sur toutes les plateformes (Spotify, Apple Music, Deezer…) : une popularité
// plus représentative que les seuls fans Deezer. À chaque passage, on traite les artistes jamais vérifiés
// ou vérifiés il y a plus de SYNC_LISTENERS_REFRESH_DAYS jours, les plus suivis d'abord, dans la limite de
// SYNC_LISTENERS_PER_RUN (Last.fm demande de rester sous 5 requêtes par seconde).
import { chunk, sleep, supabase, must } from './lib/common';

const PER_RUN = Number(process.env.SYNC_LISTENERS_PER_RUN ?? 1200);
const REFRESH_DAYS = Number(process.env.SYNC_LISTENERS_REFRESH_DAYS ?? 30);

async function listenersOf(name: string, key: string): Promise<number | null> {
  const params = new URLSearchParams({ method: 'artist.getinfo', artist: name, autocorrect: '0', api_key: key, format: 'json' });
  await sleep(250);
  const res = await fetch(`https://ws.audioscrobbler.com/2.0/?${params}`, { headers: { 'User-Agent': 'BARZ/1.0 (https://albannnnnnnnnn.github.io/BARZ-/)' } });
  const json = await res.json().catch(() => null);
  if (json?.error === 10 || json?.error === 26) throw new Error('clé LASTFM_API_KEY invalide : à renouveler sur last.fm/api');
  if (json?.error === 29) throw new Error('Last.fm limite les requêtes : on reprendra au prochain passage');
  const listeners = Number(json?.artist?.stats?.listeners);
  return Number.isFinite(listeners) ? listeners : null; // artiste inconnu de Last.fm
}

async function main() {
  const key = process.env.LASTFM_API_KEY;
  if (!key) {
    console.warn('⚠️ LASTFM_API_KEY absente : auditeurs Last.fm ignorés.');
    return;
  }
  const staleBefore = new Date(Date.now() - REFRESH_DAYS * 86_400_000).toISOString();
  const artists = must(
    await supabase
      .from('artists')
      .select('id, name')
      .or(`lastfm_checked_at.is.null,lastfm_checked_at.lt.${staleBefore}`)
      .order('popularity', { ascending: false, nullsFirst: false })
      .limit(PER_RUN),
    'Lecture artists'
  ) as { id: string; name: string }[];
  console.log(`🎧 Last.fm : auditeurs de ${artists.length} artistes...`);

  const results: { id: string; listeners: number | null }[] = [];
  try {
    for (const a of artists) results.push({ id: a.id, listeners: await listenersOf(a.name, key) });
  } catch (err) {
    console.warn(`⚠️ ${err instanceof Error ? err.message : err}`);
  }

  // Enregistrement (même un artiste introuvable est marqué vérifié, pour ne pas le redemander à chaque fois)
  const checkedAt = new Date().toISOString();
  for (const part of chunk(results, 25)) {
    await Promise.all(
      part.map(async (r) => must(await supabase.from('artists').update({ lastfm_listeners: r.listeners, lastfm_checked_at: checkedAt }).eq('id', r.id), 'Enregistrement auditeurs'))
    );
  }
  const found = results.filter((r) => r.listeners !== null).length;
  console.log(`   ${found} trouvés sur Last.fm, ${results.length - found} inconnus`);
}

main().catch((err) => {
  console.error('💥 Échec :', err instanceof Error ? err.message : err);
  process.exit(1);
});
