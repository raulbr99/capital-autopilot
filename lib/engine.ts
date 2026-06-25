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
  closePosition,
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
  recordJournal,
} from "./db";
import { notify, notifyConfigured } from "./notify";
import { reviewSignal, type AiVerdict } from "./ai";
import { askPortfolioManager, type PmContext } from "./pm";
import { getEconomicEvents, currenciesFor } from "./calendar";

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
  dealId?: string;
};

export function autopilotArmed(): boolean {
  return process.env.AUTOPILOT_ARMED === "true";
}

export type EngineResult = {
  configured: boolean;
  enabled: boolean;
  armed: boolean;
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
  // ---- equity ----
  const equity = account.balance + (account.pnl || 0);

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

  // ---- posiciones abiertas ----
  const openPositions: OpenPos[] = positions.map((p) => realToOpen(p));
  const openEpics = new Set(openPositions.map((o) => o.epic));
  evals.forEach((e) => (e.hasPosition = openEpics.has(e.epic)));
  let openCount = openPositions.length;
  let opened = 0;

  // ---- decisión: Gestor de Cartera IA, o motor técnico ----
  if (cfg.pmMode && allowTradesIntent && cfg.enabled) {
    opened += await runPmCycle({
      equity,
      dailyPnlPct,
      account,
      evals,
      openPositions,
      openEpics,
      openCount,
      tradesToday,
      killedToday,
      cooldownActive,
    });
  } else if (effectiveAllow) {
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
        dryRun: false,
        reason: e.signal.reason,
      };

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
          await notify(`✅ ${e.signal.type} ${e.epic} @${e.price.toFixed(2)} · size ${size.toFixed(2)} · SL ${stopDist.toFixed(1)} / TP ${tpDist.toFixed(1)}`);
      } catch (err: any) {
        logN("error", `No se pudo abrir ${e.epic}: ${err.message}`, e.epic);
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
  return sizeForRisk(equity, stopDist, epic, cfg.risk.riskPercent);
}

// Riesgo fijo en €: con PnL = size · movimiento, size = riesgo / distancia_stop.
// Respeta el min/step del instrumento (Capital).
async function sizeForRisk(
  equity: number,
  stopDist: number,
  epic: string,
  riskPct: number
): Promise<number> {
  if (stopDist <= 0) return 0;
  let size = (equity * riskPct) / 100 / stopDist;
  try {
    const md = await getMarketDetails(epic);
    const step = md.sizeStep > 0 ? md.sizeStep : md.minDealSize;
    size = Math.round(size / step) * step;
    size = Math.max(md.minDealSize, Math.min(size, md.maxDealSize));
  } catch {
    size = Math.max(0.01, Math.round(size * 100) / 100);
  }
  return size;
}

/* ---------------- Gestor de Cartera IA ---------------- */

async function buildPmEvents(epics: string[]): Promise<string> {
  try {
    const currencies = new Set<string>();
    epics.forEach((e) => currenciesFor(e).forEach((c) => currencies.add(c)));
    const now = Date.now();
    const ev = (await getEconomicEvents())
      .filter(
        (e) =>
          e.impact === "High" &&
          currencies.has(e.currency) &&
          e.time >= now - 1_800_000 &&
          e.time <= now + 21_600_000
      )
      .sort((a, b) => a.time - b.time)
      .slice(0, 5)
      .map((e) => `${e.currency} ${e.title} (${Math.round((e.time - now) / 60000)}min)`);
    return ev.length ? ev.join("; ") : "Sin eventos de alto impacto en las próximas 6h.";
  } catch {
    return "Calendario no disponible.";
  }
}

