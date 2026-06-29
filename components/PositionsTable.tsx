"use client";

import { useState } from "react";
import type { OpenPos } from "./types";
import { SectionHead, fmt, pnlClass, pnlFmt } from "./ui";
import PositionChart from "./PositionChart";

const ChartIcon = (
  <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M2 12l3.5-4 2.5 2L13 4" />
    <path d="M13 4h-2.5M13 4v2.5" />
  </svg>
);

// Decimales según la magnitud del precio (forex necesita 5, índices/cripto 1).
function pdec(n: number) {
  const a = Math.abs(n);
  return a < 10 ? 5 : a < 100 ? 3 : a < 1000 ? 2 : 1;
}
function price(n: number | null | undefined) {
  return n == null ? "—" : fmt(n, pdec(n));
}

function derive(p: OpenPos) {
  const cur = p.currentPrice ?? p.entry;
  const risk = p.stopLevel != null ? Math.abs(p.entry - p.stopLevel) * p.size : null;
  const distPct = p.stopLevel != null && cur ? (Math.abs(cur - p.stopLevel) / cur) * 100 : null;
  const distTone = distPct == null ? "text-muted" : distPct < 0.5 ? "text-short" : "text-dim";
  // ¿el precio actual favorece la posición? (LONG sube / SHORT baja)
  const favor = cur === p.entry ? 0 : p.direction === "BUY" ? cur - p.entry : p.entry - cur;
  const curTone = favor > 0 ? "text-long" : favor < 0 ? "text-short" : "text-dim";
  return { cur, risk, distPct, distTone, curTone };
}

const LiveTag = (
  <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wide text-muted">
    <span className="h-1.5 w-1.5 rounded-full bg-long animate-pulse motion-reduce:animate-none" />
    En vivo
  </span>
);

export default function PositionsTable({
  positions,
  onClose,
  busy,
}: {
  positions: OpenPos[];
  onClose: (p: OpenPos) => void;
  busy: boolean;
}) {
  const [chartPos, setChartPos] = useState<OpenPos | null>(null);
  return (
    <>
    <div className="rounded-xl border border-industrial bg-soft">
      <SectionHead label={`Posiciones abiertas · ${positions.length}`} right={positions.length > 0 ? LiveTag : undefined} />
      {positions.length === 0 ? (
        <div className="dotgrid px-5 py-9 text-center">
          <p className="text-sm font-medium text-dim">Sin posiciones abiertas</p>
          <p className="mt-1 text-xs text-muted">Cuando el bot abra una posición aparecerá aquí con su SL, riesgo y P&L.</p>
        </div>
      ) : (
        <>
          {/* Escritorio: tabla */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-left font-mono text-xs">
              <thead>
                <tr className="border-b border-industrial text-muted">
                  <th className="px-4 py-2 font-normal">ACTIVO</th>
                  <th className="px-4 py-2 font-normal">DIR</th>
                  <th className="px-4 py-2 text-right font-normal">SIZE</th>
                  <th className="px-4 py-2 text-right font-normal">ENTRADA</th>
                  <th className="px-4 py-2 text-right font-normal">PRECIO</th>
                  <th className="px-4 py-2 text-right font-normal">SL · TP</th>
                  <th className="px-4 py-2 text-right font-normal">DIST→SL</th>
                  <th className="px-4 py-2 text-right font-normal">RIESGO</th>
                  <th className="px-4 py-2 text-right font-normal">PNL</th>
                  <th className="px-4 py-2 font-normal"></th>
                </tr>
              </thead>
              <tbody>
                {positions.map((p) => {
                  const { cur, risk, distPct, distTone, curTone } = derive(p);
                  return (
                    <tr key={p.key} className="border-b border-industrial/60 hover:bg-raised">
                      <td className="px-4 py-3 text-white">{p.epic}</td>
                      <td className="px-4 py-3">
                        <span className={p.direction === "BUY" ? "text-long" : "text-short"}>
                          {p.direction === "BUY" ? "▲ LONG" : "▼ SHORT"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-dim">{fmt(p.size)}</td>
                      <td className="px-4 py-3 text-right text-dim">{price(p.entry)}</td>
                      <td className={`px-4 py-3 text-right font-medium tabular-nums ${curTone}`}>{price(cur)}</td>
                      <td className="px-4 py-3 text-right text-dim">
                        {p.stopLevel == null ? <span className="text-short">sin SL</span> : price(p.stopLevel)}
                        <span className="text-muted"> · {price(p.limitLevel)}</span>
                      </td>
                      <td className={`px-4 py-3 text-right ${distTone}`}>{distPct == null ? "—" : `${distPct.toFixed(2)}%`}</td>
                      <td className="px-4 py-3 text-right text-dim">{risk == null ? "—" : `≈${fmt(risk)}`}</td>
                      <td className={`px-4 py-3 text-right ${pnlClass(p.upl)}`}>{pnlFmt(p.upl)}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setChartPos(p)}
                            title="Ver gráfico"
                            className="rounded-md border border-cement p-1.5 text-dim transition hover:border-accent hover:text-accent"
                          >
                            {ChartIcon}
                          </button>
                          <button
                            onClick={() => onClose(p)}
                            disabled={busy}
                            className="rounded-md border border-cement px-3 py-1 text-[10px] text-dim transition hover:border-short hover:text-short disabled:opacity-40"
                          >
                            CERRAR
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Móvil: tarjetas apiladas */}
          <div className="space-y-2 p-3 md:hidden">
            {positions.map((p) => {
              const { cur, risk, distPct, distTone, curTone } = derive(p);
              return (
                <div key={p.key} className="rounded-lg border border-industrial bg-base p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-sm text-white">{p.epic}</span>
                    <span className={`font-mono text-xs ${p.direction === "BUY" ? "text-long" : "text-short"}`}>
                      {p.direction === "BUY" ? "▲ LONG" : "▼ SHORT"}
                    </span>
                  </div>
                  <div className="mt-2.5 grid grid-cols-3 gap-y-2 font-mono text-[11px]">
                    <Cell label="SIZE" value={fmt(p.size)} />
                    <Cell label="ENTRADA" value={price(p.entry)} />
                    <Cell label="PRECIO" value={price(cur)} tone={curTone} />
                    <Cell label="SL" value={p.stopLevel == null ? "sin SL" : price(p.stopLevel)} tone={p.stopLevel == null ? "text-short" : "text-dim"} />
                    <Cell label="DIST→SL" value={distPct == null ? "—" : `${distPct.toFixed(2)}%`} tone={distTone} />
                    <Cell label="RIESGO" value={risk == null ? "—" : `≈${fmt(risk)}`} />
                    <Cell label="P&L" value={pnlFmt(p.upl)} tone={pnlClass(p.upl)} />
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => setChartPos(p)}
                      className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-md border border-cement text-[11px] text-dim transition hover:border-accent hover:text-accent"
                    >
                      {ChartIcon} GRÁFICO
                    </button>
                    <button
                      onClick={() => onClose(p)}
                      disabled={busy}
                      className="min-h-11 flex-1 rounded-md border border-cement text-[11px] text-dim transition hover:border-short hover:text-short disabled:opacity-40"
                    >
                      CERRAR
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
    {chartPos && <PositionChart pos={chartPos} onClose={() => setChartPos(null)} />}
    </>
  );
}

function Cell({ label, value, tone = "text-dim" }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <p className="text-[9px] text-muted">{label}</p>
      <p className={`mt-0.5 ${tone}`}>{value}</p>
    </div>
  );
}
