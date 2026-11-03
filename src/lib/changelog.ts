// Journal des nouveautés (page /nouveautes et fenêtre « Quoi de neuf ? » à l'ouverture, src/components/WhatsNew.astro).
// La plus récente en premier. Ajouter une entrée avec un nouvel id la montre une fois à chaque membre et la publie
// dans #annonces. L'id est sa date (« 2026-11-03 ») ; une deuxième le même jour prend « 2026-11-03-2 ».
// Textes adressés aux membres : ce qui change pour eux, pas comment c'est fait.

export type ChangeItem = { title: string; text: string; href?: string; link?: string };
export type ChangeEntry = { id: string; title: string; items: ChangeItem[] };

// Serveur Discord de BARZ¡ : les Nouveautés y sont publiées automatiquement à chaque mise à jour (scripts/news-discord.mjs)
export const DISCORD_URL = 'https://discord.gg/jjY2ptZdAv';

export const CHANGELOG: ChangeEntry[] = [
  {
    id: '2026-11-03-3',
    title: 'Les albums annoncés, et des notifs pour tes Barz',
    items: [
      {
        title: 'Les albums annoncés arrivent dans À venir',
        text: 'Un artiste annonce un album sans précommande ? Il apparaît quand même, avec « Prévu en mars » ou « Date à venir », et le compte à rebours démarre dès que la date exacte est connue.',
        href: '/BARZ-/annonces',
        link: 'Voir les annonces',
      },
      {
        title: 'Prévenu quand tes artistes annoncent',
        text: 'Si tu suis un artiste, tu reçois une notification dès qu’il annonce un nouvel album ou un EP.',
      },
      {
        title: 'Signale une annonce',
        text: 'Tu as vu passer une annonce sur les réseaux ? Sur la fiche de l’artiste, touche « Signaler une annonce » et ajoute le lien : on vérifie, puis elle apparaît pour tout le monde.',
      },
      {
        title: 'Des notifs pour tes Barz',
        text: 'Quand quelqu’un répond à ton Barz ou l’aime, tu es prévenu. Les ♥ sont regroupés, pour ne pas te faire vibrer à chaque fois.',
      },
    ],
  },
  {
    id: '2026-11-03-2',
    title: 'Le Discord, des Barz plus longs et les feats sur chaque titre',
    items: [
      {
        title: 'Un Barz, et le disque est dans Écouté',
        text: 'Quand tu publies un Barz, l’album ou le single passe tout seul dans tes disques écoutés. Plus besoin de cocher « Écouté » en plus.',
      },
      {
        title: 'Des Barz jusqu’à 1 000 caractères',
        text: 'Une phrase ou un vrai avis : tu as maintenant la place. Les retours à la ligne sont gardés.',
      },
      {
        title: 'Le Discord de BARZ¡ est ouvert',
        text: 'Les mises à jour en avant-première, les coulisses de l’appli et un salon pour tes idées.',
        href: DISCORD_URL,
        link: 'Rejoindre le Discord',
      },
      {
        title: 'Les feats sur chaque titre',
        text: 'Dans la liste des titres d’un disque, les artistes invités s’affichent à côté de chaque morceau, même quand ils ne sont pas dans le titre.',
      },
      {
        title: 'Des artistes au hasard',
        text: 'Dans Tous les artistes, « Au hasard » tire des artistes du catalogue, et « Remélanger » refait le tirage. Ça marche aussi par genre.',
        href: '/BARZ-/artistes?tri=hasard',
        link: 'Tirer des artistes',
      },
    ],
  },
  {
    id: '2026-11-03',
    title: 'Tes tops, des sorties plus rapides et une recherche plus précise',
    items: [
      {
        title: 'Tes tops sur ton profil',
        text: 'Choisis ton top 3 artistes, ton top 10 albums et ton top 10 singles, dans l’ordre. Ils comptent aussi dans tes recommandations.',
        href: '/BARZ-/profil',
        link: 'Choisir mes tops',
      },
      {
        title: 'Les sorties arrivent plus vite',
        text: 'BARZ¡ vérifie les nouvelles sorties toutes les 5 minutes, et la notification part dès qu’une sortie est trouvée.',
      },
      {
        title: 'Une page pour chaque disque',
        text: 'Toute la discographie d’un artiste est sur sa fiche. Chaque disque a sa page avec ses titres, des extraits à écouter, et tu peux le noter même s’il est ancien.',
      },
      {
        title: 'Une recherche plus précise',
        text: 'Des suggestions s’affichent pendant que tu tapes, l’artiste exact passe en premier, et les résultats sans rapport ont disparu.',
      },
      {
        title: 'Une capture d’écran dans tes retours',
        text: 'Pour montrer un bug ou une idée, joins une image à ton message, ou colle directement une capture d’écran.',
        href: '/BARZ-/retours',
        link: 'Écrire un retour',
      },
      {
        title: 'Des recos que tu peux trier',
        text: 'Le bouton × « Pas pour moi » écarte un artiste de tes recommandations.',
      },
      {
        title: 'Une page Paramètres',
        text: 'Notifications, comptes reliés (Spotify, Deezer, Last.fm) et aide sont réunis au même endroit, depuis ton profil.',
        href: '/BARZ-/parametres',
        link: 'Ouvrir les paramètres',
      },
      {
        title: 'Plus confortable sur téléphone',
        text: 'Rangées qui défilent, noms qui ne se coupent plus, boutons du guide toujours visibles en bas de l’écran.',
      },
    ],
  },
];

export const LATEST_CHANGE = CHANGELOG[0];


// « 2026-11-03 » → « 3 novembre 2026 »
export const changeDate = (id: string) => new Date(`${id.slice(0, 10)}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
