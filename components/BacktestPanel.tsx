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
              className="bg-volt px-3 py-1 font-display text-[11px] text-ink disabled:opacity-40"
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
          <div className="mb-3 grid grid-cols-3 gap-px border border-industrial bg-industrial text-center">
            <Cell label="TRADES" value={String(agg.trades)} />
            <Cell label="WIN_RATE" value={`${agg.winRate.toFixed(0)}%`} />
            <Cell
              label="NET_PNL"
              value={fmt(agg.netPnl)}
              tone={agg.netPnl >= 0 ? "long" : "short"}
            />
          </div>
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
                  up={r.netPnl >= 0}
                  w={120}
                  h={34}
                />
                <span
                  className={`font-mono text-sm ${r.netPnl >= 0 ? "text-long" : "text-short"}`}
                >
                  {r.netPnl >= 0 ? "+" : ""}
                  {fmt(r.netPnl)}
                </span>
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
