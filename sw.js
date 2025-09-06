const CACHE_NAME = 'hook-mill-v1';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './db.js',
  './presets.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// During install we try to cache all assets.  Previously a single failed
// request (e.g. due to a 404 when the app is served from a sub-path) would
// reject `cache.addAll` and abort the entire install event, causing the
// "Failed to execute 'addAll' on 'Cache': Request failed" error.  To make the
// service worker more resilient we cache assets individually and ignore
// failures so the install event can still complete.
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.all(
      ASSETS.map(async asset => {
        try {
          await cache.add(asset);
        } catch (err) {
          console.warn('SW: failed to cache', asset, err);
        }
      })
    );
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then(cacheRes => {
      const fetchPromise = fetch(event.request).then(networkRes => {
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, networkRes.clone()));
        return networkRes;
      });
      return cacheRes || fetchPromise;
    })
  );
});
