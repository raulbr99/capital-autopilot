/**
 * Precios de acciones con extendido (pre-market / after-hours) vía Yahoo Finance.
 * Capital no da extended-hours de US stocks; Yahoo sí. Gratis, sin key.
 */
import YahooFinance from "yahoo-finance2";

const yf = new YahooFinance({ suppressNotices: ["yahooSurvey", "ripHistorical"] });

export type StockQuote = {
  symbol: string;
  marketState: string; // PRE | REGULAR | POST | POSTPOST | CLOSED
  regularPrice: number | null;
  regularChangePct: number | null;
  extPrice: number | null; // pre o post según el estado
  extChangePct: number | null;
  extLabel: "pre-market" | "after-hours" | null;
};

export async function stockQuotes(symbols: string[]): Promise<StockQuote[]> {
  if (!symbols.length) return [];
  const res = await yf.quote(symbols);
  const arr = (Array.isArray(res) ? res : [res]) as any[];
  return arr.map((q) => {
    const state: string = q.marketState || "";
    const isPre = state === "PRE";
    const isPost = state === "POST" || state === "POSTPOST" || state === "CLOSED";
    return {
      symbol: q.symbol,
      marketState: state,
      regularPrice: q.regularMarketPrice ?? null,
      regularChangePct: q.regularMarketChangePercent ?? null,
      extPrice: isPre ? q.preMarketPrice ?? null : isPost ? q.postMarketPrice ?? null : null,
      extChangePct: isPre
        ? q.preMarketChangePercent ?? null
        : isPost
          ? q.postMarketChangePercent ?? null
          : null,
      extLabel: isPre ? "pre-market" : isPost ? "after-hours" : null,
    };
  });
}
