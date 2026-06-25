"use client";

import type { OpenPos } from "./types";
import { SectionHead, fmt, pnlClass, pnlFmt } from "./ui";

function fnum(n: number | null | undefined, d = 2) {
  return n == null ? "—" : fmt(n, d);
}

export default function PositionsTable({
  positions,
  onClose,
  busy,
}: {
  positions: OpenPos[];
  onClose: (p: OpenPos) => void;
  busy: boolean;
}) {
  return (
    <div className="rounded-xl border border-industrial bg-soft">
      <SectionHead label={`Posiciones abiertas · ${positions.length}`} />
      {positions.length === 0 ? (
        <div className="dotgrid px-5 py-9 text-center">
          <p className="text-sm font-medium text-dim">Sin posiciones abiertas</p>
          <p className="mt-1 text-xs text-muted">Cuando el bot abra una posición aparecerá aquí con su SL, riesgo y P&L.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left font-mono text-xs">
            <thead>
              <tr className="border-b border-industrial text-muted">
                <th className="px-4 py-2 font-normal">ACTIVO</th>
                <th className="px-4 py-2 font-normal">DIR</th>
                <th className="px-4 py-2 text-right font-normal">SIZE</th>
                <th className="px-4 py-2 text-right font-normal">ENTRADA</th>
                <th className="px-4 py-2 text-right font-normal">SL · TP</th>
                <th className="px-4 py-2 text-right font-normal">DIST→SL</th>
                <th className="px-4 py-2 text-right font-normal">RIESGO</th>
                <th className="px-4 py-2 text-right font-normal">PNL</th>
                <th className="px-4 py-2 font-normal"></th>
              </tr>
            </thead>
            <tbody>
              {positions.map((p) => {
                const cur = p.currentPrice ?? p.entry;
                const risk =
                  p.stopLevel != null ? Math.abs(p.entry - p.stopLevel) * p.size : null;
                const distPct =
                  p.stopLevel != null && cur ? (Math.abs(cur - p.stopLevel) / cur) * 100 : null;
                const distTone =
                  distPct == null ? "text-muted" : distPct < 0.5 ? "text-short" : "text-dim";
                return (
                  <tr key={p.key} className="border-b border-industrial/60 hover:bg-raised">
                    <td className="px-4 py-3 text-white">{p.epic}</td>
                    <td className="px-4 py-3">
                      <span className={p.direction === "BUY" ? "text-long" : "text-short"}>
                        {p.direction === "BUY" ? "▲ LONG" : "▼ SHORT"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-dim">{fmt(p.size)}</td>
                    <td className="px-4 py-3 text-right text-dim">{fnum(p.entry)}</td>
                    <td className="px-4 py-3 text-right text-dim">
                      {p.stopLevel == null ? (
                        <span className="text-short">sin SL</span>
                      ) : (
                        fnum(p.stopLevel)
                      )}
                      <span className="text-muted"> · {fnum(p.limitLevel)}</span>
                    </td>
                    <td className={`px-4 py-3 text-right ${distTone}`}>
                      {distPct == null ? "—" : `${distPct.toFixed(2)}%`}
                    </td>
                    <td className="px-4 py-3 text-right text-dim">{risk == null ? "—" : `≈${fmt(risk)}`}</td>
                    <td className={`px-4 py-3 text-right ${pnlClass(p.upl)}`}>{pnlFmt(p.upl)}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => onClose(p)}
                        disabled={busy}
                        className="rounded-md border border-cement px-3 py-1 text-[10px] text-dim transition hover:border-short hover:text-short disabled:opacity-40"
                      >
                        CERRAR
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
