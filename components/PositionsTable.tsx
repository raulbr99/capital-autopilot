"use client";

import { useState } from "react";
import type { OpenPos } from "./types";
import { SectionHead, fmt, price, pnlClass, pnlFmt, positionRisk, Skeleton } from "./ui";
import dynamic from "next/dynamic";

// El modal del gráfico arrastra lightweight-charts (~56 kB). Como solo se abre
// al pulsar, se carga en ese momento en vez de en cada visita a la página.
const PositionChart = dynamic(() => import("./PositionChart"), { ssr: false });

const ChartIcon = (
  <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M2 12l3.5-4 2.5 2L13 4" />
    <path d="M13 4h-2.5M13 4v2.5" />
  </svg>
);

function derive(p: OpenPos) {
  const cur = p.currentPrice ?? p.entry;
  const { risk, locked, lockedGain } = positionRisk(p);
  const distPct = p.stopLevel != null && cur ? (Math.abs(cur - p.stopLevel) / cur) * 100 : null;
  const distTone = distPct == null ? "text-muted" : distPct < 0.5 ? "text-short" : "text-dim";
  // ¿el precio actual favorece la posición? (LONG sube / SHORT baja)
  const favor = cur === p.entry ? 0 : p.direction === "BUY" ? cur - p.entry : p.entry - cur;
  const curTone = favor > 0 ? "text-long" : favor < 0 ? "text-short" : "text-dim";
  // Resultado en múltiplos de RIESGO: como puntúa un operador ("voy +1.2R"),
  // comparable entre activos aunque los euros sean distintos.
  const rMult = risk && risk > 0 ? p.upl / risk : null;
  const notional = Math.abs(p.size * p.entry);
  return { cur, risk, distPct, distTone, curTone, rMult, notional, locked, lockedGain };
}