async function runPmCycle(p: {
  equity: number;
  dailyPnlPct: number;
  account: Awaited<ReturnType<typeof getAccount>>;
  evals: EpicEval[];
  openPositions: OpenPos[];
  openEpics: Set<string>;
  openCount: number;
  tradesToday: number;
  killedToday: boolean;
  cooldownActive: boolean;
}): Promise<number> {
  const b = bot();
  const cfg = b.config;

  const ctx: PmContext = {
    account: {
      equity: p.equity,
      available: p.account.available,
      dailyPnlPct: p.dailyPnlPct,
      currency: p.account.currency,
    },
    constraints: {
      maxOpenPositions: cfg.maxOpenPositions,
      openNow: p.openCount,
      maxRiskPct: cfg.risk.riskPercent,
      maxTradesPerDay: cfg.risk.maxTradesPerDay,
      tradesToday: p.tradesToday,
      killSwitchPct: cfg.risk.maxDailyLossPct,
    },
    positions: p.openPositions.map((o) => ({
      epic: o.epic,
      direction: o.direction,
      size: o.size,
      entry: o.entry,
      upl: o.upl,
    })),
    instruments: p.evals.map((e) => ({
      epic: e.epic,
      resolution: e.resolution,
      price: e.price,
      signal: e.signal.type,
      smaFast: e.signal.indicators.smaFast,
      smaSlow: e.signal.indicators.smaSlow,
      rsi: e.signal.indicators.rsi,
      adx: e.signal.indicators.adx,
      atr: e.atr,
      hasPosition: e.hasPosition,
    })),
    events: await buildPmEvents(p.evals.map((e) => e.epic)),
  };

  const decision = await askPortfolioManager(ctx);
  if (!decision) {
    logN("info", "🧠 Gestor IA: sin respuesta este ciclo");
    return 0;
  }

  await recordJournal({
    thesis: decision.thesis,
    confidence: decision.confidence,
    actions: decision.actions,
    snapshot: { equity: p.equity, dailyPnlPct: p.dailyPnlPct, positions: ctx.positions.length },
  });
  logN("info", `🧠 Gestor IA (${(decision.confidence * 100).toFixed(0)}%): ${decision.thesis.slice(0, 150)}`);

  let opened = 0;
  let openCount = p.openCount;
  let tradesToday = p.tradesToday;

  for (const act of decision.actions) {
    if (act.action === "CLOSE") {
      const pos = p.openPositions.find((o) => o.epic === act.epic && o.dealId);
      if (!pos || !pos.dealId) continue;
      try {
        await closePosition(pos.dealId);
        b.stats.tradesClosed++;
        p.openEpics.delete(pos.epic);
        openCount = Math.max(0, openCount - 1);
        logN("trade", `🧠 GESTOR cierra ${pos.epic}: ${act.reason}`, pos.epic);
        if (cfg.notify.onTrade) await notify(`🧠 *Gestor* cierra ${pos.epic} · ${act.reason}`);
      } catch (err: any) {
        logN("error", `Gestor no pudo cerrar ${act.epic}: ${err.message}`, act.epic);
      }
    } else if (act.action === "OPEN") {
      if (!act.epic || !act.direction) continue;
      if (p.killedToday || p.cooldownActive) continue;
      if (openCount >= cfg.maxOpenPositions) continue;
      if (tradesToday >= cfg.risk.maxTradesPerDay) continue;
      if (p.openEpics.has(act.epic)) continue;
      const e = p.evals.find((x) => x.epic === act.epic);
      if (!e || e.price <= 0) continue;
      const { stopDist, tpDist } = distances(cfg, e.atr, e.price);
      const riskPct = Math.max(0.25, Math.min(act.riskPct ?? cfg.risk.riskPercent, cfg.risk.riskPercent));
      const size = await sizeForRisk(p.equity, stopDist, act.epic, riskPct);
      if (!Number.isFinite(stopDist) || stopDist <= 0 || size <= 0) continue;
      const trade: TradeRecord = {
        id: `${Date.now()}-${act.epic}`,
        ts: Date.now(),
        epic: act.epic,
        direction: act.direction,
        size,
        entry: e.price,
        status: "open",
        dryRun: false,
        reason: `IA: ${act.reason}`,
      };
      try {
        const r = await openPosition({
          epic: act.epic,
          direction: act.direction,
          size,
          stopDistance: stopDist,
          profitDistance: tpDist,
        });
        trade.dealId = r.dealReference;
        await recordTrade(trade);
        b.stats.tradesOpened++;
        openCount++;
        tradesToday++;
        opened++;
        p.openEpics.add(act.epic);
        logN("trade", `🧠 GESTOR abre ${act.direction} ${size.toFixed(2)} ${act.epic} @${e.price.toFixed(2)} (riesgo ${riskPct}%): ${act.reason}`, act.epic);
        if (cfg.notify.onTrade)
          await notify(`🧠 *Gestor* ${act.direction} ${act.epic} @${e.price.toFixed(2)} · ${act.reason}`);
      } catch (err: any) {
        logN("error", `Gestor no pudo abrir ${act.epic}: ${err.message}`, act.epic);
      }
    }
  }
  return opened;
}

function realToOpen(p: Position): OpenPos {
  return {
    key: p.dealId,
    epic: p.epic,
    direction: p.direction,
    size: p.size,
    entry: p.level,
    upl: p.upl,
    dealId: p.dealId,
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
