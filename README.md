# BARZ 🎵

> Ton calendrier des sorties musicales. Tous les vendredis, découvre les nouveaux albums, EPs et singles.

[![Deploy to GitHub Pages](https://github.com/alban/BARZ/actions/workflows/deploy.yml/badge.svg)](https://github.com/alban/BARZ/actions/workflows/deploy.yml)
[![Sync Releases](https://github.com/alban/BARZ/actions/workflows/sync-releases.yml/badge.svg)](https://github.com/alban/BARZ/actions/workflows/sync-releases.yml)

## ✨ Fonctionnalités

- **📅 Calendrier hebdomadaire interactif** — Navigue semaine par semaine, focus sur le vendredi
- **🎭 Filtres par genre** — Multi-sélection, URL partageable
- **💿 Fiches releases riches** — Cover, tracklist (Spotify), liens streaming, crédits
- **🔄 Sync automatique** — Nouvelles sorties chaque jeudi via GitHub Actions
- **🚀 100% gratuit** — Hébergé sur GitHub Pages, données via Supabase (free tier)

## 🛠 Stack

| Layer | Tech |
|-------|------|
| Frontend | Astro 5 + React Islands |
| Database | Supabase (PostgreSQL) |
| APIs | MusicBrainz, Last.fm, Spotify Web API |
| CI/CD | GitHub Actions |
| Hosting | GitHub Pages |

## 🚀 Démarrage rapide

### 1. Cloner et installer

```bash
git clone https://github.com/alban/BARZ.git
cd BARZ
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
| MusicBrainz | Pas de clé, juste User-Agent | ✅ |
| Last.fm | [last.fm/api](https://www.last.fm/api) | ✅ |
| Spotify | [developer.spotify.com](https://developer.spotify.com) | Optionnel |

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

# MusicBrainz (Requis)
MUSICBRAINZ_USER_AGENT=BARZ/1.0 (your-email@example.com)

# Last.fm (Requis)
LASTFM_API_KEY=your-lastfm-api-key

# Spotify (Optionnel - pour tracklist, durées, URLs)
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
| `LASTFM_API_KEY` | Clé Last.fm |
| `SPOTIFY_CLIENT_ID` | Client ID Spotify (optionnel) |
| `SPOTIFY_CLIENT_SECRET` | Client Secret Spotify (optionnel) |
| `MUSICBRAINZ_EMAIL` | Email pour User-Agent MusicBrainz |

### 3. Sync automatique

Le workflow `sync-releases.yml` s'exécute **chaque jeudi 18h UTC** (19h/20h FR) pour avoir les données fraîches pour le vendredi.

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
│   ├── api.ts                   # Wrappers MusicBrainz/Last.fm/Spotify
│   ├── utils.ts                 # Formatage dates, slugs, couleurs
│   └── types.ts                 # Types TypeScript partagés
└── styles/
    └── global.css

scripts/
└── sync-releases.ts             # Pipeline sync hebdo

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
npm run sync:artists     # Sync artistes (à implémenter)
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

**Données fournies par** [MusicBrainz](https://musicbrainz.org) • [Last.fm](https://last.fm) • [Spotify Web API](https://developer.spotify.com)