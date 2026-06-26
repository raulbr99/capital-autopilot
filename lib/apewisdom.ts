/**
 * ApeWisdom — buzz social de acciones (Reddit/WSB), gratis y sin API key.
 * Da volumen de menciones + variación 24h + rank trending. NO da dirección;
 * para "dónde va" usamos las noticias de Exa.
 *   https://apewisdom.io/api/
 */

const BASE = "https://apewisdom.io/api/v1.0";

export type ApeTicker = {
  ticker: string;
  name: string;
  rank: number | null;
  rankPrev: number | null;
  mentions: number;
  mentions24hAgo: number | null;
  pctChange24h: number | null;
  upvotes: number;
  sentimentScore: number | null;
  notListed?: boolean;
};

/** source: all-stocks | wallstreetbets | stocks | options | crypto */
export async function apewisdom(source = "all-stocks", page = 1): Promise<ApeTicker[]> {
  const res = await fetch(`${BASE}/filter/${encodeURIComponent(source)}?page=${page}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(8000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`ApeWisdom ${res.status}`);
  const data = await res.json();
  return ((data.results ?? []) as any[]).map((r) => ({
    ticker: r.ticker,
    name: r.name ?? r.ticker,
    rank: r.rank ?? null,
    rankPrev: r.rank_24h_ago ?? null,
    mentions: r.mentions ?? 0,
    mentions24hAgo: r.mentions_24h_ago ?? null,
    pctChange24h:
      r.mentions != null && r.mentions_24h_ago && r.mentions_24h_ago > 0
        ? ((r.mentions - r.mentions_24h_ago) / r.mentions_24h_ago) * 100
        : null,
    upvotes: r.upvotes ?? 0,
    sentimentScore: typeof r.sentiment_score === "number" ? r.sentiment_score : null,
  }));
}
