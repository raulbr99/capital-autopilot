"use client";

import type { Analytics as A, TradeRecord } from "./types";
import { SectionHead, StatCard, fmt, pf } from "./ui";

export default function Analytics({
  a,
  trades,
}: {
  a: A | null;
  trades: TradeRecord[];
}) {
  if (!a) return null;
  return (
    <div className="space-y-4">
      <div className="border border-industrial bg-soft rounded-xl">
        <SectionHead label="Rendimiento" />
        <div className="grid grid-cols-2 gap-px border-b border-industrial bg-industrial md:grid-cols-4">
          <StatCard label="WIN_RATE" value={`${a.winRate.toFixed(0)}%`} tone="accent" />
          <StatCard label="PROFIT_FACTOR" value={pf(a.profitFactor)} />
          <StatCard label="NET_PNL" value={fmt(a.netPnl)} tone={a.netPnl >= 0 ? "long" : "short"} />
          <StatCard label="MAX_DD" value={fmt(a.maxDrawdown)} tone="short" />
        </div>
        <div className="grid grid-cols-2 gap-px bg-industrial md:grid-cols-4">
          <Mini label="CERRADOS" value={String(a.closed)} />
          <Mini label="W / L" value={`${a.wins} / ${a.losses}`} />
          <Mini label="EXPECTANCY" value={fmt(a.expectancy)} />
          <Mini label="RACHA" value={`${a.bestStreak >= 0 ? "+" : ""}${a.bestStreak} / ${a.worstStreak}`} />
        </div>

        {/* Daily P&L bars */}
        <div className="p-4">
          <p className="tag mb-2">PnL diario</p>
          <DailyBars data={a.dailyPnl} />
        </div>
      </div>

      {/* trade history */}
      <div className="border border-industrial bg-soft rounded-xl">
        <SectionHead label={`Operaciones · ${trades.length}`} />
        {trades.length === 0 ? (
          <div className="dotgrid p-8 text-center">
            <span className="tag">SIN_TRADES_TODAVÍA</span>
          </div>
        ) : (
          <div className="max-h-[320px] overflow-y-auto">
            <table className="w-full text-left font-mono text-[11px]">
              <thead className="sticky top-0 bg-soft">
                <tr className="border-b border-industrial text-muted">
                  <th className="px-3 py-2 font-normal">HORA</th>
                  <th className="px-3 py-2 font-normal">ACTIVO</th>
                  <th className="px-3 py-2 font-normal">DIR</th>
                  <th className="px-3 py-2 font-normal">ENT/SAL</th>
                  <th className="px-3 py-2 font-normal">PNL</th>
                  <th className="px-3 py-2 font-normal">EST</th>
                </tr>
              </thead>
              <tbody>
                {trades.map((t) => (
                  <tr key={t.id} className="border-b border-industrial/50 hover:bg-raised">
                    <td className="px-3 py-2 text-muted">
                      {new Date(t.ts).toLocaleTimeString("es-ES", { hour12: false })}
                    </td>
                    <td className="px-3 py-2 text-white">
                      {t.epic}
                    </td>
                    <td className="px-3 py-2">
                      <span className={t.direction === "BUY" ? "text-long" : "text-short"}>
                        {t.direction === "BUY" ? "▲" : "▼"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-dim">
                      {fmt(t.entry)}
                      {t.exit != null ? ` → ${fmt(t.exit)}` : ""}
                    </td>
                    <td className={`px-3 py-2 ${(t.pnl || 0) >= 0 ? "text-long" : "text-short"}`}>
                      {t.pnl != null ? `${t.pnl >= 0 ? "+" : ""}${fmt(t.pnl)}` : "—"}
                    </td>
                    <td className="px-3 py-2">
                      <span className={t.status === "open" ? "text-volt" : "text-muted"}>
                        {t.status === "open" ? "ABIERTA" : "CERRADA"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-soft p-3">
      <p className="font-display text-base text-white">{value}</p>
      <p className="tag mt-0.5">{label}</p>
    </div>
  );
}

function DailyBars({ data }: { data: { date: string; pnl: number }[] }) {
  if (!data.length)
    return <div className="dotgrid h-20 border border-industrial" />;
  const max = Math.max(...data.map((d) => Math.abs(d.pnl)), 1);
  return (
    <div className="flex h-24 items-center gap-1">
      {data.slice(-30).map((d) => {
        const h = (Math.abs(d.pnl) / max) * 44;
        const up = d.pnl >= 0;
        return (
          <div key={d.date} title={`${d.date}: ${d.pnl.toFixed(2)}`} className="flex flex-1 flex-col items-center justify-center">
            <div className="flex h-[44px] w-full items-end justify-center">
              {up && <div className="w-full max-w-[14px] bg-long" style={{ height: h }} />}
            </div>
            <div className="h-px w-full bg-cement" />
            <div className="flex h-[44px] w-full items-start justify-center">
              {!up && <div className="w-full max-w-[14px] bg-short" style={{ height: h }} />}
            </div>
          </div>
        );
      })}
    </div>
  );
}
