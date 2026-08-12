"use client";

import { useState } from "react";
import { SectionHead, Skeleton, fmt, pf, Sparkline, pl } from "./ui";

/** Equity nocional del backtest (lib/sim.ts). Con él, la caída se expresa en %. */
const BASE_EQUITY = 1000;
/** Igual que en Analítica y el Diario: bajo esta muestra el % no es una tasa. */
const MUESTRA_MIN = 5;

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
  /**
   * Sello de la ejecución. Un resultado en pantalla no dice con qué se calculó,
   * y la pestaña de al lado (Configuración) puede cambiar las SMA, el RSI o la
   * confianza mínima en cualquier momento: sin esto, lo que estás mirando puede
   * ser de una estrategia que ya no existe y nada te avisa.
   */
  const [sello, setSello] = useState<{ ts: number; marco: string; params: string } | null>(null);
  // Por defecto 4 horas, NO 1 minuto. En marcos cortos la horquilla domina el
  // resultado (medido: en 1 min es ~66% del rango de la vela en EURUSD), así
  // que arrancar ahí empuja a concluir que la estrategia no vale cuando lo que
  // no vale es el marco. Las opciones rápidas siguen ahí para quien las busque.
  const [resolution, setResolution] = useState("HOUR_4");
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
        const s = data.strategy;
        setSello({
          ts: Date.now(),
          marco: data.resolution || resolution,
          params: s
            ? `SMA ${s.fast}/${s.slow} · RSI ${s.rsiPeriod} · conf ≥${s.minConfidence}${
                s.useRegimeFilter ? ` · ADX ≥${s.adxThreshold}` : ""
              }`
            : "",
        });
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
              {["MINUTE", "MINUTE_5", "MINUTE_15", "HOUR", "HOUR_4", "DAY"].map((r) => (
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
              {loading ? "…" : "▶ Ejecutar"}
            </button>
          </div>
        }
      />
      <div className="p-4">
        {err && <p className="text-xs text-short">{err}</p>}
        {!res && !err && !loading && (
          <p className="text-xs text-muted">
            Corre la estrategia actual sobre histórico de cada activo de la watchlist
            <span className="text-dim"> antes de arriesgar</span>. En marcos por debajo de una hora la
            horquilla se come el resultado, así que un mal dato ahí dice más del marco que de la estrategia.
          </p>
        )}
        {/*
          Durante la ejecución el cuerpo se quedaba EXACTAMENTE igual: el único
          indicio de que pasaba algo era un "…" dentro de un botón de 11 px,
          mientras el servidor recorre los 20 activos del universo (medido: ~4 s).
          Se lee como que el botón no ha hecho nada.
        */}
        {loading && (
          <div>
            <p className="mb-3 flex items-center gap-2 font-mono text-[11px] text-accent">
              <span className="h-1.5 w-1.5 animate-pulseDot rounded-full bg-accent" />
              Simulando el universo en {resolution}…
            </p>
            <div className="mb-2 grid grid-cols-4 gap-px border border-industrial bg-industrial">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="bg-soft p-3">
                  <Skeleton className="mx-auto h-2 w-14" />
                  <Skeleton className="mx-auto mt-2 h-4 w-10" />
                </div>
              ))}
            </div>
            <div className="space-y-2">
              {[0, 1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-11 w-full" />
              ))}
            </div>
          </div>
        )}
        {sello && !loading && (
          <p className="mb-3 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-b border-industrial pb-2.5 font-mono text-[10px] text-muted">
            <span className="text-dim">{sello.marco}</span>
            <span>·</span>
            <span>{sello.params}</span>
            <span className="ml-auto" title="Si cambias la estrategia en Configuración, este resultado deja de reflejarla">
              {new Date(sello.ts).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}
            </span>
          </p>
        )}
        {agg && (
          <>
            <div className="mb-2 grid grid-cols-4 gap-px border border-industrial bg-industrial text-center">
              <Cell label="Operaciones" value={String(agg.trades)} />
              <Cell label="Aciertos" value={`${agg.winRate.toFixed(0)}%`} />
              <Cell
                label="Retorno"
                value={`${(agg.returnPct ?? 0) >= 0 ? "+" : ""}${(agg.returnPct ?? 0).toFixed(1)}%`}
                tone={(agg.returnPct ?? 0) >= 0 ? "long" : "short"}
              />
              <Cell
                label="P&L nocional"
                value={fmt(agg.netPnl)}
                tone={agg.netPnl >= 0 ? "long" : "short"}
              />
            </div>
            {typeof agg.spreadCost === "number" && agg.spreadCost > 0 && (
              <p className="mb-2 flex items-start gap-1.5 rounded-lg border border-industrial bg-base px-3 py-2 text-[11px] leading-relaxed text-dim">
                <span aria-hidden>💸</span>
                <span>
                  Incluye <span className="font-mono text-white">{fmt(agg.spreadCost)} €</span> de
                  horquilla ({agg.trades} {pl(agg.trades, "operación", "operaciones")} × spread real del activo). Un backtest sin este
                  coste siempre sale a favor, y más cuanto más corto sea el marco temporal.
                </span>
              </p>
            )}
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
                className={`flex items-center justify-between gap-3 rounded-lg border border-industrial bg-ink px-3 py-2 ${
                  r.trades === 0 ? "opacity-55" : ""
                }`}
              >
                {/* Ancho fijo: con la columna flexible, la línea de métricas
                    partía y dejaba huérfano el último dato. */}
                <div className="w-[176px] shrink-0">
                  <p className="font-display text-sm">{r.epic}</p>
                  {r.trades === 0 ? (
                    <p className="font-mono text-[10px] text-muted">sin operaciones en el periodo</p>
                  ) : (
                    /* "1 ops · 100% · PF —": tres problemas en una línea de
                       diez píxeles. El plural sin concordar; un acierto del
                       100 % que en realidad es una moneda que cayó una vez; y
                       un profit factor que sobre una sola operación no existe
                       (de ahí el guion). Mismo umbral de muestra que el resto
                       de la app. */
                    <p className="whitespace-nowrap font-mono text-[10px] tabular-nums text-muted">
                      {r.trades} {pl(r.trades, "op", "ops")}
                      {r.trades >= MUESTRA_MIN
                        ? ` · ${r.winRate.toFixed(0)}% · PF ${pf(r.profitFactor)}`
                        : " · muestra corta"}
                    </p>
                  )}
                </div>
                {r.trades === 0 ? (
                  <div className="min-w-0 flex-1" />
                ) : (
                  <div className="min-w-0 flex-1">
                    <Sparkline data={r.equityCurve.map((p) => p.equity)} up={r.returnPct >= 0} h={34} />
                  </div>
                )}
                <div className="w-[92px] shrink-0 text-right">
                  {r.trades === 0 ? (
                    <span className="font-mono text-sm text-muted">—</span>
                  ) : (
                    <>
                      <span className={`font-mono text-sm tabular-nums ${r.returnPct >= 0 ? "text-long" : "text-short"}`}>
                        {r.returnPct >= 0 ? "+" : ""}
                        {r.returnPct.toFixed(1)}%
                      </span>
                      {/* Era "peor racha 98.66". Una racha es una serie de
                          pérdidas seguidas; esto es la CAÍDA MÁXIMA desde el
                          pico (lib/sim.ts la calcula como peak − equity), o sea
                          otra cosa. Y el número iba sin unidad: son euros sobre
                          el equity nocional de 1.000 €, así que en porcentaje
                          se lee solo y además se compara con el retorno que
                          tiene justo encima. */}
                      <p
                        className="font-mono text-[10px] tabular-nums text-muted"
                        title={`Caída máxima desde el pico: ${fmt(r.maxDrawdown)} € sobre el equity nocional de ${BASE_EQUITY} €`}
                      >
                        caída máx. {((r.maxDrawdown / BASE_EQUITY) * 100).toFixed(1)}%
                      </p>
                    </>
                  )}
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
