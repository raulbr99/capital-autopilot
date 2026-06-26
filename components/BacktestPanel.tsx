"use client";

import { useState } from "react";
import { SectionHead, fmt, pf, Sparkline } from "./ui";

type BTResult = {
  epic: string;
  bars: number;
  trades: number;
  wins: number;
  winRate: number;
  netPnl: number;
  returnPct: number;
  profitFactor: number;
  maxDrawdown: number;
  equityCurve: { i: number; equity: number }[];
};

export default function BacktestPanel() {
  const [loading, setLoading] = useState(false);
  const [res, setRes] = useState<BTResult[] | null>(null);
  const [agg, setAgg] = useState<any>(null);
  const [resolution, setResolution] = useState("MINUTE");
  const [err, setErr] = useState<string | null>(null);

  const run = async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch(`/api/bot/backtest?resolution=${resolution}&max=400`);
      const data = await r.json();
      if (data.configured === false) {
        setErr("Conecta tus credenciales de Capital.com para backtestear.");
        setRes(null);
      } else if (data.error) {
        setErr(data.error);
      } else {
        setRes(data.results);
        setAgg(data.aggregate);
      }
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="border border-industrial bg-soft rounded-xl">
      <SectionHead
        label="Backtest histórico"
        right={
          <div className="flex items-center gap-2">
            <select
              value={resolution}
              aria-label="Resolución de velas"
              onChange={(e) => setResolution(e.target.value)}
              className="border border-cement bg-ink px-1.5 py-0.5 font-mono text-[10px] text-dim focus:outline-none"
            >
              {["MINUTE", "MINUTE_5", "MINUTE_15", "HOUR", "DAY"].map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <button
              onClick={run}
              disabled={loading}
              className="bg-accent px-3 py-1 font-display text-[11px] text-onaccent disabled:opacity-40"
            >
              {loading ? "…" : "▶ RUN"}
            </button>
          </div>
        }
      />
      <div className="p-4">
        {err && <p className="text-xs text-short">{err}</p>}
        {!res && !err && (
          <p className="text-xs text-muted">
            Corre la estrategia actual sobre histórico de cada activo de la watchlist
            <span className="text-dim"> antes de arriesgar</span>.
          </p>
        )}
        {agg && (
          <>
            <div className="mb-2 grid grid-cols-4 gap-px border border-industrial bg-industrial text-center">
              <Cell label="TRADES" value={String(agg.trades)} />
              <Cell label="WIN_RATE" value={`${agg.winRate.toFixed(0)}%`} />
              <Cell
                label="RETORNO"
                value={`${(agg.returnPct ?? 0) >= 0 ? "+" : ""}${(agg.returnPct ?? 0).toFixed(1)}%`}
                tone={(agg.returnPct ?? 0) >= 0 ? "long" : "short"}
              />
              <Cell
                label="P&L NOCIONAL"
                value={fmt(agg.netPnl)}
                tone={agg.netPnl >= 0 ? "long" : "short"}
              />
            </div>
            <p className="mb-3 text-[10px] leading-relaxed text-muted">
              Cada trade arriesga el mismo % de un equity nocional de 1.000 € → el P&L es
              comparable entre activos (BTC ya no se dispara). El <span className="text-dim">retorno %</span> es
              la métrica fiable; el P&L nocional es solo su traducción a €.
            </p>
          </>
        )}
        {res && (
          <div className="space-y-2">
            {res.map((r) => (
              <div
                key={r.epic}
                className="flex items-center justify-between gap-3 border border-industrial bg-ink px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="font-display text-sm">{r.epic}</p>
                  <p className="font-mono text-[10px] text-muted">
                    {r.trades} trades · WR {r.winRate.toFixed(0)}% · PF {pf(r.profitFactor)} · DD {fmt(r.maxDrawdown)}
                  </p>
                </div>
                <Sparkline
                  data={r.equityCurve.map((p) => p.equity)}
                  up={r.returnPct >= 0}
                  w={120}
                  h={34}
                />
                <div className="shrink-0 text-right">
                  <span
                    className={`font-mono text-sm ${r.returnPct >= 0 ? "text-long" : "text-short"}`}
                  >
                    {r.returnPct >= 0 ? "+" : ""}
                    {r.returnPct.toFixed(1)}%
                  </span>
                  <p className="font-mono text-[10px] text-muted">
                    {r.netPnl >= 0 ? "+" : ""}
                    {fmt(r.netPnl)} €
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Cell({ label, value, tone }: { label: string; value: string; tone?: "long" | "short" }) {
  const c = tone === "long" ? "text-long" : tone === "short" ? "text-short" : "text-white";
  return (
    <div className="bg-soft py-2.5">
      <p className={`font-display text-lg ${c}`}>{value}</p>
      <p className="tag mt-0.5">{label}</p>
    </div>
  );
}
