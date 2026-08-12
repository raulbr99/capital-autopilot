"use client";

import { useEffect, useState } from "react";
import { SectionHead, StatCard, fmt, pf, pnlClass, pnlFmt, pl } from "./ui";

type Exp = {
  closed: number;
  wins: number;
  losses: number;
  breakeven: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  payoff: number;
  expectancy: number;
  profitFactor: number;
  netTotal: number;
  breakevenWinRate: number | null;
  best: number;
  worst: number;
  spanDays: number;
  tradesPerWeek: number;
  equity: number;
  projWeek: number;
  projMonth: number;
  projWeekPct: number;
  projMonthPct: number;
  enough: boolean;
};

export default function ExpectancyPanel({
  className = "",
  divisa = "",
}: {
  className?: string;
  /**
   * Divisa de la cuenta. El componente llevaba un "€" escrito a fuego en la
   * proyección —y la variable se llamaba `eur`—, así que una cuenta en libras o
   * dólares habría mostrado sus importes rotulados como euros. Todo lo demás
   * del panel ya toma la divisa de la cuenta; esta esquina se quedó atrás.
   */
  divisa?: string;
}) {
  const [d, setD] = useState<Exp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetch("/api/bot/expectancy")
      .then((r) => r.json())
      .then((x) => alive && !x.error && setD(x))
      .catch(() => {})
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  const shell = (children: React.ReactNode) => (
    <div className={`overflow-hidden rounded-xl border border-industrial bg-soft ${className}`}>
      <SectionHead
        label="Expectativa real"
        right={d ? <span className="font-mono text-[11px] text-muted">{d.closed} {pl(d.closed, "cerrada", "cerradas")}</span> : undefined}
      />
      {children}
    </div>
  );

  if (loading) return shell(<div className="dotgrid h-44" />);

  if (!d || d.closed === 0)
    return shell(
      <div className="dotgrid p-8 text-center">
        <p className="text-sm font-medium text-dim">Sin operaciones cerradas todavía</p>
        <p className="mt-2 text-xs text-muted">Se llena solo según el bot va cerrando operaciones.</p>
      </div>
    );

  const beatsBreakeven = d.breakevenWinRate != null && d.winRate >= d.breakevenWinRate;
  const positive = d.expectancy > 0.005;

  return shell(
    <>
      {/* núcleo: 4 métricas */}
      <div className="grid grid-cols-2 gap-px border-b border-industrial bg-industrial md:grid-cols-4">
        <StatCard
          label="Aciertos"
          value={`${d.winRate.toFixed(0)}%`}
          unit={d.breakeven ? `+${d.breakeven} a cero` : undefined}
          tone={beatsBreakeven ? "long" : "short"}
        />
        <StatCard
          label="Por operación"
          value={`${pnlFmt(d.expectancy)}`}
          unit={divisa || undefined}
          tone={positive ? "long" : d.expectancy < -0.005 ? "short" : undefined}
        />
        <StatCard label="Profit factor" value={pf(d.profitFactor)} tone={d.profitFactor >= 1 ? "long" : "short"} />
        <StatCard label="Resultado neto" value={`${pnlFmt(d.netTotal)}`} unit={divisa || undefined} tone={d.netTotal >= 0 ? "long" : "short"} />
      </div>

      {/* mecánica: ganas X / pierdes Y → equilibrio */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3.5 text-[12.5px]">
        <span className="text-dim">
          Ganas <b className="font-mono text-long">{fmt(d.avgWin)}€</b> · pierdes{" "}
          <b className="font-mono text-short">{fmt(d.avgLoss)}€</b>
          <span className="ml-1 text-muted">(R {d.payoff.toFixed(2)}:1)</span>
        </span>
        {d.breakevenWinRate != null && (
          <span className="text-dim">
            Equilibrio en <b className="font-mono text-white">{d.breakevenWinRate.toFixed(0)}%</b> · vas al{" "}
            <b className={`font-mono ${beatsBreakeven ? "text-long" : "text-short"}`}>{d.winRate.toFixed(0)}%</b>
          </span>
        )}
        <span
          className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
            beatsBreakeven ? "bg-long/15 text-long" : "bg-short/15 text-short"
          }`}
        >
          {beatsBreakeven ? "✓ con ventaja" : "✗ bajo equilibrio"}
        </span>
      </div>

      {/* proyección a la frecuencia observada */}
      <div className="border-t border-industrial p-5">
        <p className="tag mb-3">
          Proyección · a tu ritmo de {d.tradesPerWeek.toFixed(1)} operaciones/semana
        </p>
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-industrial bg-industrial">
          <Proj label="Por semana" importe={d.projWeek} pct={d.projWeekPct} divisa={divisa} />
          <Proj label="Por mes" importe={d.projMonth} pct={d.projMonthPct} divisa={divisa} big />
        </div>
      </div>

      {/* honestidad: tamaño de muestra */}
      <div
        className={`flex items-start gap-2 border-t border-industrial px-5 py-3 text-[11px] leading-snug ${
          d.enough ? "text-muted" : "text-accent"
        }`}
      >
        <span className="mt-px">{d.enough ? "ℹ" : "⚠"}</span>
        <span>
          {d.enough
            ? "Proyección lineal a la frecuencia observada — orientativa, no una promesa."
            : `Muestra pequeña (${d.closed} de ~30 para fiarse). La proyección es muy ruidosa hasta acumular histórico.`}
        </span>
      </div>
    </>
  );
}

function Proj({
  label,
  importe,
  pct,
  divisa,
  big,
}: {
  label: string;
  importe: number;
  pct: number;
  divisa?: string;
  big?: boolean;
}) {
  return (
    <div className="bg-soft p-4">
      <p className="tag">{label}</p>
      <p className={`mt-1.5 font-mono ${big ? "text-2xl" : "text-xl"} font-medium tracking-tight ${pnlClass(importe)}`}>
        {pnlFmt(importe)}
        {divisa && <span className="ml-1 text-xs font-normal text-muted">{divisa}</span>}
      </p>
      <p className={`mt-0.5 font-mono text-[11px] ${pnlClass(pct)}`}>{pnlFmt(pct)}%</p>
    </div>
  );
}
