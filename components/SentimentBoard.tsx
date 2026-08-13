"use client";

import { useEffect, useState } from "react";
import { usePoll, Skeleton } from "./ui";

type Ape = {
  ticker: string;
  name: string;
  rank: number | null;
  rankPrev: number | null;
  mentions: number;
  pctChange24h: number | null;
  upvotes: number;
  notListed?: boolean;
};
type News = { title: string; url: string; source: string; publishedDate: string | null; summary?: string };
type SQ = {
  symbol: string;
  marketState: string;
  regularChangePct: number | null;
  extPrice: number | null;
  extChangePct: number | null;
  extLabel: "pre-market" | "after-hours" | null;
};
type Earn = {
  symbol: string;
  nextEarningsDate?: string | null;
  daysUntil?: number | null;
  imminent?: boolean;
  epsEstimate?: number | null;
};

type Data = {
  fetchedAt: string;
  stocks: Ape[];
  trending: Ape[];
  prices: SQ[];
  earnings?: Earn[];
  news: News[];
  exaConfigured: boolean;
  exaErr?: boolean;
};

/**
 * Resultados próximos. El Gestor lo usa como REGLA DURA (no abre con earnings
 * a <=7 días, porque el hueco de apertura se salta el stop), así que quien mira
 * el tablero tiene que ver lo mismo que decide la IA.
 */
