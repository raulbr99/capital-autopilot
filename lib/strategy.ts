/**
 * Motor de senales tecnicas.
 * Combina cruce de medias (SMA rapida/lenta) + RSI como filtro.
 * Devuelve una senal con direccion y "confianza" 0..1 para que el bot decida.
 */

import type { Candle } from "./capital";

export type SignalType = "BUY" | "SELL" | "FLAT";

export type Signal = {
  type: SignalType;
  confidence: number; // 0..1
  reason: string;
  indicators: { smaFast: number; smaSlow: number; rsi: number; adx: number };
};

export type StrategyConfig = {
  fast: number; // periodo SMA rapida
  slow: number; // periodo SMA lenta
  rsiPeriod: number;
  rsiBuyBelow: number; // sobreventa -> favorece BUY
  rsiSellAbove: number; // sobrecompra -> favorece SELL
  minConfidence: number; // umbral para ejecutar
  // Filtro de regimen (ADX): solo operar si hay tendencia
  useRegimeFilter: boolean;
  adxPeriod: number;
  adxThreshold: number; // ADX por debajo -> mercado lateral -> bloquear
};

export const DEFAULT_STRATEGY: StrategyConfig = {
  fast: 9,
  slow: 21,
  rsiPeriod: 14,
  rsiBuyBelow: 35,
  rsiSellAbove: 65,
  minConfidence: 0.5,
  useRegimeFilter: false, // arranca off; se valida A/B y se enciende si mejora
  adxPeriod: 14,
  adxThreshold: 25,
};

/** ATR (Average True Range) — medida de volatilidad en unidades de precio. */
export function atr(candles: Candle[], period: number): number {
  if (candles.length < period + 1) return NaN;
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const prevClose = candles[i - 1].close;
    trs.push(
      Math.max(
        c.high - c.low,
        Math.abs(c.high - prevClose),
        Math.abs(c.low - prevClose)
      )
    );
  }
  const slice = trs.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

/**
 * ADX (Average Directional Index) — fuerza de la tendencia (0..100).
 * >25 ≈ tendencia; <20 ≈ lateral. Suavizado de Wilder.
 * Devuelve 0 si no hay datos suficientes (se trata como "no operar").
 */
export function adx(candles: Candle[], period: number): number {
  if (candles.length < period * 2 + 1) return 0;
  const tr: number[] = [];
  const plusDM: number[] = [];
  const minusDM: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const p = candles[i - 1];
    const up = c.high - p.high;
    const down = p.low - c.low;
    plusDM.push(up > down && up > 0 ? up : 0);
    minusDM.push(down > up && down > 0 ? down : 0);
    tr.push(
      Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close))
    );
  }
  // Suavizado de Wilder
  const wilder = (arr: number[]): number[] => {
    const out: number[] = [];
    let sum = arr.slice(0, period).reduce((a, b) => a + b, 0);
    out.push(sum);
    for (let i = period; i < arr.length; i++) {
      sum = sum - sum / period + arr[i];
      out.push(sum);
    }
    return out;
  };
  const trS = wilder(tr);
  const plusS = wilder(plusDM);
  const minusS = wilder(minusDM);

  const dx: number[] = [];
  for (let i = 0; i < trS.length; i++) {
    const t = trS[i] || 1e-9;
    const plusDI = (100 * plusS[i]) / t;
    const minusDI = (100 * minusS[i]) / t;
    const denom = plusDI + minusDI || 1e-9;
    dx.push((100 * Math.abs(plusDI - minusDI)) / denom);
  }
  if (dx.length < period) return 0;
  // ADX = media de Wilder de los DX
  let adxVal = dx.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < dx.length; i++) {
    adxVal = (adxVal * (period - 1) + dx[i]) / period;
  }
  return adxVal;
}

function sma(values: number[], period: number): number {
  if (values.length < period) return NaN;
  const slice = values.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

function rsi(values: number[], period: number): number {
  if (values.length < period + 1) return 50;
  let gains = 0;
  let losses = 0;
  for (let i = values.length - period; i < values.length; i++) {
    const diff = values[i] - values[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  if (losses === 0) return 100;
  const rs = gains / period / (losses / period);
  return 100 - 100 / (1 + rs);
}

export function evaluate(
  candles: Candle[],
  cfg: StrategyConfig = DEFAULT_STRATEGY
): Signal {
  const closes = candles.map((c) => c.close).filter((n) => Number.isFinite(n));
  const smaFast = sma(closes, cfg.fast);
  const smaSlow = sma(closes, cfg.slow);
  const r = rsi(closes, cfg.rsiPeriod);
  const adxVal = adx(candles, cfg.adxPeriod ?? 14);

  const indicators = { smaFast, smaSlow, rsi: r, adx: adxVal };

  if (!Number.isFinite(smaFast) || !Number.isFinite(smaSlow)) {
    return {
      type: "FLAT",
      confidence: 0,
      reason: "Datos insuficientes",
      indicators,
    };
  }

  // Separacion relativa entre medias -> fuerza de la tendencia
  const spread = (smaFast - smaSlow) / smaSlow;
  const trend: SignalType = spread > 0 ? "BUY" : "SELL";

  // Confianza base por separacion de medias (saturada)
  let confidence = Math.min(1, Math.abs(spread) * 120);

  // RSI como filtro/refuerzo
  let reason = "";
  if (trend === "BUY") {
    if (r < cfg.rsiBuyBelow) {
      confidence = Math.min(1, confidence + 0.25);
      reason = `Cruce alcista + RSI ${r.toFixed(0)} en sobreventa`;
    } else if (r > cfg.rsiSellAbove) {
      confidence *= 0.4;
      reason = `Cruce alcista pero RSI ${r.toFixed(0)} sobrecomprado (cautela)`;
    } else {
      reason = `Tendencia alcista, RSI neutro ${r.toFixed(0)}`;
    }
  } else {
    if (r > cfg.rsiSellAbove) {
      confidence = Math.min(1, confidence + 0.25);
      reason = `Cruce bajista + RSI ${r.toFixed(0)} en sobrecompra`;
    } else if (r < cfg.rsiBuyBelow) {
      confidence *= 0.4;
      reason = `Cruce bajista pero RSI ${r.toFixed(0)} sobrevendido (cautela)`;
    } else {
      reason = `Tendencia bajista, RSI neutro ${r.toFixed(0)}`;
    }
  }

  let type: SignalType = confidence >= cfg.minConfidence ? trend : "FLAT";

  // Filtro de régimen: si la señal querría operar pero no hay tendencia, bloquear.
  if (type !== "FLAT" && cfg.useRegimeFilter && adxVal < cfg.adxThreshold) {
    type = "FLAT";
    reason = `Bloqueado por régimen: lateral (ADX ${adxVal.toFixed(0)} < ${cfg.adxThreshold})`;
  }

  return { type, confidence, reason, indicators };
}
