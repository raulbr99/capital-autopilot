/**
 * Metricas de rendimiento a partir de trades cerrados.
 */

import type { TradeRecord } from "./store";

// Una operación cerrada EXACTAMENTE a cero no es un acierto: es un empate.
// Contarla como ganadora inflaba el win rate (8 de 33 en el histórico actual:
// 52% aparente frente al 36% real) y contradecía al panel de expectativa, que
// ya lo hacía bien. El win rate se mide sobre las que SÍ se decidieron.
const EPS_PNL = 0.005;
const esGanadora = (p: number | undefined) => (p || 0) > EPS_PNL;
const esPerdedora = (p: number | undefined) => (p || 0) < -EPS_PNL;


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
  /** avgWin/avgLoss: euros ganados por cada euro perdido. */
  payoff: number;
  /** % de acierto necesario para no perder con ese payoff. */
  breakevenWinRate: number;
  /** Largos vs cortos: el desglose que destapó el agujero de los shorts. */
  byDirection: { dir: "BUY" | "SELL"; trades: number; wins: number; winRate: number; pnl: number }[];
  /** ¿hay muestra suficiente para que esto signifique algo? */
  enough: boolean;
};

export function analyze(trades: TradeRecord[]): Analytics {
  const closed = trades
    .filter((t) => t.status === "closed" && typeof t.pnl === "number")
    .sort((a, b) => (a.closedTs || a.ts) - (b.closedTs || b.ts));

  const wins = closed.filter((t) => esGanadora(t.pnl));
  const losses = closed.filter((t) => esPerdedora(t.pnl));
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
    // Un cierre a CERO no es ni ganadora ni perdedora: corta la racha en vez
    // de alargar la de pérdidas. El `else` la contaba como fallo, así que con
    // 8 empates en 33 operaciones la "peor racha" salía inflada — el mismo
    // criterio que ya se corrigió en el win rate y en el desglose por
    // dirección, y que aquí se quedó sin aplicar.
    if (esGanadora(t.pnl)) cur = cur > 0 ? cur + 1 : 1;
    else if (esPerdedora(t.pnl)) cur = cur < 0 ? cur - 1 : -1;
    else cur = 0;
    best = Math.max(best, cur);
    worst = Math.min(worst, cur);
  }

  // por activo
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

  // PnL diario
  const dayMap = new Map<string, number>();
  for (const t of closed) {
    // Día natural del usuario, no UTC: si no, lo cerrado entre medianoche y
    // las 02:00 de Madrid caía en la barra del día anterior.
    const d = new Date(t.closedTs || t.ts).toLocaleDateString("en-CA", {
      timeZone: "Europe/Madrid",
    });
    dayMap.set(d, (dayMap.get(d) || 0) + (t.pnl || 0));
  }
  const dailyPnl = [...dayMap.entries()]
    .map(([date, pnl]) => ({ date, pnl }))
    .sort((a, b) => a.date.localeCompare(b.date));

  /**
   * Estas cuatro métricas existían SOLO en la copia del cliente desde la
   * pasada 5. Esta copia es la que consumen /api/bot/trades y /api/bot/report
   * —el informe que lee el analista diario—, así que la IA que juzga el
   * rendimiento no veía ni el umbral de equilibrio ni el reparto largos/cortos:
   * justo los dos números que destaparon que los cortos eran el agujero.
   */
  const avgWin = wins.length ? grossWin / wins.length : 0;
  const avgLoss = losses.length ? grossLoss / losses.length : 0;
  const payoff = avgLoss > 0 ? avgWin / avgLoss : 0;
  const byDirection = (["BUY", "SELL"] as const)
    .map((dir) => {
      const set = closed.filter((t) => t.direction === dir);
      const w = set.filter((t) => esGanadora(t.pnl)).length;
      const l = set.filter((t) => esPerdedora(t.pnl)).length;
      return {
        dir,
        trades: set.length,
        wins: w,
        winRate: w + l ? (w / (w + l)) * 100 : 0,
        pnl: set.reduce((s, t) => s + (t.pnl || 0), 0),
      };
    })
    .filter((d) => d.trades > 0);

  return {
    payoff,
    breakevenWinRate: payoff > 0 ? 100 / (1 + payoff) : 0,
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
