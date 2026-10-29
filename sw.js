// Keeps the app shell available offline and loads fast on repeat visits.
// Pages and scripts are fetched fresh when online (so new deploys show up straight away)
// and fall back to the cached copy when offline. Supabase requests are never cached.
const CACHE = 'reading-app-v1';
const SHELL = ['./', './index.html', './css/styles.css', './js/app.js', './js/api.js', './js/config.js', './js/image.js', './icons/icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
