"use client";

import { useEffect, useState } from "react";

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
type Data = {
  fetchedAt: string;
  stocks: Ape[];
  trending: Ape[];
  prices: SQ[];
  news: News[];
  exaConfigured: boolean;
  exaErr?: boolean;
};

const STATE_LABEL: Record<string, string> = {
  PRE: "pre-market",
  REGULAR: "● abierto",
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

export default function SentimentBoard({ className = "" }: { className?: string }) {
  const [d, setD] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/bot/sentiment")
        .then((r) => r.json())
        .then((x) => {
          if (alive && !x.error) setD(x);
        })
        .catch(() => {})
        .finally(() => alive && setLoading(false));
    load();
    const t = setInterval(load, 5 * 60 * 1000); // refresco cada 5 min
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const maxMentions = Math.max(1, ...(d?.stocks ?? []).map((s) => s.mentions));
  const stocks = [...(d?.stocks ?? [])].sort((a, b) => b.mentions - a.mentions);
  const priceMap = new Map((d?.prices ?? []).map((p) => [p.symbol, p]));
  const marketState = d?.prices?.[0]?.marketState ?? "";

  return (
    <div className={`rounded-xl border border-industrial bg-soft ${className}`}>
      <div className="flex items-center justify-between border-b border-industrial px-5 py-3.5">
        <h2 className="tag">Sentimiento, buzz &amp; precio · acciones</h2>
        <span className="flex items-center gap-2 font-mono text-[10px] text-muted">
          {marketState && (
            <span className="rounded bg-industrial px-1.5 py-0.5 text-dim">
              {STATE_LABEL[marketState] ?? marketState}
            </span>
          )}
          {loading && !d ? "cargando…" : d ? ago(d.fetchedAt) : ""}
        </span>
      </div>

      <div className="grid gap-5 p-4 lg:grid-cols-[1fr_320px]">
        {/* Buzz de tus acciones */}
        <div className="min-w-0">
          <p className="mb-2 font-mono text-[10px] uppercase tracking-wider text-muted">
            Menciones (buzz) · Δ24h · rank · precio (pre/post)
          </p>
          <div className="space-y-1.5">
            {stocks.map((s) => (
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
                <span className="w-14 shrink-0 text-right font-mono text-[11px]">
                  <Delta pct={s.pctChange24h} />
                </span>
                <span className="w-8 shrink-0 text-right font-mono text-[10px] text-muted">
                  {s.rank ? `#${s.rank}` : "—"}
                </span>
                <span className="w-[72px] shrink-0 text-right">
                  <PriceCell q={priceMap.get(s.ticker)} />
                </span>
              </div>
            ))}
          </div>

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
          ) : d && d.news.length === 0 ? (
            <p className="text-[11px] text-muted">{d.exaErr ? "Error consultando Exa." : "Sin noticias recientes."}</p>
          ) : (
            <ul className="space-y-2.5">
              {(d?.news ?? []).map((n, i) => (
                <li key={i}>
                  <a
                    href={n.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-[12px] leading-snug text-dim transition-colors hover:text-accent [overflow-wrap:anywhere]"
                  >
                    {n.title}
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
