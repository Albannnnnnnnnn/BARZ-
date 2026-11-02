// Où en est-on des jeux du jour sur cet appareil (parties gardées par src/pages/jeux/pochette.astro et artiste.astro).
// Pour la page Jeux et la carte de la page Sorties ; null = pas encore joué aujourd'hui.

export type DailyGame = 'pochette' | 'artiste';

const parisDay = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date());

export function dailyGameStatus(game: DailyGame): string | null {
  try {
    const kept = JSON.parse(localStorage.getItem(`barz-${game}-${parisDay()}`) ?? 'null');
    if (!kept?.done) return null;
    const tries: number = game === 'pochette' ? kept.tries.length : kept.rows.length;
    if (!kept.won) return game === 'pochette' ? 'Raté aujourd’hui' : 'Abandon aujourd’hui';
    return `Trouvé en ${tries} essai${tries > 1 ? 's' : ''} ✓`;
  } catch {
    return null; // stockage bloqué
  }
}
