export type Signal = {
  type: "BUY" | "SELL" | "FLAT";
  confidence: number;
  reason: string;
  indicators: { smaFast: number; smaSlow: number; rsi: number; adx: number };
};

export type EpicEval = {
  epic: string;
  resolution: string;
  signal: Signal;
  hasPosition: boolean;
  price: number;
  atr: number;
  spark: number[];
};

export type DeskCategory = "forex" | "crypto" | "stocks" | "commodities";
export type Instrument = { epic: string; resolution: string; regimeFilter?: boolean; category?: DeskCategory };
export const RESOLUTIONS = [
  "MINUTE",
  "MINUTE_5",
  "MINUTE_15",
  "MINUTE_30",
  "HOUR",
  "HOUR_4",
  "DAY",
  "WEEK",
];

export type OpenPos = {
  key: string;
  epic: string;
  direction: "BUY" | "SELL";
  size: number;
  entry: number;
  upl: number;
  dealId?: string;
  stopLevel?: number | null;
  limitLevel?: number | null;
  currentPrice?: number | null;
};

export type Account = {
  accountId: string;
  balance: number; // = equity (Capital ya incluye el P&L flotante)
  available: number;
  deposit: number; // efectivo realizado, sin flotante
  pnl: number; // P&L flotante (profitLoss)
  currency: string;
};

export type LogEntry = {
  id: string;
  ts: number;
  level: "info" | "signal" | "trade" | "error" | "kill";
  epic?: string;
  message: string;
};

export type TradeRecord = {
  id: string;
  ts: number;
  closedTs?: number;
  epic: string;
  direction: "BUY" | "SELL";
  size: number;
  entry: number;
  exit?: number;
  pnl?: number;
  status: "open" | "closed";
  dryRun: boolean;
  reason: string;
};

export type StrategyConfig = {
  fast: number;
  slow: number;
  rsiPeriod: number;
  rsiBuyBelow: number;
  rsiSellAbove: number;
  minConfidence: number;
  useRegimeFilter: boolean;
  adxPeriod: number;
  adxThreshold: number;
};

export type RiskConfig = {
  sizingMode: "fixed" | "percent" | "margin";
  riskPercent: number;
  marginPct?: number;
  useAtrStops: boolean;
  atrPeriod: number;
  atrStopMult: number;
  atrTpMult: number;
  maxDailyLossPct: number;
  maxTradesPerDay: number;
  cooldownMin: number;
  activeManage?: boolean;
  breakevenAtr?: number;
  trailAtr?: number;
  trailDistAtr?: number;
  scaleOutAtr?: number;
  scaleOutPct?: number;
};

export type NotifyConfig = {
  telegram: boolean;
  discord: boolean;
  onTrade: boolean;
  onKill: boolean;
};

export type BotConfig = {
  enabled: boolean;
  aiFilter: boolean;
  aiCooldownMin: number;
  pmMode: boolean;
  cloudPm: boolean;
  committee: boolean;
  committeeMinApprovals?: number;
  instruments: Instrument[];
  watchlist: string[];
  sizePerTrade: number;
  maxOpenPositions: number;
  stopDistance: number;
  profitDistance: number;
  strategy: StrategyConfig;
  risk: RiskConfig;
  notify: NotifyConfig;
};

export type State = {
  config: BotConfig;
  logs: LogEntry[];
  equity: { ts: number; equity: number }[];
  trades: TradeRecord[];
  stats: { signals: number; tradesOpened: number; tradesClosed: number };
  lastTick: number;
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
};

export type Analytics = {
  total: number;
  closed: number;
  open: number;
  wins: number;
  losses: number;
  winRate: number;
  netPnl: number;
  grossWin: number;
  grossLoss: number;
  profitFactor: number;
  avgWin: number;
  avgLoss: number;
  expectancy: number;
  maxDrawdown: number;
  bestStreak: number;
  worstStreak: number;
  byEpic: { epic: string; pnl: number; trades: number; winRate: number }[];
  pnlCurve: { ts: number; cum: number }[];
  dailyPnl: { date: string; pnl: number }[];
};
