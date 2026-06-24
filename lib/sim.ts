/**
 * Simulador barra a barra de la estrategia sobre velas.
 * Núcleo compartido por el backtest simple y la validación walk-forward.
 */

import type { Candle } from "./capital";
import { evaluate, atr, StrategyConfig } from "./strategy";
import type { RiskConfig } from "./store";

export type SimTrade = {
  dir: "BUY" | "SELL";
  entry: number;
  exit: number;
  pnl: number;
  iEntry: number;
  iExit: number;
};

export type SimMetrics = {
  trades: number;
  wins: number;
  winRate: number;
  netPnl: number;
  profitFactor: number;
  maxDrawdown: number;
};

export type SimResult = SimMetrics & {
  tradeList: SimTrade[];
  equityCurve: number[];
};

export function metricsOf(trades: { pnl: number }[]): SimMetrics {
  const wins = trades.filter((t) => t.pnl >= 0);
  const grossWin = wins.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(
    trades.filter((t) => t.pnl < 0).reduce((s, t) => s + t.pnl, 0)
  );
  let eq = 0,
    peak = 0,
    maxDd = 0;
  for (const t of trades) {
    eq += t.pnl;
    peak = Math.max(peak, eq);
    maxDd = Math.max(maxDd, peak - eq);
  }
  return {
    trades: trades.length,
    wins: wins.length,
    winRate: trades.length ? (wins.length / trades.length) * 100 : 0,
    netPnl: eq,
    profitFactor:
      grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0,
    maxDrawdown: maxDd,
  };
}

/**
 * Simula la estrategia sobre `candles` entre los índices [from, to).
 * Replica la lógica del motor: SMA+RSI para la señal, SL/TP por ATR (o fijo).
 */
export function simulate(
  candles: Candle[],
  strategy: StrategyConfig,
  risk: RiskConfig,
  sizePerTrade: number,
  from = 0,
  to = candles.length
): SimResult {
  const warmup = Math.max(strategy.slow, risk.atrPeriod) + 2;
  const start = Math.max(from, warmup);
  let open: { dir: "BUY" | "SELL"; entry: number; sl: number; tp: number; i: number } | null =
    null;
  const tradeList: SimTrade[] = [];
  const equityCurve: number[] = [];
  let eq = 0;

  for (let i = start; i < to; i++) {
    const window = candles.slice(0, i + 1); // histórico hasta la barra i
    const c = candles[i];

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
        tradeList.push({ dir: open.dir, entry: open.entry, exit, pnl, iEntry: open.i, iExit: i });
        eq += pnl;
        open = null;
      }
    }

    if (!open) {
      const sig = evaluate(window, strategy);
      if (sig.type !== "FLAT") {
        const a = atr(window, risk.atrPeriod);
        const useAtr = risk.useAtrStops && Number.isFinite(a) && a > 0;
        const stopDist = useAtr ? a * risk.atrStopMult : risk.atrStopMult; // fallback simbólico
        const tpDist = useAtr ? a * risk.atrTpMult : risk.atrTpMult;
        if (stopDist > 0 && tpDist > 0) {
          const entry = c.close;
          open = {
            dir: sig.type,
            entry,
            sl: sig.type === "BUY" ? entry - stopDist : entry + stopDist,
            tp: sig.type === "BUY" ? entry + tpDist : entry - tpDist,
            i,
          };
        }
      }
    }
    equityCurve.push(eq);
  }

  return { ...metricsOf(tradeList), tradeList, equityCurve };
}
