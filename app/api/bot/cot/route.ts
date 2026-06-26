import { NextResponse } from "next/server";
import { cot, type CotData } from "@/lib/cot";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const maxDuration = 30;

const FOREX = ["EUR", "GBP", "JPY", "CHF", "NZD", "USD"];
const COMMODITIES = ["GOLD", "SILVER", "OIL_CRUDE", "NATURALGAS", "COPPER"];

// El COT es semanal → caché larga en memoria (best-effort en serverless).
let cache: { t: number; data: unknown } | null = null;
const TTL = 6 * 60 * 60 * 1000; // 6 h

export async function GET() {
  if (cache && Date.now() - cache.t < TTL) {
    return NextResponse.json({ ...(cache.data as object), cached: true });
  }
  try {
    const symbols = [...FOREX, ...COMMODITIES];
    const results = await Promise.all(
      symbols.map((s) => cot(s).catch(() => null))
    );
    const map: Record<string, CotData> = {};
    results.forEach((r) => {
      if (r) map[r.symbol] = r;
    });
    const data = {
      fetchedAt: new Date().toISOString(),
      reportDate: Object.values(map)[0]?.reportDate ?? null,
      forex: FOREX.map((s) => map[s]).filter(Boolean),
      commodities: COMMODITIES.map((s) => map[s]).filter(Boolean),
    };
    cache = { t: Date.now(), data };
    return NextResponse.json(data);
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "cot failed" },
      { status: 500 }
    );
  }
}
