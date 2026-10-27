// Entrées de navigation partagées par la barre latérale (PC) et la barre du bas (mobile)
export const NAV_ITEMS = [
  { id: 'vendredi', href: '/BARZ-/', label: 'Vendredi', icon: 'calendar' },
  { id: 'explorer', href: '/BARZ-/search', label: 'Explorer', icon: 'search' },
  { id: 'actus', href: '/BARZ-/actus', label: 'Actus', icon: 'news' },
  { id: 'commu', href: '/BARZ-/commu', label: 'Communauté', icon: 'chat' },
  { id: 'profil', href: '/BARZ-/profil', label: 'Profil', icon: 'user' },
] as const;

export function activeNav(pathname: string): string | null {
  const path = pathname.replace(/^\/BARZ-/, '').replace(/\/$/, '') || '/';
  if (path === '/' || path.startsWith('/releases') || path.startsWith('/calendar')) return 'vendredi';
  if (path.startsWith('/search')) return 'explorer';
  if (path.startsWith('/actus')) return 'actus';
  if (path.startsWith('/commu')) return 'commu';
  if (path.startsWith('/profil')) return 'profil';
  return null;
}
