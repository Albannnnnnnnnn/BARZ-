// Fans Deezer des artistes du catalogue (colonne popularity, supabase/deezer-fans.sql)
//
//   npm run sync:fans
//
// La synchro des sorties ne lit les fans que des artistes de la watchlist (et le catalogue, ceux de son graphe) :
// les autres gardent le chiffre déjà en base, et un artiste arrivé en invité (fans inconnus) restait à 0 pour toujours, ce qui faussait
// son audience et le tri « Populaires ». À chaque passage, on relit sur Deezer les artistes à 0 d'abord
// (les plus écoutés sur Last.fm en tête), puis ceux vérifiés il y a plus de SYNC_FANS_REFRESH_DAYS jours,
// dans la limite de SYNC_FANS_PER_RUN (deezerFetch respecte la limite de débit de Deezer).
import { chunk, deezerFetch, supabase, must } from './lib/common';

const PER_RUN = Number(process.env.SYNC_FANS_PER_RUN ?? 1500);
const REFRESH_DAYS = Number(process.env.SYNC_FANS_REFRESH_DAYS ?? 30);

type Row = { id: string; deezer_id: number };

async function main() {
  const staleBefore = new Date(Date.now() - REFRESH_DAYS * 86_400_000).toISOString();
  const due = `deezer_checked_at.is.null,deezer_checked_at.lt.${staleBefore}`;
  const zeros = await supabase
    .from('artists')
    .select('id, deezer_id')
    .not('deezer_id', 'is', null)
    .eq('popularity', 0)
    .or(due)
    .order('audience', { ascending: false })
    .limit(PER_RUN);
  if (zeros.error?.message.includes('deezer_checked_at')) {
    console.warn('⚠️ Colonne deezer_checked_at absente : lancer supabase/deezer-fans.sql. Fans Deezer ignorés.');
    return;
  }
  const artists = [...(must(zeros, 'Lecture artistes à 0 fan') as Row[])];
  if (artists.length < PER_RUN) {
    const stale = must(
      await supabase
        .from('artists')
        .select('id, deezer_id')
        .not('deezer_id', 'is', null)
        .gt('popularity', 0)
        .or(due)
        .order('deezer_checked_at', { ascending: true, nullsFirst: true })
        .limit(PER_RUN - artists.length),
      'Lecture artistes à revérifier'
    ) as Row[];
    artists.push(...stale);
  }
  console.log(`💿 Deezer : fans de ${artists.length} artistes...`);

  const results: { id: string; fans: number | null }[] = [];
  try {
    for (const a of artists) {
      const artist = await deezerFetch(`/artist/${a.deezer_id}`);
      results.push({ id: a.id, fans: typeof artist?.nb_fan === 'number' ? artist.nb_fan : null });
    }
  } catch (err) {
    console.warn(`⚠️ ${err instanceof Error ? err.message : err}`);
  }

  // Même un artiste introuvable est marqué vérifié (ses fans restent tels quels), pour ne pas le redemander
  const checkedAt = new Date().toISOString();
  for (const part of chunk(results, 25)) {
    await Promise.all(
      part.map(async (r) =>
        must(
          await supabase
            .from('artists')
            .update(r.fans === null ? { deezer_checked_at: checkedAt } : { popularity: r.fans, deezer_checked_at: checkedAt })
            .eq('id', r.id),
          'Enregistrement fans'
        )
      )
    );
  }
  const found = results.filter((r) => r.fans !== null);
  console.log(`   ${found.length} lus sur Deezer (${found.filter((r) => r.fans! > 0).length} avec des fans), ${results.length - found.length} introuvables`);
}

main().catch((err) => {
  console.error('💥 Échec :', err instanceof Error ? err.message : err);
  process.exit(1);
});
