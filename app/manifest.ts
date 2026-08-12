import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Capital Autopilot",
    short_name: "Autopilot",
    description: "Bot de trading autónomo sobre Capital.com — panel en vivo",
    start_url: "/",
    scope: "/",
    display: "standalone",
    /**
     * NO bloquear en vertical. Esto es un panel de operativa: la tabla de
     * posiciones tiene diez columnas y los gráficos quieren ancho. Con
     * "portrait", una vez instalada como app la pantalla no gira aunque el
     * usuario gire el teléfono, así que se le impedía justamente la postura
     * en la que el blotter se lee entero — y en tablet dejaba la app en
     * vertical permanente. El diseño ya es adaptable en las dos.
     */
    orientation: "any",
    background_color: "#0B0D11",
    theme_color: "#0B0D11",
    icons: [
      // "any": el icono a sangre, que se ve entero (escritorio, pestaña).
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // "maskable": Android lo RECORTA a círculo o squircle según el lanzador,
      // así que necesita su propia versión con el dibujo dentro del 60% central.
      // Reusar el de arriba cortaba los extremos de la línea y el punto.
      { src: "/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    /**
     * Accesos directos del icono instalado (pulsación larga en Android,
     * clic derecho en escritorio). Sin ellos, una app instalada solo sabe
     * abrir la portada; con cuatro secciones fijas y cuatro mesas, entrar
     * siempre por el panel obliga a navegar a mano cada vez.
     */
    shortcuts: [
      { name: "Analítica", short_name: "Analítica", url: "/analytics" },
      { name: "Diario del Gestor IA", short_name: "Diario", url: "/journal" },
      { name: "Mesa Forex", short_name: "Forex", url: "/forex" },
      { name: "Mesa Stocks", short_name: "Stocks", url: "/stocks" },
    ],
    categories: ["finance", "productivity"],
  };
}
