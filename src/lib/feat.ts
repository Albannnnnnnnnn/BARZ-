// « feat. X », « feat. X et Y », « feat. X et 3 autres » : une ligne courte sous une vignette
// (sans dépendance : utilisé aussi dans le navigateur par src/scripts/social.ts)
export function featLabel(featuring: string[] | null | undefined): string {
  const list = featuring ?? [];
  if (!list.length) return '';
  if (list.length === 1) return `feat. ${list[0]}`;
  if (list.length === 2) return `feat. ${list[0]} et ${list[1]}`;
  return `feat. ${list[0]} et ${list.length - 1} autres`;
}
