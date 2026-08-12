import type { Analytics, TradeRecord } from "./types";

// Una operación cerrada EXACTAMENTE a cero no es un acierto: es un empate.
// Contarla como ganadora inflaba el win rate (8 de 33 en el histórico actual:
// 52% aparente frente al 36% real) y contradecía al panel de expectativa, que
// ya lo hacía bien. El win rate se mide sobre las que SÍ se decidieron.
const EPS_PNL = 0.005;
const esGanadora = (p: number | undefined) => (p || 0) > EPS_PNL;
const esPerdedora = (p: number | undefined) => (p || 0) < -EPS_PNL;


/** Cálculo de métricas en cliente (espejo de lib/analytics.ts) para filtrar en vivo. */
export function analyze(trades: TradeRecord[]): Analytics {
  const closed = trades
    .filter((t) => t.status === "closed" && typeof t.pnl === "number")
    .sort((a, b) => (a.closedTs || a.ts) - (b.closedTs || b.ts));

  const wins = closed.filter((t) => esGanadora(t.pnl));
  const losses = closed.filter((t) => esPerdedora(t.pnl));
  const grossWin = wins.reduce((s, t) => s + (t.pnl || 0), 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + (t.pnl || 0), 0));
  const netPnl = grossWin - grossLoss;

  let cum = 0;
  let peak = 0;
  let maxDd = 0;
  const pnlCurve = closed.map((t) => {
    cum += t.pnl || 0;
    peak = Math.max(peak, cum);
    maxDd = Math.max(maxDd, peak - cum);
    return { ts: t.closedTs || t.ts, cum };
  });

  let cur = 0;
  let best = 0;
  let worst = 0;
  for (const t of closed) {
    const win = esGanadora(t.pnl);
    if (win) cur = cur > 0 ? cur + 1 : 1;
    else cur = cur < 0 ? cur - 1 : -1;
    best = Math.max(best, cur);
    worst = Math.min(worst, cur);
  }

  const epicMap = new Map<string, { pnl: number; trades: number; wins: number; losses: number }>();
  for (const t of closed) {
    const e = epicMap.get(t.epic) || { pnl: 0, trades: 0, wins: 0, losses: 0 };
    e.pnl += t.pnl || 0;
    e.trades++;
    if (esGanadora(t.pnl)) e.wins++;
    else if (esPerdedora(t.pnl)) e.losses++;
    epicMap.set(t.epic, e);
  }
  const byEpic = [...epicMap.entries()]
    .map(([epic, v]) => ({
      epic,
      pnl: v.pnl,
      trades: v.trades,
      winRate: v.wins + v.losses ? (v.wins / (v.wins + v.losses)) * 100 : 0,
    }))
    .sort((a, b) => b.pnl - a.pnl);

  const dayMap = new Map<string, number>();
  for (const t of closed) {
    const d = new Date(t.closedTs || t.ts).toISOString().slice(0, 10);
    dayMap.set(d, (dayMap.get(d) || 0) + (t.pnl || 0));
  }
  const dailyPnl = [...dayMap.entries()]
    .map(([date, pnl]) => ({ date, pnl }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const avgWin = wins.length ? grossWin / wins.length : 0;
  const avgLoss = losses.length ? grossLoss / losses.length : 0;
  // Payoff y punto de equilibrio: con ganadores 2× los perdedores, acertar el
  // 34% ya es rentable. Sin este contraste, un win rate suelto no dice nada.
  const payoff = avgLoss > 0 ? avgWin / avgLoss : 0;
  const breakevenWinRate = payoff > 0 ? 100 / (1 + payoff) : 0;

  const byDirection = (["BUY", "SELL"] as const)
    .map((dir) => {
      const set = closed.filter((t) => t.direction === dir);
      const w = set.filter((t) => esGanadora(t.pnl)).length;
      return {
        dir,
        trades: set.length,
        wins: w,
        winRate: set.length ? (w / set.length) * 100 : 0,
        pnl: set.reduce((s, t) => s + (t.pnl || 0), 0),
      };
    })
    .filter((d) => d.trades > 0);

  return {
    payoff,
    breakevenWinRate,
    byDirection,
    enough: closed.length >= 30,
    total: trades.length,
    closed: closed.length,
    open: trades.filter((t) => t.status === "open").length,
    wins: wins.length,
    losses: losses.length,
    winRate: wins.length + losses.length ? (wins.length / (wins.length + losses.length)) * 100 : 0,
    netPnl,
    grossWin,
    grossLoss,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0,
    avgWin,
    avgLoss,
    expectancy: closed.length ? netPnl / closed.length : 0,
    maxDrawdown: maxDd,
    bestStreak: best,
    worstStreak: worst,
    byEpic,
    pnlCurve,
    dailyPnl,
  };
}
