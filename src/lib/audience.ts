// Popularité d'un artiste : moyenne géométrique de ses auditeurs Last.fm (toutes plateformes, mais public
// peu francophone) et de ses fans Deezer (surtout français) : chaque source corrige le biais de l'autre.
// Quand une source manque, on l'estime avec l'autre. Même calcul que la colonne artists.audience
// (supabase/audience.sql), utilisée pour trier côté serveur. Sans dépendance : build et navigateur.
type WithAudience = { popularity?: number | null; lastfm_listeners?: number | null } | null | undefined;

// Rapport moyen observé entre auditeurs Last.fm et fans Deezer
const DEEZER_TO_LISTENERS = 0.3;

export function audience(artist: WithAudience): number {
  const listeners = artist?.lastfm_listeners || (artist?.popularity ?? 0) * DEEZER_TO_LISTENERS;
  const fans = artist?.popularity || (artist?.lastfm_listeners ?? 0) / DEEZER_TO_LISTENERS;
  return Math.round(Math.sqrt(listeners * fans));
}

export function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace('.0', '').replace('.', ',')} M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)} k`;
  return String(n);
}

// « Audience 960 k » (le détail Last.fm / Deezer est sur la fiche de l'artiste), sinon rien
export function formatAudience(artist: WithAudience): string {
  const n = audience(artist);
  return n ? `Audience ${compact(n)}` : '';
}

// Rééditions et versions spéciales : moins prioritaires qu'une vraie nouveauté dans « Populaires »
const REISSUE = /remaster|anniversary|anniversaire|deluxe|reissue|réédition|edition|édition|\blive\b|demo|\(\d{4}\)|from (the )?netflix|soundtrack|bande originale/i;

// Score « Populaires » d'une sortie : popularité de l'artiste × intérêt pour cette sortie (fans de l'album sur Deezer),
// en échelle logarithmique, moins une pénalité pour les rééditions et les compilations (6 invités ou plus)
export function releaseScore(r: { title: string; metadata?: { fans?: number | null; featuring?: string[] } | null; artist?: WithAudience }): number {
  const reissue = REISSUE.test(r.title) ? 1.5 : 0;
  const compilation = (r.metadata?.featuring?.length ?? 0) >= 6 ? 2 : 0;
  return Math.log10(audience(r.artist) + 1) + Math.log10((r.metadata?.fans ?? 0) + 1) - reissue - compilation;
}
