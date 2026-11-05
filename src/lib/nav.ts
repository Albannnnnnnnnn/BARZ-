// Entrées de navigation partagées par la barre latérale (PC) et la barre du bas (mobile).
// Entre Barz et Jeux, le bouton ＋ « Noter » ouvre la fenêtre src/components/NoteSheet.astro.
export const NAV_ITEMS = [
  { id: 'sorties', href: '/BARZ-/', label: 'Sorties', icon: 'calendar' },
  // Barz : les Barz des amis puis de la commu, le fil du vendredi et les actus (src/components/FilTabs.astro)
  { id: 'barz', href: '/BARZ-/commu', label: 'Barz', icon: 'chat' },
  { id: 'jeux', href: '/BARZ-/jeux', label: 'Jeux', icon: 'dice' },
  { id: 'moi', href: '/BARZ-/profil', label: 'Moi', icon: 'user' },
] as const;

export function activeNav(pathname: string): string | null {
  const path = pathname.replace(/^\/BARZ-/, '').replace(/\/$/, '') || '/';
  if (path === '/' || path.startsWith('/releases') || path.startsWith('/calendar') || path.startsWith('/a-venir') || path.startsWith('/semaine') || path.startsWith('/annonces')) return 'sorties';
  if (path.startsWith('/commu') || path.startsWith('/actus') || path.startsWith('/vendredi')) return 'barz';
  if (path.startsWith('/jeux') || path.startsWith('/artistes') || path === '/search') return 'jeux';
  if (path.startsWith('/profil') || path.startsWith('/bilan') || path.startsWith('/modifier-profil') || path.startsWith('/liste') || path.startsWith('/parametres')) return 'moi';
  return null;
}
