/**
 * Funding rates de Binance Futures (público, sin API key; 500 req/5min).
 * El funding es LA señal de posicionamiento en cripto: positivo = los longs
 * pagan a los shorts (mercado cargado de longs); muy positivo = sobrecalentado
 * (riesgo de long squeeze); negativo = shorts pagan (combustible de squeeze alcista).
 *
 * ⚠️ Binance devuelve HTTP 451 a IPs de EE.UU. — la route que use esto debe
 * fijar preferredRegion a una región no-US de Vercel (p.ej. fra1).
 */

const BASE = "https://fapi.binance.com";

export type FundingInfo = {
  epic: string; // nomenclatura del bot (BTCUSD)
  symbol: string; // símbolo Binance (BTCUSDT)
  currentRatePct: number | null; // % por periodo de 8h
  avg3dPct: number | null; // media de los últimos 9 periodos (3 días)
  annualizedPct: number | null; // % anualizado (rate · 3 · 365)
  nextFundingTime: string | null;
  markPrice: number | null;
  bias: "crowded-long" | "long" | "neutral" | "short" | "crowded-short";
};

const EPIC_TO_BINANCE: Record<string, string> = {
  BTCUSD: "BTCUSDT",
  ETHUSD: "ETHUSDT",
};

// El funding solo cambia cada 8h; caché 10 min por proceso.
let cache: { t: number; data: FundingInfo[] } | null = null;
const TTL = 10 * 60 * 1000;

function biasFor(ratePct: number | null): FundingInfo["bias"] {
  if (ratePct == null) return "neutral";
  if (ratePct >= 0.03) return "crowded-long";
  if (ratePct >= 0.005) return "long";
  if (ratePct <= -0.03) return "crowded-short";
  if (ratePct <= -0.005) return "short";
  return "neutral";
}

async function jget(path: string): Promise<any> {
  const res = await fetch(`${BASE}${path}`, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Binance ${res.status}`);
  return res.json();
}

export async function fundingRates(epics: string[] = Object.keys(EPIC_TO_BINANCE)): Promise<FundingInfo[]> {
  if (cache && Date.now() - cache.t < TTL) return cache.data;
  const out = await Promise.all(
    epics
      .filter((e) => EPIC_TO_BINANCE[e])
      .map(async (epic): Promise<FundingInfo> => {
        const symbol = EPIC_TO_BINANCE[epic];
        try {
          const [pi, hist] = await Promise.all([
            jget(`/fapi/v1/premiumIndex?symbol=${symbol}`),
            jget(`/fapi/v1/fundingRate?symbol=${symbol}&limit=9`),
          ]);
          const cur = pi.lastFundingRate != null ? Number(pi.lastFundingRate) * 100 : null;
          const rates: number[] = (Array.isArray(hist) ? hist : []).map((h: any) => Number(h.fundingRate) * 100);
          const avg3d = rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : null;
          return {
            epic,
            symbol,
            currentRatePct: cur != null ? round6(cur) : null,
            avg3dPct: avg3d != null ? round6(avg3d) : null,
            annualizedPct: cur != null ? Math.round(cur * 3 * 365 * 10) / 10 : null,
            nextFundingTime: pi.nextFundingTime ? new Date(pi.nextFundingTime).toISOString() : null,
            markPrice: pi.markPrice != null ? Number(pi.markPrice) : null,
            bias: biasFor(cur),
          };
        } catch {
          return { epic, symbol, currentRatePct: null, avg3dPct: null, annualizedPct: null, nextFundingTime: null, markPrice: null, bias: "neutral" };
        }
      })
  );
  cache = { t: Date.now(), data: out };
  return out;
}

function round6(n: number) {
  return Math.round(n * 1e6) / 1e6;
}
