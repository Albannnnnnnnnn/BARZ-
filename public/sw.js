// Service worker de BARZ¡ (appli installable).
// - Pages : le réseau d'abord (le site change deux fois par jour), sinon la dernière version vue, sinon la page hors ligne
// - Fichiers de /_astro/ (noms qui changent à chaque version), icônes : gardés en cache
// - Supabase, Spotify, Deezer… ne passent jamais par ce cache
const VERSION = 'barz-v1';
const BASE = '/BARZ-/';
const OFFLINE = `${BASE}hors-ligne/`;
const PRECACHE = [OFFLINE, `${BASE}icon-192.png`, `${BASE}favicon.png`];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || !url.pathname.startsWith(BASE)) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          if (response.ok) caches.open(VERSION).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(async () => (await caches.match(request)) ?? (await caches.match(OFFLINE)))
    );
    return;
  }

  if (url.pathname.startsWith(`${BASE}_astro/`) || /\.(png|svg|webp|woff2)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((response) => {
            const copy = response.clone();
            if (response.ok) caches.open(VERSION).then((cache) => cache.put(request, copy));
            return response;
          })
      )
    );
  }
});
