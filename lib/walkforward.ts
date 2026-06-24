/**
 * Validación WALK-FORWARD.
 *
 * Por qué: un backtest con parámetros fijos sobre todo el histórico se sobreajusta
 * (parece que gana porque elegiste los parámetros que iban bien en ESOS datos).
 * Walk-forward es honesto:
 *   1. Optimiza parámetros en una ventana IN-SAMPLE (entrenamiento).
 *   2. Aplica esos parámetros a la siguiente ventana OUT-OF-SAMPLE (datos no vistos).
 *   3. Desliza la ventana hacia delante y repite.
 *   4. Las métricas OOS concatenadas son la estimación REAL de la ventaja.
 *
 * Si OOS ≈ IS → robusto. Si OOS se desploma frente a IS → sobreajuste (sin edge).
 */

import type { Candle } from "./capital";
import type { StrategyConfig } from "./strategy";
import type { RiskConfig } from "./store";
import { simulate, metricsOf, SimMetrics, SimTrade } from "./sim";

export type WFParams = {
  fast: number;
  slow: number;
  atrStopMult: number;
  atrTpMult: number;
};

// Rejilla de búsqueda (modesta para acotar cómputo): 2·2·3·2 = 24 combinaciones
const GRID: WFParams[] = (() => {
  const out: WFParams[] = [];
  for (const fast of [9, 12])
    for (const slow of [21, 50])
      for (const atrStopMult of [1.5, 2, 3])
        for (const atrTpMult of [2, 3])
          if (fast < slow) out.push({ fast, slow, atrStopMult, atrTpMult });
  return out;
})();

export type WFFold = {
  index: number;
  isFrom: number;
  isTo: number;
  oosFrom: number;
  oosTo: number;
  best: WFParams;
  is: SimMetrics;
  oos: SimMetrics;
};

export type WalkForwardResult = {
  epic: string;
  bars: number;
  folds: WFFold[];
  oosAggregate: SimMetrics;
  isAggregate: SimMetrics;
  degradation: number; // PF_oos / PF_is  (1 = sin degradación)
  oosEquity: number[];
  verdict: "edge" | "weak" | "none";
  note: string;
};

function score(m: SimMetrics): number {
  // Profit factor pero penalizando muestras minúsculas
  if (m.trades < 4) return -1;
  const pf = m.profitFactor === Infinity ? 5 : m.profitFactor;
  return pf;
}

export function walkForward(
  epic: string,
  candles: Candle[],
  baseStrategy: StrategyConfig,
  baseRisk: RiskConfig,
  sizePerTrade: number,
  opts: { isBars?: number; oosBars?: number } = {}
): WalkForwardResult {
  const isBars = opts.isBars ?? 250;
  const oosBars = opts.oosBars ?? 80;
  const folds: WFFold[] = [];
  const allOosTrades: SimTrade[] = [];
  const allIsTrades: SimTrade[] = [];
  const oosEquity: number[] = [];
  let eqAcc = 0;

  let foldIdx = 0;
  let isFrom = 0;
  while (isFrom + isBars + oosBars <= candles.length) {
    const isTo = isFrom + isBars;
    const oosFrom = isTo;
    const oosTo = Math.min(isTo + oosBars, candles.length);

    // 1) optimizar en IS
    let best = GRID[0];
    let bestScore = -Infinity;
    let bestIs = simulate(candles, withParams(baseStrategy, baseRisk, best).s, withParams(baseStrategy, baseRisk, best).r, sizePerTrade, isFrom, isTo);
    for (const p of GRID) {
      const { s, r } = withParams(baseStrategy, baseRisk, p);
      const m = simulate(candles, s, r, sizePerTrade, isFrom, isTo);
      const sc = score(m);
      if (sc > bestScore) {
        bestScore = sc;
        best = p;
        bestIs = m;
      }
    }

    // 2) aplicar best en OOS
    const { s, r } = withParams(baseStrategy, baseRisk, best);
    const oos = simulate(candles, s, r, sizePerTrade, oosFrom, oosTo);

    allIsTrades.push(...bestIs.tradeList);
    allOosTrades.push(...oos.tradeList);
    for (const t of oos.tradeList) {
      eqAcc += t.pnl;
      oosEquity.push(eqAcc);
    }

    folds.push({
      index: foldIdx++,
      isFrom,
      isTo,
      oosFrom,
      oosTo,
      best,
      is: stripTrades(bestIs),
      oos: stripTrades(oos),
    });

    isFrom += oosBars; // deslizar la ventana hacia delante
  }

  const oosAggregate = metricsOf(allOosTrades);
  const isAggregate = metricsOf(allIsTrades);
  const pfOos = oosAggregate.profitFactor === Infinity ? 5 : oosAggregate.profitFactor;
  const pfIs = isAggregate.profitFactor === Infinity ? 5 : isAggregate.profitFactor;
  const degradation = pfIs > 0 ? pfOos / pfIs : 0;

  let verdict: WalkForwardResult["verdict"] = "none";
  let note = "";
  if (oosAggregate.trades < 12) {
    verdict = "none";
    note = "Pocos trades OOS para concluir — amplía histórico/resolución.";
  } else if (pfOos >= 1.3 && oosAggregate.netPnl > 0 && degradation >= 0.6) {
    verdict = "edge";
    note = "Ventaja consistente fuera de muestra. Candidata a validar más.";
  } else if (pfOos >= 1.0 && oosAggregate.netPnl > 0) {
    verdict = "weak";
    note = "Ventaja marginal o inestable. No fiarse aún.";
  } else {
    verdict = "none";
    note = "Sin ventaja fuera de muestra (probable sobreajuste).";
  }

  return {
    epic,
    bars: candles.length,
    folds,
    oosAggregate,
    isAggregate,
    degradation,
    oosEquity,
    verdict,
    note,
  };
}

function withParams(
  s: StrategyConfig,
  r: RiskConfig,
  p: WFParams
): { s: StrategyConfig; r: RiskConfig } {
  return {
    s: { ...s, fast: p.fast, slow: p.slow },
    r: { ...r, useAtrStops: true, atrStopMult: p.atrStopMult, atrTpMult: p.atrTpMult },
  };
}

function stripTrades(m: SimMetrics & { tradeList?: SimTrade[] }): SimMetrics {
  return {
    trades: m.trades,
    wins: m.wins,
    winRate: m.winRate,
    netPnl: m.netPnl,
    profitFactor: m.profitFactor,
    maxDrawdown: m.maxDrawdown,
  };
}
