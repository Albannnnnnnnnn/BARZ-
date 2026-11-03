// Journal des nouveautés (page /nouveautes et fenêtre « Quoi de neuf ? » à l'ouverture, src/components/WhatsNew.astro).
// La plus récente en premier. Ajouter une entrée avec un nouvel id (sa date) la montre une fois à chaque membre.
// Textes adressés aux membres : ce qui change pour eux, pas comment c'est fait.

export type ChangeItem = { title: string; text: string; href?: string; link?: string };
export type ChangeEntry = { id: string; title: string; items: ChangeItem[] };

export const CHANGELOG: ChangeEntry[] = [
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
export const changeDate = (id: string) => new Date(`${id}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
