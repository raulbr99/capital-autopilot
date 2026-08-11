"use client";

import { useEffect, useState } from "react";
import { SectionHead, fmt, pnlClass, pnlFmt } from "./ui";

type Lado = { trades: number; wins: number; winRate: number; netPnl: number };
type Data = {
  closed: number;
  netTotal: number;
  gestor: Lado;
  tecnico: Lado;
  byEpic: { epic: string; trades: number; winRate: number; netPnl: number }[];
  failedTheses: { epic: string; direction: string; pnl: number; thesis: string }[];
  decisiones: Record<string, number>;
};

/**
 * La memoria del bot. Los cuatro Gestores leen este mismo resumen en cada ciclo
 * para "aprender" —qué activos le sangran, qué tesis suyas fallaron— y hasta
 * ahora era invisible desde la interfaz: la IA sabía más que quien la vigila.
 */
export default function LessonsPanel({ desk }: { desk?: string }) {
  const [d, setD] = useState<Data | null>(null);

  useEffect(() => {
    const q = desk && desk !== "all" ? `?desk=${desk}` : "";
    fetch(`/api/bot/lessons${q}`)
      .then((r) => r.json())
      .then((x) => !x.error && setD(x))
      .catch(() => {});
  }, [desk]);

  if (!d || !d.closed) return null;

  const peores = (d.byEpic || []).filter((x) => x.netPnl < 0).slice(0, 5);
  const comparables = d.gestor.trades >= 5 && d.tecnico.trades >= 5;

  return (
    <div className="rounded-xl border border-industrial bg-soft">
      <SectionHead label="Lo que ha aprendido" />
      <div className="grid grid-cols-1 gap-px bg-industrial md:grid-cols-3">
        {/* Quién decide mejor: la pregunta de fondo de todo el proyecto */}
        <div className="bg-soft p-4">
          <p className="tag">Quién acierta más</p>
          <div className="mt-2.5 space-y-2.5">
            {[
              { k: "Gestor IA", v: d.gestor },
              { k: "Motor técnico", v: d.tecnico },
            ].map(({ k, v }) => (
              <div key={k}>
                <div className="flex items-baseline justify-between">
                  <span className="text-[12.5px] text-dim">{k}</span>
                  <span className="font-mono text-[11px] tabular-nums text-muted">
                    {v.trades} ops · {v.winRate}%
                  </span>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-industrial">
                  <div
                    className={v.netPnl >= 0 ? "h-full bg-long" : "h-full bg-short"}
                    style={{ width: `${Math.min(100, v.winRate)}%` }}
                  />
                </div>
                <p className={`mt-0.5 font-mono text-[12px] tabular-nums ${pnlClass(v.netPnl)}`}>
                  {pnlFmt(v.netPnl)}
                </p>
              </div>
            ))}
          </div>
          {!comparables && (
            <p className="mt-2 text-[10px] leading-snug text-muted">
              Con tan pocas operaciones de un lado, la comparación aún no dice nada.
            </p>
          )}
        </div>

        {/* Lo que le sangra: es lo que el prompt le pide no repetir */}
        <div className="bg-soft p-4">
          <p className="tag">Dónde pierde</p>
          {peores.length === 0 ? (
            <p className="mt-2 text-[12px] text-muted">Ningún activo en negativo.</p>
          ) : (
            <div className="mt-2.5 space-y-1.5">
              {peores.map((x) => (
                <div key={x.epic} className="flex items-baseline justify-between gap-2">
                  <span className="font-mono text-[12px] text-white">{x.epic}</span>
                  <span className="font-mono text-[10px] tabular-nums text-muted">
                    {x.trades}t · {x.winRate}%
                  </span>
                  <span className="font-mono text-[12px] tabular-nums text-short">{fmt(x.netPnl)}</span>
                </div>
              ))}
            </div>
          )}
          <p className="mt-2.5 border-t border-industrial pt-2 text-[10px] leading-snug text-muted">
            Los Gestores leen esta lista en cada ciclo con la instrucción de no repetir lo que ya pierde.
          </p>
        </div>

        {/* Sus propias tesis equivocadas, en sus palabras */}
        <div className="bg-soft p-4">
          <p className="tag">Tesis que fallaron</p>
          {(!d.failedTheses || d.failedTheses.length === 0) ? (
            <p className="mt-2 text-[12px] text-muted">Ninguna operación suya cerró en pérdida.</p>
          ) : (
            <ul className="mt-2.5 space-y-2">
              {d.failedTheses.slice(0, 3).map((t, i) => (
                <li key={i}>
                  <div className="flex items-baseline gap-1.5">
                    <span className="font-mono text-[11px] text-white">{t.epic}</span>
                    <span className={`font-mono text-[10px] ${t.direction === "BUY" ? "text-long" : "text-short"}`}>
                      {t.direction === "BUY" ? "▲" : "▼"}
                    </span>
                    <span className="font-mono text-[11px] tabular-nums text-short">{fmt(t.pnl)}</span>
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted" title={t.thesis}>
                    {t.thesis}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <p className="border-t border-industrial px-5 py-2.5 text-[11px] leading-relaxed text-muted">
        Resumen de {d.closed} operaciones cerradas · neto{" "}
        <span className={pnlClass(d.netTotal)}>{pnlFmt(d.netTotal)}</span>. Es exactamente lo que reciben
        los Gestores antes de decidir
        {d.decisiones?.vetoed ? ` · el comité ha vetado ${d.decisiones.vetoed} de sus propuestas` : ""}.
      </p>
    </div>
  );
}
