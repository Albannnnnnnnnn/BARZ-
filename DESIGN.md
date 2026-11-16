# BARZ¡ — Design

Référence du style visuel de BARZ¡ : ce qu'on utilise, pourquoi, et les règles à respecter quand on ajoute une page ou un composant.
Les valeurs font foi dans le code : `src/styles/global.css` (jetons) et `src/styles/barz.css` (briques `bz-*`). Si ce fichier et le code ne disent pas la même chose, c'est le code qui a raison : mets ce fichier à jour.

---

## 1. Direction : le style « Affiche »

Adopté en novembre 2026, après les essais « Papier marine » et sombre/lime.

- **Fond blanc, encre noire, un seul accent** : le bleu électrique du logo, éclairci.
- **Contours noirs de 2 px** sur tout ce qui se touche : boutons, puces, champs, pochettes et cartes.
- **Ombres franches et décalées** (pas de flou). Elles apparaissent au survol, comme si l'élément se soulevait de la page.
- **Titres en capitales**, très larges et très gras.
- **Coins à peine arrondis** (8 à 14 px). Seuls les avatars et les photos d'artistes sont ronds.
- **Les pochettes portent la couleur.** L'interface reste sobre pour laisser la place à la musique.

L'idée : une affiche de concert ou un flyer, pas une appli de streaming de plus. Pour la même raison, les polices ont été choisies pour ne ressembler à aucune grande appli musicale.

---

## 2. Couleurs

Toujours passer par les jetons (`var(--color-…)`), jamais de couleur écrite en dur dans un composant : sinon le mode sombre casse.

### Clair (par défaut)

| Jeton | Valeur | Usage |
|---|---|---|
| `--color-bg` | `#ffffff` | Fond de page |
| `--color-bg-elevated` | `#f2f3f7` | Survol de puce, bandeaux légers |
| `--color-bg-surface` | `#e9ebf2` | Fond d'une pochette en chargement, blocs neutres |
| `--color-bg-hover` | `#e4e7f0` | Survol de ligne de liste |
| `--color-paper` | `#ffffff` | Cartes, champs, menus (ce qui est « posé » sur la page) |
| `--color-text` | `#0a0a0a` | Texte principal |
| `--color-text-muted` | `#4a4f5c` | Texte secondaire, paragraphes |
| `--color-text-dim` | `#5c6170` | Méta-infos, textes indicatifs (placeholder) |
| `--color-line` | `#d9dce5` | Séparateurs discrets (listes, menus) |
| `--color-ink` | `#0a0a0a` | Contours, ombres franches, aplats noirs |
| `--color-on-ink` | `#ffffff` | Texte posé sur un aplat d'encre (barre du bas, bouton noir) |
| `--color-accent` | `#3d5afe` | Bouton principal, puce active, notes, mots mis en avant |
| `--color-accent-hover` | `#2f4ae6` | Survol de l'accent |
| `--color-accent-soft` | `#e6eaff` | Fond léger d'accent (survol de menu) |
| `--color-accent-line` | `#b3bfff` | Contour du champ actif (focus) |
| `--color-on-accent` | `#ffffff` | Texte posé sur l'accent |

Couleurs d'appoint, à utiliser avec parcimonie (illustrations, jeux, carte du bilan) : `--color-orange #ff5a1f`, `--color-violet #5b3df5`, `--color-sand #ffd23f`.

### Sombre

L'affiche s'inverse : fond presque noir, « encre » claire. L'accent s'éclaircit (`#7c8fff`) et son texte passe en noir pour rester lisible. Les ombres franches deviennent gris foncé (`#3a3f4c`) : une ombre claire ferait un halo. Les pochettes ne changent pas.

Fonctionnement :
- **Automatique** (par défaut) suit le réglage du téléphone (`prefers-color-scheme`).
- **Clair** ou **Sombre**, choisis dans Paramètres → Apparence, posent `data-theme` sur `<html>`. Le choix est gardé dans l'appareil (`localStorage` `barz-theme`).
- Un petit script en tête de `Layout.astro` applique le thème avant l'affichage : pas de flash blanc.

