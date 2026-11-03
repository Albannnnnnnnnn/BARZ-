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

// Plus petit nombre de fautes (lettre en trop, en moins, différente, ou deux lettres inversées comme « dmaso » pour
// « damso ») pour retrouver needle au début de haystack : « damso » n'est pas « bryanadams » (le « dams » est au
// milieu d'un mot), c'est ce qui écartait les faux résultats
function fuzzyPrefixDistance(needle: string, haystack: string, max: number): number {
  const hay = haystack.slice(0, needle.length + max);
  let before: number[] = [];
  let prev = Array.from({ length: hay.length + 1 }, (_, j) => j);
  for (let i = 1; i <= needle.length; i++) {
    const row = [i];
    let rowMin = i;
    for (let j = 1; j <= hay.length; j++) {
      const cost = needle[i - 1] === hay[j - 1] ? 0 : 1;
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && needle[i - 1] === hay[j - 2] && needle[i - 2] === hay[j - 1]) row[j] = Math.min(row[j], before[j - 2] + 1);
      if (row[j] < rowMin) rowMin = row[j];
    }
    if (rowMin > max) return max + 1; // inutile d'aller plus loin
    before = prev;
    prev = row;
  }
  return Math.min(...prev);
}

// Au milieu d'un mot, seule une recherche assez longue compte (« ninho » ne doit pas trouver « Toninho »)
const MID_WORD_MIN = 6;

// Pertinence d'un texte pour une recherche : 0 = chaque mot cherché commence un mot du texte, 1 = la recherche
// collée commence un mot (« hjeunecrack », « h jeune crack »), 2 = trouvée au milieu d'un mot, 3 et plus = fautes de
// frappe (au début d'un mot), null = pas trouvé. text doit déjà être passé par normalizeSearch.
export function searchScore(query: string, text: string): number | null {
  const q = normalizeSearch(query);
  if (!q || !text) return null;
  const terms = q.split(' ');
  const words = text.split(' ');
  if (terms.every((t) => words.some((w) => w.startsWith(t)))) return 0;
  // Le texte collé à partir de chaque début de mot : « h jeune crack » → « hjeunecrack », « jeunecrack », « crack »
  const starts = words.map((_, k) => words.slice(k).join(''));
  const flatQuery = compact(q);
  if (starts.some((s) => s.startsWith(flatQuery))) return 1;
  if (flatQuery.length >= MID_WORD_MIN && compact(text).includes(flatQuery)) return 2;
  const closest = (needle: string, max: number) => Math.min(...starts.map((s) => fuzzyPrefixDistance(needle, s, max)));
  // Fautes de frappe, mot par mot, puis sur la recherche entière sans espaces
  let total = 0;
  const perTerm = terms.every((t) => {
    const max = tolerance(t.length);
    const d = closest(t, max);
    total += d;
    return d <= max;
  });
  if (perTerm) return 3 + total;
  const max = tolerance(flatQuery.length);
  const d = closest(flatQuery, max);
  return d <= max ? 3 + d : null;
}
