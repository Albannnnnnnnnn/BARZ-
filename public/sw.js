// Service worker de BARZ¡ (appli installable).
// - Pages : le réseau d'abord (le site change deux fois par jour), sinon la dernière version vue, sinon la page hors ligne
// - Fichiers de /_astro/ (noms qui changent à chaque version), icônes : gardés en cache
// - Supabase, Spotify, Deezer… ne passent jamais par ce cache
// - Notifications (supabase/functions/notify) : bandeau dans l'appli si elle est ouverte, sinon notification du téléphone ;
//   au clic, ouverture de la bonne page
const VERSION = 'barz-v2';
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
      // no-cache : revalide auprès de GitHub Pages (sinon son cache de 10 min ressert l'ancienne version)
      fetch(request, { cache: 'no-cache' })
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

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  const message = { type: 'barz-push', title: data.title || 'BARZ¡', body: data.body || '', url: data.url || BASE };
  const notify = () =>
    self.registration.showNotification(message.title, {
      body: message.body,
      icon: `${BASE}icon-192.png`,
      badge: `${BASE}favicon.png`,
      tag: data.tag || 'barz',
      data: { url: message.url },
    });
  // Appli ouverte et visible : bandeau dans l'appli (src/components/PushToast.astro) plutôt qu'une notification du téléphone.
  // Sur iPhone et iPad, Apple exige une notification à chaque envoi (sinon il coupe l'abonnement) : les deux.
  const apple = /iphone|ipad|ipod|macintosh/i.test(self.navigator.userAgent) && !/chrome|android/i.test(self.navigator.userAgent);
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const visible = windows.filter((w) => w.visibilityState === 'visible' && w.url.startsWith(self.location.origin + BASE));
      visible.forEach((w) => w.postMessage(message));
      // La notification de test (Paramètres) s'affiche toujours sur le téléphone : c'est elle qu'on veut vérifier
      return visible.length && !apple && data.tag !== 'test' ? undefined : notify();
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || BASE, self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => w.url.startsWith(self.location.origin + BASE));
      if (open) return open.navigate(target).then((w) => (w || open).focus());
      return self.clients.openWindow(target);
    })
  );
});
