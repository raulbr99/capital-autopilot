"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusTrap, useReturnFocus } from "./ui";

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

/**
 * Cuánto margen dejar a la izquierda de la pestaña activa al encuadrarla.
 *
 * Centrarla es lo deseable, pero si es MÁS ANCHA que la barra visible el
 * cálculo daba negativo y desplazaba de más: en un iPhone SE, "Commodities"
 * (99 px) dentro de una barra de 89 se leía cortada por los DOS lados. Con el
 * margen a cero queda pegada al principio y solo se pierde la cola, que es
 * legible ("Commoditie…") en vez de ambigua.
 */
const hueco = (n: HTMLElement, el: HTMLElement) =>
  Math.max(0, (n.clientWidth - el.offsetWidth) / 2);

export default function Nav({ active }: { active: string }) {
  const caja = useRef<HTMLElement | null>(null);
  const actual = useRef<HTMLSpanElement | null>(null);
  const [bordes, setBordes] = useState({ izq: false, der: false });
  const [menu, setMenu] = useState(false);
  /**
   * El menú de navegación de móvil era la única capa de la aplicación sin
   * gestión de foco. La paleta de comandos y el modal del gráfico usan estos
   * dos ayudantes desde hace pasadas; aquí no llegaron.
   *
   * Con el menú abierto, seguir tabulando salía a la página de detrás —que está
   * tapada por la capa, así que el foco se perdía en controles invisibles— y al
   * cerrarlo el foco no volvía al botón que lo había abierto, sino al principio
   * del documento. Con teclado o con lector de pantalla, eso es perder el sitio
   * en cada navegación.
   */
  const cajaMenu = useRef<HTMLDivElement | null>(null);
  useFocusTrap(cajaMenu, menu);
  useReturnFocus(menu);

  // Escape cierra el menú móvil, como el resto de capas de la app
  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menu]);

  /**
   * Cerrar al tocar fuera.
   *
   * Antes lo hacía una capa `fixed inset-0` puesta DENTRO del menú. Y `fixed`
   * no se resuelve contra la ventana cuando un ancestro tiene transform o
   * filtro: la cabecera lleva backdrop-blur, así que esa capa se convertía en el
   * bloque contenedor de la cabecera. Medido en producción: el botón "Cerrar
   * menú" ocupaba 390×64, no la pantalla. O sea que tocar por debajo de la
   * cabecera —el 92 % de la pantalla de un teléfono, y el gesto natural para
   * descartar un menú— no cerraba nada.
   *
   * De paso desaparece un botón invisible a pantalla completa que estaba en el
   * orden del tabulador, entre el interruptor del menú y sus destinos.
   */
  useEffect(() => {
    if (!menu) return;
    const fuera = (e: PointerEvent) => {
      if (!cajaMenu.current?.contains(e.target as Node)) setMenu(false);
    };
    document.addEventListener("pointerdown", fuera);
    return () => document.removeEventListener("pointerdown", fuera);
  }, [menu]);

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
      n.scrollLeft = Math.max(0, el.offsetLeft - hueco(n, el));
    }
    medir();
  }, [active, medir]);

  /**
   * Re-centrar cuando la barra CAMBIA DE ANCHO, no solo al montar.
   *
   * El equity de la cabecera aparece cuando responde la API, uno o dos segundos
   * después de pintar: la navegación se estrecha entonces y el desplazamiento
   * calculado antes deja de mostrar la sección activa. En /analytics a 390 px
   * se veía "…ommodities" en lugar de "Analítica" — el mismo fallo que el
   * observador de la curva de equity y el del carril de decisiones: medir una
   * sola vez en un panel donde el contenido llega después.
   */
  useEffect(() => {
    const n = caja.current;
    if (!n) return;
    const recolocar = () => {
      const el = actual.current;
      if (el) n.scrollLeft = Math.max(0, el.offsetLeft - hueco(n, el));
      medir();
    };
    const obs = new ResizeObserver(recolocar);
    obs.observe(n);
    window.addEventListener("resize", medir);
    return () => {
      obs.disconnect();
      window.removeEventListener("resize", medir);
    };
  }, [medir]);

  const plano = GROUPS.flat();
  const actualItem = plano.find((i) => i.href === active);

  return (
    <>
    {/*
      MÓVIL: menú, no cinta.
      La barra completa mide 531 px. En un teléfono el contenedor se queda entre
      87 y 256 según la página, o sea entre un 52 % y un 84 % oculto, y ya he
      chocado dos veces con eso raspando píxeles de la cabecera. Una cinta que
      esconde siete de ocho destinos no es navegación: es un cajón horizontal
      que hay que descubrir arrastrando. Un botón con la sección actual y un
      desplegable con las ocho resuelve las dos preguntas —dónde estoy y a dónde
      puedo ir— sin depender del gesto.
    */}
    {/*
      min-w-0 para que ESTE bloque pueda encoger. Sin él, el botón imponía su
      ancho completo y, como el bloque de la derecha (equity, conexión, tema) es
      shrink-0, no cedía ninguno de los dos: medido a 375 px, el equity empezaba
      16 px ANTES de donde acababa el botón — se montaban el uno sobre el otro.
      Ahora la etiqueta se recorta y cada cosa ocupa su sitio.
    */}
    <div className="relative min-w-0 sm:hidden" ref={cajaMenu}>
      <button
        onClick={() => setMenu((m) => !m)}
        aria-expanded={menu}
        aria-haspopup="menu"
        className="flex min-h-[36px] w-full min-w-0 items-center gap-1.5 rounded-lg border border-industrial px-2.5 text-[12.5px] font-medium text-white"
      >
        <span className="min-w-0 flex-1 truncate text-left">{actualItem?.label ?? "Menú"}</span>
        <span className={`shrink-0 text-[9px] text-muted transition-transform ${menu ? "rotate-180" : ""}`}>▼</span>
      </button>
      {menu && (
        <>

          <div
            role="menu"
            className="absolute left-0 top-full z-50 mt-1.5 w-[190px] overflow-hidden rounded-lg border border-cement bg-soft shadow-elevated"
          >
            {GROUPS.map((grupo, gi) => (
              <div key={gi} className={gi > 0 ? "border-t border-industrial" : ""}>
                {grupo.map((it) => (
                  <Link
                    key={it.href}
                    href={it.href}
                    role="menuitem"
                    onClick={() => setMenu(false)}
                    aria-current={it.href === active ? "page" : undefined}
                    className={`block px-3.5 py-2.5 text-[13px] ${
                      it.href === active ? "bg-raised font-medium text-white" : "text-dim"
                    }`}
                  >
                    {it.label}
                  </Link>
                ))}
              </div>
            ))}
          </div>
        </>
      )}
    </div>

    <div className="relative hidden min-w-0 sm:block">
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
    </>
  );
}
