/* จดสลิป service worker: offline app shell + offline slip reader */
const VERSION = 'jodslip-v0.1.8';
const SHELL = ['./', './index.html', './app.js', './parser.js', './manifest.webmanifest',
  './icon-maskable-512.png', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];
const VENDOR_CACHE = 'jodslip-vendor-v1';

// Same-origin ./vendor/* paths are served from these CDNs and cached forever,
// so the slip reader works offline after the first download.
const TJS = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/';
const CORE = 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5/';
function vendorSources(name) {
  if (name === 'tesseract.min.js' || name === 'worker.min.js') return [TJS + name];
  if (name === 'jsQR.js') return ['https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js'];
  let m = /^core\/(.+)$/.exec(name);
  if (m) return [CORE + m[1]];
  m = /^lang\/([a-z_]+)\.traineddata\.gz$/.exec(name);
  if (m) return [
    `https://cdn.jsdelivr.net/npm/@tesseract.js-data/${m[1]}/4.0.0_best_int/${m[1]}.traineddata.gz`,
    `https://tessdata.projectnaptha.com/4.0.0_best_int/${m[1]}.traineddata.gz`,
    `https://tessdata.projectnaptha.com/4.0.0/${m[1]}.traineddata.gz`,
  ];
  return null;
}
const TYPES = { js: 'text/javascript', gz: 'application/gzip', wasm: 'application/wasm' };

self.addEventListener('install', (e) => {
  // cache: 'reload' skips the browser's HTTP cache, so a new version never installs stale files
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('jodslip-v') && k !== VERSION) await caches.delete(k);
    await self.clients.claim();
  })());
});

async function vendor(req, name) {
  const cache = await caches.open(VENDOR_CACHE);
  const hit = await cache.match(req.url);
  if (hit) return hit;
  const srcs = vendorSources(name);
  if (!srcs) return new Response('not found', { status: 404 });
  let last;
  for (const url of srcs) {
    try {
      const r = await fetch(url, { mode: 'cors', credentials: 'omit' });
      if (!r.ok) { last = r; continue; }
      const ext = (name.split('.').pop() || '').toLowerCase();
      const body = await r.arrayBuffer();
      const res = new Response(body, { status: 200, headers: { 'Content-Type': TYPES[ext] || r.headers.get('Content-Type') || 'application/octet-stream' } });
      await cache.put(req.url, res.clone());
      return res;
    } catch (err) { last = err; }
  }
  return new Response('offline', { status: 503 });
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);

  // Android share target: banking app → share slip → this app
  if (req.method === 'POST' && url.origin === location.origin && url.pathname.endsWith('/share')) {
    e.respondWith((async () => {
      try {
        const form = await req.formData();
        const files = form.getAll('slips');
        const c = await caches.open('jodslip-share');
        let i = 0;
        for (const f of files) await c.put(new Request(`./shared/${Date.now()}-${i++}.img`), new Response(f, { headers: { 'Content-Type': f.type || 'image/jpeg' } }));
      } catch (err) { /* ignore */ }
      return Response.redirect('./?shared=1', 303);
    })());
    return;
  }
  if (req.method !== 'GET') return;

  const scope = new URL(self.registration.scope);
  if (url.origin === location.origin && url.pathname.startsWith(scope.pathname + 'vendor/')) {
    e.respondWith(vendor(req, url.pathname.slice((scope.pathname + 'vendor/').length)));
    return;
  }

  // Google Fonts: cache-first so Thai font works offline
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith((async () => {
      const c = await caches.open(VENDOR_CACHE);
      const hit = await c.match(req);
      if (hit) return hit;
      try { const r = await fetch(req); if (r.ok || r.type === 'opaque') c.put(req, r.clone()); return r; } catch (err) { return new Response('', { status: 503 }); }
    })());
    return;
  }

  if (url.origin === location.origin) {
    // app shell: network first, revalidating with GitHub instead of trusting the browser's
    // ~10-minute HTTP cache, so a new version shows up on the next open; cache is the offline fallback
    e.respondWith((async () => {
      const c = await caches.open(VERSION);
      try {
        const r = req.mode === 'navigate' ? await fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }) : await fetch(req, { cache: 'no-cache' });
        if (r.ok) c.put(req, r.clone());
        return r;
      } catch (err) {
        return (await c.match(req, { ignoreSearch: true })) || (req.mode === 'navigate' ? c.match('./index.html') : new Response('', { status: 503 }));
      }
    })());
  }
});
