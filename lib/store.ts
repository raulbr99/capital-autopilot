/**
 * Modelo de estado + fallback en memoria.
 * La persistencia real (Supabase) vive en lib/db.ts y usa estas mismas formas.
 * Si Supabase no esta configurado, todo cae aqui (memoria del proceso).
 */

import { DEFAULT_STRATEGY, StrategyConfig } from "./strategy";
// Los tipos compartidos con el cliente viven en ./model (sin código ejecutable).
// Se reexportan para no tener que tocar los ~30 imports que ya apuntan aquí.
import type {
  BotConfig,
  DeskCategory,
  EquityPoint,
  Instrument,
  LogEntry,
  NotifyConfig,
  RiskConfig,
  TradeRecord,
} from "./model";
export type {
  BotConfig,
  DeskCategory,
  EquityPoint,
  Instrument,
  LogEntry,
  NotifyConfig,
  RiskConfig,
  TradeRecord,
};
export { RESOLUTIONS, DEFAULT_RESOLUTION } from "./model";



export const DEFAULT_RISK: RiskConfig = {
  sizingMode: "percent", // riesgo normalizado (mismo €-riesgo por trade entre mesas)
  riskPercent: 0.75, // ~0.75% del equity arriesgado por trade
  marginPct: 10,
  useAtrStops: true,
  atrPeriod: 14,
  atrStopMult: 2,
  atrTpMult: 3,
  maxDailyLossPct: 0, // desactivado a petición del dueño (ago 2026); poner un % para reactivar
  maxTradesPerDay: 4,
  cooldownMin: 30,
  activeManage: true,
  breakevenAtr: 1,
  trailAtr: 1.5,
  trailDistAtr: 2,
  scaleOutAtr: 2,
  scaleOutPct: 0.5,
};







export const DEFAULT_NOTIFY: NotifyConfig = {
  telegram: true,
  discord: true,
  onTrade: true,
  onKill: true,
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
    { epic: "BTCUSD", resolution: "HOUR_4", regimeFilter: true, category: "crypto", longOnly: true },
    { epic: "ETHUSD", resolution: "DAY", regimeFilter: true, category: "crypto", longOnly: true },
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
  watchlist: ["NZDUSD", "EURUSD", "GBPJPY", "EURJPY", "USDCHF", "BTCUSD", "ETHUSD", "AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "JPM", "V", "GOLD", "SILVER", "OIL_CRUDE", "NATURALGAS", "COPPER"],
  sizePerTrade: 0.1,
  maxPerDesk: 4,
  stopDistance: 150,
  profitDistance: 300,
  strategy: { ...DEFAULT_STRATEGY },
  risk: { ...DEFAULT_RISK },
  notify: { ...DEFAULT_NOTIFY },
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
  /**
   * Última vez que corrió el CRON (no una visita del navegador). lastTick se
   * refresca con cada GET del panel, así que sirve para saber si la web está
   * viva, pero NO si el motor lo está: el bot pudo estar un mes sin operar
   * mientras el panel se veía perfecto. Este sello lo pone solo /api/bot/cron.
   */
  lastCronTick: number;
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
    lastCronTick: 0,
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

/**
 * Zona horaria del dueño de la cuenta. El "día" del bot debe coincidir con SU
 * día natural, no con el UTC: con toISOString() la jornada empezaba a las 02:00
 * de Madrid, así que entre medianoche y las dos el panel enseñaba el P&L de
 * ayer bajo el rótulo "HOY" y el cupo de operaciones diarias se reiniciaba a
 * deshora. Configurable por si la cuenta cambia de país.
 */
export const TZ = process.env.ACCOUNT_TZ || "Europe/Madrid";

/**
 * Recorte de texto para registro y diario. Todo esto se cortaba con un
 * `.slice(0, n)` a pelo, así que las frases terminaban a mitad de palabra y sin
 * ninguna marca: en el registro se leía "…COT: GOLD 88.54% long (e" y en el
 * diario "…la operación es contra la tenden". Un texto cortado en seco no
 * parece resumido, parece corrompido — y en un registro de operativa la
 * diferencia importa: no sabes si falta texto o si el bot escribió eso.
 * Además corta en el último espacio para no partir palabras.
 */
export function recorta(s: string, n: number): string {
  const t = (s || "").trim();
  if (t.length <= n) return t;
  const duro = t.slice(0, n - 1);
  const esp = duro.lastIndexOf(" ");
  return (esp > n * 0.6 ? duro.slice(0, esp) : duro).trimEnd() + "…";
}

/** Fecha AAAA-MM-DD en la zona de la cuenta. */
export function todayKey(ts = Date.now()): string {
  // 'en-CA' formatea como AAAA-MM-DD, que es lo que queremos para comparar
  return new Date(ts).toLocaleDateString("en-CA", { timeZone: TZ });
}
