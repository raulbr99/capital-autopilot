/**
 * Backtest de la estrategia sobre velas historicas.
 * Replica la logica del motor (SMA+RSI, SL/TP por ATR) barra a barra.
 */

import type { Candle } from "./capital";
import { evaluate, atr, StrategyConfig } from "./strategy";
import type { RiskConfig } from "./store";

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
  sample: {
    dir: "BUY" | "SELL";
    entry: number;
    exit: number;
    pnl: number;
  }[];
};

export function backtest(
  epic: string,
  candles: Candle[],
  strategy: StrategyConfig,
  risk: RiskConfig,
  sizePerTrade: number
): BacktestResult {
  const warmup = Math.max(strategy.slow, risk.atrPeriod) + 2;
  let open: { dir: "BUY" | "SELL"; entry: number; sl: number; tp: number } | null =
    null;
  const trades: { dir: "BUY" | "SELL"; entry: number; exit: number; pnl: number }[] =
    [];

  let equity = 0;
  let peak = 0;
  let maxDd = 0;
  const equityCurve: { i: number; equity: number }[] = [];

  for (let i = warmup; i < candles.length; i++) {
    const window = candles.slice(0, i + 1);
    const c = candles[i];

    // gestionar posicion abierta (fills con high/low de la barra)
    if (open) {
      let exit: number | null = null;
      if (open.dir === "BUY") {
        if (c.low <= open.sl) exit = open.sl;
        else if (c.high >= open.tp) exit = open.tp;
      } else {
        if (c.high >= open.sl) exit = open.sl;
        else if (c.low <= open.tp) exit = open.tp;
      }
      if (exit !== null) {
        const dir = open.dir === "BUY" ? 1 : -1;
        const pnl = (exit - open.entry) * dir * sizePerTrade;
        trades.push({ dir: open.dir, entry: open.entry, exit, pnl });
        equity += pnl;
        peak = Math.max(peak, equity);
        maxDd = Math.max(maxDd, peak - equity);
        open = null;
      }
    }

    // abrir si no hay posicion
    if (!open) {
      const sig = evaluate(window, strategy);
      if (sig.type !== "FLAT") {
        const a = atr(window, risk.atrPeriod);
        const stopDist =
          risk.useAtrStops && Number.isFinite(a) && a > 0
            ? a * risk.atrStopMult
            : 0;
        const tpDist =
          risk.useAtrStops && Number.isFinite(a) && a > 0
            ? a * risk.atrTpMult
            : 0;
        if (stopDist > 0 && tpDist > 0) {
          const entry = c.close;
          open = {
            dir: sig.type,
            entry,
            sl: sig.type === "BUY" ? entry - stopDist : entry + stopDist,
            tp: sig.type === "BUY" ? entry + tpDist : entry - tpDist,
          };
        }
      }
    }
    equityCurve.push({ i, equity });
  }

  const wins = trades.filter((t) => t.pnl >= 0);
  const grossWin = wins.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(
    trades.filter((t) => t.pnl < 0).reduce((s, t) => s + t.pnl, 0)
  );

  return {
    epic,
    bars: candles.length,
    trades: trades.length,
    wins: wins.length,
    winRate: trades.length ? (wins.length / trades.length) * 100 : 0,
    netPnl: equity,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0,
    maxDrawdown: maxDd,
    equityCurve,
    sample: trades.slice(-12),
  };
}
