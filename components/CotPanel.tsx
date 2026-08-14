"use client";

import { useEffect, useState } from "react";
import { Skeleton } from "./ui";
import { COT_SESGO, COT_MASIF } from "@/lib/model";

type Cot = {
  symbol: string;
  market: string;
  reportDate: string;
  net: number;
  change: number | null;
  longs: number;
  shorts: number;
  pctLong: number;
  bias: "long" | "short" | "neutral";
};
type Data = { fetchedAt: string; reportDate: string | null; forex: Cot[]; commodities: Cot[] };

/** Todos en la misma barca. */
const crowded = (pctLong: number) => pctLong >= COT_MASIF || pctLong <= 100 - COT_MASIF;

const NAMES: Record<string, string> = {
  EUR: "Euro",
  GBP: "Libra",
  JPY: "Yen",
  CHF: "Franco",
  NZD: "Dólar NZ",
  USD: "Índice USD",
  GOLD: "Oro",
  SILVER: "Plata",
  OIL_CRUDE: "Crudo WTI",
  NATURALGAS: "Gas natural",
  COPPER: "Cobre",
};

function fmtK(n: number) {
  const a = Math.abs(n);
  return (n < 0 ? "−" : "+") + (a >= 1000 ? `${(a / 1000).toFixed(0)}k` : a.toFixed(0));
}

