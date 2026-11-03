// Flux RSS des Actus (src/lib/news.ts), aussi lus par scripts/announcements.ts : sans dépendance, pour les scripts.
// Ajoute ou retire des médias ici : seuls les flux RSS publics sont utilisés. Vérifiés le 31/10/2026 (Rolling Stone FR
// refuse les robots, Booska-P et Mouv' ne publient plus dans leur flux, celui de Raplume est envahi de pubs de casino).
// lang 'fr' : mis en avant (le public de BARZ¡ est francophone).
export const NEWS_FEEDS = [
  { source: 'Tsugi', url: 'https://www.tsugi.fr/feed/', lang: 'fr' },
  { source: 'L’Abcdr du Son', url: 'https://www.abcdrduson.com/feed/', lang: 'fr' },
  { source: 'Les Inrocks', url: 'https://www.lesinrocks.com/musique/feed/', lang: 'fr' },
  { source: 'Radio Nova', url: 'https://www.nova.fr/feed/', lang: 'fr' },
  { source: 'FIP', url: 'https://www.radiofrance.fr/fip/rss', lang: 'fr' },
  { source: 'Les Oreilles Curieuses', url: 'https://www.lesoreillescurieuses.com/feed', lang: 'fr' },
  { source: 'Pitchfork', url: 'https://pitchfork.com/feed/feed-news/rss', lang: 'en' },
  { source: 'NME', url: 'https://www.nme.com/news/music/feed', lang: 'en' },
] as const;
