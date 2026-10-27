// Genres de l'app (partagé par les pages et le navigateur : aucun import serveur ici)

// Puces de genre des maquettes → genres stockés par le sync
export const GENRE_CHIPS: { id: string; label: string; genres: string[] }[] = [
  { id: 'rap', label: 'Rap', genres: ['rap'] },
  { id: 'electro', label: 'Électro', genres: ['electronic'] },
  { id: 'pop', label: 'Pop', genres: ['pop'] },
  { id: 'jazz', label: 'Jazz', genres: ['jazz'] },
  { id: 'rock', label: 'Rock', genres: ['rock', 'metal'] },
  { id: 'soul', label: 'Soul', genres: ['soul', 'rnb'] },
  { id: 'monde', label: 'Monde', genres: ['world', 'latin', 'reggae'] },
];

export function chipIdsFor(genres: string[] = []): string[] {
  return GENRE_CHIPS.filter((c) => c.genres.some((g) => genres.includes(g))).map((c) => c.id);
}
