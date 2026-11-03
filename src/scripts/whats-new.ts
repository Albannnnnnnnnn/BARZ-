// Fenêtre « Quoi de neuf ? » (src/components/WhatsNew.astro) : la dernière mise à jour vue est gardée dans ce
// navigateur. Une seule fois par mise à jour, et jamais pour quelqu'un qui découvre l'appli.
import { BASE, getMyProfile } from './social';

const KEY = 'barz-news-seen';
// Pages où la fenêtre gênerait : le journal lui-même, le guide, la connexion, l'accueil des nouveaux, le retour de Spotify
const SKIP = ['nouveautes', 'guide', 'connexion', 'bienvenue', 'spotify', 'hors-ligne'];

export function markNewsSeen(id: string) {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    // Stockage bloqué (navigation privée) : la fenêtre reviendra, tant pis
  }
}

function seenNews(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

// true s'il faut montrer la mise à jour latestId
export async function shouldShowNews(latestId: string): Promise<boolean> {
  const page = location.pathname.slice(BASE.length).split('/')[0] ?? '';
  if (SKIP.includes(page)) return false;
  const seen = seenNews();
  if (seen && seen >= latestId) return false;
  if (!seen) {
    // Jamais vu de mise à jour : un membre inscrit avant celle-ci la découvre ; un visiteur sans compte ou un
    // membre arrivé depuis n'a rien à rattraper
    const profile = await getMyProfile().catch(() => null);
    if (!profile || profile.created_at.slice(0, 10) >= latestId) {
      markNewsSeen(latestId);
      return false;
    }
  }
  return true;
}
