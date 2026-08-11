import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Capital Autopilot",
    short_name: "Autopilot",
    description: "Bot de trading autónomo sobre Capital.com — panel en vivo",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
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
  };
}
