# BARZ 🎵

> Ton calendrier des sorties musicales. Tous les vendredis, découvre les nouveaux albums, EPs et singles.

[![Deploy to GitHub Pages](https://github.com/Albannnnnnnnnn/BARZ-/actions/workflows/deploy.yml/badge.svg)](https://github.com/Albannnnnnnnnn/BARZ-/actions/workflows/deploy.yml)
[![Sync Releases](https://github.com/Albannnnnnnnnn/BARZ-/actions/workflows/sync-releases.yml/badge.svg)](https://github.com/Albannnnnnnnnn/BARZ-/actions/workflows/sync-releases.yml)

## ✨ Fonctionnalités

- **📅 Calendrier hebdomadaire interactif** — Navigue semaine par semaine, focus sur le vendredi
- **🎭 Filtres par genre** — Multi-sélection, URL partageable
- **💿 Fiches releases riches** — Cover, tracklist (Spotify), liens streaming, crédits
- **🔄 Sync automatique** — Nouvelles sorties chaque vendredi et mardi via GitHub Actions, puis redéploiement du site
- **🚀 100% gratuit** — Hébergé sur GitHub Pages, données via Supabase (free tier)

## 🛠 Stack

| Layer | Tech |
|-------|------|
| Frontend | Astro 5 + React Islands |
| Database | Supabase (PostgreSQL) |
| APIs | Deezer API + Spotify Web API |
| CI/CD | GitHub Actions |
| Hosting | GitHub Pages |

## 🚀 Démarrage rapide

### 1. Cloner et installer

```bash
git clone https://github.com/Albannnnnnnnnn/BARZ-.git
cd BARZ-
npm install
```

### 2. Configuration Supabase

1. Créer un projet sur [supabase.com](https://supabase.com)
2. Exécuter le schéma SQL dans `supabase/schema.sql` (SQL Editor)
3. Activer RLS sur toutes les tables (déjà dans le schéma)
4. Noter l'URL et les clés (anon + service_role)

### 3. Clés API externes

| Service | Où obtenir | Requis |
|---------|------------|--------|
| Deezer | Aucune clé nécessaire | ✅ (genres, fans, label, charts) |
| Spotify | [developer.spotify.com](https://developer.spotify.com) (Client ID + Secret) | Recommandé (lien d'écoute, photos d'artistes) |

Les deux sources sont fusionnées (code-barres UPC, sinon artiste + titre). Si Spotify est bloqué ou indisponible, le sync continue avec Deezer seul.

Les artistes suivis par le sync sont listés dans `scripts/artist-watchlist.json`, rangés par genre : ajoute ou retire des noms librement.

### 4. Variables d'environnement

```bash
cp .env.example .env
# Éditer .env avec vos clés
```

```env
# Supabase (Requis)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_KEY=your-service-role-key
SUPABASE_PROJECT_ID=your-project-id

# Spotify (Requis - source des sorties)
SPOTIFY_CLIENT_ID=your-spotify-client-id
SPOTIFY_CLIENT_SECRET=your-spotify-client-secret
```

### 5. Développement local

```bash
npm run dev
# → http://localhost:4321
```

### 6. Test du sync manuel

```bash
npm run sync:releases
# Vérifier dans Supabase Dashboard > Table Editor > releases
```

## 📦 Déploiement GitHub Pages

### 1. Configurer le repo

1. Push sur GitHub
2. Settings > Pages > Source: "GitHub Actions"
3. Le workflow `deploy.yml` se charge du reste

### 2. Secrets GitHub (Settings > Secrets > Actions)

| Secret | Description |
|--------|-------------|
| `SUPABASE_URL` | URL du projet Supabase |
| `SUPABASE_ANON_KEY` | Clé anon (publique) |
| `SUPABASE_SERVICE_KEY` | Clé service_role (privée) |
| `SPOTIFY_CLIENT_ID` | Client ID Spotify |
| `SPOTIFY_CLIENT_SECRET` | Client Secret Spotify |

### 3. Sync automatique

Le workflow `sync-releases.yml` s'exécute **le vendredi et le mardi à 6h UTC**. Quand il réussit, `deploy.yml` reconstruit le site : le site étant statique, c'est ce qui fait apparaître les nouvelles sorties.

Déclencher manuellement : Actions > Sync Weekly Releases > Run workflow

## 📁 Structure du projet

```
src/
├── pages/
│   ├── index.astro              # Home = calendrier semaine
│   ├── releases/
│   │   ├── index.astro          # Liste paginée
│   │   └── [slug].astro         # Fiche détaillée
│   ├── calendar.astro           # Vue mensuelle
│   ├── search.astro             # Recherche
│   └── api/releases/related.ts  # API releases liées
├── components/
│   ├── CalendarView.tsx         # Île calendrier (cœur MVP)
│   ├── ReleaseCard.tsx          # Carte album
│   ├── ReleaseGrid.tsx          # Grille responsive
│   └── GenreFilter.tsx          # Filtre multi-genres
├── layouts/
│   └── Layout.astro
├── lib/
│   ├── supabase.ts              # Clients server/browser
│   ├── releases.ts              # Sorties groupées par semaine
│   ├── api.ts                   # Wrappers MusicBrainz/Last.fm/Spotify
│   ├── utils.ts                 # Formatage dates, slugs, couleurs
│   └── types.ts                 # Types TypeScript partagés
└── styles/
    └── global.css

scripts/
├── sync-releases.ts             # Pipeline sync (Deezer + Spotify)
└── artist-watchlist.json        # Artistes suivis, par genre

.github/workflows/
├── sync-releases.yml            # Cron jeudi 18h
└── deploy.yml                   # Deploy Pages

supabase/
└── schema.sql                   # Schéma DB complet
```

## 🎨 Personnalisation

### Couleurs genres
Dans `src/lib/utils.ts` : `GENRE_COLORS`

### Types de release
Dans `src/lib/utils.ts` : `RELEASE_TYPE_LABELS`, `RELEASE_TYPE_COLORS`

### Design system
Variables CSS dans `src/styles/global.css` : `--color-accent`, `--font-sans`, etc.

## 🔧 Scripts disponibles

```bash
npm run dev              # Serveur dev
npm run build            # Build production (→ ./dist)
npm run preview          # Prévisualiser le build
npm run sync:releases    # Sync manuel des sorties
npm run sync:releases -- --reset   # Vide les sorties et artistes avant le sync
```

## 📝 TODO / Prochaines étapes

- [ ] Auth Supabase (magic link + OAuth) → "Ma spin list", "Écoutés", notes
- [ ] Profils publics + follow artistes/labels
- [ ] Mode "Sortir de ma bulle" (recommandations inversées)
- [ ] Newsletter hebdo (Supabase Edge Function + Resend)
- [ ] PWA complète (manifest, SW, install prompt)
- [ ] Recherche full-text (Meilisearch/Algolia)
- [ ] Artistes & Labels pages
- [ ] Sitemap.xml auto-généré

## 📄 Licence

MIT — Fait avec ❤️ pour la musique

---

**Données fournies par** [Deezer](https://developers.deezer.com) • [Spotify Web API](https://developer.spotify.com)