const VER = 'fam-v4';
const STATIC = [
  '/family/',
  '/family/index.html',
  'https://cdn.jsdelivr.net/gh/6tail/lunar-javascript@master/lunar.js'
];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(VER).then(c => c.addAll(STATIC)));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VER).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // API requests: network only
  if (url.pathname.startsWith('/family/api/')) return;
  // Static: cache first, fallback network
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request).then(res => {
      if (res.ok) {
        const clone = res.clone();
        caches.open(VER).then(c => c.put(e.request, clone));
      }
      return res;
    }))
  );
});