export default function CotPanel({
  category,
  className = "",
}: {
  category: "forex" | "commodities";
  className?: string;
}) {
  const [d, setD] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetch("/api/bot/cot")
      .then((r) => r.json())
      .then((x) => {
        if (alive && !x.error) setD(x);
      })
      .catch(() => {})
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  const rows = category === "forex" ? d?.forex : d?.commodities;

  /**
   * Antigüedad del informe. El COT es semanal —la CFTC publica el viernes las
   * posiciones del martes anterior— así que en un ciclo normal el dato tiene
   * entre 3 y 10 días. Sin decirlo, se lee como si fuera de hoy.
   *
   * Y hasta ahora eso era todo: un "hace N d" en gris pequeño, sin umbral. Si
   * el feed se rompe, el panel seguiría dibujando las mismas barras con la
   * misma pinta mientras el dato envejece semanas, y los Gestores seguirían
   * leyéndolo como contexto de mercado. Es el mismo fallo silencioso que tenía
   * el latido del motor antes de calibrarlo.
   *
   * Pasados 14 días falta al menos una publicación; pasados 21, tres semanas
   * sin actualizar no son contexto, son ruido viejo.
   */
  const ageDays = d?.reportDate
    ? Math.floor((Date.now() - new Date(d.reportDate).getTime()) / 86_400_000)
    : null;
  const viejo = ageDays != null && ageDays > 14;
  const muyViejo = ageDays != null && ageDays > 21;

  return (
    <div className={`rounded-xl border border-industrial bg-soft ${className}`}>
      <div className="flex items-center justify-between border-b border-industrial px-5 py-3.5">
        <h2 className="tag">COT · posicionamiento institucional</h2>
        <span
          className={`font-mono text-[10px] ${
            muyViejo ? "text-short" : viejo ? "text-accent" : "text-muted"
          }`}
          title={
            viejo
              ? "La CFTC publica cada semana: este informe se ha quedado atrás."
              : undefined
          }
        >
          {loading && !d
            ? "cargando…"
            : d?.reportDate
            ? `CFTC · ${d.reportDate}${ageDays != null ? ` · hace ${ageDays} d` : ""}`
            : ""}
        </span>
      </div>
      <div className="space-y-2.5 p-4">
        {/*
          Sin datos, la tarjeta quedaba como una banda vacía con solo el pie
          explicativo debajo — se lee como "no hay posicionamiento que enseñar",
          no como "aún no ha llegado". El COT viene de la CFTC y tarda; seis
          huecos con la forma de las seis divisas dicen la verdad mientras tanto.
        */}
        {loading && !(rows ?? []).length &&
          [0, 1, 2, 3, 4, 5].map((i) => (
            <div key={`hueco-${i}`} className="flex items-center gap-3">
              <Skeleton className="h-4 w-20 shrink-0 sm:w-24" />
              <Skeleton className="h-5 min-w-0 flex-1" />
              <Skeleton className="h-3 w-24 shrink-0 sm:w-40" />
            </div>
          ))}
        {(rows ?? []).map((c) => {
          const long = c.bias === "long";
          const short = c.bias === "short";
          return (
            <div key={c.symbol} className="flex items-center gap-3">
              <span className="w-20 shrink-0 truncate text-[13px] font-medium text-white sm:w-24 sm:text-sm">{NAMES[c.symbol] ?? c.symbol}</span>
              <div
                className="relative flex h-5 min-w-0 flex-1 overflow-hidden rounded bg-industrial/40"
                title={`${c.longs.toLocaleString()} long · ${c.shorts.toLocaleString()} short`}
              >
                <div className="h-full bg-long/40" style={{ width: `${c.pctLong}%` }} />
                <div className="h-full bg-short/40" style={{ width: `${100 - c.pctLong}%` }} />
                {/*
                  La cifra: a ojo no se distingue un 72 % de un 88 %, y esa
                  diferencia es la que separa "sesgo" de "masificado".
                  Va anclada al inicio de la barra, no al final del relleno, así
                  que cuando el porcentaje es bajo (Dólar NZ al 11 %) el texto
                  es más ancho que su propio segmento y quedaba partido entre
                  el verde y el rojo — se leía como si el número perteneciera a
                  los dos lados. Un fondo propio lo separa de la barra sin
                  robarle sitio, que en móvil no sobra: darle columna propia
                  dejaba la barra en 74 px.
                */}
                <span className="absolute inset-y-0 left-1 flex items-center">
                  <span className="rounded bg-ink/75 px-1.5 py-0.5 font-mono text-[10px] leading-none tabular-nums text-dim">
                    {c.pctLong.toFixed(0)}% long
                  </span>
                </span>
                {/*
                  La referencia no es el 50 %: el sesgo se declara a partir del
                  55/45 (lib/cot.ts). Con una sola raya en el medio, un símbolo
                  al 52 % enseñaba la barra pasada de la marca mientras la
                  etiqueta de al lado decía "neutral" — la raya desmentía al
                  veredicto. Pintada la banda entera, "neutral" es exactamente
                  lo que se ve: el corte entre verde y rojo cae dentro de ella.
                */}
                <span
                  className="absolute inset-y-0 border-x border-muted/40 bg-ink/20"
                  style={{ left: `${100 - COT_SESGO}%`, width: `${2 * COT_SESGO - 100}%` }}
                  aria-hidden
                />
              </div>
              <span className={`flex w-24 shrink-0 items-center justify-end gap-1 whitespace-nowrap font-mono text-[10px] sm:w-40 sm:text-[11px] ${long ? "text-long" : short ? "text-short" : "text-muted"}`}>
                {c.bias === "neutral" ? "neutral" : long ? "▲ net long" : "▼ net short"}
                {crowded(c.pctLong) && (
                  <span
                    className="rounded bg-accent/15 px-1 py-0.5 text-[8px] text-accent"
                    title="Posicionamiento extremo: casi todos al mismo lado. Suele avisar de agotamiento, no confirmar la tendencia."
                  >
                    MASIF.
                  </span>
                )}
              </span>
              <span className="hidden w-14 shrink-0 text-right font-mono text-[10px] text-muted sm:block" title="Cambio vs semana previa">
                {c.change != null ? fmtK(c.change) : ""}
              </span>
            </div>
          );
        })}
        {!loading && (!rows || rows.length === 0) && <p className="text-xs text-muted">Sin datos COT.</p>}
        {viejo && (
          <p
            className={`flex items-start gap-1.5 border-t border-industrial pt-2.5 text-[11px] leading-relaxed ${
              muyViejo ? "text-short" : "text-accent"
            }`}
          >
            <span aria-hidden>⚠️</span>
            <span>
              Informe de hace {ageDays} días. La CFTC publica cada semana, así que{" "}
              {muyViejo ? "faltan varias entregas" : "falta al menos una entrega"}: esto ya no
              describe el posicionamiento actual.
            </span>
          </p>
        )}
      </div>
      <p className="border-t border-industrial px-5 py-2.5 text-[10px] leading-relaxed text-muted">
        Net de especuladores (no-comerciales, CFTC). Informe <span className="text-dim">semanal</span>: refleja
        posiciones del martes anterior, así que es contexto de fondo, nunca una señal de entrada.
        Net-long = sesgo alcista; net-short = bajista; Δ = flujo vs la semana previa. Dentro de la banda
        marcada ({100 - COT_SESGO}–{COT_SESGO} %) el reparto se considera <span className="text-dim">neutral</span>.{" "}
        <span className="text-accent">MASIF.</span> marca un posicionamiento extremo (≥{COT_MASIF} % a un lado):
        el mercado ya está todo del mismo lado y suele avisar de agotamiento.
      </p>
    </div>
  );
}
