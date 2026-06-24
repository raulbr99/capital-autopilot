/**
 * Metricas de rendimiento a partir de trades cerrados.
 */

import type { TradeRecord } from "./store";

export type Analytics = {
  total: number;
  closed: number;
  open: number;
  wins: number;
  losses: number;
  winRate: number; // %
  netPnl: number;
  grossWin: number;
  grossLoss: number;
  profitFactor: number;
  avgWin: number;
  avgLoss: number;
  expectancy: number;
  maxDrawdown: number; // sobre curva de PnL acumulado
  bestStreak: number;
  worstStreak: number;
  byEpic: { epic: string; pnl: number; trades: number; winRate: number }[];
  pnlCurve: { ts: number; cum: number }[];
  dailyPnl: { date: string; pnl: number }[];
};

export function analyze(trades: TradeRecord[]): Analytics {
  const closed = trades
    .filter((t) => t.status === "closed" && typeof t.pnl === "number")
    .sort((a, b) => (a.closedTs || a.ts) - (b.closedTs || b.ts));

  const wins = closed.filter((t) => (t.pnl || 0) >= 0);
  const losses = closed.filter((t) => (t.pnl || 0) < 0);
  const grossWin = wins.reduce((s, t) => s + (t.pnl || 0), 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + (t.pnl || 0), 0));
  const netPnl = grossWin - grossLoss;

  // curva acumulada + max drawdown
  let cum = 0;
  let peak = 0;
  let maxDd = 0;
  const pnlCurve = closed.map((t) => {
    cum += t.pnl || 0;
    peak = Math.max(peak, cum);
    maxDd = Math.max(maxDd, peak - cum);
    return { ts: t.closedTs || t.ts, cum };
  });

  // rachas
  let cur = 0;
  let best = 0;
  let worst = 0;
  for (const t of closed) {
    const win = (t.pnl || 0) >= 0;
    if (win) cur = cur > 0 ? cur + 1 : 1;
    else cur = cur < 0 ? cur - 1 : -1;
    best = Math.max(best, cur);
    worst = Math.min(worst, cur);
  }

  // por activo
  const epicMap = new Map<string, { pnl: number; trades: number; wins: number }>();
  for (const t of closed) {
    const e = epicMap.get(t.epic) || { pnl: 0, trades: 0, wins: 0 };
    e.pnl += t.pnl || 0;
    e.trades++;
    if ((t.pnl || 0) >= 0) e.wins++;
    epicMap.set(t.epic, e);
  }
  const byEpic = [...epicMap.entries()]
    .map(([epic, v]) => ({
      epic,
      pnl: v.pnl,
      trades: v.trades,
      winRate: v.trades ? (v.wins / v.trades) * 100 : 0,
    }))
    .sort((a, b) => b.pnl - a.pnl);

  // PnL diario
  const dayMap = new Map<string, number>();
  for (const t of closed) {
    const d = new Date(t.closedTs || t.ts).toISOString().slice(0, 10);
    dayMap.set(d, (dayMap.get(d) || 0) + (t.pnl || 0));
  }
  const dailyPnl = [...dayMap.entries()]
    .map(([date, pnl]) => ({ date, pnl }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    total: trades.length,
    closed: closed.length,
    open: trades.filter((t) => t.status === "open").length,
    wins: wins.length,
    losses: losses.length,
    winRate: closed.length ? (wins.length / closed.length) * 100 : 0,
    netPnl,
    grossWin,
    grossLoss,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0,
    avgWin: wins.length ? grossWin / wins.length : 0,
    avgLoss: losses.length ? grossLoss / losses.length : 0,
    expectancy: closed.length ? netPnl / closed.length : 0,
    maxDrawdown: maxDd,
    bestStreak: best,
    worstStreak: worst,
    byEpic,
    pnlCurve,
    dailyPnl,
  };
}
