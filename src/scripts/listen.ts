// Plateforme préférée des boutons « Écouter » (src/lib/listen.ts) :
// - la dernière plateforme choisie dans le menu, retenue sur cet appareil ;
// - sinon Spotify si le compte du membre y est connecté (vérifié une fois par session) ;
// - sinon le lien par défaut (Deezer le plus souvent).
import { getSession } from './social';
import { spotifyAvailable, spotifyStatus } from './spotify';

const KEY = 'barz-listen-platform';
const CHECKED = 'barz-listen-spotify-checked';

function read(storage: Storage, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function write(storage: Storage, key: string, value: string) {
  try {
    storage.setItem(key, value);
  } catch {
    // Stockage bloqué (navigation privée) : on garde le lien par défaut
  }
}

function setPlatform(platform: string) {
  write(localStorage, KEY, platform);
  applyListenPreference();
}

export function applyListenPreference(root: ParentNode = document) {
  const platform = read(localStorage, KEY);
  if (!platform) return;
  root.querySelectorAll<HTMLElement>('[data-listen]').forEach((box) => {
    const link = [...box.querySelectorAll<HTMLAnchorElement>('[data-platform]')].find((a) => a.dataset.platform === platform);
    const main = box.querySelector<HTMLAnchorElement>('.bz-listen-main');
    if (!link || !main) return;
    main.href = link.href;
    main.querySelector('b')!.textContent = platform;
  });
}

async function detectSpotify() {
  if (read(localStorage, KEY) || read(sessionStorage, CHECKED) || !spotifyAvailable() || !document.querySelector('[data-listen]')) return;
  if (!(await getSession())) return;
  write(sessionStorage, CHECKED, '1');
  const status = await spotifyStatus().catch(() => null);
  if (status?.connected) setPlatform('Spotify');
}

// Choisir une plateforme dans le menu la retient pour la suite
document.addEventListener('click', (event) => {
  const link = (event.target as HTMLElement).closest<HTMLAnchorElement>('[data-listen] [data-platform]');
  if (!link?.dataset.platform) return;
  link.closest('details')?.removeAttribute('open');
  setPlatform(link.dataset.platform);
});

// Place le menu sous la flèche (au-dessus s'il manque de place) et le fait suivre au défilement
function place(details: HTMLDetailsElement) {
  const menu = details.querySelector<HTMLElement>('.bz-listen-menu')!;
  const r = details.getBoundingClientRect();
  menu.style.right = `${Math.max(8, innerWidth - r.right)}px`;
  const below = innerHeight - r.bottom > menu.offsetHeight + 16;
  menu.style.top = below ? `${r.bottom + 8}px` : `${Math.max(8, r.top - menu.offsetHeight - 8)}px`;
}
const placeOpen = () => document.querySelectorAll<HTMLDetailsElement>('details.bz-listen-more[open]').forEach(place);
document.addEventListener('toggle', (event) => (event.target as Element).matches?.('details.bz-listen-more[open]') && place(event.target as HTMLDetailsElement), true);
// Capture : c'est parfois <body> qui défile, et son événement ne remonte pas jusqu'à window
document.addEventListener('scroll', placeOpen, { capture: true, passive: true });
addEventListener('resize', placeOpen);

// À rappeler quand une page ajoute un bouton « Écouter » après le chargement (fiche artiste)
export function initListen() {
  applyListenPreference();
  detectSpotify();
}

initListen();
