/**
 * Calendario de earnings vía Yahoo Finance (quoteSummary): próxima fecha de
 * resultados + EPS estimado + últimas sorpresas. Gratis, sin key (misma dep
 * que lib/prices.ts). Para que el Gestor de stocks NO entre justo antes de
 * earnings y sepa si la empresa suele batir estimaciones.
 */
import YahooFinance from "yahoo-finance2";

const yf = new YahooFinance({ suppressNotices: ["yahooSurvey", "ripHistorical"] });

export type EarningsInfo = {
  symbol: string;
  nextEarningsDate: string | null; // ISO
  daysUntil: number | null;
  imminent: boolean; // dentro de 7 días -> prudencia
  epsEstimate: number | null;
  lastSurprises: { quarter: string; actual: number | null; estimate: number | null; surprisePct: number | null }[];
};

// Las fechas de earnings cambian poco: caché 6h por proceso.
let cache: { t: number; key: string; data: EarningsInfo[] } | null = null;
const TTL = 6 * 60 * 60 * 1000;

import { IMMINENT_DAYS } from "./model";
export { IMMINENT_DAYS };

export async function earningsCalendar(symbols: string[]): Promise<EarningsInfo[]> {
  if (!symbols.length) return [];
  const key = symbols.slice().sort().join(",");
  if (cache && cache.key === key && Date.now() - cache.t < TTL) return cache.data;

  const out = await Promise.all(
    symbols.map(async (symbol): Promise<EarningsInfo> => {
      try {
        const qs: any = await yf.quoteSummary(symbol, { modules: ["calendarEvents", "earnings"] });
        const rawDate = qs.calendarEvents?.earnings?.earningsDate?.[0] ?? null;
        const next = rawDate ? new Date(rawDate) : null;
        const days =
          next && !isNaN(next.getTime())
            ? Math.ceil((next.getTime() - Date.now()) / 86_400_000)
            : null;
        const quarters: any[] = qs.earnings?.earningsChart?.quarterly ?? [];
        return {
          symbol,
          nextEarningsDate: next && !isNaN(next.getTime()) ? next.toISOString() : null,
          daysUntil: days,
          imminent: days != null && days >= 0 && days <= IMMINENT_DAYS,
          epsEstimate: qs.calendarEvents?.earnings?.earningsAverage ?? null,
          lastSurprises: quarters.slice(-2).map((q) => ({
            quarter: q.date ?? "",
            actual: q.actual ?? null,
            estimate: q.estimate ?? null,
            surprisePct: q.surprisePct != null ? Number(q.surprisePct) : null,
          })),
        };
      } catch {
        return { symbol, nextEarningsDate: null, daysUntil: null, imminent: false, epsEstimate: null, lastSurprises: [] };
      }
    })
  );
  cache = { t: Date.now(), key, data: out };
  return out;
}
