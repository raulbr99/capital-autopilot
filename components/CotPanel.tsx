"use client";

import { useEffect, useState } from "react";

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

/** ≥80 % de un lado = todos en la misma barca. */
const crowded = (pctLong: number) => pctLong >= 80 || pctLong <= 20;

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

  // Antigüedad del informe: el COT es semanal y refleja posiciones del martes
  // anterior. Sin decirlo, se lee como si fuera de hoy.
  const ageDays = d?.reportDate
    ? Math.floor((Date.now() - new Date(d.reportDate).getTime()) / 86_400_000)
    : null;

  return (
    <div className={`rounded-xl border border-industrial bg-soft ${className}`}>
      <div className="flex items-center justify-between border-b border-industrial px-5 py-3.5">
        <h2 className="tag">COT · posicionamiento institucional</h2>
        <span className="font-mono text-[10px] text-muted">
          {loading && !d
            ? "cargando…"
            : d?.reportDate
            ? `CFTC · ${d.reportDate}${ageDays != null ? ` · hace ${ageDays} d` : ""}`
            : ""}
        </span>
      </div>
      <div className="space-y-2.5 p-4">
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
                {/* Marca del 50 %: sin referencia, la barra no dice de qué lado cae */}
                <span className="absolute inset-y-0 left-1/2 w-px bg-muted/40" aria-hidden />
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
      </div>
      <p className="border-t border-industrial px-5 py-2.5 text-[10px] leading-relaxed text-muted">
        Net de especuladores (no-comerciales, CFTC). Informe <span className="text-dim">semanal</span>: refleja
        posiciones del martes anterior, así que es contexto de fondo, nunca una señal de entrada.
        Net-long = sesgo alcista; net-short = bajista; Δ = flujo vs la semana previa.{" "}
        <span className="text-accent">MASIF.</span> marca un posicionamiento extremo (≥80 % a un lado):
        el mercado ya está todo del mismo lado y suele avisar de agotamiento.
      </p>
    </div>
  );
}
