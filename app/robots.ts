import type { MetadataRoute } from "next";

/**
 * Ningún rastreador, ninguna ruta. Ver el comentario de `robots` en layout.tsx:
 * el meta va en el HTML, pero un robots.txt lo dice ANTES de pedir la página,
 * que es lo que respetan los rastreadores que no ejecutan JavaScript.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", disallow: "/" }],
  };
}
