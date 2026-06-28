"use client";

import { useEffect, useState } from "react";
import { SectionHead, StatCard, fmt, pf, pnlClass, pnlFmt } from "./ui";

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

export default function ExpectancyPanel({ className = "" }: { className?: string }) {
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
        label="EXPECTATIVA_REAL"
        right={d ? <span className="font-mono text-[11px] text-muted">{d.closed} cerrados</span> : undefined}
      />
      {children}
    </div>
  );

  if (loading) return shell(<div className="dotgrid h-44" />);

  if (!d || d.closed === 0)
    return shell(
      <div className="dotgrid p-8 text-center">
        <span className="tag">SIN_TRADES_CERRADOS_TODAVÍA</span>
        <p className="mt-2 text-xs text-muted">Se llena solo según el bot va cerrando operaciones.</p>
      </div>
    );

  const beatsBreakeven = d.breakevenWinRate != null && d.winRate >= d.breakevenWinRate;
  const positive = d.expectancy > 0.005;

  return shell(
    <>
      {/* núcleo: 4 métricas */}
      <div className="grid grid-cols-2 gap-px border-b border-industrial bg-industrial md:grid-cols-4">
        <StatCard label="WIN_RATE" value={`${d.winRate.toFixed(0)}%`} tone="accent" />
        <StatCard
          label="EXPECTANCY/TRADE"
          value={`${pnlFmt(d.expectancy)}`}
          unit="€"
          tone={positive ? "long" : d.expectancy < -0.005 ? "short" : undefined}
        />
        <StatCard label="PROFIT_FACTOR" value={pf(d.profitFactor)} tone={d.profitFactor >= 1 ? "long" : "short"} />
        <StatCard label="NET_TOTAL" value={`${pnlFmt(d.netTotal)}`} unit="€" tone={d.netTotal >= 0 ? "long" : "short"} />
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
          className={`rounded px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide ${
            beatsBreakeven ? "bg-long/15 text-long" : "bg-short/15 text-short"
          }`}
        >
          {beatsBreakeven ? "✓ con ventaja" : "✗ bajo equilibrio"}
        </span>
      </div>

      {/* proyección a la frecuencia observada */}
      <div className="border-t border-industrial p-5">
        <p className="tag mb-3">
          PROYECCIÓN · a tu ritmo de {d.tradesPerWeek.toFixed(1)} trades/sem
        </p>
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-industrial bg-industrial">
          <Proj label="POR SEMANA" eur={d.projWeek} pct={d.projWeekPct} />
          <Proj label="POR MES" eur={d.projMonth} pct={d.projMonthPct} big />
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

function Proj({ label, eur, pct, big }: { label: string; eur: number; pct: number; big?: boolean }) {
  return (
    <div className="bg-soft p-4">
      <p className="tag">{label}</p>
      <p className={`mt-1.5 font-mono ${big ? "text-2xl" : "text-xl"} font-medium tracking-tight ${pnlClass(eur)}`}>
        {pnlFmt(eur)} <span className="text-xs font-normal text-muted">€</span>
      </p>
      <p className={`mt-0.5 font-mono text-[11px] ${pnlClass(pct)}`}>{pnlFmt(pct)}%</p>
    </div>
  );
}
