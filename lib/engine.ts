/**
 * Motor del piloto automatico (con gestion de riesgo + dry-run).
 *
 * - Carga config/estado durables desde Supabase (lib/db) -> el cron usa la
 *   config de la UI aunque el proceso serverless se reinicie.
 * - DRY-RUN (paper): simula entradas/salidas con SL/TP y calcula PnL realista
 *   SIN enviar nada a Capital. Ideal para "ver pensar" al bot antes de armarlo.
 * - Guardarrailes: kill-switch por perdida diaria, cooldown tras perdida,
 *   maximo de trades/dia, sizing por % de equity y SL/TP por ATR.
 */

import {
  getAccount,
  getPositions,
  getPrices,
  openPosition,
  getMarketDetails,
  capitalConfigured,
  type Position,
  type Candle,
} from "./capital";
import { evaluate, atr, type Signal } from "./strategy";
import { bot, log, pushEquity, todayKey, TradeRecord, DEFAULT_RESOLUTION, type Instrument, type EquityPoint } from "./store";
import {
  loadConfig,
  loadRuntime,
  saveRuntime,
  recordTrade,
  updateTrade,
  appendEquity,
  getEquity,
  appendLog,
} from "./db";
import { notify, notifyConfigured } from "./notify";
import { reviewSignal, type AiVerdict } from "./ai";

export type EpicEval = {
  epic: string;
  resolution: string;
  signal: Signal;
  hasPosition: boolean;
  price: number;
  atr: number;
  spark: number[]; // ultimos cierres para mini-grafica
};

export type OpenPos = {
  key: string;
  epic: string;
  direction: "BUY" | "SELL";
  size: number;
  entry: number;
  upl: number;
  paper: boolean;
  dealId?: string;
};

export function autopilotArmed(): boolean {
  return process.env.AUTOPILOT_ARMED === "true";
}

export type EngineResult = {
  configured: boolean;
  enabled: boolean;
  armed: boolean;
  dryRun: boolean;
  killedToday: boolean;
  cooldownUntil: number;
  tradesToday: number;
  dailyPnlPct: number;
  account: Awaited<ReturnType<typeof getAccount>> | null;
  openPositions: OpenPos[];
  evals: EpicEval[];
  state: ReturnType<typeof snapshotState>;
  opened: number;
};

const logN = (level: Parameters<typeof log>[0], msg: string, epic?: string) => {
  log(level, msg, epic);
  void appendLog(bot().logs[0]);
};

