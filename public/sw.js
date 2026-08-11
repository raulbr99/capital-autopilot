/* Service worker mínimo: instalable + offline shell, sin tocar los datos en vivo. */
const CACHE = "capital-autopilot-v3";

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

  // Recursos de Next (/_next/static): llevan hash en el nombre, así que su
  // contenido nunca cambia -> cache-first. Sin esto, offline llegaba el HTML
  // pero NO el JavaScript: se veía un cascarón estático sin app dentro.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icon")) {
    e.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res && res.ok) {
              const copia = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copia)).catch(() => {});
            }
            return res;
          })
      )
    );
    return;
  }
  // Navegaciones: network-first con fallback al caparazón cacheado.
  // CLAVE: cada carga buena REFRESCA la copia. Antes solo se guardaba al
  // instalar el SW, así que sin red se servía un caparazón congelado de días
  // atrás — con avisos y arreglos que la versión offline nunca llegaba a ver.
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copia = res.clone();
            caches.open(CACHE).then((c) => c.put("/", copia)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match("/"))
    );
  }
});
