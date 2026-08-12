/**
 * Tipos del cliente.
 *
 * Los que comparte con el motor ya NO se declaran aquí: se reexportan desde
 * lib/model.ts, que es un módulo de solo tipos. Antes eran ocho copias a mano y
 * cada campo nuevo había que añadirlo en los dos sitios; olvidarlo no rompía la
 * compilación, simplemente dejaba a una mitad de la aplicación sin ver el dato.
 */
import type {
  BotConfig,
  DeskCategory,
  EquityPoint,
  Instrument,
  LogEntry,
  NotifyConfig,
  EpicEval,
  OpenPos,
  RiskConfig,
  TradeRecord,
} from "@/lib/model";
export type {
  BotConfig,
  DeskCategory,
  EquityPoint,
  Instrument,
  LogEntry,
  NotifyConfig,
  EpicEval,
  OpenPos,
  RiskConfig,
  TradeRecord,
};
export { RESOLUTIONS, DEFAULT_RESOLUTION } from "@/lib/model";
export type { Signal, StrategyConfig } from "@/lib/strategy";









export type Account = {
  accountId: string;
  balance: number; // = equity (Capital ya incluye el P&L flotante)
  available: number;
  deposit: number; // efectivo realizado, sin flotante
  pnl: number; // P&L flotante (profitLoss)
  currency: string;
};













export type State = {
  config: BotConfig;
  logs: LogEntry[];
  equity: { ts: number; equity: number }[];
  trades: TradeRecord[];
  stats: { signals: number; tradesOpened: number; tradesClosed: number };
  lastTick: number;
  /** Sello del último ciclo del cron (0 = nunca). Ver BotState en lib/store.ts. */
  lastCronTick: number;
  notifyEnv: { telegram: boolean; discord: boolean };
};

export type Snapshot = {
  configured: boolean;
  enabled: boolean;
  armed: boolean;
  killedToday: boolean;
  cooldownUntil: number;
  tradesToday: number;
  dailyPnlPct: number;
  account: Account | null;
  openPositions: OpenPos[];
  evals: EpicEval[];
  state: State;
  opened: number;
};

export type JournalAction = {
  action: "OPEN" | "CLOSE" | "HOLD";
  epic?: string;
  direction?: "BUY" | "SELL";
  riskPct?: number;
  reason: string;
  outcome?: "opened" | "closed" | "vetoed" | "skipped" | "error" | "held";
  outcomeNote?: string;
};

export type JournalEntry = {
  id: number;
  ts: string;
  thesis: string;
  confidence: number;
  actions: JournalAction[];
  snapshot: { equity?: number; dailyPnlPct?: number; positions?: number };
  desk?: DeskCategory | null;
};

/**
 * El tipo vive junto a su única implementación, en lib/analytics.ts. Aquí había
 * una segunda declaración que había que mantener a mano en paralelo: cuando la
 * del cliente ganó payoff, breakevenWinRate, byDirection y enough, la del
 * servidor se quedó sin ellos y el analista diario dejó de verlos.
 */
export type { Analytics } from "@/lib/analytics";

