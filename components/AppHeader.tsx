"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import Nav from "./Nav";
import ThemeToggle from "./ThemeToggle";
import { Clock, ConnBadge, fmt, pnlClass, pnlFmt, usePoll, useOnline } from "./ui";

type Live = {
  equity: number | null;
  dayPnlPct: number;
  currency: string;
  configured: boolean;
  enabled: boolean;
  /** Momento de la última lectura buena; el badge calcula la antigüedad. */
  lastOk?: number | null;
  offline?: boolean;
};

/**
 * Cabecera única de toda la app. Además de la marca y la navegación, mantiene
 * SIEMPRE a la vista el estado del dinero (equity + P&L del día) y de la
 * conexión: es lo que distingue un panel de broker de un dashboard cualquiera.
 *
 * Se alimenta sola del snapshot (GET, solo lectura) para que ninguna página
 * tenga que pasarle datos; `live` permite inyectarlos si ya se tienen.
 */
export default function AppHeader({
  active,
  right,
  live: injected,
}: {
  active: string;
  right?: ReactNode;
  live?: Partial<Live>;
}) {
  const [live, setLive] = useState<Live | null>(null);
  const [lastOk, setLastOk] = useState<number | null>(null);
  const online = useOnline();

  // Con datos inyectados por la página no se pide nada; si no, sondeo cada 30 s
  // que se detiene con la pestaña oculta (usePoll).
  usePoll(
    () => {
      if (injected) return;
      fetch("/api/bot/tick?slim=2")
        .then((r) => r.json())
        .then((d) => {
          if (d?.error) return; // el broker falló: no refrescamos lastOk
          setLastOk(Date.now());
          setLive({
            equity: d.account?.balance ?? null,
            dayPnlPct: d.dailyPnlPct ?? 0,
            currency: d.account?.currency ?? "",
            configured: d.configured ?? true,
            enabled: d.enabled ?? false,
          });
        })
        .catch(() => {
          /* la cabecera nunca rompe la página */
        });
    },
    30_000,
    [injected]
  );

  const v: Partial<Live> = injected ?? live ?? {};

  return (
    /*
      La barra sigue siendo de borde a borde —el filete inferior y el fondo
      deben cruzar la pantalla entera—, pero SU CONTENIDO se centra con el
      mismo ancho máximo que las páginas. Antes el logo iba clavado a 32 px del
      borde izquierdo mientras el contenido arrancaba mucho más adentro: medido,
      228 px de desfase a 1920 y 548 a 2560. En un panel de escritorio, que es
      donde se mira esto, la cabecera quedaba flotando despegada de aquello que
      encabeza.
    */
    <header className="sticky top-0 z-30 border-b border-industrial bg-ink/85 backdrop-blur">
      <div className="mx-auto flex h-[64px] max-w-[1400px] items-center justify-between gap-3 px-5 md:px-8">
      <div className="flex min-w-0 items-center gap-4">
        <Link href="/" className="flex shrink-0 items-center gap-2.5" aria-label="Ir al panel">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-onaccent">
            <span className="font-display text-base font-bold leading-none">A</span>
          </div>
          <span className="hidden font-display text-[15px] font-semibold leading-none tracking-tight text-white lg:block">
            Capital Autopilot
          </span>
        </Link>
        <Nav active={active} />
      </div>

      {/*
        gap-2 en móvil. Medido a 390 px en el panel: el bloque derecho ocupa 232
        de los 350 útiles y a la navegación le quedan 58, con lo que el botón que
        dice en qué sección estás mostraba "P…". En las mesas, sin el botón de
        búsqueda, le quedan 104 y cabe hasta "Commodities": el problema es de
        reparto, no de diseño.
      */}
      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        {/* Cotización de la cuenta: el dato que un broker nunca esconde */}
        {/*
          El equity estaba oculto por debajo de 640 px, así que en un móvil
          desaparecía justo el dato que la primera pasada fijó como permanente:
          cuánto hay en la cuenta. En el panel se ve igualmente en el hero, pero
          en las mesas, Analítica, Diario y Lab no había ninguna otra forma de
          saberlo sin volver atrás.
          Medido a 390 px: el contenido llena los 350 útiles, así que en móvil se
          enseña la versión corta —importe y variación del día, sin divisa— y la
          navegación cede el ancho. Puede permitírselo desde que centra sola la
          sección activa: su trabajo ahí es decir dónde estás, y eso lo sigue
          haciendo aunque se vean menos pestañas.
        */}
        {v.equity != null && (
          <div className="flex items-baseline gap-1.5 border-r border-industrial pr-1.5 sm:gap-2 sm:pr-3">
            <span className="font-mono text-[13px] font-medium tabular-nums text-white sm:text-sm">
              {fmt(v.equity)}
              <span className="hidden text-[11px] font-normal text-muted sm:inline"> {v.currency}</span>
            </span>
            <span className={`font-mono text-[10px] tabular-nums sm:text-[11px] ${pnlClass(v.dayPnlPct ?? 0)}`}>
              {pnlFmt(v.dayPnlPct ?? 0)}%
            </span>
          </div>
        )}
        {right}
        {v.configured != null && (
          <ConnBadge
            configured={!!v.configured}
            enabled={!!v.enabled}
            lastOk={injected ? injected.lastOk : lastOk}
            offline={injected ? !!injected.offline : !online}
          />
        )}
        <ThemeToggle />
        <Clock className="hidden font-mono text-sm text-white lg:block" />
      </div>
      </div>
    </header>
  );
}
