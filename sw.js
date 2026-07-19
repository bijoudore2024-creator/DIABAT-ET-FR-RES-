// Service Worker — Diabaté & Frères Sarl (Gestion Pharmacie)
// Permet l'installation de l'app et son fonctionnement hors-ligne.
// À chaque mise à jour du contenu de l'app, changez CACHE_VERSION
// pour forcer le rechargement du cache chez les utilisateurs.
const CACHE_VERSION = 'diabate-pharma-v1';
const CACHE_NAME = CACHE_VERSION;

// Fichiers de l'application (app shell) à mettre en cache dès l'installation.
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// Stratégie : "network first, fallback to cache" pour le HTML principal
// (pour récupérer les mises à jour de l'app dès qu'il y a du réseau),
// et "cache first, fallback to network" pour tout le reste (polices,
// scripts tiers, icônes) car ce contenu change rarement.
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const isAppHtml = url.origin === self.location.origin &&
    (url.pathname.endsWith('/') || url.pathname.endsWith('index.html'));

  if (isAppHtml) {
    event.respondWith(
      fetch(req)
        .then(res => {
          const resClone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, resClone));
          return res;
        })
        .catch(() => caches.match(req).then(cached => cached || caches.match('./index.html')))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req).then(res => {
        // Ne met en cache que les réponses valides (évite de cacher des erreurs)
        if (res && res.status === 200) {
          const resClone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, resClone));
        }
        return res;
      }).catch(() => {
        // Hors-ligne et pas en cache : rien à faire de plus, la requête échoue normalement
        // (par ex. l'appel réseau Supabase, qui n'a de toute façon pas de sens hors-ligne).
      });
    })
  );
});
