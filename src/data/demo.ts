// CONTENU FICTIF DE DÉMONSTRATION, repris des maquettes Figma.
// Artistes, albums, utilisateurs et concerts inventés : à remplacer par de vraies données
// quand les comptes utilisateurs (notes, Barz, spin list) et les actus existeront.
// Ne pas y mettre de vrais artistes : on leur prêterait des concerts ou des propos inventés.

export const DEMO_ALBUMS = {
  kintsugi: { title: 'Kintsugi', artist: 'Tamo & The Fold', palette: 0 },
  neons: { title: 'Néons Lents', artist: 'Mira Kale', palette: 1 },
  basse: { title: 'Basse Marée', artist: 'Ostra', palette: 2 },
  peau: { title: 'Sous la Peau', artist: 'Lou Varenne', palette: 3 },
  terre: { title: 'Terre Brûlée', artist: 'Volta Noire', palette: 4 },
  hiver: { title: 'Hiver 04', artist: 'Sacha Rubis', palette: 5 },
  lagune: { title: 'Lagune', artist: 'Nour', palette: 6 },
  selva: { title: 'Selva Eléctrica', artist: 'Los Cometas', palette: 7 },
} as const;

export const DEMO_CHALLENGE = {
  title: 'Un album de cumbia psychédélique',
  meta: '1 248 membres relèvent le défi · se termine dimanche',
};

export const DEMO_CONCERTS = [
  { day: '12', month: 'AVR', artist: 'Mira Kale', venue: 'Zénith, Paris', price: '39 €', scene: 0 },
  { day: '18', month: 'AVR', artist: 'Tamo & The Fold', venue: 'New Morning, Paris', price: '28 €', scene: 1 },
  { day: '02', month: 'MAI', artist: 'Ostra', venue: 'Le Sucre, Lyon', price: '18 €', scene: 2 },
  { day: '09', month: 'MAI', artist: 'Volta Noire', venue: 'La Cigale, Paris', price: '32 €', scene: 3 },
];

export const DEMO_USER = {
  name: 'Alban',
  handle: '@alban.mmi',
  bio: 'Étudiant MMI · rap, électro, et de plus en plus de jazz',
  stats: [
    { value: '147', label: 'Écoutés' },
    { value: '2', label: 'Spin list' },
    { value: '61', label: 'Barz' },
    { value: '212', label: 'Abonnés' },
  ],
  dna: [
    { genre: 'Rap', pct: 62 },
    { genre: 'Électro', pct: 21 },
    { genre: 'Jazz', pct: 11 },
    { genre: 'Autres', pct: 6 },
  ],
  dnaNote: '+8 % de jazz ce mois-ci. Tu sors de ta bulle.',
  spinList: [
    { album: 'lagune', score: '8.1', type: 'Album' },
    { album: 'selva', score: '8.3', type: 'Album' },
  ],
  activity: [
    ['A noté', 'Néons Lents · 8.5'],
    ['A relevé', 'le défi jazz de la semaine 10'],
    ['Suit', 'Sacha Rubis'],
    ['A ajouté', 'Lagune à sa spin list'],
  ],
};

export const DEMO_BARZ = [
  { name: 'Inès', handle: '@ines.wav', color: '#ec6a3e', time: 'il y a 1 h', text: '« Je n’écoutais jamais de jazz. Le défi de la semaine m’a convertie. »', album: 'kintsugi', score: '9.5', likes: 214 },
  { name: 'Malik', handle: '@malikbeats', color: '#3a6cf4', time: 'il y a 1 h', text: '« Le deuxième couplet de « Verglas »… On en parle ? »', album: 'neons', score: '8.0', likes: 98 },
  { name: 'Jade', handle: '@jadesurvinyle', color: '#e2c27a', time: 'il y a 1 h', text: '« Bonne prod, mais ça manque de prises de risque. »', album: 'terre', score: '7.0', likes: 41 },
] as const;

export const DEMO_CONTRIBUTORS = ['@ines.wav', '@malikbeats', '@jadesurvinyle'];

export const DEMO_NEWS = {
  feature: { tag: 'Tournée', title: 'Mira Kale annonce une tournée des Zéniths pour l’automne', meta: 'BARZ¡ Rédaction · Il y a 2 h · 3 min', scene: 3 },
  side: [
    { category: 'Festival', title: 'Les Nuits Sonores dévoilent leur programmation complète', meta: 'Tsugi · 4 min', scene: 2 },
    { category: 'Interview', title: 'Tamo Adeyemi : « Le jazz est une musique de club »', meta: 'Jazz Mag · 8 min', scene: 5 },
    { category: 'Industrie', title: 'Streaming : ce que change la nouvelle rémunération des artistes', meta: 'Les Inrocks · 6 min', scene: 0 },
  ],
};

export const DEMO_RABBIT_HOLE = [
  { kind: 'Album', title: 'Kintsugi', sub: 'Tamo & The Fold', link: true },
  { kind: 'Producteur', title: 'Idris Mbaye', sub: '14 disques produits', link: false },
  { kind: 'A aussi produit', title: 'Lagune', sub: 'Nour', link: true },
  { kind: 'Sample de', title: 'Karma', sub: 'Pharoah Sanders, 1969', link: false },
  { kind: 'Scène', title: 'Spiritual jazz', sub: 'Londres, 2015-2025', link: false },
];

export const MOODS = [
  { title: 'Travail', desc: 'Concentration, instrumental', color: 'var(--color-blue)', ink: '#0b0b0b' },
  { title: 'Sport', desc: 'BPM élevés, énergie', color: 'var(--color-orange)', ink: '#0b0b0b' },
  { title: 'Nuit', desc: 'Ambient, deep house', color: 'var(--color-violet)', ink: '#0b0b0b' },
  { title: 'Dimanche', desc: 'Soul, folk, jazz doux', color: 'var(--color-sand)', ink: '#0b0b0b' },
];
