/**
 * Modelo de datos COMPARTIDO entre servidor y cliente.
 *
 * Estos ocho tipos estaban declarados dos veces: en lib/store.ts y, copiados a
 * mano, en components/types.ts. El cliente no podía importar de store.ts porque
 * ese fichero SÍ trae código de ejecución (el estado en memoria, DEFAULT_CONFIG,
 * log()...), así que la copia parecía inevitable. Lo que era evitable es que
 * los TIPOS vivieran ahí dentro.
 *
 * El precio de la copia se ha pagado varias veces en esta rotación: cada campo
 * nuevo —maxPerDesk, paused, longOnly, el nivel "veto" del registro— había que
 * añadirlo en los dos sitios, y olvidarlo no rompe la compilación: simplemente
 * una de las dos mitades de la aplicación deja de ver el campo.
 *
 * Aquí no hay nada ejecutable, solo tipos y constantes, así que lo importan las
 * dos partes sin arrastrar servidor al navegador.
 */

import type { StrategyConfig } from "./strategy";

export type RiskConfig = {
  sizingMode: "fixed" | "percent" | "margin"; // unidades fijas | % de equity arriesgado | % de equity como margen
  riskPercent: number; // % de equity arriesgado por trade (modo percent)
  marginPct: number; // % de equity reservado como MARGEN por trade (modo margin)
  useAtrStops: boolean; // SL/TP por ATR (volatilidad) en vez de puntos fijos
  atrPeriod: number;
  atrStopMult: number; // SL = atrStopMult * ATR
  atrTpMult: number; // TP = atrTpMult * ATR
  maxDailyLossPct: number; // kill-switch: si el equity cae este % en el dia -> desarma (0 = desactivado)
  maxTradesPerDay: number;
  cooldownMin: number; // minutos de pausa tras una operacion perdedora
  // --- Gestión activa de posiciones abiertas (trailing/breakeven/scaling) ---
  activeManage: boolean; // master toggle de la gestión activa
  breakevenAtr: number; // mover SL a entrada cuando el profit >= este x ATR
  trailAtr: number; // empezar a trailing cuando el profit >= este x ATR
  trailDistAtr: number; // el SL se mantiene a este x ATR por detrás del precio
  scaleOutAtr: number; // cerrar parte cuando el profit >= este x ATR (0 = off)
  scaleOutPct: number; // fracción a cerrar en el scaling out (0 = off)
};

export type Instrument = {
  epic: string;
  resolution: string;
  regimeFilter?: boolean; // override por activo del filtro ADX (undefined = usa el global)
  category?: DeskCategory; // mesa a la que pertenece (forex/crypto/stocks/commodities)
  longOnly?: boolean; // solo compras (bloquea SELL) — para mesas donde shortear pierde
  paused?: boolean; // circuit breaker: auto-pausado por mala racha (no abre nuevas; reactivación manual)
};

export type NotifyConfig = {
  telegram: boolean;
  discord: boolean;
  onTrade: boolean;
  onKill: boolean;
};

export type BotConfig = {
  enabled: boolean; // interruptor maestro (Activar/Detener) que respeta el cron
  aiFilter: boolean; // capa IA: revisa/veta cada senal antes de operar
  aiCooldownMin: number; // no re-evaluar el mismo activo con IA dentro de X min
  pmMode: boolean; // Gestor de Cartera IA inline (OpenRouter, cada tick) — DEPRECADO por coste
  cloudPm: boolean; // Gestor en la nube: una routine Claude decide cada hora y deja las acciones en cola; el motor las ejecuta
  committee: boolean; // comité IA: varios modelos (OpenRouter) votan antes de cada apertura
  committeeMinApprovals: number; // aprobaciones mínimas para no vetar (1 = veto solo si rechazo unánime)
  committeeMinApprovalsShort: number; // igual pero para SELL (más estricto: los shorts pierden)
  instruments: Instrument[]; // activos con su resolucion de senal
  watchlist: string[]; // espejo de instruments[].epic (compat)
  sizePerTrade: number; // unidades (modo fixed)
  maxPerDesk: number; // máx posiciones abiertas POR MESA (forex/crypto/stocks/commodities); sin límite global
  stopDistance: number; // puntos (si no usa ATR)
  profitDistance: number;
  strategy: StrategyConfig;
  risk: RiskConfig;
  notify: NotifyConfig;
};

export type LogEntry = {
  id: string;
  ts: number;
  level: "info" | "signal" | "trade" | "veto" | "error" | "kill";
  epic?: string;
  message: string;
};

export type TradeRecord = {
  id: string;
  ts: number; // apertura
  closedTs?: number;
  epic: string;
  direction: "BUY" | "SELL";
  size: number;
  entry: number;
  exit?: number;
  pnl?: number; // realizado al cerrar
  status: "open" | "closed";
  dealId?: string;
  dryRun: boolean;
  reason: string;
};

export type DeskCategory = "forex" | "crypto" | "stocks" | "commodities";

export type EquityPoint = { ts: number; equity: number };

export const RESOLUTIONS = [
  "MINUTE",
  "MINUTE_5",
  "MINUTE_15",
  "MINUTE_30",
  "HOUR",
  "HOUR_4",
  "DAY",
  "WEEK",
] as const;
export const DEFAULT_RESOLUTION = "HOUR_4";
