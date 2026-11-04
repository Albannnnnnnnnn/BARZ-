// Note moyenne BARZ¡ sur les cartes de sorties : lue en direct (les Barz arrivent entre deux reconstructions du site),
// pour chaque carte qui mène à une fiche /releases/… et n'a pas déjà un badge (note d'un membre, compte à rebours…).
// Les cartes ajoutées plus tard (carrousels, « Voir plus ») sont prises en compte aussi.
import { BASE, supabase } from './social';

const TILE = `a.tile[href*="${BASE}releases/"], a.bz-ctile[href*="${BASE}releases/"]`;
const averages = new Map<string, { avg: number; count: number } | null>();

const slugOf = (a: HTMLAnchorElement) => decodeURIComponent(a.pathname.split('/releases/')[1]?.replace(/\/$/, '') ?? '');

function paint(tile: HTMLAnchorElement) {
  const stat = averages.get(slugOf(tile));
  const row = tile.querySelector('.tile-row, .bz-ctile-row');
  if (!stat || !row || row.querySelector('.bz-score')) return;
  row.insertAdjacentHTML('beforeend', `<span class="bz-score bz-avg" title="Moyenne de ${stat.count} Barz">★ ${stat.avg.toFixed(1).replace('.', ',')}</span>`);
}

let pending = false;
async function scan() {
  pending = false;
  if (!supabase) return;
  const tiles = [...document.querySelectorAll<HTMLAnchorElement>(TILE)];
  const missing = [...new Set(tiles.map(slugOf).filter((s) => s && !averages.has(s)))];
  for (let i = 0; i < missing.length; i += 80) {
    const part = missing.slice(i, i + 80);
    part.forEach((s) => averages.set(s, null));
    const { data } = await supabase.from('barz').select('score, release:releases!inner(slug)').in('release.slug', part).limit(5000);
    const sums = new Map<string, { sum: number; count: number }>();
    for (const b of (data ?? []) as unknown as { score: number; release: { slug: string } }[]) {
      const cur = sums.get(b.release.slug) ?? { sum: 0, count: 0 };
      sums.set(b.release.slug, { sum: cur.sum + Number(b.score), count: cur.count + 1 });
    }
    for (const [slug, { sum, count }] of sums) averages.set(slug, { avg: sum / count, count });
  }
  tiles.forEach(paint);
}

const schedule = () => {
  if (pending) return;
  pending = true;
  setTimeout(() => scan().catch(() => {}), 400);
};
schedule();
new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
