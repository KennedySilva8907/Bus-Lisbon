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

// ── Push notifications ──────────────────────────────────────
// Backend POSTs JSON via the web-push protocol; we render the notification.
// Expected payload shape:
//   { title, body, tag, stopId, vehicleId, lineId, url }

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = {}; }

  const title = data.title || '🚌 Autocarro a chegar';
  const body  = data.body  || 'O teu autocarro está próximo.';
  const tag   = data.tag   || `bus-${data.vehicleId || ''}-${data.stopId || ''}`;

  const options = {
    body,
    tag,                     // collapses repeated alerts for same bus/stop
    renotify: true,
    icon: '/icon-512.png',
    badge: '/icon-512.png',
    vibrate: [200, 100, 200],
    data: {
      url: data.url || '/',
      stopId: data.stopId,
      vehicleId: data.vehicleId,
      lineId: data.lineId,
      patternId: data.patternId,
    },
  };

  event.waitUntil((async () => {
    await self.registration.showNotification(title, options);
    // Tell every open client (tab/window) that this alert just fired so the
    // bell badge can update without waiting for a backend refresh.
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of all) {
      client.postMessage({
        type: 'alert-fired',
        payload: {
          vehicleId: data.vehicleId,
          stopId: data.stopId,
          lineId: data.lineId,
        },
      });
    }
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    // Focus an existing window if one is already open on our origin
    for (const client of all) {
      if ('focus' in client) {
        client.postMessage({ type: 'open-alert-target', payload: event.notification.data });
        return client.focus();
      }
    }
    if (self.clients.openWindow) {
      return self.clients.openWindow(targetUrl);
    }
  })());
});