⚠️ Les valeurs sombres sont écrites **deux fois** dans `global.css` (bloc `@media (prefers-color-scheme: dark)` et bloc `:root[data-theme='dark']`). Si tu en changes une, change l'autre.

**Règle :** le texte sur un fond d'encre utilise `--color-on-ink`, le texte sur l'accent `--color-on-accent`. Jamais `#fff` : en sombre, ces fonds sont clairs.

---

## 3. Typographie

| Rôle | Police | Jeton |
|---|---|---|
| Titres, boutons, puces | **Unbounded** (500 à 900), large et ronde, en capitales | `--font-display` |
| Texte | **Atkinson Hyperlegible** (400, 700), faite pour être très lisible | `--font-sans` |
| Code, chiffres techniques | JetBrains Mono | `--font-mono` |

Chargées depuis Google Fonts dans `Layout.astro`. `--font-serif` est un ancien nom gardé pour compatibilité : il pointe aussi vers Unbounded.

Styles de base :
- **Grand titre de page** `.bz-display` : Unbounded 800, capitales, `clamp(32px, 5vw, 72px)`, interligne 0,95. Un `<em>` dedans passe en couleur d'accent (pas en italique).
- **Titre de section** `.bz-h2` : Unbounded 800, capitales, `clamp(19px, 2vw, 28px)`.
- **Surtitre** `.bz-eyebrow` : 12 px, gras, capitales espacées, couleur d'accent. Il se place au-dessus d'un titre.
- **Texte courant** : 16 px, interligne 1,6. Les paragraphes sont en `--color-text-muted`.
- **Lien d'action** `.bz-link` (« Tout voir », « Modifier ») : 13 px, 800, capitales. Il existe aussi en `<button class="bz-link">`.

Échelle disponible : `--text-xs` (12) · `sm` (14) · `base` (16) · `lg` (18) · `xl` (20) · `2xl` (24) · `3xl` (30) · `4xl` (40) · `5xl` (56) · `6xl` (80).

---

## 4. Espacements, rayons, ombres

