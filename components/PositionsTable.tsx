"use client";

import type { OpenPos } from "./types";
import { SectionHead, fmt } from "./ui";

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
    <div className="border border-industrial bg-soft rounded-xl">
      <SectionHead label={`Posiciones abiertas · ${positions.length}`} />
      {positions.length === 0 ? (
        <div className="dotgrid p-10 text-center">
          <span className="tag">NO_HAY_POSICIONES_ABIERTAS</span>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left font-mono text-xs">
            <thead>
              <tr className="border-b border-industrial text-muted">
                <th className="px-4 py-2 font-normal">ACTIVO</th>
                <th className="px-4 py-2 font-normal">DIR</th>
                <th className="px-4 py-2 font-normal">SIZE</th>
                <th className="px-4 py-2 font-normal">ENTRADA</th>
                <th className="px-4 py-2 font-normal">PNL</th>
                <th className="px-4 py-2 font-normal"></th>
              </tr>
            </thead>
            <tbody>
              {positions.map((p) => (
                <tr key={p.key} className="border-b border-industrial/60 hover:bg-raised">
                  <td className="px-4 py-3 text-white">{p.epic}</td>
                  <td className="px-4 py-3">
                    <span className={p.direction === "BUY" ? "text-long" : "text-short"}>
                      {p.direction === "BUY" ? "▲ LONG" : "▼ SHORT"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-dim">{fmt(p.size)}</td>
                  <td className="px-4 py-3 text-dim">{fmt(p.entry)}</td>
                  <td className={`px-4 py-3 ${p.upl >= 0 ? "text-long" : "text-short"}`}>
                    {p.upl >= 0 ? "+" : ""}
                    {fmt(p.upl)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => onClose(p)}
                      disabled={busy}
                      className="border border-cement px-3 py-1 text-[10px] text-dim transition hover:border-short hover:text-short disabled:opacity-40"
                    >
                      CERRAR
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
