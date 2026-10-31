// Entrées de navigation partagées par la barre latérale (PC) et la barre du bas (mobile)
export const NAV_ITEMS = [
  { id: 'vendredi', href: '/BARZ-/', label: 'Sorties', icon: 'calendar' },
  { id: 'decouvrir', href: '/BARZ-/search', label: 'Découvrir', icon: 'search' },
  // Fil : les Barz de la communauté et les actus, deux onglets d'une même rubrique (src/components/FilTabs.astro)
  { id: 'fil', href: '/BARZ-/commu', label: 'Fil', icon: 'chat' },
  { id: 'profil', href: '/BARZ-/profil', label: 'Profil', icon: 'user' },
] as const;

export function activeNav(pathname: string): string | null {
  const path = pathname.replace(/^\/BARZ-/, '').replace(/\/$/, '') || '/';
  if (path === '/' || path.startsWith('/releases') || path.startsWith('/calendar') || path.startsWith('/a-venir')) return 'vendredi';
  if (path.startsWith('/search') || path.startsWith('/artiste') || path.startsWith('/jeux')) return 'decouvrir';
  if (path.startsWith('/commu') || path.startsWith('/actus') || path.startsWith('/mag')) return 'fil';
  if (path.startsWith('/profil') || path.startsWith('/bilan') || path.startsWith('/modifier-profil')) return 'profil';
  return null;
}