- **Espacement** : `--space-1` (4 px) à `--space-24` (96 px), par pas de 4 px. Sur téléphone, la marge des bords de page est de 16 px.
- **Rayons** : 8 px (puces, Suivre) · 10 px (boutons, champs, pochettes) · 12 à 14 px (cartes, encarts) · rond (avatars, photos d'artistes, pastille ×).
- **Contour** : `--line` = `2px solid var(--color-ink)`.
- **Ombres franches** : `--shadow-hard` (4 px 4 px) et `--shadow-hard-sm` (3 px 3 px). Les ombres floues (`--shadow-md`…) sont réservées aux cas où l'élément flotte vraiment au-dessus de la page (pochette du jeu, fenêtres).
- **Transitions** : `--transition-fast` (150 ms) pour les survols, `--transition-base` (250 ms) pour les ouvertures.

---

## 5. Mise en page

- **Ordinateur** (plus de 900 px) : barre latérale de 300 px à gauche (`Sidebar.astro`), contenu à droite, barre du haut (`TopBar.astro`).
- **Téléphone** (900 px et moins) : plus de barre latérale. Barre de navigation en bas (`BottomNav.astro`), en aplat d'encre.
- **Navigation** (`src/lib/nav.ts`, partagée par les deux) : **Sorties · Barz · ＋ Noter · Jeux · Moi**. Le ＋ ouvre la fenêtre de notation (`NoteSheet.astro`).
- **Point de rupture principal : 900 px.** On l'utilise partout où c'est possible. D'autres seuils (760, 700, 640…) existent pour des cas précis.
- **Carrousel** : sur téléphone, une grille de vignettes ou d'artistes avec la classe `.bz-rail` devient une rangée qui défile sur le côté (42 % de largeur par vignette, 30 % par artiste, 22 % en version `--compact`).
- Les pages se placent dans `.bz-page`.

---

## 6. Composants

### Briques CSS (`barz.css`)

| Classe | Rôle |
|---|---|
| `.bz-btn` | Bouton : contour 2 px, coins de 10 px, Unbounded en capitales. Au survol, il se décale et une ombre franche apparaît. |
| `.bz-btn--lime` | Bouton principal, en accent. Le nom date de l'ancien thème lime : la couleur est maintenant le bleu. |
| `.bz-btn--ink` | Bouton noir (encre). |
| `.bz-btn--outline` | Bouton secondaire, fond papier. |
| `.bz-btn--small` | Plus petit. |
| `.bz-chip` / `.is-active` | Puce de filtre (genres, types) ; active = fond d'accent. |
| `.bz-listen` | Bouton « Écouter » coupé en deux : action principale + menu des plateformes. |
| `.bz-cover` | Pochette encadrée. Sans image (ou si l'image casse) : un dégradé avec le titre. |
| `.bz-ctile` | Vignette album fabriquée côté navigateur (même rendu que `AlbumTile.astro`). |
| `.bz-score` | Pastille de note, en accent. |
| `.bz-artist`, `.bz-follow` | Bulle d'artiste + bouton Suivre. |
| `.barz-card` | Carte d'un Barz (avis) : contour, coins de 14 px, fond papier. |
| `.bz-input`, `.bz-field` | Champ de saisie ; au focus, un contour de 3 px en `--color-accent-line`. |
| `.bz-notice` (`--ok`, `--error`) | Message de confirmation ou d'erreur. |
| `.bz-empty` | Message « rien ici », en pointillés. |
| `.bz-section-head` | En-tête de section : titre + lien, souligné d'un trait d'encre. |
| `.bz-dismiss` | Petit × « Pas pour moi » sur une recommandation. |

`global.css` contient aussi d'anciennes classes génériques (`.btn`, `.card`, `.badge`, utilitaires `.flex`, `.mt-4`…). **Pour du neuf, préfère les briques `bz-*`.**

### Composants Astro (`src/components/`)

- `AlbumTile`, `Cover` : vignette et pochette (`srcset` géré par `src/lib/cover.ts`).
- `WeekPage` : page Sorties (les premières vignettes rendues au build, les autres complétées dans le navigateur).
- `TopBar`, `Sidebar`, `BottomNav`, `NavIcon` : coque et navigation.
- `NoteSheet` : fenêtre de notation ; `Player` : lecteur d'extraits.
- `GenreChips`, `FilTabs` : filtres et onglets.
- `PushToast`, `UpdateBanner`, `WhatsNew`, `InstallNudge`, `InstallApp` : messages et bandeaux.
- `DailyPlay`, `Scene` : jeux.

---

## 7. Ton et textes

- **En français, en tutoyant**, direct et un peu complice (« Du premier coup. Respect. »).
- **Neutre en genre** : pas de « connecté·e » ni d'accord au masculin par défaut. On reformule (« Ton compte », « Bienvenue »).
- **Jamais de faux contenu présenté comme vrai** : pas de faits inventés sur de vrais artistes, pas de données de démonstration.
- Les boutons et titres sont en capitales **par le CSS** (`text-transform`). Dans le code, on écrit le texte normalement.

---

## 8. Accessibilité

- **Zone de clic de 44 px minimum** sur téléphone (liens de vignettes, « ← retour », Plus tard, etc.). Les petits boutons comme le ♥ gardent une zone de 40 px, même si le dessin est plus petit.
- **Contraste** : les jetons de texte ont été choisis pour rester lisibles en clair comme en sombre. Ne mets pas `--color-text-dim` sur `--color-bg-surface` pour un texte important.
- **Focus visible** sur tout ce qui se clique (`:focus-visible` en accent). Ne le retire jamais.
- `[hidden]` masque toujours, même un élément en flex ou en grid (règle globale avec `!important`).
- Les icônes décoratives ont `aria-hidden="true"`, les boutons sans texte ont un `aria-label`.
- Les animations restent courtes et ne transmettent jamais d'information à elles seules.

---

## 9. Ajouter quelque chose : la liste à cocher

1. Couleurs uniquement via les jetons, et vérifié en mode sombre (Paramètres → Apparence → Sombre).
2. Texte sur l'encre → `--color-on-ink` ; sur l'accent → `--color-on-accent`.
3. Briques `bz-*` existantes avant de créer un nouveau style.
4. Testé à 375 px de large : pas de défilement horizontal, zones de clic de 44 px.
5. Point de rupture 900 px, sauf vraie raison.
6. Textes neutres en genre, tutoiement.
