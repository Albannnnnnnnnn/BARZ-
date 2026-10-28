// Bouton « Écouter » (fiche de sortie, fiche artiste) : un bouton vers la plateforme du membre, et une flèche
// pour en choisir une autre. Lien exact quand on le connaît (Deezer, parfois Spotify ou Apple Music), sinon la
// recherche de la plateforme avec l'artiste et le titre déjà tapés. La plateforme préférée est appliquée dans
// le navigateur (src/scripts/listen.ts). Sans dépendance : utilisé au build et dans le navigateur.
export type ListenTarget = {
  artist: string;
  title?: string;
  deezerUrl?: string | null;
  spotifyUrl?: string | null;
  appleUrl?: string | null;
};

type Platform = { name: string; exact?: string | null; search: (q: string) => string };

function platforms(t: ListenTarget): Platform[] {
  return [
    { name: 'Spotify', exact: t.spotifyUrl, search: (q) => `https://open.spotify.com/search/${q}` },
    { name: 'Deezer', exact: t.deezerUrl, search: (q) => `https://www.deezer.com/search/${q}` },
    { name: 'Apple Music', exact: t.appleUrl, search: (q) => `https://music.apple.com/fr/search?term=${q}` },
    { name: 'YouTube Music', search: (q) => `https://music.youtube.com/search?q=${q}` },
    { name: 'SoundCloud', search: (q) => `https://soundcloud.com/search?q=${q}` },
  ];
}

export function listenLinks(t: ListenTarget): { name: string; url: string; exact: boolean }[] {
  const q = encodeURIComponent([t.artist, t.title].filter(Boolean).join(' '));
  return platforms(t).map((p) => ({ name: p.name, url: p.exact || p.search(q), exact: !!p.exact }));
}

function escape(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

// Sans préférence connue : la première plateforme dont on a le lien exact (Deezer le plus souvent)
export function listenMenuHtml(t: ListenTarget): string {
  const links = listenLinks(t);
  const main = links.find((l) => l.exact) ?? links[0];
  const items = links
    .map((l) => `<li><a href="${escape(l.url)}" target="_blank" rel="noopener" data-platform="${escape(l.name)}">${escape(l.name)} <span aria-hidden="true">↗</span></a></li>`)
    .join('');
  return `<div class="bz-listen" data-listen>
    <a class="bz-btn bz-btn--lime bz-listen-main" href="${escape(main.url)}" target="_blank" rel="noopener">Écouter sur <b>${escape(main.name)}</b> ↗</a>
    <details class="bz-listen-more"><summary class="bz-btn bz-btn--lime" aria-label="Choisir une autre plateforme"><span aria-hidden="true">▾</span></summary><ul class="bz-listen-menu">${items}</ul></details>
  </div>`;
}
