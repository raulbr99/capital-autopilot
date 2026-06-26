/**
 * COT — Commitment of Traders (CFTC Legacy Futures-Only, dataset 6dca-aqww).
 * Gratis, sin key. Net de NO-COMERCIALES (especuladores) = el sesgo del dinero
 * grande. Cubre forex + commodities con una sola fuente. Publica semanal (vie,
 * datos del martes).
 */

const CFTC = "https://publicreporting.cftc.gov/resource/6dca-aqww.json";

// Símbolo amigable -> patrón de market_and_exchange_names (Legacy)
export const COT_MARKETS: Record<string, string> = {
  EUR: "EURO FX",
  GBP: "BRITISH POUND",
  JPY: "JAPANESE YEN",
  CHF: "SWISS FRANC",
  NZD: "NZ DOLLAR",
  AUD: "AUSTRALIAN DOLLAR",
  CAD: "CANADIAN DOLLAR",
  USD: "U.S. DOLLAR INDEX",
  GOLD: "GOLD",
  SILVER: "SILVER",
  OIL_CRUDE: "CRUDE OIL, LIGHT SWEET",
  NATURALGAS: "NATURAL GAS",
  COPPER: "COPPER",
};

export type CotData = {
  symbol: string;
  market: string;
  reportDate: string;
  net: number; // no-comerciales long - short
  netPrev: number | null;
  change: number | null;
  longs: number;
  shorts: number;
  pctLong: number; // long / (long+short) * 100
  bias: "long" | "short" | "neutral";
};

const num = (v: unknown) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

export async function cot(symbol: string): Promise<CotData | null> {
  const pattern = COT_MARKETS[symbol.toUpperCase()];
  if (!pattern) return null;
  const params = new URLSearchParams({
    $where: `upper(market_and_exchange_names) like '%${pattern}%'`,
    $order: "report_date_as_yyyy_mm_dd DESC",
    $limit: "40",
  });
  const res = await fetch(`${CFTC}?${params}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`CFTC ${res.status}`);
  const rows = (await res.json()) as any[];
  if (!rows.length) return null;

  // Por cada fecha, quedarse con el contrato principal (mayor OI) → evita MICRO/E-MINI.
  const byDate = new Map<string, any>();
  for (const r of rows) {
    const d = r.report_date_as_yyyy_mm_dd;
    if (!d) continue;
    const oi = num(r.open_interest_all);
    const cur = byDate.get(d);
    if (!cur || oi > num(cur.open_interest_all)) byDate.set(d, r);
  }
  const dates = [...byDate.keys()].sort().reverse();
  const latest = byDate.get(dates[0]);
  const prev = dates[1] ? byDate.get(dates[1]) : null;

  const longs = num(latest.noncomm_positions_long_all);
  const shorts = num(latest.noncomm_positions_short_all);
  const net = longs - shorts;
  const netPrev = prev
    ? num(prev.noncomm_positions_long_all) - num(prev.noncomm_positions_short_all)
    : null;
  const pctLong = longs + shorts > 0 ? (longs / (longs + shorts)) * 100 : 50;

  return {
    symbol: symbol.toUpperCase(),
    market: latest.market_and_exchange_names,
    reportDate: String(latest.report_date_as_yyyy_mm_dd || "").slice(0, 10),
    net,
    netPrev,
    change: netPrev != null ? net - netPrev : null,
    longs,
    shorts,
    pctLong,
    bias: pctLong > 55 ? "long" : pctLong < 45 ? "short" : "neutral",
  };
}
