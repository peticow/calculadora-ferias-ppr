// Service worker: abre o app mesmo sem sinal. API nunca vai para o cache.
const CACHE = 'cv-v2';
const SORTABLE = 'https://cdn.jsdelivr.net/npm/sortablejs@1.15.6/Sortable.min.js';
const CASCA = [
  './', 'index.html', 'css/app.css', 'manifest.webmanifest',
  'js/app.js', 'js/api.js', 'js/estado.js', 'js/ficha.js', 'js/fotos.js', 'js/util.js',
  'icons/icon.svg', 'icons/icon-192.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then(async (c) => {
      await c.addAll(CASCA);
      try {
        await c.add(SORTABLE);
      } catch {}
    }),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin && /\/(api|setup)\.php$/.test(url.pathname)) return;

  // Fotos: nomes únicos, nunca mudam → cache primeiro.
  // Vídeos: direto da rede (são grandes e o player pede trechos).
  if (/\.(mp4|mov|webm|3gp)$/i.test(url.pathname)) return;
  if (url.origin === location.origin && url.pathname.includes('/uploads/')) {
    e.respondWith(
      caches.match(req).then(
        (r) =>
          r ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copia = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copia));
            }
            return res;
          }),
      ),
    );
    return;
  }

  // Resto: rede primeiro (sempre a versão nova), cache se estiver sem sinal.
  if (url.origin !== location.origin && req.url !== SORTABLE) return;
  e.respondWith(
    fetch(req, { cache: 'no-cache' })
      .then((res) => {
        if (res.ok) {
          const copia = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copia));
        }
        return res;
      })
      .catch(async () => (await caches.match(req)) || (req.mode === 'navigate' ? caches.match('index.html') : Response.error())),
  );
});
