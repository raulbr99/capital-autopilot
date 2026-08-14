"use client";

import { useEffect, useState } from "react";
import { Skeleton } from "./ui";
import { FUNDING_ALTO, FUNDING_NEUTRO } from "@/lib/model";

type Fund = {
  epic: string;
  symbol: string;
  currentRatePct: number;
  avg3dPct: number | null;
  annualizedPct: number | null;
  nextFundingTime: string | null;
  markPrice: number | null;
  bias: "crowded-long" | "long" | "neutral" | "short" | "crowded-short";
};
type Data = { fetchedAt: string; funding: Fund[] };

const NOMBRES: Record<string, string> = { BTCUSD: "Bitcoin", ETHUSD: "Ether" };



const pct = (n: number | null | undefined, d = 4) =>
  n == null || !Number.isFinite(n) ? "—" : `${n > 0 ? "+" : ""}${n.toFixed(d)}%`;

/**
 * Funding de perpetuos para la mesa de cripto.
 *
 * De las cuatro mesas, cripto era la ÚNICA sin panel de contexto de mercado:
 * acciones tiene su tablero de sentimiento (menciones, noticias, resultados) y
 * forex y materias primas tienen el COT. El COT es de la CFTC y no cubre cripto,
 * así que esa mesa se quedaba con la rejilla de señales y nada más.
 *
 * Y el dato equivalente ya existía: /api/bot/funding sirve las tasas de funding
 * de Binance para BTC y ETH desde hace tiempo, con su umbral de sobrecalentado
 * incluido, y el Gestor de la mesa de cripto las lee en cada ciclo. O sea que la
 * IA veía el posicionamiento de su mercado y quien vigila el panel, no.
 *
 * Es el mismo desequilibrio que tenía el panel de expectativa con el desglose
 * por dirección: calculado, servido, consumido por el modelo y nunca pintado.
 */
export default function FundingPanel({ className = "" }: { className?: string }) {
  const [d, setD] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [fallo, setFallo] = useState(false);

  useEffect(() => {
    let vivo = true;
    fetch("/api/bot/funding")
      .then((r) => r.json())
      .then((x) => {
        if (!vivo) return;
        if (x?.error) setFallo(true);
        else setD(x);
      })
      .catch(() => vivo && setFallo(true))
      .finally(() => vivo && setLoading(false));
    return () => {
      vivo = false;
    };
  }, []);

  const rows = d?.funding ?? [];
  const proxima = rows.find((f) => f.nextFundingTime)?.nextFundingTime;

  return (
    <div className={`rounded-xl border border-industrial bg-soft ${className}`}>
      <div className="flex items-center justify-between border-b border-industrial px-5 py-3.5">
        <h2 className="tag">Funding · posicionamiento en perpetuos</h2>
        <span className="font-mono text-[10px] text-muted">
          {loading && !d
            ? "cargando…"
            : proxima
              ? `Binance · próximo ${new Date(proxima).toLocaleTimeString("es-ES", {
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: false,
                })}`
              : "Binance"}
        </span>
      </div>

      <div className="space-y-2.5 p-4">
        {/* Dos huecos con la forma de BTC y ETH mientras llega la respuesta:
            una banda vacía se lee como "no hay nada que enseñar". */}
        {loading &&
          !rows.length &&
          [0, 1].map((i) => (
            <div key={`hueco-${i}`} className="flex items-center gap-3">
              <Skeleton className="h-4 w-20 shrink-0" />
              <Skeleton className="h-5 min-w-0 flex-1" />
              <Skeleton className="h-3 w-24 shrink-0" />
            </div>
          ))}

        {rows.map((f) => {
          const caliente = Math.abs(f.currentRatePct) >= FUNDING_ALTO;
          /*
            El módulo devuelve CINCO sesgos: crowded-long, long, neutral, short
            y crowded-short. Este panel —que escribí yo— solo miraba "long" y
            "short", así que los dos extremos caían al caso por defecto y se
            rotulaban "neutral": justo lo contrario de lo que significan. Y
            convivían con la insignia ALTO, que sí se calcula aparte, así que
            con el funding disparado la fila habría dicho "ALTO" y "neutral" a
            dos centímetros.
          */
          const largo = f.bias === "long" || f.bias === "crowded-long";
          const corto = f.bias === "short" || f.bias === "crowded-short";
          return (
            <div key={f.epic} className="flex items-center gap-3">
              <span className="w-20 shrink-0 truncate text-[13px] font-medium text-white sm:w-24 sm:text-sm">
                {NOMBRES[f.epic] ?? f.epic}
              </span>
              <span
                className="min-w-0 flex-1 font-mono text-[11px] tabular-nums text-dim"
                title="Tasa que se paga cada 8 horas. Positiva: la pagan los largos."
              >
                {pct(f.currentRatePct)}
                <span className="ml-1.5 text-[10px] text-muted">/8h</span>
                {f.avg3dPct != null && (
                  <span className="ml-2 text-[10px] text-muted">media 3d {pct(f.avg3dPct)}</span>
                )}
              </span>
              {/* La cifra que se entiende sin hacer cuentas: lo que cuesta al
                  año mantener el lado que paga. */}
              <span
                className="hidden w-24 shrink-0 text-right font-mono text-[11px] tabular-nums text-dim sm:block"
                title="Coste anualizado de mantener el lado que paga"
              >
                {f.annualizedPct == null ? "" : `${pct(f.annualizedPct, 1)} anual`}
              </span>
              <span
                className={`flex w-24 shrink-0 items-center justify-end gap-1 whitespace-nowrap font-mono text-[10px] sm:w-32 sm:text-[11px] ${
                  largo ? "text-long" : corto ? "text-short" : "text-muted"
                }`}
              >
                {largo ? "▲ pagan largos" : corto ? "▼ pagan cortos" : "neutral"}
                {caliente && (
                  <span
                    className="rounded bg-accent/15 px-1 py-0.5 text-[8px] text-accent"
                    title="Posicionamiento extremo: el lado que paga está muy cargado. Suele preceder a un cierre en cascada, no confirmar la tendencia."
                  >
                    ALTO
                  </span>
                )}
              </span>
            </div>
          );
        })}

        {!loading && !rows.length && (
          <p className="text-xs text-muted">
            {fallo
              ? "No se han podido leer las tasas de funding."
              : "Sin datos de funding."}
          </p>
        )}
      </div>

      <p className="border-t border-industrial px-5 py-2.5 text-[10px] leading-relaxed text-muted">
        Tasa que se paga cada 8 h entre las dos partes de un perpetuo. Positiva = la pagan los{" "}
        <span className="text-dim">largos</span>, o sea que el mercado está cargado de largos;
        negativa = la pagan los cortos. Es <span className="text-dim">contexto de posicionamiento</span>,
        el equivalente del COT en cripto — nunca una señal de entrada.{" "}
        <span className="text-accent">ALTO</span> marca ≥{FUNDING_ALTO}% cada 8 h: el lado que paga
        está muy cargado y suele preceder a un cierre en cascada. Por debajo de ±{FUNDING_NEUTRO}% cada 8 h la
        tasa se considera <span className="text-dim">neutral</span>: es ruido, no posicionamiento.
      </p>
    </div>
  );
}
