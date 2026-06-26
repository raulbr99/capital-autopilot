/**
 * Modelo de estado + fallback en memoria.
 * La persistencia real (Supabase) vive en lib/db.ts y usa estas mismas formas.
 * Si Supabase no esta configurado, todo cae aqui (memoria del proceso).
 */

import { DEFAULT_STRATEGY, StrategyConfig } from "./strategy";

export type RiskConfig = {
  sizingMode: "fixed" | "percent"; // unidades fijas o % de equity arriesgado
  riskPercent: number; // % de equity arriesgado por trade (modo percent)
  useAtrStops: boolean; // SL/TP por ATR (volatilidad) en vez de puntos fijos
  atrPeriod: number;
  atrStopMult: number; // SL = atrStopMult * ATR
  atrTpMult: number; // TP = atrTpMult * ATR
  maxDailyLossPct: number; // kill-switch: si el equity cae este % en el dia -> desarma
  maxTradesPerDay: number;
  cooldownMin: number; // minutos de pausa tras una operacion perdedora
};

export const DEFAULT_RISK: RiskConfig = {
  sizingMode: "percent",
  riskPercent: 1,
  useAtrStops: true,
  atrPeriod: 14,
  atrStopMult: 2,
  atrTpMult: 3,
  maxDailyLossPct: 5,
  maxTradesPerDay: 6,
  cooldownMin: 30,
};

export type DeskCategory = "forex" | "crypto" | "stocks" | "commodities";

export type Instrument = {
  epic: string;
  resolution: string;
  regimeFilter?: boolean; // override por activo del filtro ADX (undefined = usa el global)
  category?: DeskCategory; // mesa a la que pertenece (forex/crypto/stocks/commodities)
};

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

export type NotifyConfig = {
  telegram: boolean;
  discord: boolean;
  onTrade: boolean;
  onKill: boolean;
};

export const DEFAULT_NOTIFY: NotifyConfig = {
  telegram: true,
  discord: true,
  onTrade: true,
  onKill: true,
};

export type BotConfig = {
  enabled: boolean; // interruptor maestro (Activar/Detener) que respeta el cron
  aiFilter: boolean; // capa IA: revisa/veta cada senal antes de operar
  aiCooldownMin: number; // no re-evaluar el mismo activo con IA dentro de X min
  pmMode: boolean; // Gestor de Cartera IA inline (OpenRouter, cada tick) — DEPRECADO por coste
  cloudPm: boolean; // Gestor en la nube: una routine Claude decide cada hora y deja las acciones en cola; el motor las ejecuta
  instruments: Instrument[]; // activos con su resolucion de senal
  watchlist: string[]; // espejo de instruments[].epic (compat)
  sizePerTrade: number; // unidades (modo fixed)
  maxOpenPositions: number;
  stopDistance: number; // puntos (si no usa ATR)
  profitDistance: number;
  strategy: StrategyConfig;
  risk: RiskConfig;
  notify: NotifyConfig;
};

