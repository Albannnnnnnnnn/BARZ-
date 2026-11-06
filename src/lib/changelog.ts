// Journal des nouveautés (page /nouveautes et fenêtre « Quoi de neuf ? » à l'ouverture, src/components/WhatsNew.astro).
// La plus récente en premier. Ajouter une entrée avec un nouvel id la montre une fois à chaque membre et la publie
// dans #annonces. L'id est sa date (« 2026-11-03 ») ; une deuxième le même jour prend « 2026-11-03-2 ».
// Textes adressés aux membres : ce qui change pour eux, pas comment c'est fait.

// tuto : 'lastfm' ajoute les boutons « Tuto Android » et « Tuto iPhone », qui ouvrent le tuto (src/components/LastfmTuto.astro)
export type ChangeItem = { title: string; text: string; href?: string; link?: string; tuto?: 'lastfm' };
export type ChangeEntry = { id: string; title: string; items: ChangeItem[] };

// Serveur Discord de BARZ¡ : les Nouveautés y sont publiées automatiquement à chaque mise à jour (scripts/news-discord.mjs)
export const DISCORD_URL = 'https://discord.gg/jjY2ptZdAv';

export const CHANGELOG: ChangeEntry[] = [
  {
    id: '2026-11-06',
    title: 'Relie Last.fm à ta musique, en 3 minutes',
    items: [
      {
        title: 'Le tuto Last.fm, pour Android et iPhone',
        text: 'Tu écoutes sur Spotify, Deezer, Apple Music ou YouTube Music ? Le tuto t’explique, étape par étape, comment faire enregistrer tes écoutes par Last.fm. Ensuite, tes recos se basent sur ce que tu écoutes vraiment.',
        tuto: 'lastfm',
      },
      {
        title: 'Tes titres notés comptent',
        text: 'Ton profil affiche le nombre de titres que tu as notés, et ton bilan du mois a son « titre du mois ». Nouveau badge : Oreille fine, à 10 titres notés.',
      },
      {
        title: 'Le fil du vendredi te prévient',
        text: 'Quelqu’un aime ton message ou y répond ? Tu reçois une notif. Si tu as répondu sous un message, tu es aussi prévenu·e des réponses suivantes.',
      },
      {
        title: 'La recherche va plus loin',
        text: 'Un vieil album ou un son pas encore chez nous ? La barre de recherche va maintenant le chercher sur Deezer.',
      },
      {
        title: 'Moins de bruit dans Sorties',
        text: 'Les artistes qui sortent des singles à la chaîne sont regroupés dans une section « En rafale », en bas de la semaine. Et les artistes générés par IA sont retirés de l’appli.',
      },
    ],
  },
  {
    id: '2026-11-05',
    title: 'Nouveaux menus : noter en un geste, les Barz et les jeux à portée de main',
    items: [
      {
        title: 'Quatre rubriques, plus de sous-menus',
        text: 'Sorties, Barz, Jeux et Moi : tout est à un toucher, plus besoin de fouiller.',
      },
      {
        title: 'Le bouton ＋ pour noter',
        text: 'Au milieu de la barre, depuis n’importe où : cherche un son ou un album, mets ta note, écris un Barz si tu veux. La note seule suffit.',
      },
      {
        title: 'La rubrique Barz',
        text: 'Les Barz de tes amis d’abord, puis ceux de toute la commu. On y trouve aussi le fil du vendredi et les actus. Le week-end, elle s’ouvre directement sur le fil du vendredi.',
        href: '/BARZ-/commu',
        link: 'Voir les Barz',
      },
      {
        title: 'Une rubrique Jeux',
        text: 'Pochette floue et L’artiste mystère, puis de quoi creuser : tous les artistes, un tirage au hasard, et Explorer pour sortir de ta bulle.',
        href: '/BARZ-/jeux',
        link: 'Jouer',
      },
      {
        title: 'Sorties : bientôt, en bas de la semaine',
        text: 'Les albums annoncés et les sorties les plus attendues, juste après celles de la semaine. La vue par semaine a maintenant des filtres par genre.',
      },
      {
        title: 'Ton profil, plus clair',
        text: 'Une seule rangée d’onglets : Spin list, Écoutés, Notés, Listes, Artistes, Bilans.',
      },
      {
        title: 'Ton menu sous ta photo',
        text: 'Paramètres, Quoi de neuf, le guide, un bug ou une idée, et inviter un ami.',
      },
      {
        title: 'Masquer les artistes IA',
        text: 'Une case sur Sorties et dans la vue par semaine. Tu tombes sur un artiste généré par IA ? Signale-le depuis sa fiche.',
      },
      {
        title: 'Corrigés',
        text: 'Dans le jeu de l’artiste, une ligne toute verte veut enfin dire que tu as trouvé. Le texte des badges ne dépasse plus. La rangée de tes artistes s’affiche en entier sur ordinateur.',
      },
    ],
  },
  {
    id: '2026-11-04',
    title: 'Partage en story, la discussion du vendredi et tes listes',
    items: [
      {
        title: 'Partage en story',
        text: 'Un Barz, ton top, ton bilan du mois ou ton résultat aux jeux en image, prête à poster sur Instagram ou à envoyer à tes potes.',
      },
      {
        title: 'La discussion du vendredi',
        text: 'Chaque week-end, un fil pour parler des sorties de la semaine, du vendredi au dimanche, avec le top des Barz de la communauté et de tes amis.',
        href: '/BARZ-/vendredi',
        link: 'Ouvrir le fil',
      },
      {
        title: 'Invite tes amis',
        text: 'Sur ton profil, « Inviter un ami » : la personne qui s’inscrit avec ton lien est ajoutée à tes amis directement.',
        href: '/BARZ-/profil',
        link: 'Inviter un ami',
      },
      {
        title: 'Tes listes de disques',
        text: 'Tes classiques, tes albums pour la route, tes découvertes : crée des listes et partage-les.',
        href: '/BARZ-/liste?nouvelle=1',
        link: 'Créer une liste',
      },
      {
        title: 'La note BARZ¡ sur chaque sortie',
        text: 'La moyenne des Barz s’affiche sur les cartes : tu vois d’un coup d’œil ce qui vaut le coup.',
      },
      {
        title: 'Des badges sur ton profil',
        text: 'Flair, Plume, Régularité, Mélomanie, Curiosité : gagne-les en notant vite, en écrivant, en jouant et en écoutant.',
      },
      {
        title: 'Le disque de la semaine',
        text: 'Chaque dimanche matin, une notif avec le disque le mieux noté par tes amis.',
      },
      {
        title: 'Ce que tes amis écoutent, via Last.fm',
        text: 'Plus besoin de Spotify : avec Last.fm, tes amis voient ce que tu écoutes en ce moment, si tu l’actives dans les Paramètres.',
      },
    ],
  },
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
