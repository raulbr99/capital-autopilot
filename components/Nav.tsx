"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

const GROUPS: { href: string; label: string }[][] = [
  [{ href: "/", label: "Panel" }],
  [
    { href: "/forex", label: "Forex" },
    { href: "/crypto", label: "Crypto" },
    { href: "/stocks", label: "Stocks" },
    { href: "/commodities", label: "Commodities" },
  ],
  [
    { href: "/analytics", label: "Analítica" },
    { href: "/journal", label: "Diario" },
    { href: "/lab", label: "Lab" },
  ],
];

export default function Nav({ active }: { active: string }) {
  const caja = useRef<HTMLElement | null>(null);
  const actual = useRef<HTMLSpanElement | null>(null);
  const [bordes, setBordes] = useState({ izq: false, der: false });

  const medir = useCallback(() => {
    const n = caja.current;
    if (!n) return;
    setBordes({
      izq: n.scrollLeft > 4,
      der: n.scrollWidth - n.clientWidth - n.scrollLeft > 4,
    });
  }, []);

  /**
   * Centrar la sección activa. La barra mide 531 px y en un móvil de 390 el
   * contenedor se queda en ~184: con scrollLeft en 0 solo se ven Panel, Forex
   * y Crypto, así que en Lab, Diario, Analítica, Stocks y Commodities —seis de
   * las ocho secciones— la pestaña marcada quedaba FUERA de la vista. O sea:
   * la navegación dejaba de responder a "¿dónde estoy?", que es su primer
   * trabajo, justo en el sitio donde menos pantalla hay para deducirlo.
   *
   * Se calcula a mano en vez de usar scrollIntoView() para no arrastrar
   * también el scroll vertical de la página al cargar.
   */
  useEffect(() => {
    const n = caja.current;
    const el = actual.current;
    if (n && el) {
      n.scrollLeft = Math.max(0, el.offsetLeft - (n.clientWidth - el.offsetWidth) / 2);
    }
    medir();
  }, [active, medir]);

  useEffect(() => {
    window.addEventListener("resize", medir);
    return () => window.removeEventListener("resize", medir);
  }, [medir]);

  return (
    <div className="relative min-w-0">
      <nav
        ref={caja}
        onScroll={medir}
        className="flex items-center overflow-x-auto rounded-lg border border-industrial p-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {GROUPS.map((group, gi) => (
          <div key={gi} className="flex items-center gap-0.5">
            {gi > 0 && <span className="mx-1 h-4 w-px shrink-0 bg-industrial" aria-hidden />}
            {group.map((it) => {
              const on = it.href === active;
              return on ? (
                <span
                  key={it.href}
                  ref={actual}
                  aria-current="page"
                  className="whitespace-nowrap rounded-md bg-raised px-2.5 py-2 text-[12.5px] font-medium text-white"
                >
                  {it.label}
                </span>
              ) : (
                <Link
                  key={it.href}
                  href={it.href}
                  className="whitespace-nowrap rounded-md px-2.5 py-2 text-[12.5px] font-medium text-muted transition-colors hover:text-dim"
                >
                  {it.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
      {/* Pistas de scroll: solo del lado donde queda contenido. Antes el
          degradado derecho estaba SIEMPRE, también con la barra entera a la
          vista en escritorio, y no había ninguno a la izquierda — al desplazarse
          parecía que la barra empezaba ahí. */}
      {bordes.izq && (
        <span
          className="pointer-events-none absolute inset-y-0 left-0 w-6 rounded-l-lg bg-gradient-to-r from-ink to-transparent"
          aria-hidden
        />
      )}
      {bordes.der && (
        <span
          className="pointer-events-none absolute inset-y-0 right-0 w-6 rounded-r-lg bg-gradient-to-l from-ink to-transparent"
          aria-hidden
        />
      )}
    </div>
  );
}
