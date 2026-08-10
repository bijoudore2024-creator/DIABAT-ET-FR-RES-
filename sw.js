// ============================================================
// Service Worker - Pharmacie Diabaté & Frères
// Mode hors-ligne (cache-first pour l'app shell)
// ============================================================

const CACHE_VERSION = 'diabate-v1';
const CACHE_NAME = `pharmacie-diabate-${CACHE_VERSION}`;

// Fichiers de l'app shell à mettre en cache dès l'installation
const APP_SHELL = [
    './',
    './index.html',
    './manifest.json',
    './icon-192.png',
    './icon-512.png',
    './icon-512-maskable.png'
];

// ---------- Installation : mise en cache de l'app shell ----------
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(APP_SHELL))
            .then(() => self.skipWaiting())
    );
});

// ---------- Activation : nettoyage des anciens caches ----------
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(
                keys
                    .filter((key) => key.startsWith('pharmacie-diabate-') && key !== CACHE_NAME)
                    .map((key) => caches.delete(key))
            )
        ).then(() => self.clients.claim())
    );
});

// ---------- Stratégie de fetch ----------
self.addEventListener('fetch', (event) => {
    const req = event.request;
    const url = new URL(req.url);

    // On ne gère que les requêtes GET
    if (req.method !== 'GET') return;

    // Ne jamais intercepter/cacher les appels Firebase / Google APIs
    // (auth, firestore, storage) : ils doivent passer en direct sur le réseau
    // et échouer naturellement si hors-ligne, sans casser l'app.
    const isFirebase =
        url.hostname.includes('firebaseio.com') ||
        url.hostname.includes('firestore.googleapis.com') ||
        url.hostname.includes('googleapis.com') ||
        url.hostname.includes('gstatic.com') ||
        url.hostname.includes('firebaseapp.com') ||
        url.hostname.includes('firebasestorage.googleapis.com');

    if (isFirebase) {
        // Laisser passer directement au réseau, pas de cache
        return;
    }

    // Pour l'app shell et ressources same-origin : cache-first,
    // avec mise à jour silencieuse du cache en arrière-plan (stale-while-revalidate)
    if (url.origin === self.location.origin) {
        event.respondWith(
            caches.match(req).then((cachedResponse) => {
                const fetchPromise = fetch(req)
                    .then((networkResponse) => {
                        if (networkResponse && networkResponse.status === 200) {
                            const clone = networkResponse.clone();
                            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
                        }
                        return networkResponse;
                    })
                    .catch(() => cachedResponse); // pas de réseau -> on garde le cache

                return cachedResponse || fetchPromise;
            })
        );
        return;
    }

    // Autres ressources externes (polices, CDN divers) : network-first avec fallback cache
    event.respondWith(
        fetch(req)
            .then((networkResponse) => {
                const clone = networkResponse.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
                return networkResponse;
            })
            .catch(() => caches.match(req))
    );
});
