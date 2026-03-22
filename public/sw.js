const CACHE_NAME = 'bdt-cache-v2';
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

  // Vehicles endpoint: always fetch from network (realtime data)
  if (url.includes('/v2/vehicles')) {
    return; // Let the browser handle it normally (no caching for realtime)
  }

  // Map tiles: cache-first (they rarely change)
  if (url.includes('basemaps.cartocdn.com') || url.includes('mt1.google.com') || url.includes('mt2.google.com') || url.includes('mt3.google.com')) {
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
