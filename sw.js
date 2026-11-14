// Service worker: εγκατάσταση, λειτουργία χωρίς ίντερνετ, αποθήκευση τελευταίων δεδομένων
const CACHE = 'jarvis-v56';
const DATA = 'jarvis-data-v1';
const FONTS = 'jarvis-fonts-v1';
const SHELL = ['./', './index.html', './style.css', './app.js', './features.js', './life.js', './extra.js', './work.js', './report.js', './backup.js', './voice.js', './native.js', './offline.js', './understand.js', './proactive.js', './smart.js', './phone.js', './wisdom.js', './radio.js', './health.js', './calendar.js', './manifest.json', './icons/icon-192.png', './icons/icon-512.png'];
// Υπηρεσίες των οποίων την τελευταία απάντηση κρατάμε για χρήση χωρίς σύνδεση
const API_HOSTS = ['api.open-meteo.com', 'geocoding-api.open-meteo.com', 'el.wikipedia.org', 'site.api.espn.com', 'api-live.euroleague.net', 'open.er-api.com', 'api.rss2json.com', 'router.project-osrm.org', 'api.mymemory.translated.net', 'api.themoviedb.org'];
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];
const MAX_DATA = 200;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  const keep = [CACHE, DATA, FONTS];
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => !keep.includes(k)).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

const timeout = (ms) => new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms));
async function trim(name) { const c = await caches.open(name); const keys = await c.keys(); for (let i = 0; i < keys.length - MAX_DATA; i++) await c.delete(keys[i]); }

// Πρώτα δίκτυο (με όριο χρόνου), αλλιώς η τελευταία αποθηκευμένη απάντηση
async function networkFirst(req, cacheName, ms, fresh) {
  const cache = await caches.open(cacheName);
  try {
    // fresh: έλεγχος στον server κάθε φορά, ώστε οι ενημερώσεις της εφαρμογής να φτάνουν αμέσως
    const res = await Promise.race([fresh ? fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }) : fetch(req), timeout(ms)]);
    if (res && res.ok) cache.put(req, res.clone()).then(() => cacheName === DATA && trim(DATA));
    return res;
  } catch (err) {
    const hit = await cache.match(req, { ignoreVary: true });
    if (hit) return hit;
    throw err;
  }
}
// Πρώτα από τη μνήμη (γραμματοσειρές που δεν αλλάζουν)
async function cacheFirst(req) {
  const cache = await caches.open(FONTS); const hit = await cache.match(req); if (hit) return hit;
  const res = await fetch(req); if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone()); return res;
}

self.addEventListener('fetch', (e) => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) e.respondWith(networkFirst(req, CACHE, 4000, true).catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('./index.html'))));
  else if (FONT_HOSTS.includes(url.hostname)) e.respondWith(cacheFirst(req));
  else if (API_HOSTS.includes(url.hostname)) e.respondWith(networkFirst(req, DATA, 7000));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then((cs) => (cs[0] ? cs[0].focus() : self.clients.openWindow('./'))));
});