export const DEFAULT_CONFIG: BotConfig = {
  enabled: false,
  aiFilter: false, // off por defecto; se enciende cuando hay AI Gateway
  aiCooldownMin: 45, // 1 revisión IA por activo cada 45 min como mucho
  pmMode: false, // Gestor IA inline (OpenRouter) off — sustituido por cloudPm
  cloudPm: false, // Gestor en la nube off por defecto
  instruments: [
    // 💱 Forex
    { epic: "NZDUSD", resolution: "DAY", regimeFilter: false, category: "forex" },
    { epic: "EURUSD", resolution: "HOUR_4", regimeFilter: true, category: "forex" },
    { epic: "GBPJPY", resolution: "DAY", regimeFilter: false, category: "forex" },
    { epic: "EURJPY", resolution: "DAY", regimeFilter: false, category: "forex" },
    { epic: "USDCHF", resolution: "HOUR_4", regimeFilter: true, category: "forex" },
    // ₿ Crypto
    { epic: "BTCUSD", resolution: "HOUR_4", regimeFilter: true, category: "crypto" },
    { epic: "ETHUSD", resolution: "DAY", regimeFilter: true, category: "crypto" },
    // 📈 Stocks US (solo horario NY ~15:30-22:00 Madrid; el motor las salta si están CLOSED)
    { epic: "AAPL", resolution: "DAY", regimeFilter: true, category: "stocks" },
    { epic: "NVDA", resolution: "DAY", regimeFilter: true, category: "stocks" },
    { epic: "TSLA", resolution: "DAY", regimeFilter: true, category: "stocks" },
    { epic: "MSFT", resolution: "DAY", regimeFilter: true, category: "stocks" },
    { epic: "AMZN", resolution: "DAY", regimeFilter: true, category: "stocks" },
    // 🛢️ Commodities
    { epic: "GOLD", resolution: "HOUR_4", regimeFilter: false, category: "commodities" },
    { epic: "SILVER", resolution: "HOUR_4", regimeFilter: false, category: "commodities" },
    { epic: "OIL_CRUDE", resolution: "HOUR_4", regimeFilter: false, category: "commodities" },
    { epic: "NATURALGAS", resolution: "HOUR_4", regimeFilter: false, category: "commodities" },
    { epic: "COPPER", resolution: "DAY", regimeFilter: false, category: "commodities" },
  ],
  watchlist: ["NZDUSD", "EURUSD", "GBPJPY", "EURJPY", "USDCHF", "BTCUSD", "ETHUSD", "AAPL", "NVDA", "TSLA", "MSFT", "AMZN", "GOLD", "SILVER", "OIL_CRUDE", "NATURALGAS", "COPPER"],
  sizePerTrade: 0.1,
  maxOpenPositions: 3,
  stopDistance: 150,
  profitDistance: 300,
  strategy: { ...DEFAULT_STRATEGY },
  risk: { ...DEFAULT_RISK },
  notify: { ...DEFAULT_NOTIFY },
};

export type LogEntry = {
  id: string;
  ts: number;
  level: "info" | "signal" | "trade" | "error" | "kill";
  epic?: string;
  message: string;
};

export type EquityPoint = { ts: number; equity: number };

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

export type DayAnchor = { date: string; startEquity: number };

export type BotState = {
  config: BotConfig;
  logs: LogEntry[];
  equity: EquityPoint[];
  trades: TradeRecord[];
  dayAnchor: DayAnchor | null;
  killedDate: string | null; // si === hoy, kill-switch activo (no opera)
  prevDeposit: number; // deposit (efectivo) del tick anterior (para atribuir P&L de cierres)
  aiReviewedAt: Record<string, number>; // epic -> ts última revisión IA (cooldown)
  lastTick: number;
  cooldownUntil: number; // timestamp; no abrir hasta pasarlo
  stats: { signals: number; tradesOpened: number; tradesClosed: number };
};

declare global {
  // eslint-disable-next-line no-var
  var __bot: BotState | undefined;
}

function init(): BotState {
  return {
    config: structuredClone(DEFAULT_CONFIG),
    logs: [],
    equity: [],
    trades: [],
    dayAnchor: null,
    killedDate: null,
    prevDeposit: 0,
    aiReviewedAt: {},
    lastTick: 0,
    cooldownUntil: 0,
    stats: { signals: 0, tradesOpened: 0, tradesClosed: 0 },
  };
}

export function bot(): BotState {
  if (!global.__bot) global.__bot = init();
  return global.__bot;
}

let logSeq = 0;
export function log(level: LogEntry["level"], message: string, epic?: string) {
  const b = bot();
  b.logs.unshift({
    id: `${Date.now()}-${logSeq++}`,
    ts: Date.now(),
    level,
    epic,
    message,
  });
  if (b.logs.length > 200) b.logs.length = 200;
}

export function pushEquity(equity: number) {
  const b = bot();
  const last = b.equity[b.equity.length - 1];
  if (last && Math.abs(last.equity - equity) < 1e-9) return;
  b.equity.push({ ts: Date.now(), equity });
  if (b.equity.length > 500) b.equity.shift();
}

export function todayKey(ts = Date.now()): string {
  return new Date(ts).toISOString().slice(0, 10);
}