export async function runEngine(allowTradesIntent: boolean): Promise<EngineResult> {
  const b = bot();
  await loadConfig();
  await loadRuntime();
  const cfg = b.config;
  b.lastTick = Date.now();
  const today = todayKey();

  if (!capitalConfigured()) {
    return base(false, allowTradesIntent, 0, 0, 0, null, [], []);
  }

  const [account, positions] = await Promise.all([getAccount(), getPositions()]);

  // ---- instrumentos (epic + resolución de señal) ----
  const instruments: Instrument[] =
    cfg.instruments && cfg.instruments.length
      ? cfg.instruments
      : cfg.watchlist.map((epic) => ({ epic, resolution: DEFAULT_RESOLUTION }));

  // ---- precios + ATR + señal por activo (cada uno a SU resolución) ----
  const candlesByEpic = new Map<string, Candle[]>();
  const evals: EpicEval[] = [];
  for (const inst of instruments) {
    const epic = inst.epic;
    const res = inst.resolution || DEFAULT_RESOLUTION;
    // filtro de régimen por instrumento (si está definido, sobreescribe el global)
    const strat =
      inst.regimeFilter === undefined
        ? cfg.strategy
        : { ...cfg.strategy, useRegimeFilter: inst.regimeFilter };
    try {
      const candles = await getPrices(epic, res, 150);
      candlesByEpic.set(epic, candles);
      const signal = evaluate(candles, strat);
      const price = candles.length ? candles[candles.length - 1].close : 0;
      const a = atr(candles, cfg.risk.atrPeriod);
      const spark = candles.slice(-30).map((c) => c.close);
      evals.push({ epic, resolution: res, signal, hasPosition: false, price, atr: a, spark });
      if (signal.type !== "FLAT") b.stats.signals++;
    } catch (err: any) {
      logN("error", `Error evaluando ${epic} (${res}): ${err.message}`, epic);
    }
  }
  const priceOf = (epic: string) =>
    evals.find((e) => e.epic === epic)?.price ?? 0;

  // ---- gestionar paper trades abiertos (fills SL/TP) ----
  managePaperTrades(candlesByEpic);

  // ---- equity (real o paper) ----
  const paperOpen = b.trades.filter((t) => t.status === "open" && t.dryRun);
  const paperFloating = paperOpen.reduce(
    (s, t) => s + floating(t, priceOf(t.epic)),
    0
  );
  const paperRealized = b.trades
    .filter((t) => t.dryRun && t.status === "closed")
    .reduce((s, t) => s + (t.pnl || 0), 0);
  const equity = cfg.dryRun
    ? account.balance + paperRealized + paperFloating
    : account.balance + (account.pnl || 0);

  // ---- ancla del dia / kill-switch ----
  if (!b.dayAnchor || b.dayAnchor.date !== today) {
    b.dayAnchor = { date: today, startEquity: equity };
  }
  const dailyPnlPct =
    b.dayAnchor.startEquity > 0
      ? ((equity - b.dayAnchor.startEquity) / b.dayAnchor.startEquity) * 100
      : 0;

  let killedToday = b.killedDate === today;
  if (!killedToday && dailyPnlPct <= -cfg.risk.maxDailyLossPct) {
    b.killedDate = today;
    killedToday = true;
    logN("kill", `🛑 KILL-SWITCH: pérdida diaria ${dailyPnlPct.toFixed(2)}% ≥ límite ${cfg.risk.maxDailyLossPct}%. Bot desarmado hoy.`);
    if (cfg.notify.onKill)
      await notify(`🛑 *KILL-SWITCH* — pérdida diaria ${dailyPnlPct.toFixed(2)}%. Autopilot detenido por hoy.`, true);
  }

  // ---- contadores / cooldown ----
  const tradesToday = b.trades.filter((t) => todayKey(t.ts) === today).length;
  const cooldownActive = Date.now() < b.cooldownUntil;
  const effectiveAllow =
    allowTradesIntent &&
    cfg.enabled && // el toggle "Activar/Detener" controla también el cron
    !killedToday &&
    !cooldownActive &&
    tradesToday < cfg.risk.maxTradesPerDay;

  // ---- posiciones abiertas unificadas (real + paper) ----
  const openPositions: OpenPos[] = [
    ...positions.map((p) => realToOpen(p)),
    ...paperOpen.map((t) => paperToOpen(t, priceOf(t.epic))),
  ];
  const openEpics = new Set(openPositions.map((o) => o.epic));
  evals.forEach((e) => (e.hasPosition = openEpics.has(e.epic)));
  let openCount = openPositions.length;
  let opened = 0;

  // ---- abrir nuevas posiciones ----
  if (effectiveAllow) {
    for (const e of evals) {
      if (e.signal.type === "FLAT" || openEpics.has(e.epic)) continue;
      if (openCount >= cfg.maxOpenPositions) break;

      const { stopDist, tpDist } = distances(cfg, e.atr, e.price);
      const size = await sizeFor(cfg, equity, stopDist, e.epic);
      if (!Number.isFinite(stopDist) || stopDist <= 0 || size <= 0) continue;

      logN(
        "signal",
        `${e.epic} ${e.signal.type} ${(e.signal.confidence * 100).toFixed(0)}% — ${e.signal.reason}`,
        e.epic
      );

      // Capa IA: segunda opinión (fail-open). Veta si desaprueba con confianza.
      // Cooldown por activo: no gastar otra llamada de IA si lo revisamos hace poco.
      let verdict: AiVerdict | null = null;
      if (cfg.aiFilter) {
        const since = Date.now() - (b.aiReviewedAt[e.epic] || 0);
        if (since < cfg.aiCooldownMin * 60_000) continue; // en cooldown -> salta
        b.aiReviewedAt[e.epic] = Date.now();
        verdict = await reviewSignal({
          epic: e.epic,
          resolution: e.resolution,
          direction: e.signal.type as "BUY" | "SELL",
          price: e.price,
          reason: e.signal.reason,
          indicators: { ...e.signal.indicators, atr: e.atr },
          recentCloses: e.spark,
        });
      }
      if (verdict && !verdict.approve && verdict.confidence >= 0.6) {
        logN(
          "info",
          `🤖 IA vetó ${e.epic}: ${verdict.reason} (conf ${(verdict.confidence * 100).toFixed(0)}%)`,
          e.epic
        );
        continue;
      }
      if (verdict?.approve) {
        logN("info", `🤖 IA OK ${e.epic}: ${verdict.reason}`, e.epic);
      }

      const trade: TradeRecord = {
        id: `${Date.now()}-${e.epic}`,
        ts: Date.now(),
        epic: e.epic,
        direction: e.signal.type,
        size,
        entry: e.price,
        status: "open",
        dryRun: cfg.dryRun,
        reason: e.signal.reason,
      };
      // stops "virtuales" para el simulador
      (trade as any).sl =
        e.signal.type === "BUY" ? e.price - stopDist : e.price + stopDist;
      (trade as any).tp =
        e.signal.type === "BUY" ? e.price + tpDist : e.price - tpDist;

      if (cfg.dryRun) {
        await recordTrade(trade);
        b.stats.tradesOpened++;
        openCount++;
        opened++;
        openEpics.add(e.epic);
        logN("trade", `📝 PAPER ${e.signal.type} ${size.toFixed(2)} ${e.epic} @${e.price.toFixed(2)} (SL ${stopDist.toFixed(1)} / TP ${tpDist.toFixed(1)})`, e.epic);
        if (cfg.notify.onTrade)
          await notify(`📝 *PAPER* ${e.signal.type} ${e.epic} @${e.price.toFixed(2)} · size ${size.toFixed(2)}`);
      } else {
        try {
          const r = await openPosition({
            epic: e.epic,
            direction: e.signal.type,
            size,
            stopDistance: stopDist,
            profitDistance: tpDist,
          });
          trade.dealId = r.dealReference;
          await recordTrade(trade);
          b.stats.tradesOpened++;
          openCount++;
          opened++;
          openEpics.add(e.epic);
          logN("trade", `✅ ABIERTA ${e.signal.type} ${size.toFixed(2)} ${e.epic} @${e.price.toFixed(2)} (SL ${stopDist.toFixed(1)} / TP ${tpDist.toFixed(1)})`, e.epic);
          if (cfg.notify.onTrade)
            await notify(`✅ *LIVE* ${e.signal.type} ${e.epic} @${e.price.toFixed(2)} · size ${size.toFixed(2)} · SL ${stopDist.toFixed(1)} / TP ${tpDist.toFixed(1)}`);
        } catch (err: any) {
          logN("error", `No se pudo abrir ${e.epic}: ${err.message}`, e.epic);
        }
      }
    }
  }

  // ---- equity + persistencia ----
  pushEquity(equity);
  await appendEquity({ ts: Date.now(), equity });
  await saveRuntime();
  // Histórico desde BD (consistente entre instancias serverless)
  const equityHistory = await getEquity(240);

  return {
    configured: true,
    enabled: cfg.enabled,
    armed: autopilotArmed(),
    dryRun: cfg.dryRun,
    killedToday,
    cooldownUntil: b.cooldownUntil,
    tradesToday,
    dailyPnlPct,
    account,
    openPositions,
    evals,
    state: snapshotState(equityHistory),
    opened,
  };
}

