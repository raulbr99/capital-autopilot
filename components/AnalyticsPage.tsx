"use client";

import { useEffect, useMemo, useState } from "react";
import type { TradeRecord, DeskCategory } from "./types";
import { analyze } from "./analytics-util";
import { fmt, pf, pnlFmt, pnlClass, SectionHead } from "./ui";
import EquityChart from "./EquityChart";
import AppHeader from "./AppHeader";

const DESK_OF: Record<string, DeskCategory> = {
  NZDUSD: "forex", EURUSD: "forex", GBPJPY: "forex", EURJPY: "forex", USDCHF: "forex",
  BTCUSD: "crypto", ETHUSD: "crypto",
  AAPL: "stocks", NVDA: "stocks", TSLA: "stocks", MSFT: "stocks", AMZN: "stocks",
  GOLD: "commodities", SILVER: "commodities", OIL_CRUDE: "commodities", NATURALGAS: "commodities", COPPER: "commodities",
};
const DESK_FILTERS = [
  { key: "", label: "Todas" },
  { key: "forex", label: "Forex" },
  { key: "crypto", label: "Crypto" },
  { key: "stocks", label: "Stocks" },
  { key: "commodities", label: "Commodities" },
];

export default function AnalyticsPage() {
  const [trades, setTrades] = useState<TradeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [epic, setEpic] = useState<string>("");
  const [desk, setDesk] = useState<string>("");

  useEffect(() => {
    const load = async () => {
      try {
        const r = await fetch("/api/bot/trades");
        const d = await r.json();
        setTrades(d.trades || []);
      } catch {
        /* */
      } finally {
        setLoading(false);
      }
    };
    load();
    const t1 = setInterval(load, 20000);
    return () => clearInterval(t1);
  }, []);

  const epics = useMemo(
    () => Array.from(new Set(trades.map((t) => t.epic))).sort(),
    [trades]
  );

  const filtered = useMemo(
    () => trades.filter((t) => (!epic || t.epic === epic) && (!desk || DESK_OF[t.epic] === desk)),
    [trades, epic, desk]
  );

  const a = useMemo(() => analyze(filtered), [filtered]);
  const closedTrades = filtered
    .filter((t) => t.status === "closed")
    .sort((x, y) => (y.closedTs || y.ts) - (x.closedTs || x.ts));
  const markers = a.pnlCurve.map((p) => ({ ts: p.ts, dir: "BUY" as const, pnl: 0 }));

  return (
    <div className="min-h-screen">
      <AppHeader active="/analytics" />

      <main className="mx-auto max-w-[1400px] px-5 py-6 md:px-8">
        {/* título + filtros */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight text-white">Analítica</h1>
            <p className="mt-1 text-sm text-dim">
              Rendimiento de {a.closed} operaciones cerradas{epic && ` · ${epic}`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap gap-1">
              {DESK_FILTERS.map((f) => (
                <button
                  key={f.key}
                  onClick={() => setDesk(f.key)}
                  className={`rounded-md px-2.5 py-1.5 text-[12px] font-medium transition-colors ${
                    desk === f.key ? "bg-accent text-onaccent" : "border border-industrial text-muted hover:text-dim"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <select
              value={epic}
              onChange={(e) => setEpic(e.target.value)}
              aria-label="Filtrar por instrumento"
              className="rounded-lg border border-cement bg-base px-3 py-2 font-mono text-[12px] text-dim focus:border-accent focus:outline-none"
            >
              <option value="">Todos los activos</option>
              {epics.map((e) => (
                <option key={e} value={e}>{e}</option>
              ))}
            </select>
          </div>
        </div>

        {loading ? (
          <p className="mt-10 text-center text-sm text-muted">Cargando…</p>
        ) : a.closed === 0 ? (
          <div className="mt-6 rounded-xl border border-industrial bg-soft p-16 text-center">
            <p className="text-base font-medium text-dim">Sin operaciones cerradas todavía</p>
            <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
              Cuando el bot abra y cierre operaciones, aquí verás win rate, profit factor, drawdown,
              desglose por activo y el historial completo.
            </p>
          </div>
        ) : (
          <>
            {/* KPIs */}
            <section className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-industrial bg-industrial md:grid-cols-4">
              <Kpi label="PnL neto" value={pnlFmt(a.netPnl)} tone={Math.abs(a.netPnl) < 0.005 ? undefined : a.netPnl > 0 ? "long" : "short"} big />
              <Kpi label="Win rate" value={`${a.winRate.toFixed(0)}%`} tone="accent" big />
              <Kpi label="Profit factor" value={pf(a.profitFactor)} big />
              <Kpi label="Max drawdown" value={fmt(a.maxDrawdown)} tone="short" big />
              <Kpi label="Operaciones" value={String(a.closed)} sub={`${a.wins}G / ${a.losses}P`} />
              <Kpi label="Expectancy" value={fmt(a.expectancy)} sub="por operación" />
              <Kpi label="Media ganancia" value={`+${fmt(a.avgWin)}`} sub={`−${fmt(a.avgLoss)} media pérdida`} />
              <Kpi label="Racha" value={`${a.bestStreak >= 0 ? "+" : ""}${a.bestStreak} / ${a.worstStreak}`} sub="mejor / peor" />
            </section>

            {/* curva PnL + por instrumento */}
            <section className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_400px]">
              <div className="rounded-xl border border-industrial bg-soft">
                <SectionHead label="PnL acumulado" />
                <div className="p-5">
                  <EquityChart data={a.pnlCurve.map((p) => ({ ts: p.ts, equity: p.cum }))} markers={markers} />
                </div>
              </div>
              <div className="rounded-xl border border-industrial bg-soft">
                <SectionHead label="Por instrumento" />
                <ByInstrument rows={a.byEpic} />
              </div>
            </section>

            {/* P&L diario */}
            <section className="mt-4 rounded-xl border border-industrial bg-soft">
              <SectionHead label="PnL diario" />
              <div className="p-5">
                <DailyBars data={a.dailyPnl} />
              </div>
            </section>

            {/* historial */}
            <section className="mt-4 rounded-xl border border-industrial bg-soft">
              <SectionHead label={`Historial · ${closedTrades.length}`} />
              <TradeTable trades={closedTrades} />
            </section>
          </>
        )}

        <footer className="mt-10 flex items-center justify-between border-t border-industrial py-6 text-[11px] text-muted">
          <p>Capital Autopilot</p>
          <p>Cuenta real · no es consejo financiero</p>
        </footer>
      </main>
    </div>
  );
}

function Kpi({
  label,
  value,
  sub,
  tone,
  big,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "long" | "short" | "accent";
  big?: boolean;
}) {
  const c =
    tone === "long" ? "text-long" : tone === "short" ? "text-short" : tone === "accent" ? "text-accent" : "text-white";
  return (
    <div className="bg-soft p-5">
      <p className="tag">{label}</p>
      <p className={`mt-2 font-mono ${big ? "text-2xl" : "text-xl"} font-medium tracking-tight ${c}`}>{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-muted">{sub}</p>}
    </div>
  );
}

function ByInstrument({ rows }: { rows: { epic: string; pnl: number; trades: number; winRate: number }[] }) {
  if (!rows.length) return <div className="p-8 text-center text-sm text-muted">Sin datos</div>;
  const max = Math.max(...rows.map((r) => Math.abs(r.pnl)), 1);
  return (
    <div className="divide-y divide-industrial/60">
      {rows.map((r) => (
        <div key={r.epic} className="flex items-center gap-3 px-4 py-2.5">
          <div className="w-20 shrink-0">
            <p className="font-display text-sm">{r.epic}</p>
            <p className="font-mono text-[10px] text-muted">{r.trades}t · {r.winRate.toFixed(0)}%</p>
          </div>
          <div className="flex-1">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-industrial">
              <div
                className={`h-full rounded-full ${r.pnl >= 0 ? "bg-long" : "bg-short"}`}
                style={{ width: `${(Math.abs(r.pnl) / max) * 100}%` }}
              />
            </div>
          </div>
          <span className={`w-16 shrink-0 text-right font-mono text-[13px] ${pnlClass(r.pnl)}`}>
            {r.pnl >= 0 ? "+" : ""}
            {fmt(r.pnl)}
          </span>
        </div>
      ))}
    </div>
  );
}

function DailyBars({ data }: { data: { date: string; pnl: number }[] }) {
  if (!data.length) return <div className="dotgrid h-28 rounded-lg border border-industrial" />;
  const max = Math.max(...data.map((d) => Math.abs(d.pnl)), 1);
  return (
    <div className="flex h-32 items-stretch gap-1.5">
      {data.slice(-40).map((d) => {
        const h = (Math.abs(d.pnl) / max) * 56;
        const up = d.pnl >= 0;
        return (
          <div key={d.date} title={`${d.date}: ${d.pnl.toFixed(2)}`} className="group flex flex-1 flex-col items-center justify-center">
            <div className="flex h-[56px] w-full items-end justify-center">
              {up && <div className="w-full max-w-[18px] rounded-t bg-long transition-opacity group-hover:opacity-80" style={{ height: h }} />}
            </div>
            <div className="h-px w-full bg-cement" />
            <div className="flex h-[56px] w-full items-start justify-center">
              {!up && <div className="w-full max-w-[18px] rounded-b bg-short transition-opacity group-hover:opacity-80" style={{ height: h }} />}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TradeTable({ trades }: { trades: TradeRecord[] }) {
  return (
    <div className="max-h-[520px] overflow-auto">
      <table className="w-full text-left font-mono text-[12px]">
        <thead className="sticky top-0 bg-soft">
          <tr className="border-b border-industrial text-muted">
            <th className="px-4 py-2.5 font-normal">Cierre</th>
            <th className="px-4 py-2.5 font-normal">Activo</th>
            <th className="px-4 py-2.5 font-normal">Dir</th>
            <th className="px-4 py-2.5 font-normal">Entrada → Salida</th>
            <th className="px-4 py-2.5 text-right font-normal">PnL</th>
          </tr>
        </thead>
        <tbody>
          {trades.map((t) => (
            <tr key={t.id} className="border-b border-industrial/50 hover:bg-raised">
              <td className="px-4 py-2.5 text-muted">
                {new Date(t.closedTs || t.ts).toLocaleString("es-ES", {
                  day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
                })}
              </td>
              <td className="px-4 py-2.5 text-white">{t.epic}</td>
              <td className="px-4 py-2.5">
                <span className={t.direction === "BUY" ? "text-long" : "text-short"}>
                  {t.direction === "BUY" ? "▲" : "▼"}
                </span>
              </td>
              <td className="px-4 py-2.5 text-dim">
                {fmt(t.entry)}
                {t.exit != null ? ` → ${fmt(t.exit)}` : ""}
              </td>
              <td className={`px-4 py-2.5 text-right ${pnlClass(t.pnl || 0)}`}>
                {t.pnl != null ? `${t.pnl >= 0 ? "+" : ""}${fmt(t.pnl)}` : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
