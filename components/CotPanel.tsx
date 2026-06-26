"use client";

import { useEffect, useState } from "react";

type Cot = {
  symbol: string;
  market: string;
  reportDate: string;
  net: number;
  change: number | null;
  longs: number;
  shorts: number;
  pctLong: number;
  bias: "long" | "short" | "neutral";
};
type Data = { fetchedAt: string; reportDate: string | null; forex: Cot[]; commodities: Cot[] };

const NAMES: Record<string, string> = {
  EUR: "Euro",
  GBP: "Libra",
  JPY: "Yen",
  CHF: "Franco",
  NZD: "Dólar NZ",
  USD: "Índice USD",
  GOLD: "Oro",
  SILVER: "Plata",
  OIL_CRUDE: "Crudo WTI",
  NATURALGAS: "Gas natural",
  COPPER: "Cobre",
};

function fmtK(n: number) {
  const a = Math.abs(n);
  return (n < 0 ? "−" : "+") + (a >= 1000 ? `${(a / 1000).toFixed(0)}k` : a.toFixed(0));
}

export default function CotPanel({
  category,
  className = "",
}: {
  category: "forex" | "commodities";
  className?: string;
}) {
  const [d, setD] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetch("/api/bot/cot")
      .then((r) => r.json())
      .then((x) => {
        if (alive && !x.error) setD(x);
      })
      .catch(() => {})
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  const rows = category === "forex" ? d?.forex : d?.commodities;

  return (
    <div className={`rounded-xl border border-industrial bg-soft ${className}`}>
      <div className="flex items-center justify-between border-b border-industrial px-5 py-3.5">
        <h2 className="tag">COT · posicionamiento institucional</h2>
        <span className="font-mono text-[10px] text-muted">
          {loading && !d ? "cargando…" : d?.reportDate ? `CFTC · ${d.reportDate}` : ""}
        </span>
      </div>
      <div className="space-y-2.5 p-4">
        {(rows ?? []).map((c) => {
          const long = c.bias === "long";
          const short = c.bias === "short";
          return (
            <div key={c.symbol} className="flex items-center gap-3">
              <span className="w-24 shrink-0 text-sm font-medium text-white">{NAMES[c.symbol] ?? c.symbol}</span>
              <div className="flex h-5 min-w-0 flex-1 overflow-hidden rounded bg-industrial/40" title={`${c.longs.toLocaleString()} long · ${c.shorts.toLocaleString()} short`}>
                <div className="h-full bg-long/40" style={{ width: `${c.pctLong}%` }} />
                <div className="h-full bg-short/40" style={{ width: `${100 - c.pctLong}%` }} />
              </div>
              <span className={`w-28 shrink-0 text-right font-mono text-[11px] ${long ? "text-long" : short ? "text-short" : "text-muted"}`}>
                {c.bias === "neutral" ? "neutral" : long ? "▲ net long" : "▼ net short"}
              </span>
              <span className="w-14 shrink-0 text-right font-mono text-[10px] text-muted" title="Cambio vs semana previa">
                {c.change != null ? fmtK(c.change) : ""}
              </span>
            </div>
          );
        })}
        {!loading && (!rows || rows.length === 0) && <p className="text-xs text-muted">Sin datos COT.</p>}
      </div>
      <p className="border-t border-industrial px-5 py-2.5 text-[10px] leading-relaxed text-muted">
        Net de especuladores (no-comerciales, CFTC, semanal). Dinero grande net-long = sesgo alcista; net-short = bajista.
        Δ = cambio de posición vs la semana previa (flujo).
      </p>
    </div>
  );
}
