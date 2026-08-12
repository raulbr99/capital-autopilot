"use client";

import { useMemo, useState } from "react";
import type { EpicEval } from "./types";
import { SectionHead, Sparkline, price } from "./ui";

type Filter = "todas" | "senal" | "posicion";

export default function SignalMatrix({ evals }: { evals: EpicEval[] }) {
  const [filter, setFilter] = useState<Filter>("todas");

  const counts = useMemo(
    () => ({
      todas: evals.length,
      senal: evals.filter((e) => e.signal.type !== "FLAT").length,
      posicion: evals.filter((e) => e.hasPosition).length,
    }),
    [evals]
  );

  /**
   * Triaje: lo accionable primero. Con 20 activos, una rejilla sin orden obliga
   * a barrer un muro de FLAT para encontrar la única señal que importa.
   * Orden: señal activa (por confianza) → con posición abierta → resto.
   */
  const sorted = useMemo(() => {
    const rank = (e: EpicEval) => (e.signal.type !== "FLAT" ? 0 : e.hasPosition ? 1 : 2);
    return [...evals]
      .filter((e) =>
        filter === "senal" ? e.signal.type !== "FLAT" : filter === "posicion" ? e.hasPosition : true
      )
      .sort((a, b) => rank(a) - rank(b) || (b.signal.confidence ?? 0) - (a.signal.confidence ?? 0));
  }, [evals, filter]);

  const chip = (id: Filter, label: string) => {
    const on = filter === id;
    return (
      <button
        key={id}
        onClick={() => setFilter(id)}
        aria-pressed={on}
        className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
          on ? "bg-raised text-white" : "text-muted hover:text-dim"
        }`}
      >
        {label} <span className="tabular-nums text-[10px] text-muted">{counts[id]}</span>
      </button>
    );
  };

  return (
    <div className="rounded-xl border border-industrial bg-soft">
      <SectionHead
        label="Señales · en vivo"
        right={
          <div className="flex items-center gap-0.5 rounded-lg border border-industrial p-0.5">
            {chip("todas", "Todas")}
            {chip("senal", "Con señal")}
            {chip("posicion", "Abiertas")}
          </div>
        }
      />
      {/* Separadores por BORDE en cada tarjeta, no por fondo con gap: con un
          número impar de activos, el hueco de la última fila dejaba ver el
          fondo separador y parecía una tarjeta rota. */}
      <div className="grid grid-cols-1 bg-soft sm:grid-cols-2 xl:grid-cols-3">
        {sorted.length === 0 && (
          <div className="col-span-full border-b border-industrial bg-soft px-5 py-9 text-center">
            <p className="text-sm font-medium text-dim">
              {evals.length === 0 ? "Sin activos en seguimiento" : "Ningún activo cumple el filtro"}
            </p>
            <p className="mt-1 text-xs text-muted">
              {evals.length === 0
                ? "Añade instrumentos desde el Lab para que el motor los evalúe."
                : "El motor sigue evaluando: las señales aparecen cuando la tendencia se define."}
            </p>
          </div>
        )}
        {sorted.map((e) => (
          <SignalCard key={e.epic} e={e} />
        ))}
      </div>
    </div>
  );
}

function SignalCard({ e }: { e: EpicEval }) {
  const s = e.signal;
  const buy = s.type === "BUY";
  const sell = s.type === "SELL";
  const active = buy || sell;
  const conf = Math.round((s.confidence ?? 0) * 100);
  // Cambio sobre la ventana del sparkline (coherente con la línea: mismo origen)
  const sp = e.spark || [];
  const chg = sp.length >= 2 && sp[0] ? ((e.price - sp[0]) / sp[0]) * 100 : null;
  const chgTone = chg == null ? "" : chg > 0.02 ? "text-long" : chg < -0.02 ? "text-short" : "text-muted";

  return (
    <div
      className={`group relative overflow-hidden border-b border-r border-industrial p-4 transition hover:bg-raised ${
        active ? "bg-soft" : "bg-soft/60"
      }`}
    >
      {/* Filo de color: identifica la señal de un vistazo sin leer nada */}
      {active && (
        <span className={`absolute inset-y-0 left-0 w-0.5 ${buy ? "bg-long" : "bg-short"}`} aria-hidden />
      )}

      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className={`font-display text-base ${active ? "text-white" : "text-dim"}`}>{e.epic}</span>
            <span className="rounded bg-industrial px-1 py-0.5 font-mono text-[8px] text-muted">{e.resolution}</span>
            {e.hasPosition && (
              <span className="rounded bg-accent/10 px-1.5 py-0.5 font-mono text-[8px] text-accent">abierta</span>
            )}
          </div>
          <p className="mt-0.5 font-mono text-[10px] tabular-nums text-muted">
            {price(e.price)}
            {chg != null && (
              <span className={`ml-1.5 ${chgTone}`}>
                {chg > 0.02 ? "▲" : chg < -0.02 ? "▼" : "•"} {chg > 0 ? "+" : ""}
                {chg.toFixed(2)}%
              </span>
            )}
          </p>
        </div>
        <span
          className={`shrink-0 rounded px-2 py-0.5 font-mono text-[10px] ${
            buy ? "bg-long/15 text-long" : sell ? "bg-short/15 text-short" : "bg-industrial text-muted"
          }`}
        >
          {buy ? "▲ LONG" : sell ? "▼ SHORT" : "● FLAT"}
        </span>
      </div>

      <div className="mt-2">
        <Sparkline data={e.spark} h={36} />
      </div>

      {/* La confianza solo se dibuja si hay señal: una barra al 66% bajo un
          FLAT sugiere que pasa algo cuando en realidad no hay nada que hacer. */}
      {active ? (
        <>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-industrial">
            <div className={`h-full ${buy ? "bg-long" : "bg-short"}`} style={{ width: `${conf}%` }} />
          </div>
          <div className="mt-1 flex justify-between font-mono text-[10px]">
            <span className="text-muted">CONFIANZA</span>
            <span className={`tabular-nums ${buy ? "text-long" : "text-short"}`}>{conf}%</span>
          </div>
        </>
      ) : (
        <div className="mt-2 h-1.5" aria-hidden />
      )}

      <p className={`mt-2 text-[11px] leading-snug ${active ? "text-dim" : "text-muted"}`}>{s.reason}</p>

      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-industrial pt-3 font-mono text-[10px] tabular-nums sm:grid-cols-4 sm:gap-2">
        {/*
          Las medias son precios y deben escribirse como tal. Con dos decimales
          fijos, USDCHF enseñaba "SMA-F 0.81 · SMA-S 0.81" y EURUSD "1.15 · 1.15":
          justo el cruce que la tarjeta afirma en su texto quedaba invisible, y
          encima contradecía al precio de la misma tarjeta, que sí sale con sus
          cinco decimales porque usa price(). El ayudante ya estaba importado
          en este fichero para la cotización; solo faltaba usarlo aquí.
        */}
        <Ind label="SMA-F" v={s.indicators.smaFast} fmtV={price} />
        <Ind label="SMA-S" v={s.indicators.smaSlow} fmtV={price} />
        <Ind label="RSI" v={s.indicators.rsi} d={0} />
        <div>
          <p className="text-muted">ADX</p>
          <p className={s.indicators.adx >= 25 ? "text-long" : "text-muted"}>
            {Number.isFinite(s.indicators.adx) ? s.indicators.adx.toFixed(0) : "—"}
            <span className="ml-1 text-[8px]">{s.indicators.adx >= 25 ? "TREND" : "RANGE"}</span>
          </p>
        </div>
      </div>
    </div>
  );
}

function Ind({
  label,
  v,
  d = 2,
  fmtV,
}: {
  label: string;
  v: number;
  d?: number;
  fmtV?: (n: number) => string;
}) {
  return (
    <div>
      <p className="text-muted">{label}</p>
      <p className="text-dim">
        {Number.isFinite(v) ? (fmtV ? fmtV(v) : v.toFixed(d)) : "—"}
      </p>
    </div>
  );
}