/** Barra de recorrido del trade: -1R (stop) .. 0 (entrada) .. +2R. */
function RBar({ r }: { r: number }) {
  const clamped = Math.max(-1, Math.min(2, r));
  const zero = 33.3; // posición de la entrada en la barra
  const pct = clamped >= 0 ? zero + (clamped / 2) * (100 - zero) : zero + clamped * zero;
  const pos = r >= 0;
  return (
    <div className="relative mt-1 h-1 w-full overflow-hidden rounded-full bg-industrial" aria-hidden>
      <div
        className={`absolute top-0 h-full ${pos ? "bg-long/60" : "bg-short/60"}`}
        style={{ left: `${Math.min(zero, pct)}%`, width: `${Math.abs(pct - zero)}%` }}
      />
      <div className="absolute top-0 h-full w-px bg-muted" style={{ left: `${zero}%` }} />
    </div>
  );
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
  cargando,
  divisa,
  equity,
}: {
  positions: OpenPos[];
  onClose: (p: OpenPos) => void;
  cargando?: boolean;
  divisa?: string;
  /** Equity de la cuenta: sin él, "exposición 328" no dice nada. */
  equity?: number | null;
  busy: boolean;
}) {
  const [chartPos, setChartPos] = useState<OpenPos | null>(null);
  const [confirmKey, setConfirmKey] = useState<string | null>(null);

  // Totales de la cartera: un blotter de broker siempre cierra con su suma
  const totals = positions.reduce(
    (a, p) => {
      const { risk, notional } = derive(p);
      a.pnl += p.upl || 0;
      a.risk += risk ?? 0;
      a.notional += notional;
      return a;
    },
    { pnl: 0, risk: 0, notional: 0 }
  );

  /** Cerrar mueve dinero real: primer clic arma, segundo confirma. */
  const closeBtn = (p: OpenPos, cls: string) =>
    confirmKey === p.key ? (
      <button
        onClick={() => {
          onClose(p);
          setConfirmKey(null);
        }}
        disabled={busy}
        className={`${cls} border-short bg-short/10 text-short`}
      >
        ¿CERRAR?
      </button>
    ) : (
      <button
        onClick={() => setConfirmKey(p.key)}
        disabled={busy}
        className={`${cls} border-cement text-dim hover:border-short hover:text-short`}
      >
        CERRAR
      </button>
    );

  return (
    <>
    <div className="rounded-xl border border-industrial bg-soft">
      <SectionHead label={`Posiciones abiertas · ${positions.length}`} right={positions.length > 0 ? LiveTag : undefined} />
      {cargando ? (
        <div className="space-y-2 p-4">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : positions.length === 0 ? (
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
                  <th scope="col" className="px-4 py-2 font-normal">ACTIVO</th>
                  <th scope="col" className="px-4 py-2 font-normal">DIR</th>
                  <th scope="col" className="px-4 py-2 text-right font-normal">SIZE</th>
                  <th scope="col" className="px-4 py-2 text-right font-normal">ENTRADA</th>
                  <th scope="col" className="px-4 py-2 text-right font-normal">PRECIO</th>
                  <th scope="col" className="px-4 py-2 text-right font-normal">SL · TP</th>
                  <th scope="col" className="px-4 py-2 text-right font-normal">DIST→SL</th>
                  <th scope="col" className="px-4 py-2 text-right font-normal">RIESGO</th>
                  <th scope="col" className="px-4 py-2 text-right font-normal">PNL · R</th>
                  <th scope="col" className="px-4 py-2 font-normal"></th>
                </tr>
              </thead>
              <tbody>
                {positions.map((p) => {
                  const { cur, risk, distPct, distTone, curTone, rMult, locked, lockedGain } = derive(p);
                  return (
                    <tr key={p.key} className="border-b border-industrial/60 hover:bg-raised">
                      <td className="px-4 py-3 text-white">{p.epic}</td>
                      <td className="px-4 py-3">
                        <span className={p.direction === "BUY" ? "text-long" : "text-short"}>
                          {p.direction === "BUY" ? "▲ LONG" : "▼ SHORT"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-dim">{fmt(p.size)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-dim">{price(p.entry)}</td>
                      <td className={`px-4 py-3 text-right font-medium tabular-nums ${curTone}`}>{price(cur)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-dim">
                        {p.stopLevel == null ? <span className="text-short">sin SL</span> : price(p.stopLevel)}
                        <span className="text-muted"> · {price(p.limitLevel)}</span>
                      </td>
                      <td className={`px-4 py-3 text-right tabular-nums ${distTone}`}>{distPct == null ? "—" : `${distPct.toFixed(2)}%`}</td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {risk == null ? (
                          <span className="text-dim">—</span>
                        ) : locked ? (
                          <span className="text-long" title={`Stop por delante de la entrada: ${fmt(lockedGain)} asegurados`}>
                            asegurada
                          </span>
                        ) : (
                          <span className="text-dim">≈{fmt(risk)}</span>
                        )}
                      </td>
                      <td className="min-w-[92px] px-4 py-3 text-right">
                        <span className={`tabular-nums ${pnlClass(p.upl)}`}>{pnlFmt(p.upl)}</span>
                        {rMult != null && (
                          <>
                            <span className="ml-1.5 tabular-nums text-[10px] text-muted">
                              {rMult >= 0 ? "+" : ""}
                              {rMult.toFixed(2)}R
                            </span>
                            <RBar r={rMult} />
                          </>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setChartPos(p)}
                            title="Ver gráfico"
                            className="rounded-md border border-cement p-1.5 text-dim transition hover:border-accent hover:text-accent"
                          >
                            {ChartIcon}
                          </button>
                          {closeBtn(p, "rounded-md border px-3 py-1 text-[10px] transition disabled:opacity-40")}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-cement bg-base/60 text-[11px]">
                  <td className="px-4 py-2.5 text-muted" colSpan={3}>
                    TOTAL · {positions.length} {positions.length === 1 ? "posición" : "posiciones"}
                  </td>
                  <td className="px-4 py-2.5 text-right text-muted" colSpan={3}>
                    {/*
                      La exposición nocional suelta es un número sin escala:
                      "328" sobre una cuenta de 228 € es 1,4 veces el capital, y
                      sobre una de 5.000 sería nada. El resto del panel ya
                      contextualiza así sus cifras absolutas —la caída máxima y
                      el resultado neto van con su "% del capital"—; esta se
                      quedó fuera.
                    */}
                    exposición <span className="tabular-nums text-dim">{fmt(totals.notional, 0)}</span>
                    {equity && equity > 0 ? (
                      <span className="ml-1 text-muted">
                        ({(totals.notional / equity).toFixed(1)}× capital)
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-2.5 text-right text-muted">a stop</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-dim">≈{fmt(totals.risk)}</td>
                  <td className={`px-4 py-2.5 text-right font-medium tabular-nums ${pnlClass(totals.pnl)}`}>
                    {pnlFmt(totals.pnl)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Móvil: tarjetas apiladas */}
          <div className="space-y-2 p-3 md:hidden">
            {positions.map((p) => {
              const { cur, risk, distPct, distTone, curTone, rMult, locked, lockedGain } = derive(p);
              return (
                <div key={p.key} className="rounded-lg border border-industrial bg-base p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-sm text-white">{p.epic}</span>
                    <div className="flex items-baseline gap-2">
                      <span className={`font-mono text-sm tabular-nums ${pnlClass(p.upl)}`}>{pnlFmt(p.upl)}</span>
                      {rMult != null && (
                        <span className="font-mono text-[10px] tabular-nums text-muted">
                          {rMult >= 0 ? "+" : ""}
                          {rMult.toFixed(2)}R
                        </span>
                      )}
                    </div>
                  </div>
                  {rMult != null && <RBar r={rMult} />}
                  <div className="mt-2.5 grid grid-cols-3 gap-y-2 font-mono text-[11px] tabular-nums">
                    <Cell label="DIR" value={p.direction === "BUY" ? "▲ LONG" : "▼ SHORT"} tone={p.direction === "BUY" ? "text-long" : "text-short"} />
                    <Cell label="SIZE" value={fmt(p.size)} />
                    <Cell label="ENTRADA" value={price(p.entry)} />
                    <Cell label="PRECIO" value={price(cur)} tone={curTone} />
                    <Cell label="SL" value={p.stopLevel == null ? "sin SL" : price(p.stopLevel)} tone={p.stopLevel == null ? "text-short" : "text-dim"} />
                    <Cell label="DIST→SL" value={distPct == null ? "—" : `${distPct.toFixed(2)}%`} tone={distTone} />
                    <Cell
                      label="RIESGO"
                      value={risk == null ? "—" : locked ? "asegurada" : `≈${fmt(risk)}`}
                      tone={locked ? "text-long" : "text-dim"}
                    />
                    {/*
                      La tarjeta móvil enseñaba el stop y NO el objetivo, aunque
                      la tabla de escritorio tiene su columna "SL · TP". En un
                      teléfono no había forma de ver si la posición tenía
                      take-profit — y resulta que el motor lo estaba borrando en
                      silencio en el primer ajuste del trailing (corregido en la
                      pasada 75). Precisamente el campo cuya ausencia había que
                      poder detectar era el único que faltaba aquí.
                    */}
                    <Cell
                      label="TP"
                      value={p.limitLevel == null ? "sin TP" : price(p.limitLevel)}
                      tone={p.limitLevel == null ? "text-muted" : "text-dim"}
                    />
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => setChartPos(p)}
                      className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-md border border-cement text-[11px] text-dim transition hover:border-accent hover:text-accent"
                    >
                      {ChartIcon} GRÁFICO
                    </button>
                    {closeBtn(p, "min-h-11 flex-1 rounded-md border text-[11px] transition disabled:opacity-40")}
                  </div>
                </div>
              );
            })}

            {/* Total de cartera también en móvil */}
            <div className="flex items-center justify-between rounded-lg border border-cement bg-base/60 px-3 py-2.5 font-mono text-[11px]">
              <span className="text-muted">TOTAL · riesgo ≈{fmt(totals.risk)}</span>
              <span className={`tabular-nums ${pnlClass(totals.pnl)}`}>{pnlFmt(totals.pnl)}</span>
            </div>
          </div>
        </>
      )}
    </div>
    {chartPos && <PositionChart pos={chartPos} onClose={() => setChartPos(null)} divisa={divisa} />}
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
