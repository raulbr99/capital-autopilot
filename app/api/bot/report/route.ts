import { NextResponse } from "next/server";
import { getAccount, getPositions, capitalConfigured } from "@/lib/capital";
import { bot } from "@/lib/store";
import { loadConfig, getTrades } from "@/lib/db";
import { analyze } from "@/lib/analytics";

export const dynamic = "force-dynamic";

/**
 * Informe de seguimiento en JSON. Lo consume la rutina Claude diaria.
 */
export async function GET() {
  if (!capitalConfigured()) return NextResponse.json({ configured: false });
  const cfg = await loadConfig();
  try {
    const [account, positions, trades] = await Promise.all([
      getAccount(),
      getPositions(),
      getTrades(300),
    ]);
    const analytics = analyze(trades);
    const floatPnl = positions.reduce((s, p) => s + (p.upl || 0), 0);
    return NextResponse.json({
      configured: true,
      generatedAt: new Date().toISOString(),
      mode: cfg.dryRun ? "paper" : "live",
      armed: process.env.AUTOPILOT_ARMED === "true",
      killedToday: bot().killedDate === new Date().toISOString().slice(0, 10),
      account: {
        balance: account.balance,
        available: account.available,
        pnl: account.pnl,
        equity: account.balance + (account.pnl || 0),
        currency: account.currency,
      },
      floatingPnl: floatPnl,
      openPositions: positions.map((p) => ({
        epic: p.epic,
        direction: p.direction,
        size: p.size,
        level: p.level,
        upl: p.upl,
      })),
      performance: {
        closed: analytics.closed,
        winRate: analytics.winRate,
        netPnl: analytics.netPnl,
        profitFactor: analytics.profitFactor,
        maxDrawdown: analytics.maxDrawdown,
        expectancy: analytics.expectancy,
        byEpic: analytics.byEpic,
      },
      config: {
        watchlist: cfg.watchlist,
        risk: cfg.risk,
      },
      recentEvents: bot().logs.slice(0, 25).map((l) => ({
        ts: new Date(l.ts).toISOString(),
        level: l.level,
        message: l.message,
      })),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