/* ---------------- helpers ---------------- */

function distances(cfg: ReturnType<typeof bot>["config"], a: number, price: number) {
  if (cfg.risk.useAtrStops && Number.isFinite(a) && a > 0) {
    return { stopDist: a * cfg.risk.atrStopMult, tpDist: a * cfg.risk.atrTpMult };
  }
  return { stopDist: cfg.stopDistance, tpDist: cfg.profitDistance };
}

async function sizeFor(
  cfg: ReturnType<typeof bot>["config"],
  equity: number,
  stopDist: number,
  epic: string
): Promise<number> {
  if (cfg.risk.sizingMode !== "percent" || stopDist <= 0) {
    return cfg.sizePerTrade;
  }
  // Riesgo fijo en €: con PnL = size · movimiento, size = riesgo / distancia_stop.
  const riskAmount = (equity * cfg.risk.riskPercent) / 100;
  let size = riskAmount / stopDist;
  try {
    const md = await getMarketDetails(epic);
    const step = md.sizeStep > 0 ? md.sizeStep : md.minDealSize;
    size = Math.round(size / step) * step; // ajustar al incremento del instrumento
    size = Math.max(md.minDealSize, Math.min(size, md.maxDealSize)); // respetar min/max
  } catch {
    size = Math.max(0.01, Math.round(size * 100) / 100);
  }
  return size;
}

