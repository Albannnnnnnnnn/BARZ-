// « feat. X », « feat. X et Y », « feat. X et 3 autres » : une ligne courte sous une vignette
// (sans dépendance : utilisé aussi dans le navigateur par src/scripts/social.ts)
export function featLabel(featuring: string[] | null | undefined): string {
  const list = featuring ?? [];
  if (!list.length) return '';
  if (list.length === 1) return `feat. ${list[0]}`;
  if (list.length === 2) return `feat. ${list[0]} et ${list[1]}`;
  return `feat. ${list[0]} et ${list.length - 1} autres`;
}

// Nom comparable d'un artiste : « JeanJass », « jeanjass » et « Jéanjass » se reconnaissent
export function normName(name: string): string {
  return name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '');
}

// Premier artiste suivi parmi les invités d'une sortie (followedNames : nom comparable → nom affiché)
export function followedInFeat(featuring: string[] | null | undefined, followedNames: Map<string, string>): string | null {
  for (const name of featuring ?? []) {
    const hit = followedNames.get(normName(name));
    if (hit) return hit;
  }
  return null;
}
