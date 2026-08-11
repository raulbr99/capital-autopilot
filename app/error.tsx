"use client";

import Link from "next/link";
import { useEffect } from "react";

/**
 * Frontera de error por ruta. Sin esto, una excepción en cualquier componente
 * deja la pantalla EN BLANCO — y en un panel de dinero real eso significa
 * perder la vista de las posiciones y el botón de cerrarlas. Aquí al menos
 * queda una salida y la ruta directa al broker.
 */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Fallo en la interfaz:", error);
  }, [error]);

  return (
    <div className="grid min-h-screen place-items-center px-5">
      <div className="w-full max-w-md rounded-xl border border-industrial bg-soft p-6">
        <p className="tag">Error de interfaz</p>
        <h1 className="mt-3 font-display text-2xl font-semibold tracking-tight text-white">
          Esta pantalla no se ha podido dibujar
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-dim">
          El fallo es de la interfaz, no del motor:{" "}
          <span className="text-white">el bot sigue operando con normalidad</span> en el servidor y tus
          posiciones y stops no se ven afectados.
        </p>

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            onClick={reset}
            className="rounded-lg bg-accent px-4 py-2.5 text-[13px] font-semibold text-onaccent transition-opacity hover:opacity-90"
          >
            Reintentar
          </button>
          <Link
            href="/"
            className="rounded-lg border border-cement px-4 py-2.5 text-[13px] font-medium text-dim transition-colors hover:border-accent hover:text-accent"
          >
            Ir al panel
          </Link>
          <a
            href="https://capital.com"
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border border-cement px-4 py-2.5 text-[13px] font-medium text-muted transition-colors hover:text-dim"
          >
            Abrir Capital.com
          </a>
        </div>

        <p className="mt-4 border-t border-industrial pt-3 font-mono text-[10px] leading-relaxed text-muted [overflow-wrap:anywhere]">
          {error.message}
          {error.digest ? ` · ${error.digest}` : ""}
        </p>
      </div>
    </div>
  );
}
