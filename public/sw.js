/* Service worker mínimo: instalable + offline shell, sin tocar los datos en vivo. */
const CACHE = "capital-autopilot-v4";

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
  // Navegaciones: network-first, cada carga buena refresca su copia.
  //
  // Antes TODAS las rutas se guardaban bajo la misma clave "/": visitar el
  // Diario sobrescribía el caparazón de la portada, así que sin red el HTML
  // servido era el de la última página que hubieras abierto, fuese cual fuese
  // la que pedías. El router de Next lo acaba corrigiendo al hidratar, pero
  // la primera pintura era de otra pantalla. Comprobado: con /journal visitado,
  // la caché solo contenía la entrada "/".
  //
  // Ahora cada ruta se guarda con su propia petición y el respaldo va de más
  // preciso a más general: la propia ruta primero y la portada como último
  // recurso, para que una ruta nunca vista siga abriendo algo.
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copia = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copia)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match("/")))
    );
  }
});
