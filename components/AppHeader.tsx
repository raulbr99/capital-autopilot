"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import Nav from "./Nav";
import ThemeToggle from "./ThemeToggle";
import { Clock, ConnBadge, fmt, pnlClass, pnlFmt, usePoll } from "./ui";

type Live = {
  equity: number | null;
  dayPnlPct: number;
  currency: string;
  configured: boolean;
  enabled: boolean;
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

  // Con datos inyectados por la página no se pide nada; si no, sondeo cada 30 s
  // que se detiene con la pestaña oculta (usePoll).
  usePoll(
    () => {
      if (injected) return;
      fetch("/api/bot/tick")
        .then((r) => r.json())
        .then((d) =>
          setLive({
            equity: d.account?.balance ?? null,
            dayPnlPct: d.dailyPnlPct ?? 0,
            currency: d.account?.currency ?? "",
            configured: d.configured ?? true,
            enabled: d.enabled ?? false,
          })
        )
        .catch(() => {
          /* la cabecera nunca rompe la página */
        });
    },
    30_000,
    [injected]
  );

  const v: Partial<Live> = injected ?? live ?? {};

  return (
    <header className="sticky top-0 z-30 flex h-[64px] items-center justify-between gap-3 border-b border-industrial bg-ink/85 px-5 backdrop-blur md:px-8">
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

      <div className="flex shrink-0 items-center gap-3">
        {/* Cotización de la cuenta: el dato que un broker nunca esconde */}
        {v.equity != null && (
          <div className="hidden items-baseline gap-2 border-r border-industrial pr-3 sm:flex">
            <span className="font-mono text-sm font-medium tabular-nums text-white">
              {fmt(v.equity)} <span className="text-[11px] font-normal text-muted">{v.currency}</span>
            </span>
            <span className={`font-mono text-[11px] tabular-nums ${pnlClass(v.dayPnlPct ?? 0)}`}>
              {pnlFmt(v.dayPnlPct ?? 0)}%
            </span>
          </div>
        )}
        {right}
        {v.configured != null && <ConnBadge configured={!!v.configured} enabled={!!v.enabled} />}
        <ThemeToggle />
        <Clock className="hidden font-mono text-sm text-white lg:block" />
      </div>
    </header>
  );
}
