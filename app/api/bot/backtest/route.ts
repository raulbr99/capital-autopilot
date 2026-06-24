import { NextResponse } from "next/server";
import { getPrices, capitalConfigured } from "@/lib/capital";
import { loadConfig } from "@/lib/db";
import { backtest } from "@/lib/backtest";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Backtest sobre histórico. Por defecto corre toda la watchlist.
 *   ?epic=BTCUSD       limita a un activo
 *   ?resolution=HOUR   resolucion de velas (def. MINUTE)
 *   ?max=400           nº de velas
 */
export async function GET(req: Request) {
  if (!capitalConfigured()) {
    return NextResponse.json({ configured: false });
  }
  const { searchParams } = new URL(req.url);
  const cfg = await loadConfig();
  const resolution = searchParams.get("resolution") || "MINUTE";
  const max = Math.min(1000, Number(searchParams.get("max") || 400));
  const epicParam = searchParams.get("epic");
  const epics = epicParam ? [epicParam.toUpperCase()] : cfg.watchlist;

  try {
    const results = [];
    for (const epic of epics) {
      const candles = await getPrices(epic, resolution, max);
      results.push(
        backtest(epic, candles, cfg.strategy, cfg.risk, cfg.sizePerTrade)
      );
    }
    const agg = {
      trades: results.reduce((s, r) => s + r.trades, 0),
      netPnl: results.reduce((s, r) => s + r.netPnl, 0),
      wins: results.reduce((s, r) => s + r.wins, 0),
    };
    return NextResponse.json({
      configured: true,
      resolution,
      max,
      results,
      aggregate: {
        ...agg,
        winRate: agg.trades ? (agg.wins / agg.trades) * 100 : 0,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
