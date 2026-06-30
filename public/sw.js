/* Service worker mínimo: instalable + offline shell, sin tocar los datos en vivo. */
const CACHE = "capital-autopilot-v1";

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.add("/")).catch(() => {}));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))),
    ])
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return; // POST (tick, etc.) intacto
  const url = new URL(req.url);
  if (url.pathname.startsWith("/api/")) return; // datos SIEMPRE frescos (network)
  // Navegaciones: network-first con fallback a la home cacheada (offline)
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).catch(() => caches.match("/")));
  }
});
