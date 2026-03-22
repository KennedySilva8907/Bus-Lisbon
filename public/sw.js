const CACHE_NAME = 'bdt-cache-v1';
const STOPS_URL = 'https://api.carrismetropolitana.pt/stops';

// Pre-cache stops data on install
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.add(STOPS_URL))
      .catch(() => {}) // Silently fail if offline during install
  );
  self.skipWaiting();
});

// Clean old caches on activate
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Network-first strategy for API calls, cache-first for tiles
self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  // Stops endpoint: network-first with cache fallback
  if (url === STOPS_URL) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Map tiles: cache-first (they rarely change)
  if (url.includes('basemaps.cartocdn.com')) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        });
      })
    );
    return;
  }
});
