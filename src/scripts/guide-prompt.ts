// Guide à l'ouverture de l'appli : un membre qui n'a pas vu la dernière version du guide (profiles.guide_version,
// supabase/guide.sql) y est envoyé une fois, puis repart vers la page qu'il ouvrait. Le guide enregistre qu'il a été vu.
import { BASE, getMyProfile, supabase } from './social';

// À augmenter pour remontrer le guide à tous les membres après une grosse nouveauté
export const GUIDE_VERSION = 1;

// Pages où l'on ne détourne jamais : le guide lui-même, la connexion, l'accueil des nouveaux, le retour de Spotify
const SKIP = ['guide', 'connexion', 'bienvenue', 'spotify', 'hors-ligne'];

export async function promptGuide() {
  const page = location.pathname.slice(BASE.length).split('/')[0] ?? '';
  if (SKIP.includes(page)) return;
  const profile = (await getMyProfile()) as { guide_version?: number; onboarded?: boolean } | null;
  // Colonne absente (SQL pas lancé), pas connecté, ou nouveau membre qui passera par Bienvenue puis le guide
  if (!profile || profile.guide_version === undefined || profile.onboarded === false) return;
  if (profile.guide_version >= GUIDE_VERSION) return;
  location.replace(`${BASE}guide?retour=1&next=${encodeURIComponent(location.pathname + location.search)}`);
}

export async function markGuideSeen() {
  const profile = (await getMyProfile()) as { id: string; guide_version?: number } | null;
  if (!profile || !supabase || profile.guide_version === undefined || profile.guide_version >= GUIDE_VERSION) return;
  await supabase.from('profiles').update({ guide_version: GUIDE_VERSION }).eq('id', profile.id);
}
