const CACHE_NAME = 'dabali-v43';
const ASSETS_TO_CACHE = [
    '/',
    'index.html',
    'style.css',
    'script.js',
    'manifest.json',
    'assets/icone_dabali.png',
    'assets/icone_dabali_192.png',
    'assets/splash_chef.webp',
    'assets/maggi.png',
    'assets/alloco.png',
    'assets/bottle.png',
    'assets/map_saga_panoramic.webp',
    'assets/intro.mp4',
    'assets/background_game.webp',
    'assets/background_game.png',
    'assets/icon.svg'
];

// Installation
self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return Promise.allSettled(
                ASSETS_TO_CACHE.map((url) => cache.add(url).catch((err) => console.warn('Cache error:', url, err)))
            );
        })
    );
});

// Activation (nettoyage anciens caches)
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Écouteur pour le message SKIP_WAITING envoyé depuis le client
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

// Fetch (servir le cache ou le réseau)
self.addEventListener('fetch', (event) => {
    const request = event.request;

    // Ignore non-http requests (extensions, etc.)
    if (!request.url.startsWith('http')) return;

    // Navigation (HTML pages)
    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request.url)
                .then((response) => {
                    if (response && response.status === 200) {
                        const copy = response.clone();
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put('/', copy.clone());
                            cache.put('index.html', copy);
                        });
                    }
                    return response;
                })
                .catch(() => {
                    return caches.match('/')
                        .then((res) => res || caches.match('index.html'))
                        .then((res) => res || caches.match('./index.html'));
                })
        );
        return;
    }

    if (request.destination === 'script' || request.destination === 'style') {
        event.respondWith(
            fetch(request.url, { cache: 'no-cache' })
                .then((response) => {
                    if (response && response.status === 200) {
                        const copy = response.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
                    }
                    return response;
                })
                .catch(() => caches.match(request))
        );
        return;
    }

    event.respondWith(
        caches.match(request).then((response) => {
            if (response) return response;
            return fetch(request).catch(() => null);
        })
    );
});
