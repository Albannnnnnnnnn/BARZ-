// Recherche tolérante : ignore majuscules, accents, espaces et ponctuation, et accepte quelques fautes de frappe.
// « HJEUNECRACK », « h jeune crack » ou « H JeuneCrak » trouvent tous « H JeuneCrack ».

// Minuscules, sans accents ; tout ce qui n'est ni lettre ni chiffre devient un espace
export function normalizeSearch(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const compact = (text: string) => text.replace(/ /g, '');

// Fautes tolérées selon la longueur du mot cherché
const tolerance = (length: number) => (length < 4 ? 0 : length < 8 ? 1 : 2);

// Plus petit nombre de fautes (lettre en trop, en moins ou différente) pour trouver needle quelque part dans haystack
function fuzzyDistance(needle: string, haystack: string, max: number): number {
  let prev = Array.from({ length: haystack.length + 1 }, () => 0);
  for (let i = 1; i <= needle.length; i++) {
    const row = [i];
    let rowMin = i;
    for (let j = 1; j <= haystack.length; j++) {
      const cost = needle[i - 1] === haystack[j - 1] ? 0 : 1;
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost);
      if (row[j] < rowMin) rowMin = row[j];
    }
    if (rowMin > max) return max + 1; // inutile d'aller plus loin
    prev = row;
  }
  return Math.min(...prev);
}

// Pertinence d'un texte pour une recherche : 0 = tous les mots trouvés tels quels, plus c'est grand moins c'est proche,
// null = pas trouvé. text doit déjà être passé par normalizeSearch.
export function searchScore(query: string, text: string): number | null {
  const q = normalizeSearch(query);
  if (!q) return null;
  const terms = q.split(' ');
  if (terms.every((t) => text.includes(t))) return 0;
  const flat = compact(text);
  const flatQuery = compact(q);
  if (flat.includes(flatQuery)) return 1; // espaces mal placés : « hjeunecrack », « h jeune crack »
  // Fautes de frappe, mot par mot, puis sur la recherche entière sans espaces
  let total = 0;
  const perTerm = terms.every((t) => {
    const max = tolerance(t.length);
    const d = fuzzyDistance(t, flat, max);
    total += d;
    return d <= max;
  });
  if (perTerm) return 2 + total;
  const max = tolerance(flatQuery.length);
  const d = fuzzyDistance(flatQuery, flat, max);
  return d <= max ? 2 + d : null;
}
