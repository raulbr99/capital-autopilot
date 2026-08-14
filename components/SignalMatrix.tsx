"use client";

import { useMemo, useState } from "react";
import type { EpicEval } from "./types";
import { SectionHead, Skeleton, Sparkline, price, variacion } from "./ui";
import { marcoLabel } from "@/lib/model";

type Filter = "todas" | "senal" | "posicion";

export default function SignalMatrix({
  evals,
  cargando,
  instruments = [],
  adxThreshold = 25,
}: {
  evals: EpicEval[];
  cargando?: boolean;
  /**
   * Umbral de ADX con el que el MOTOR separa tendencia de rango. Estaba escrito
   * a fuego como 25 dentro de la tarjeta, y es un ajuste editable en el Lab que
   * el resto del panel sí lee de la configuración: el panel principal rotula
   * "ADX ≥{cfg.strategy.adxThreshold}" y el sello del backtest también. Súbelo a
   * 30 y estas veinte tarjetas seguirían pintando TREND en verde a un activo con
   * ADX 26 mientras el motor lo bloquea por lateral — la pantalla se
   * contradiría consigo misma y la versión equivocada sería la del detalle.
   */
  adxThreshold?: number;
  /**
   * Para saber qué activos son de solo-compra (sus SELL no se ejecutan) y
   * cuáles están PAUSADOS (no se abre nada en ellos).
   */
  instruments?: { epic: string; longOnly?: boolean; paused?: boolean }[];
}) {
  const soloLargos = useMemo(
    () => new Set(instruments.filter((i) => i.longOnly).map((i) => i.epic)),
    [instruments]
  );
  /**
   * Activos pausados: el motor no abre nada en ellos (engine.ts, "circuit
   * breaker"). Y no hace falta que lo pauses tú: el propio motor auto-pausa un
   * instrumento cuando sus últimas diez operaciones cerradas suman negativo.
   *
   * Ese estado solo se veía en UN sitio de toda la aplicación —la tabla de
   * instrumentos del Lab—, así que aquí un activo recién apartado por mala
   * racha seguía apareciendo con su BUY al 100 %, el primero de la rejilla por
   * el triaje. Anunciar como oportunidad lo que el bot acaba de mandar al
   * banquillo es peor que no anunciar nada.
   */
  const pausados = useMemo(
    () => new Set(instruments.filter((i) => i.paused).map((i) => i.epic)),
    [instruments]
  );
  const [filter, setFilter] = useState<Filter>("todas");

  /**
   * Un SELL en un activo de solo-compra no es una señal: el motor lo descarta.
   * La tarjeta ya lo decía —sale como "▼ bloqueada" en vez de "▼ SHORT"— pero
   * el recuento y el triaje seguían tratándolo como oportunidad. Comprobado en
   * vivo: el contador decía "Con señal 8" con siete accionables, y el SHORT
   * bloqueado de BTCUSD (71 %) se colocaba por delante de SILVER (69 %) y GOLD
   * (53 %), que sí se pueden abrir. Ordenar por delante lo que no se puede
   * tomar invierte justo lo que el triaje existe para resolver.
   */
  const bloqueada = (e: EpicEval) => soloLargos.has(e.epic) && e.signal.type === "SELL";
  const pausada = (e: EpicEval) => pausados.has(e.epic);
  const accionable = (e: EpicEval) =>
    e.signal.type !== "FLAT" && !bloqueada(e) && !pausada(e);

  const counts = useMemo(
    () => ({
      todas: evals.length,
      senal: evals.filter(accionable).length,
      posicion: evals.filter((e) => e.hasPosition).length,
    }),
    [evals, soloLargos]
  );

  /**
   * Triaje: lo accionable primero. Con 20 activos, una rejilla sin orden obliga
   * a barrer un muro de FLAT para encontrar la única señal que importa.
   * Orden: señal activa (por confianza) → con posición abierta → resto.
   */
  const sorted = useMemo(() => {
    const rank = (e: EpicEval) =>
      e.sinDatos ? 4 : accionable(e) ? 0 : e.hasPosition ? 1 : bloqueada(e) || pausada(e) ? 2 : 3;
    return [...evals]
      .filter((e) => (filter === "senal" ? accionable(e) : filter === "posicion" ? e.hasPosition : true))
      .sort((a, b) => rank(a) - rank(b) || (b.signal.confidence ?? 0) - (a.signal.confidence ?? 0));
  }, [evals, filter, soloLargos, pausados]);

  const chip = (id: Filter, label: string) => {
    const on = filter === id;
    return (
      <button
        key={id}
        onClick={() => setFilter(id)}
        aria-pressed={on}
        /* whitespace-nowrap: sin esto el chip parte "Todas" y su número en dos
           líneas cuando la fila va justa, y los tres filtros pasan a ocupar el
           doble de alto. Visto en una captura a 390 px. */
        /*
          min-h-[34px]: al impedir ayer que el chip partiera su número en dos
          líneas, dejó de ser alto por accidente y se quedó en 25 px — por
          debajo del mínimo táctil. El auditor lo cazó al primer pase: "táctil
          57×25 Todas 5". Es la misma altura que ya llevan los filtros del
          registro en vivo desde la pasada 179; estos nunca la tuvieron, pasaban
          porque envolvían.
        */
        className={`inline-flex min-h-[34px] items-center gap-1 whitespace-nowrap rounded-md px-2 text-[11px] font-medium transition-colors ${
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
        {/*
          Mientras no han llegado los datos, esta rejilla afirmaba "Sin activos
          en seguimiento · Añade instrumentos desde el Lab": una instrucción
          para arreglar un problema que no existe, sobre un universo de 20
          activos, durante los ~5,5 s que tarda el primer sondeo. Es el mismo
          "frame frío" que se corrigió en el panel y en Analítica y que a las
          mesas no llegó.
        */}
        {cargando && (
          <>
            {[0, 1, 2].map((i) => (
              <div key={i} className="border-b border-r border-industrial bg-soft p-4">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="mt-2 h-3 w-32" />
                <Skeleton className="mt-3 h-9 w-full" />
                <Skeleton className="mt-3 h-3 w-full" />
              </div>
            ))}
          </>
        )}
        {!cargando && sorted.length === 0 && (
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
          <SignalCard
            key={e.epic}
            e={e}
            bloqueada={soloLargos.has(e.epic) && e.signal.type === "SELL"}
            pausada={pausados.has(e.epic)}
            adxThreshold={adxThreshold}
          />
        ))}
      </div>
    </div>
  );
}

function SignalCard({
  e,
  bloqueada,
  pausada,
  adxThreshold,
}: {
  e: EpicEval;
  bloqueada?: boolean;
  pausada?: boolean;
  adxThreshold: number;
}) {
  /**
   * Un activo que Capital no pudo devolver no es un FLAT: es una respuesta que
   * no llegó. Pintarlo igual que los demás afirmaría que no hay señal, que es
   * justo lo que no se sabe.
   */
  if (e.sinDatos) {
    return (
      <div className="border-b border-r border-industrial bg-soft/60 p-4">
        <div className="flex items-center gap-1.5">
          <span className="font-display text-base text-muted">{e.epic}</span>
          <span className="rounded bg-industrial px-1 py-0.5 font-mono text-[8px] text-muted">{marcoLabel(e.resolution)}</span>
        </div>
        <p className="mt-2 text-[11px] leading-snug text-muted">
          Sin datos en este ciclo — el broker no respondió. Se reintenta en el siguiente.
        </p>
        <p className="mt-1 font-mono text-[10px] text-muted/70" title={e.sinDatos}>
          {e.sinDatos}
        </p>
      </div>
    );
  }

  const s = e.signal;
  const buy = s.type === "BUY";
  /**
   * Un SELL en un activo de solo-compra NO es accionable: el motor lo descarta.
   * La tarjeta lo presentaba como cualquier otra señal —filo rojo, barra de
   * confianza al 100 %, primera de la rejilla por el triaje— y comprobado en
   * vivo: BTCUSD, que es solo-largos, encabezaba la mesa de cripto con un
   * "▼ SHORT" al 100 % que nunca se iba a abrir. Anunciar una oportunidad que
   * el propio sistema tiene prohibido tomar es peor que no anunciar nada.
   */
  const sell = s.type === "SELL" && !bloqueada;
  const active = (buy || sell) && !pausada;
  const conf = Math.round((s.confidence ?? 0) * 100);
  // Cambio sobre la ventana del sparkline (coherente con la línea: mismo origen)
  const sp = e.spark || [];
  // Ventana comparable entre activos (~24 h), no "las últimas 30 velas de este
  // marco": en DAY eso eran 30 días y en HOUR_4 cinco.
  const v = variacion(sp, e.price, e.resolution);
  const chg = v ? v.pct : null;
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
            <span className="rounded bg-industrial px-1 py-0.5 font-mono text-[8px] text-muted">{marcoLabel(e.resolution)}</span>
            {e.hasPosition && (
              <span className="rounded bg-accent/10 px-1.5 py-0.5 font-mono text-[8px] text-accent">abierta</span>
            )}
          </div>
          <p className="mt-0.5 font-mono text-[10px] tabular-nums text-muted">
            {price(e.price)}
            {chg != null && (
              <span
                className={`ml-1.5 ${chgTone}`}
                title={
                  v?.dia
                    ? "Variación en las últimas 24 h"
                    : "Variación en las últimas 30 velas: en este marco no llegan a 24 h"
                }
              >
                {chg > 0.02 ? "▲" : chg < -0.02 ? "▼" : "•"} {chg > 0 ? "+" : ""}
                {chg.toFixed(2)}%
              </span>
            )}
          </p>
        </div>
        <span
          className={`shrink-0 rounded px-2 py-0.5 font-mono text-[10px] ${
            active
              ? buy
                ? "bg-long/15 text-long"
                : "bg-short/15 text-short"
              : "bg-industrial text-muted"
          }`}
          title={
            pausada
              ? "Pausado: el motor no abre posiciones nuevas en este activo. Se reactiva desde el Lab."
              : bloqueada
                ? "Activo de solo-compra: el motor descarta los cortos."
                : undefined
          }
        >
          {/* Un solo chip. Con dos elementos —"SHORT" más una insignia
              "bloqueada" junto al activo— la cabecera se quedaba sin ancho y
              recortaba una de las dos: primero el nombre del activo, luego la
              propia insignia, que salía como "bl". */}
          {active
            ? buy
              ? "▲ LONG"
              : "▼ SHORT"
            : pausada
              ? `${s.type === "BUY" ? "▲" : s.type === "SELL" ? "▼" : "●"} pausada`
              : bloqueada
                ? "▼ bloqueada"
                : "● FLAT"}
        </span>
      </div>

      <div className="mt-2">
        {/*
          La línea se coloreaba sola comparando la PRIMERA y la ÚLTIMA de las 30
          velas, mientras el porcentaje de arriba mide la ventana de ~24 h. Con
          activos en diario son treinta días contra uno, así que las dos cosas
          se contradecían en la misma tarjeta: visto en una captura, AAPL con
          "+1,11 %" en verde sobre una línea ROJA, y AMZN con "−0,74 %" en rojo
          sobre una línea VERDE.
          Las dos lecturas eran ciertas por separado; puestas juntas, una desmiente
          a la otra. El color pasa a decir lo mismo que la cifra que encabeza la
          tarjeta; la forma de la línea sigue enseñando las treinta velas.
        */}
        <Sparkline data={e.spark} h={36} up={chg == null ? undefined : chg >= 0} />
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

      {/*
        Dos columnas SIEMPRE, no cuatro en pantallas anchas.
        Estas tarjetas viven en una rejilla de tres columnas, así que en
        escritorio cada una mide unos 215 px: repartir eso en cuatro deja 50 px
        por celda, y un precio de bitcoin no cabe. Visto en una captura de la
        mesa de cripto: "63,316.9 63,555.0 34" se corría de sus columnas y los
        valores dejaban de estar bajo su etiqueta, con el ADX empujado fuera de
        sitio. Con dos columnas hay ~100 px por celda, que sí dan.
        En móvil no cambia nada: ahí ya eran dos.
      */}
      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-industrial pt-3 font-mono text-[10px] tabular-nums">
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
        <div title={`Umbral configurado: ADX ≥ ${adxThreshold}`}>
          <p className="text-muted">ADX</p>
          <p className={s.indicators.adx >= adxThreshold ? "text-long" : "text-muted"}>
            {Number.isFinite(s.indicators.adx) ? s.indicators.adx.toFixed(0) : "—"}
            <span className="ml-1 text-[8px]">
              {s.indicators.adx >= adxThreshold ? "TREND" : "RANGE"}
            </span>
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
