// Popularité d'un artiste : ses auditeurs Last.fm (comptés sur toutes les plateformes) quand on les connaît,
// sinon ses fans Deezer, ramenés à peu près à la même échelle en attendant la vérification Last.fm
// (scripts/sync-listeners.ts). Sans dépendance : utilisé au build et dans le navigateur.
type WithAudience = { popularity?: number | null; lastfm_listeners?: number | null } | null | undefined;

// Les fans Deezer gonflent les artistes français et sous-estiment les autres : facteur moyen observé
const DEEZER_TO_LISTENERS = 0.3;

export function audience(artist: WithAudience): number {
  if (!artist) return 0;
  if (artist.lastfm_listeners) return artist.lastfm_listeners;
  return Math.round((artist.popularity ?? 0) * DEEZER_TO_LISTENERS);
}

function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace('.0', '').replace('.', ',')} M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)} k`;
  return String(n);
}

// « 178 k auditeurs », sinon « 5,2 M de fans » (Deezer), sinon rien
export function formatAudience(artist: WithAudience): string {
  if (!artist) return '';
  if (artist.lastfm_listeners) return `${compact(artist.lastfm_listeners)} auditeurs`;
  const fans = artist.popularity ?? 0;
  if (!fans) return '';
  return fans >= 1_000_000 ? `${compact(fans)} de fans` : `${compact(fans)} fans`;
}
