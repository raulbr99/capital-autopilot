"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AppHeader from "@/components/AppHeader";
import { DeskGlyph } from "@/components/ui";

const MESAS = [
  { href: "/forex", label: "Forex", cat: "forex", blurb: "Divisas · 24/5" },
  { href: "/crypto", label: "Crypto", cat: "crypto", blurb: "Cripto · 24/7" },
  { href: "/stocks", label: "Stocks", cat: "stocks", blurb: "Acciones US" },
  { href: "/commodities", label: "Commodities", cat: "commodities", blurb: "Materias primas" },
];

const RESTO = [
  { href: "/analytics", label: "Analítica", blurb: "Rendimiento cerrado" },
  { href: "/journal", label: "Diario del Gestor IA", blurb: "Tesis y decisiones" },
  { href: "/lab", label: "Lab", blurb: "Estrategia y validación" },
];

/**
 * Un 404 dentro de un panel de dinero no debe sentirse como una web caída. La
 * versión anterior soltaba una tarjeta en mitad de un fondo vacío: sin marca,
 * sin navegación y sin el estado de la cuenta, o sea perdiendo justo lo que la
 * cabecera única garantiza en TODAS las demás pantallas. Y los ocho destinos
 * eran texto gris en una rejilla, indistinguibles de etiquetas inertes.
 *
 * (error.tsx se queda deliberadamente sin cabecera: es la frontera que salta
 * cuando algo YA ha reventado, y no puede depender de un componente que sondea
 * la API — sería arriesgarse a fallar dentro del propio manejador del fallo.)
 */
export default function NotFound() {
  /**
   * usePathname() aquí devuelve "/_not-found", la ruta interna de Next para
   * esta pantalla: enseñaba al usuario una dirección que jamás escribió, que es
   * peor que no enseñar ninguna. La que falló solo la sabe el navegador.
   */
  const [ruta, setRuta] = useState<string | null>(null);
  useEffect(() => setRuta(window.location.pathname), []);

  return (
    <div className="min-h-screen">
      <AppHeader active="" />

      <main className="mx-auto max-w-[720px] px-5 py-12 md:px-8">
        <p className="tag">Error 404</p>
        <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-white">
          Esta página no existe
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-dim">
          {ruta ? (
            <>
              <span className="font-mono text-white [overflow-wrap:anywhere]">{ruta}</span> no
              corresponde a ninguna sección del panel.
            </>
          ) : (
            "La dirección no corresponde a ninguna sección del panel."
          )}{" "}
          El motor no se ve afectado: sigue operando en el servidor.
        </p>

        <Link
          href="/"
          className="mt-5 inline-flex rounded-lg bg-accent px-4 py-2.5 text-[13px] font-semibold text-onaccent transition-opacity hover:opacity-90"
        >
          Ir al panel de mando
        </Link>

        <p className="tag mt-8">Mesas</p>
        <nav className="mt-2 grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-industrial bg-industrial sm:grid-cols-2">
          {MESAS.map((d) => (
            <Link
              key={d.href}
              href={d.href}
              className="group flex items-center gap-3 bg-soft px-4 py-3 transition-colors hover:bg-raised"
            >
              <DeskGlyph cat={d.cat} className="h-4 w-4 shrink-0 text-muted transition-colors group-hover:text-accent" />
              <span className="min-w-0">
                <span className="block text-[13px] font-medium text-dim transition-colors group-hover:text-accent">
                  {d.label}
                </span>
                <span className="block truncate text-[11px] text-muted">{d.blurb}</span>
              </span>
            </Link>
          ))}
        </nav>

        <p className="tag mt-6">Resto del panel</p>
        <nav className="mt-2 grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-industrial bg-industrial sm:grid-cols-3">
          {RESTO.map((d) => (
            <Link
              key={d.href}
              href={d.href}
              className="group bg-soft px-4 py-3 transition-colors hover:bg-raised"
            >
              <span className="block text-[13px] font-medium text-dim transition-colors group-hover:text-accent">
                {d.label}
              </span>
              <span className="block truncate text-[11px] text-muted">{d.blurb}</span>
            </Link>
          ))}
        </nav>
      </main>
    </div>
  );
}
