/**
 * Backtest simple de la estrategia sobre velas históricas (parámetros fijos).
 * Para validación honesta usa lib/walkforward.ts.
 */

import type { Candle } from "./capital";
import { StrategyConfig } from "./strategy";
import type { RiskConfig } from "./store";
import { simulate } from "./sim";

export type BacktestResult = {
  epic: string;
  bars: number;
  trades: number;
  wins: number;
  winRate: number;
  netPnl: number;
  profitFactor: number;
  maxDrawdown: number;
  equityCurve: { i: number; equity: number }[];
  sample: { dir: "BUY" | "SELL"; entry: number; exit: number; pnl: number }[];
};

export function backtest(
  epic: string,
  candles: Candle[],
  strategy: StrategyConfig,
  risk: RiskConfig,
  sizePerTrade: number
): BacktestResult {
  const r = simulate(candles, strategy, risk, sizePerTrade);
  return {
    epic,
    bars: candles.length,
    trades: r.trades,
    wins: r.wins,
    winRate: r.winRate,
    netPnl: r.netPnl,
    profitFactor: r.profitFactor,
    maxDrawdown: r.maxDrawdown,
    equityCurve: r.equityCurve.map((equity, i) => ({ i, equity })),
    sample: r.tradeList.slice(-12).map((t) => ({
      dir: t.dir,
      entry: t.entry,
      exit: t.exit,
      pnl: t.pnl,
    })),
  };
}
