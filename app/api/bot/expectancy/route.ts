import { NextResponse } from "next/server";
import { getTrades, getEquity } from "@/lib/db";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const EPS = 0.005;

/**
 * Expectativa REAL del bot calculada solo con trades cerrados:
 * win rate, ganancia/pérdida media, payoff (R), expectancy €/trade, profit factor,
 * win rate de equilibrio, frecuencia observada y proyección semana/mes a ese ritmo.
 */
export async function GET() {
  try {
    const [trades, eq] = await Promise.all([getTrades(500), getEquity(2)]);
    const closed = trades.filter((t) => t.status === "closed" && typeof t.pnl === "number");
    const equity = eq.length ? eq[eq.length - 1].equity : 0;

    const wins = closed.filter((t) => (t.pnl as number) > EPS);
    const losses = closed.filter((t) => (t.pnl as number) < -EPS);
    const breakeven = closed.length - wins.length - losses.length;

    const sumWin = wins.reduce((s, t) => s + (t.pnl as number), 0);
    const sumLoss = losses.reduce((s, t) => s + Math.abs(t.pnl as number), 0);
    const netTotal = closed.reduce((s, t) => s + (t.pnl as number), 0);

    const decided = wins.length + losses.length;
    const winRate = decided ? (wins.length / decided) * 100 : 0;
    const avgWin = wins.length ? sumWin / wins.length : 0;
    const avgLoss = losses.length ? sumLoss / losses.length : 0;
    const payoff = avgLoss > 0 ? avgWin / avgLoss : 0; // R: avgWin / avgLoss
    const expectancy = closed.length ? netTotal / closed.length : 0; // €/trade realizado
    const profitFactor = sumLoss > 0 ? sumWin / sumLoss : sumWin > 0 ? Infinity : 0;
    const breakevenWinRate = payoff > 0 ? (1 / (1 + payoff)) * 100 : null;

    // frecuencia observada
    const ts = closed.map((t) => t.closedTs || t.ts).filter(Boolean) as number[];
    const firstTs = ts.length ? Math.min(...ts) : 0;
    const lastTs = ts.length ? Math.max(...ts) : 0;
    const spanDays = firstTs ? Math.max((lastTs - firstTs) / 86_400_000, 0.5) : 0;
    const tradesPerWeek = spanDays > 0 ? (closed.length / spanDays) * 7 : 0;

    // proyección a la frecuencia observada
    const projWeek = expectancy * tradesPerWeek;
    const projMonth = projWeek * 4.345;
    const pct = (v: number) => (equity > 0 ? (v / equity) * 100 : 0);

    const best = closed.reduce((m, t) => Math.max(m, t.pnl as number), -Infinity);
    const worst = closed.reduce((m, t) => Math.min(m, t.pnl as number), Infinity);

    return NextResponse.json({
      closed: closed.length,
      wins: wins.length,
      losses: losses.length,
      breakeven,
      winRate,
      avgWin,
      avgLoss,
      payoff,
      expectancy,
      profitFactor,
      netTotal,
      breakevenWinRate,
      best: Number.isFinite(best) ? best : 0,
      worst: Number.isFinite(worst) ? worst : 0,
      spanDays,
      tradesPerWeek,
      equity,
      projWeek,
      projMonth,
      projWeekPct: pct(projWeek),
      projMonthPct: pct(projMonth),
      enough: closed.length >= 30,
    });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "expectancy failed" },
      { status: 500 }
    );
  }
}