function floating(t: TradeRecord, price: number): number {
  if (!price) return 0;
  const dir = t.direction === "BUY" ? 1 : -1;
  return (price - t.entry) * dir * t.size;
}

function managePaperTrades(candlesByEpic: Map<string, Candle[]>) {
  const b = bot();
  const cfg = b.config;
  for (const t of b.trades) {
    if (t.status !== "open" || !t.dryRun) continue;
    const candles = candlesByEpic.get(t.epic);
    if (!candles || candles.length === 0) continue;
    const last = candles[candles.length - 1];
    const sl = (t as any).sl as number;
    const tp = (t as any).tp as number;
    let exit: number | null = null;
    if (t.direction === "BUY") {
      if (last.low <= sl) exit = sl;
      else if (last.high >= tp) exit = tp;
    } else {
      if (last.high >= sl) exit = sl;
      else if (last.low <= tp) exit = tp;
    }
    if (exit !== null) {
      const dir = t.direction === "BUY" ? 1 : -1;
      const pnl = (exit - t.entry) * dir * t.size;
      t.exit = exit;
      t.pnl = pnl;
      t.status = "closed";
      t.closedTs = Date.now();
      b.stats.tradesClosed++;
      void updateTrade(t.id, { exit, pnl, status: "closed", closedTs: t.closedTs });
      const win = pnl >= 0;
      logN("trade", `${win ? "🟢" : "🔴"} PAPER cierre ${t.epic} @${exit.toFixed(2)} · PnL ${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}`, t.epic);
      if (!win) b.cooldownUntil = Date.now() + cfg.risk.cooldownMin * 60_000;
      if (cfg.notify.onTrade)
        void notify(`${win ? "🟢" : "🔴"} *PAPER cierre* ${t.epic} · PnL ${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}`);
    }
  }
}

function realToOpen(p: Position): OpenPos {
  return {
    key: p.dealId,
    epic: p.epic,
    direction: p.direction,
    size: p.size,
    entry: p.level,
    upl: p.upl,
    paper: false,
    dealId: p.dealId,
  };
}
function paperToOpen(t: TradeRecord, price: number): OpenPos {
  return {
    key: t.id,
    epic: t.epic,
    direction: t.direction,
    size: t.size,
    entry: t.entry,
    upl: floating(t, price),
    paper: true,
  };
}

function base(
  configured: boolean,
  allow: boolean,
  tradesToday: number,
  dailyPnlPct: number,
  cooldownUntil: number,
  account: EngineResult["account"],
  openPositions: OpenPos[],
  evals: EpicEval[]
): EngineResult {
  const b = bot();
  return {
    configured,
    enabled: b.config.enabled,
    armed: autopilotArmed(),
    dryRun: b.config.dryRun,
    killedToday: false,
    cooldownUntil,
    tradesToday,
    dailyPnlPct,
    account,
    openPositions,
    evals,
    state: snapshotState(),
    opened: 0,
  };
}

export function snapshotState(equity?: EquityPoint[]) {
  const b = bot();
  return {
    config: b.config,
    logs: b.logs.slice(0, 50),
    equity: equity ?? b.equity,
    trades: b.trades.slice(0, 60),
    stats: b.stats,
    lastTick: b.lastTick,
    notifyEnv: notifyConfigured(),
  };
}
