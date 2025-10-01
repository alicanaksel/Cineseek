/**
 * Service Worker:
 * - Cache-first for static assets for quick loads
 * - Network-first (with cache fallback) for /api/* responses
 */
const STATIC_CACHE = 'static-v1';
const API_CACHE = 'api-v1';

const STATIC_ASSETS = [
  '/', '/static/css/main.css', '/static/js/app.js',
  '/static/img/no-poster.svg',
  '/static/logo/cineseek-icon-192.png',
  '/static/logo/cineseek-icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(STATIC_CACHE).then(c => c.addAll(STATIC_ASSETS)));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // JSON APIs: network-first, fallback to cached response if offline
  if (url.pathname.startsWith('/api/')) {
    e.respondWith((async ()=>{
      try {
        const res = await fetch(e.request);
        const cache = await caches.open(API_CACHE);
        cache.put(e.request, res.clone());
        return res;
      } catch {
        const hit = await caches.match(e.request);
        return hit || new Response(JSON.stringify({results: []}), {headers:{'Content-Type':'application/json'}});
      }
    })());
    return;
  }

  // Static assets: cache-first
  if (STATIC_ASSETS.includes(url.pathname)) {
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
  }
});
