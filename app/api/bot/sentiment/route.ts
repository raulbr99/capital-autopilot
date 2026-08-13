import { NextResponse } from "next/server";
import { apewisdom, type ApeTicker } from "@/lib/apewisdom";
import { exaNews, exaConfigured } from "@/lib/exa";
import { stockQuotes } from "@/lib/prices";
import { earningsCalendar } from "@/lib/earnings";
import { loadConfig } from "@/lib/db";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const maxDuration = 30;

// Caché en memoria (best-effort en serverless) para limitar llamadas a Exa/ApeWisdom.
let cache: { t: number; data: unknown } | null = null;
const TTL = 10 * 60 * 1000; // 10 min

export async function GET() {
  if (cache && Date.now() - cache.t < TTL) {
    return NextResponse.json({ ...(cache.data as object), cached: true });
  }
  try {
    const cfg = await loadConfig();
    const stockEpics = cfg.instruments
      .filter((i) => i.category === "stocks")
      .map((i) => i.epic);
    const ourSet = new Set(stockEpics);

    const all = await apewisdom("all-stocks", 1).catch(() => [] as ApeTicker[]);
    const byTicker = new Map(all.map((r) => [r.ticker, r]));
    const stocks: ApeTicker[] = stockEpics.map(
      (t) =>
        byTicker.get(t) ?? {
          ticker: t,
          name: t,
          rank: null,
          rankPrev: null,
          mentions: 0,
          mentions24hAgo: null,
          pctChange24h: null,
          upvotes: 0,
          sentimentScore: null,
          notListed: true,
        }
    );
    const trending = all.filter((r) => !ourSet.has(r.ticker)).slice(0, 8);

    // Precios con extendido (pre-market / after-hours) vía Yahoo
    const prices = await stockQuotes(stockEpics).catch(() => []);

    // Calendario de earnings (próxima fecha + EPS estimado + sorpresas) vía Yahoo
    const earnings = await earningsCalendar(stockEpics).catch(() => []);

    let news: Awaited<ReturnType<typeof exaNews>> = [];
    let exaErr = false;
    if (exaConfigured()) {
      news = await exaNews(
        `Latest US stock market news, earnings and analyst views on ${stockEpics.join(", ")}`,
        6
      ).catch(() => {
        exaErr = true;
        return [];
      });
    }

    const data = {
      fetchedAt: new Date().toISOString(),
      /**
       * Igual que en COT: las reglas de lectura estaban solo en la interfaz.
       * La más importante —resultados a 7 días o menos bloquean apertura— es
       * una REGLA DURA del motor, y el Gestor la recibía sin enunciar.
       */
      guide:
        `buzz = volumen de menciones en Reddit/WSB (ApeWisdom), NO precio: mide atención, no dirección. ` +
        `pctChange24h es la variación de MENCIONES, no de cotización. ` +
        `earnings.daysUntil <= 7 bloquea abrir en ese activo: el hueco de apertura tras resultados se salta el stop. ` +
        `prices.marketState indica si la bolsa está abierta (REGULAR), en pre/after (PRE/POST) o cerrada; ` +
        `fuera de REGULAR el motor no abre acciones. ` +
        `Un buzz alto sin confluencia técnica no es una tesis.`,
      stocks,
      trending,
      prices,
      earnings,
      news,
      exaConfigured: exaConfigured(),
      exaErr,
    };
    cache = { t: Date.now(), data };
    return NextResponse.json(data);
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "sentiment failed" },
      { status: 500 }
    );
  }
}