function EarningsCell({ e }: { e?: Earn }) {
  if (!e || e.daysUntil == null) return null;
  const d = e.daysUntil;
  const soon = d <= 7;
  const near = d <= 21;
  return (
    <span
      className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[9px] ${
        soon ? "bg-short/15 text-short" : near ? "bg-accent/10 text-accent" : "text-muted"
      }`}
      title={
        soon
          ? `Resultados en ${d} ${d === 1 ? "día" : "días"}: el motor no abre posiciones nuevas en este activo`
          : `Próximos resultados en ${d} ${d === 1 ? "día" : "días"}${e.epsEstimate != null ? ` · BPA estimado ${e.epsEstimate.toFixed(2)}` : ""}`
      }
    >
      {soon ? "⚠ " : ""}
      {d}d
    </span>
  );
}

/**
 * Estados de mercado de Yahoo. Faltaba PREPRE (el tramo previo al pre-market)
 * y el fallback era pintar el valor crudo, así que el panel enseñaba literalmente
 * "PREPRE": un enum interno de un proveedor, en mayúsculas, sin significado para
 * nadie. Si aparece uno desconocido ahora no se enseña nada, que informa más.
 */
const STATE_LABEL: Record<string, string> = {
  PREPRE: "cerrado",
  PRE: "pre-market",
  REGULAR: "abierto",
  POST: "after-hours",
  POSTPOST: "after-hours",
  CLOSED: "cerrado",
};

function PriceCell({ q }: { q?: SQ }) {
  if (!q) return <span className="text-muted">—</span>;
  const useExt = !!q.extLabel && q.extChangePct != null;
  const pct = useExt ? q.extChangePct : q.regularChangePct;
  if (pct == null) return <span className="text-muted">—</span>;
  const label = useExt ? (q.extLabel === "pre-market" ? "pre" : "post") : "ses.";
  const up = pct > 0.05;
  const down = pct < -0.05;
  return (
    <span className="font-mono text-[11px]">
      <span className={up ? "text-long" : down ? "text-short" : "text-muted"}>
        {pct > 0 ? "+" : ""}
        {pct.toFixed(2)}%
      </span>
      <span className="ml-1 text-[8px] text-muted">{label}</span>
    </span>
  );
}

/**
 * Quita el nombre del medio pegado al final del titular ("… | Seeking Alpha",
 * "… - Reuters"). Lo publican así casi todos los agregadores y aquí duplicaba
 * la línea de fuente que va justo debajo, además de comerse ancho en una
 * columna estrecha. Solo si lo que sobra es corto: hay titulares con barras
 * legítimas y no conviene amputarlos.
 */
function sinSufijo(titulo: string): string {
  const m = titulo.match(/^(.*\S)\s+[|\u2013\u2014-]\s+([^|\u2013\u2014-]{2,30})$/);
  return m && m[1].length > 25 ? m[1] : titulo;
}

function ago(iso: string | null): string {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  const h = Math.floor(ms / 3.6e6);
  if (h < 1) return "hace <1 h";
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.floor(h / 24)} d`;
}

function Delta({ pct }: { pct: number | null }) {
  if (pct == null) return <span className="text-muted">—</span>;
  const up = pct > 1;
  const down = pct < -1;
  return (
    <span className={up ? "text-accent" : down ? "text-muted" : "text-muted"}>
      {up ? "▲" : down ? "▼" : "·"} {pct > 0 ? "+" : ""}
      {Math.round(pct)}%
    </span>
  );
}

/** Señal técnica del activo, para cruzarla con el buzz en la misma fila. */
function SignalChip({ tipo }: { tipo?: "BUY" | "SELL" | "FLAT" }) {
  if (!tipo) return <span className="text-muted">—</span>;
  const cls =
    tipo === "BUY"
      ? "bg-long/15 text-long"
      : tipo === "SELL"
      ? "bg-short/15 text-short"
      : "bg-industrial text-muted";
  return (
    <span className={`rounded px-1.5 py-0.5 font-mono text-[9px] ${cls}`}>
      {tipo === "BUY" ? "LONG" : tipo === "SELL" ? "SHORT" : "FLAT"}
    </span>
  );
}

export default function SentimentBoard({
  className = "",
  evals = [],
  onEstadoMercado,
}: {
  className?: string;
  /** Señales del motor: sin ellas, buzz y técnico viven en dos tablas que el
   *  lector tiene que cruzar a mano desplazándose arriba y abajo. */
  evals?: { epic: string; signal: { type: "BUY" | "SELL" | "FLAT" } }[];
  /**
   * Estado real del mercado según Yahoo (REGULAR, PRE, POST, CLOSED). Se lo
   * devuelve a la mesa para que su distintivo de sesión deje de calcularlo a
   * mano con un horario fijo.
   */
  onEstadoMercado?: (estado: string) => void;
}) {
  const [d, setD] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);

  usePoll(() => {
    fetch("/api/bot/sentiment")
      .then((r) => r.json())
      .then((x) => {
        if (!x.error) setD(x);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, 5 * 60 * 1000);

  const listaStocks = Array.isArray(d?.stocks) ? d!.stocks : [];
  const maxMentions = Math.max(1, ...listaStocks.map((s) => s.mentions));
  const stocks = [...listaStocks].sort((a, b) => b.mentions - a.mentions);
  const priceMap = new Map((d?.prices ?? []).map((p) => [p.symbol, p]));
  const earnMap = new Map((d?.earnings ?? []).map((e) => [e.symbol, e]));
  const signalMap = new Map(evals.map((e) => [e.epic, e.signal?.type]));
  const blocked = (d?.earnings ?? []).filter((e) => e.daysUntil != null && e.daysUntil <= 7);
  const marketState = d?.prices?.[0]?.marketState ?? "";
  useEffect(() => {
    if (marketState) onEstadoMercado?.(marketState);
  }, [marketState, onEstadoMercado]);

  return (
    <div className={`rounded-xl border border-industrial bg-soft ${className}`}>
      <div className="flex items-center justify-between border-b border-industrial px-5 py-3.5">
        <h2 className="tag">Sentimiento, buzz &amp; precio · acciones</h2>
        <span className="flex items-center gap-2 font-mono text-[10px] text-muted">
          {STATE_LABEL[marketState] && (
            <span
              className={`flex items-center gap-1.5 rounded px-1.5 py-0.5 ${
                marketState === "REGULAR" ? "bg-long/10 text-long" : "bg-industrial text-dim"
              }`}
            >
              {marketState === "REGULAR" && (
                <span className="h-1.5 w-1.5 animate-pulseDot rounded-full bg-long" />
              )}
              {STATE_LABEL[marketState]}
            </span>
          )}
          {loading && !d ? "cargando…" : d ? ago(d.fetchedAt) : ""}
        </span>
      </div>

      {blocked.length > 0 && (
        <p className="flex items-start gap-2 border-b border-industrial bg-short/[0.06] px-5 py-2.5 text-[11px] leading-relaxed text-dim">
          <span aria-hidden>⚠️</span>
          <span>
            <span className="font-medium text-short">
              {blocked.map((e) => e.symbol).join(", ")}
            </span>{" "}
            {blocked.length === 1 ? "presenta resultados" : "presentan resultados"} en menos de una semana:
            el motor no abrirá posiciones nuevas ahí (el hueco de apertura se salta el stop).
          </span>
        </p>
      )}

      <div className="grid gap-5 p-4 lg:grid-cols-[1fr_320px]">
        {/* Buzz de tus acciones */}
        <div className="min-w-0">
          {/*
            Esto era una frase corrida a la izquierda ("Menciones · Δ24h · rank ·
            precio · resultados · señal") mientras las celdas de abajo tienen
            anchuras fijas: ninguna etiqueta caía sobre su columna. Importa más
            de lo normal aquí porque en la misma fila conviven DOS porcentajes
            que no significan lo mismo — el de menciones y el de precio— y sin
            cabecera no hay forma de saber cuál es cuál.
          */}
          <div className="mb-1.5 flex items-center gap-3 font-mono text-[9px] uppercase tracking-wider text-muted">
            <span className="w-12 shrink-0">Activo</span>
            <span className="min-w-0 flex-1">Menciones · buzz</span>
            {/* Las siete columnas fijas suman 368 px + 32 de padding: por
                encima de un móvil de 375. Δ y rank son las secundarias —el
                precio, los resultados y la señal son las que se miran—, así
                que se ocultan por debajo de sm en cabecera y filas a la vez. */}
            <span className="hidden w-14 shrink-0 text-right sm:block" title="Variación de menciones en 24 h (no es el precio)">
              Δ menc.
            </span>
            <span className="hidden w-8 shrink-0 text-right sm:block" title="Puesto en el ranking de menciones">
              Rank
            </span>
            <span className="w-[72px] shrink-0 text-right">Precio</span>
            <span className="w-10 shrink-0 text-right" title="Días hasta la publicación de resultados">
              Res.
            </span>
            <span className="w-12 shrink-0 text-right">Señal</span>
          </div>
          <div className="space-y-1.5">
            {/*
              Sin datos, la tarjeta pintaba la cabecera de columnas y el rótulo
              "NOTICIAS · EXA" con NADA debajo: promete cinco columnas y una
              lista de titulares que no existen todavía. Es el mismo hueco que
              se corrigió en el panel COT y en las mesas — aquí se quedó.
            */}
            {loading && !d &&
              [0, 1, 2, 3, 4, 5].map((i) => (
                <div key={`hueco-${i}`} className="flex items-center gap-3">
                  <Skeleton className="h-4 w-12 shrink-0" />
                  <Skeleton className="h-5 min-w-0 flex-1" />
                  <Skeleton className="hidden h-3 w-14 shrink-0 sm:block" />
                  <Skeleton className="h-3 w-[72px] shrink-0" />
                  <Skeleton className="h-3 w-12 shrink-0" />
                </div>
              ))}
            {stocks.slice(0, 14).map((s) => (
              <div key={s.ticker} className="flex items-center gap-3">
                <span className="w-12 shrink-0 font-mono text-[13px] font-semibold text-white">{s.ticker}</span>
                <div className="relative h-5 min-w-0 flex-1 overflow-hidden rounded bg-industrial/50">
                  <div
                    className="h-full rounded bg-accent/25"
                    style={{ width: `${s.notListed ? 0 : Math.max(3, (s.mentions / maxMentions) * 100)}%` }}
                  />
                  <span className="absolute inset-y-0 left-2 flex items-center font-mono text-[10px] text-dim">
                    {s.notListed ? "sin buzz" : `${s.mentions} menc.`}
                  </span>
                </div>
                <span className="hidden w-14 shrink-0 text-right font-mono text-[11px] sm:block">
                  <Delta pct={s.pctChange24h} />
                </span>
                <span className="hidden w-8 shrink-0 text-right font-mono text-[10px] text-muted sm:block">
                  {s.rank ? `#${s.rank}` : "—"}
                </span>
                <span className="w-[72px] shrink-0 text-right">
                  <PriceCell q={priceMap.get(s.ticker)} />
                </span>
                <span className="w-10 shrink-0 text-right">
                  <EarningsCell e={earnMap.get(s.ticker)} />
                </span>
                <span className="w-12 shrink-0 text-right">
                  <SignalChip tipo={signalMap.get(s.ticker)} />
                </span>
              </div>
            ))}
          </div>
          {stocks.length > 14 && (
            <p className="mt-2 font-mono text-[10px] text-muted">
              +{stocks.length - 14} acciones más en el universo del Gestor (ordenadas por buzz)
            </p>
          )}

          {/* Trending ahora */}
          {d && d.trending.length > 0 && (
            <div className="mt-4 border-t border-industrial pt-3">
              <p className="mb-2 font-mono text-[10px] uppercase tracking-wider text-muted">
                🔥 Trending ahora (fuera de tu lista)
              </p>
              <div className="flex flex-wrap gap-1.5">
                {d.trending.map((t) => (
                  <span
                    key={t.ticker}
                    className="rounded border border-industrial bg-base px-2 py-1 font-mono text-[10px] text-dim"
                  >
                    <span className="text-white">{t.ticker}</span>{" "}
                    <span className="text-muted">{t.mentions}</span> <Delta pct={t.pctChange24h} />
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Noticias (Exa) */}
        <div className="min-w-0 border-t border-industrial pt-3 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
          <p className="mb-2 font-mono text-[10px] uppercase tracking-wider text-muted">Noticias · Exa</p>
          {d && !d.exaConfigured ? (
            <p className="text-[11px] leading-relaxed text-muted">
              Añade <span className="font-mono text-dim">EXA_API_KEY</span> en Vercel para ver titulares.
            </p>
          ) : d && (!Array.isArray(d.news) || d.news.length === 0) ? (
            <p className="text-[11px] text-muted">{d.exaErr ? "Error consultando Exa." : "Sin noticias recientes."}</p>
          ) : (
            <ul className="space-y-0.5">
              {loading && !d &&
                [0, 1, 2, 3].map((i) => (
                  <li key={`hueco-n-${i}`}>
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="mt-1.5 h-3 w-4/5" />
                    <Skeleton className="mt-1.5 h-2 w-24" />
                  </li>
                ))}
              {(d?.news ?? []).map((n, i) => (
                <li key={i}>
                  {/*
                    Estos titulares SIEMPRE fueron enlaces, pero no lo parecían:
                    mismo color que el texto de alrededor, sin subrayado ni
                    icono, y la única pista era el cambio de color al pasar el
                    ratón — que en una pantalla táctil no existe. Yo mismo los
                    di por texto plano al revisar esta tarjeta. Un subrayado
                    tenue permanente lo resuelve sin ensuciar la columna.
                  */}
                  <a
                    href={n.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    /*
                      316×17 medía este enlace en un iPhone: ancho de sobra y
                      diecisiete píxeles de alto. Es un titular de una sola
                      línea, no un enlace dentro de una frase, así que le aplica
                      el mínimo táctil como a cualquier otro control.
                    */
                    className="block py-2.5 text-[12px] leading-snug text-dim underline decoration-cement underline-offset-2 transition-colors hover:text-accent hover:decoration-accent [overflow-wrap:anywhere]"
                  >
                    {sinSufijo(n.title)}
                  </a>
                  <p className="mt-0.5 font-mono text-[9px] text-muted">
                    {n.source} · {ago(n.publishedDate)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <p className="border-t border-industrial px-5 py-2.5 text-[10px] leading-relaxed text-muted">
        Buzz = volumen de menciones en Reddit/WSB (ApeWisdom). Es <span className="text-dim">contexto</span> —
        detecta qué está caliente—, no una señal de entrada.
      </p>
    </div>
  );
}
