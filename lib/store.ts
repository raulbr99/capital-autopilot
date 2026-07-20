/**
 * Modelo de estado + fallback en memoria.
 * La persistencia real (Supabase) vive en lib/db.ts y usa estas mismas formas.
 * Si Supabase no esta configurado, todo cae aqui (memoria del proceso).
 */

import { DEFAULT_STRATEGY, StrategyConfig } from "./strategy";

export type RiskConfig = {
  sizingMode: "fixed" | "percent" | "margin"; // unidades fijas | % de equity arriesgado | % de equity como margen
  riskPercent: number; // % de equity arriesgado por trade (modo percent)
  marginPct: number; // % de equity reservado como MARGEN por trade (modo margin)
  useAtrStops: boolean; // SL/TP por ATR (volatilidad) en vez de puntos fijos
  atrPeriod: number;
  atrStopMult: number; // SL = atrStopMult * ATR
  atrTpMult: number; // TP = atrTpMult * ATR
  maxDailyLossPct: number; // kill-switch: si el equity cae este % en el dia -> desarma
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

export const DEFAULT_RISK: RiskConfig = {
  sizingMode: "percent", // riesgo normalizado (mismo €-riesgo por trade entre mesas)
  riskPercent: 0.75, // ~0.75% del equity arriesgado por trade
  marginPct: 10,
  useAtrStops: true,
  atrPeriod: 14,
  atrStopMult: 2,
  atrTpMult: 3,
  maxDailyLossPct: 5,
  maxTradesPerDay: 4,
  cooldownMin: 30,
  activeManage: true,
  breakevenAtr: 1,
  trailAtr: 1.5,
  trailDistAtr: 2,
  scaleOutAtr: 2,
  scaleOutPct: 0.5,
};

export type DeskCategory = "forex" | "crypto" | "stocks" | "commodities";

export type Instrument = {
  epic: string;
  resolution: string;
  regimeFilter?: boolean; // override por activo del filtro ADX (undefined = usa el global)
  category?: DeskCategory; // mesa a la que pertenece (forex/crypto/stocks/commodities)
  longOnly?: boolean; // solo compras (bloquea SELL) — para mesas donde shortear pierde
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
  committee: boolean; // comité IA: varios modelos (OpenRouter) votan antes de cada apertura
  committeeMinApprovals: number; // aprobaciones mínimas para no vetar (1 = veto solo si rechazo unánime)
  committeeMinApprovalsShort: number; // igual pero para SELL (más estricto: los shorts pierden)
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
  committee: true, // comité IA vota antes de abrir (ON)
  committeeMinApprovals: 1, // veta solo si rechazo unánime (menos restrictivo)
  committeeMinApprovalsShort: 2, // SELL más estricto (mayoría 2/3) — los shorts pierden
  instruments: [
    // 💱 Forex (filtro de régimen ADX en todos)
    { epic: "NZDUSD", resolution: "DAY", regimeFilter: true, category: "forex" },
    { epic: "EURUSD", resolution: "HOUR_4", regimeFilter: true, category: "forex" },
    { epic: "GBPJPY", resolution: "DAY", regimeFilter: true, category: "forex" },
    { epic: "EURJPY", resolution: "DAY", regimeFilter: true, category: "forex" },
    { epic: "USDCHF", resolution: "HOUR_4", regimeFilter: true, category: "forex" },
    // ₿ Crypto — SOLO LONG (shortear cripto en el bull perdía todo)
    // ETHUSD retirado (afinador 2026-07-20): 4 trades cerrados, 25% aciertos, -5.25 pese a ser ya long-only.
    // BTCUSD queda como representante de la mesa cripto (near-breakeven: -1.43, 75% aciertos).
    { epic: "BTCUSD", resolution: "HOUR_4", regimeFilter: true, category: "crypto", longOnly: true },
    // 📈 Stocks US — 8 large-caps líquidas, SOLO LONG (horario NY; el motor las salta si CLOSED)
    { epic: "AAPL", resolution: "DAY", regimeFilter: true, category: "stocks", longOnly: true },
    { epic: "MSFT", resolution: "DAY", regimeFilter: true, category: "stocks", longOnly: true },
    { epic: "NVDA", resolution: "DAY", regimeFilter: true, category: "stocks", longOnly: true },
    { epic: "AMZN", resolution: "DAY", regimeFilter: true, category: "stocks", longOnly: true },
    { epic: "GOOGL", resolution: "DAY", regimeFilter: true, category: "stocks", longOnly: true },
    { epic: "META", resolution: "DAY", regimeFilter: true, category: "stocks", longOnly: true },
    { epic: "JPM", resolution: "DAY", regimeFilter: true, category: "stocks", longOnly: true },
    { epic: "V", resolution: "DAY", regimeFilter: true, category: "stocks", longOnly: true },
    // 🛢️ Commodities (filtro de régimen ADX)
    { epic: "GOLD", resolution: "HOUR_4", regimeFilter: true, category: "commodities" },
    { epic: "SILVER", resolution: "HOUR_4", regimeFilter: true, category: "commodities" },
    { epic: "OIL_CRUDE", resolution: "HOUR_4", regimeFilter: true, category: "commodities" },
    { epic: "NATURALGAS", resolution: "HOUR_4", regimeFilter: true, category: "commodities" },
    { epic: "COPPER", resolution: "DAY", regimeFilter: true, category: "commodities" },
  ],
  watchlist: ["NZDUSD", "EURUSD", "GBPJPY", "EURJPY", "USDCHF", "BTCUSD", "AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "JPM", "V", "GOLD", "SILVER", "OIL_CRUDE", "NATURALGAS", "COPPER"],
  sizePerTrade: 0.1,
  maxOpenPositions: 4,
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
