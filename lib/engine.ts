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
  claimTradeOpen,
  deleteTrade,
  updateTrade,
  getTrades,
  getLogs,
  appendEquity,
  getEquity,
  appendLog,
  recordJournal,
  getPendingPmDecisions,
  markPmConsumed,
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
  stopLevel?: number | null;
  limitLevel?: number | null;
  currentPrice?: number | null;
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
  b.logs = await getLogs(60); // hidrata logs persistidos (memoria vacía en instancias frías)
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
  // Epics que Capital.com no reconoce (error.not-found.epic): condición
  // permanente de configuración, no un error operativo. Se agregan en una
  // sola línea informativa al final del bucle en vez de emitir un `error`
  // por instrumento en cada tick (eran ~40, inundaban el feed y enmascaraban
  // errores reales de red/auth/rate-limit). El instrumento se omite igual que
  // antes: sin candles no hay eval ni señal ni trade.
  const unavailable: string[] = [];
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
      const msg = String(err?.message ?? err);
      if (/not-found\.epic/.test(msg)) {
        unavailable.push(`${epic} (${res})`);
      } else {
        logN("error", `Error evaluando ${epic} (${res}): ${msg}`, epic);
      }
    }
  }
  if (unavailable.length) {
    logN(
      "info",
      `Instrumentos no disponibles en Capital.com (epic no encontrado), se omiten: ${unavailable.join(
        ", "
      )} — revisar epics en la config (usar /api/capital/markets para resolver los correctos).`
    );
  }

  // ---- reconciliar cierres (SL/TP de Capital o cierres de la IA) ----
  const priceByEpic = new Map(evals.map((e) => [e.epic, e.price]));
  await reconcileClosedTrades(positions, priceByEpic, account.deposit);

  // ---- equity ----
  // Capital ya incluye el P&L flotante en `balance` (balance = deposit + profitLoss).
  // Sumar account.pnl otra vez sería doble conteo del flotante.
  const equity = account.balance;

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

  // ---- contadores / cooldown (desde BD, no memoria: válido entre instancias) ----
  const ourTrades = await getTrades(200);
  const tradesToday = ourTrades.filter((t) => todayKey(t.ts) === today).length;
  const ourOpenEpics = ourTrades.filter((t) => t.status === "open").map((t) => t.epic);
  const cooldownActive = Date.now() < b.cooldownUntil;
  const effectiveAllow =
    allowTradesIntent &&
    cfg.enabled && // el toggle "Activar/Detener" controla también el cron
    !killedToday &&
    !cooldownActive &&
    tradesToday < cfg.risk.maxTradesPerDay;

  // ---- posiciones abiertas (Capital + nuestros registros abiertos) ----
  const openPositions: OpenPos[] = positions.map((p) => realToOpen(p));
  const openEpics = new Set([...openPositions.map((o) => o.epic), ...ourOpenEpics]);
  evals.forEach((e) => (e.hasPosition = openEpics.has(e.epic)));
  let openCount = openPositions.length;
  let opened = 0;

  // ---- decisión: Gestor en la nube (cola) > Gestor inline (OpenRouter) > motor técnico ----
  if (cfg.cloudPm && allowTradesIntent && cfg.enabled) {
    opened += await drainPmQueue({
      equity,
      dailyPnlPct,
      evals,
      openPositions,
      openEpics,
      openCount,
      tradesToday,
      killedToday,
      cooldownActive,
    });
  } else if (cfg.pmMode && allowTradesIntent && cfg.enabled) {
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
      if (tradesToday + opened >= cfg.risk.maxTradesPerDay) break;

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

      const did = await executeOpen({
        epic: e.epic,
        direction: e.signal.type,
        size,
        stopDist,
        tpDist,
        price: e.price,
        reason: e.signal.reason,
        logMsg: `✅ ABIERTA ${e.signal.type} ${size.toFixed(2)} ${e.epic} @${e.price.toFixed(2)} (SL ${stopDist.toFixed(1)} / TP ${tpDist.toFixed(1)})`,
      });
      if (did) {
        openCount++;
        opened++;
        openEpics.add(e.epic);
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
  return executePmDecision(decision, p);
}

type PmExecCtx = {
  equity: number;
  dailyPnlPct: number;
  evals: EpicEval[];
  openPositions: OpenPos[];
  openEpics: Set<string>;
  openCount: number;
  tradesToday: number;
  killedToday: boolean;
  cooldownActive: boolean;
};

/**
 * Gestor en la nube: drena la cola (ap_pm_queue) que rellena la routine Claude
 * cada hora y ejecuta su decisión MÁS RECIENTE con los guardarraíles del bot.
 * El motor corre cada 15 min, así que la decisión se ejecuta en <15 min.
 */
async function drainPmQueue(p: PmExecCtx): Promise<number> {
  const pending = await getPendingPmDecisions(); // más recientes primero
  if (!pending.length) return 0;
  await markPmConsumed(pending.map((d) => d.id));
  // Una decisión por mesa: la más reciente de cada desk (las viejas se descartan).
  const seen = new Set<string>();
  const latestPerDesk = pending.filter((d) => {
    const k = d.desk || "global";
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  let opened = 0;
  for (const dec of latestPerDesk) {
    logN("info", `☁️ Gestor ${dec.desk || "global"}: ejecuto su decisión`);
    opened += await executePmDecision(
      { thesis: dec.thesis, confidence: dec.confidence, actions: dec.actions, desk: dec.desk },
      p
    );
  }
  return opened;
}

/**
 * Ejecuta una decisión del Gestor (OpenRouter o nube): diario + acciones con
 * guardarraíles. MUTA p.openCount/p.tradesToday para que los límites GLOBALES
 * se respeten aunque varias mesas decidan en el mismo ciclo.
 */
async function executePmDecision(
  decision: { thesis: string; confidence: number; actions: any[]; desk?: string | null },
  p: PmExecCtx
): Promise<number> {
  const b = bot();
  const cfg = b.config;

  await recordJournal({
    thesis: decision.thesis,
    confidence: decision.confidence,
    actions: decision.actions,
    snapshot: { equity: p.equity, dailyPnlPct: p.dailyPnlPct, positions: p.openPositions.length },
    desk: decision.desk ?? null,
  });
  const tag = decision.desk ? `[${decision.desk}] ` : "";
  logN("info", `🧠 ${tag}Gestor (${(decision.confidence * 100).toFixed(0)}%): ${(decision.thesis || "").slice(0, 140)}`);

  let opened = 0;

  for (const act of decision.actions || []) {
    if (act.action === "CLOSE") {
      const pos = p.openPositions.find((o) => o.epic === act.epic && o.dealId);
      if (!pos || !pos.dealId) continue;
      try {
        await closePosition(pos.dealId);
        p.openEpics.delete(pos.epic);
        p.openCount = Math.max(0, p.openCount - 1);
        logN("trade", `🧠 ${tag}cierra ${pos.epic}: ${act.reason}`, pos.epic);
        if (cfg.notify.onTrade) await notify(`🧠 *Gestor ${decision.desk || ""}* cierra ${pos.epic} · ${act.reason}`);
      } catch (err: any) {
        logN("error", `Gestor no pudo cerrar ${act.epic}: ${err.message}`, act.epic);
      }
    } else if (act.action === "OPEN") {
      if (!act.epic || !act.direction) continue;
      if (p.killedToday || p.cooldownActive) continue;
      if (p.openCount >= cfg.maxOpenPositions) continue;
      if (p.tradesToday >= cfg.risk.maxTradesPerDay) continue;
      if (p.openEpics.has(act.epic)) continue;
      const e = p.evals.find((x) => x.epic === act.epic);
      if (!e || e.price <= 0) continue;
      const { stopDist, tpDist } = distances(cfg, e.atr, e.price);
      const riskPct = Math.max(0.25, Math.min(act.riskPct ?? cfg.risk.riskPercent, cfg.risk.riskPercent));
      const size = await sizeForRisk(p.equity, stopDist, act.epic, riskPct);
      if (!Number.isFinite(stopDist) || stopDist <= 0 || size <= 0) continue;
      const did = await executeOpen({
        epic: act.epic,
        direction: act.direction,
        size,
        stopDist,
        tpDist,
        price: e.price,
        reason: `IA: ${act.reason}`,
        logMsg: `🧠 ${tag}abre ${act.direction} ${size.toFixed(2)} ${act.epic} @${e.price.toFixed(2)} (riesgo ${riskPct}%): ${act.reason}`,
      });
      if (did) {
        p.openCount++;
        p.tradesToday++;
        opened++;
        p.openEpics.add(act.epic);
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
    stopLevel: p.stopLevel,
    limitLevel: p.limitLevel,
    currentPrice: p.currentPrice,
  };
}

/**
 * Apertura segura: RECLAMA el activo en la BD (índice único parcial) ANTES de
 * mandar la orden a Capital. Si otro tick solapado ya lo reclamó -> no abre
 * (evita duplicados aunque Capital tarde en registrar la posición). Si Capital
 * rechaza la orden -> libera el reclamo. Devuelve true si abrió.
 */
async function executeOpen(p: {
  epic: string;
  direction: "BUY" | "SELL";
  size: number;
  stopDist: number;
  tpDist: number;
  price: number;
  reason: string;
  logMsg: string;
}): Promise<boolean> {
  const b = bot();
  // No abrir si el mercado no está operativo (acciones fuera de horario de bolsa, etc.)
  try {
    const md = await getMarketDetails(p.epic);
    if (md.marketStatus && md.marketStatus !== "TRADEABLE") {
      logN("info", `⏸️ ${p.epic}: mercado ${md.marketStatus} — no se abre ahora`, p.epic);
      return false;
    }
  } catch {
    /* si la consulta falla, no bloqueamos (forex/cripto 24/7) */
  }
  const trade: TradeRecord = {
    id: `${Date.now()}-${p.epic}`,
    ts: Date.now(),
    epic: p.epic,
    direction: p.direction,
    size: p.size,
    entry: p.price,
    status: "open",
    dryRun: false,
    reason: p.reason,
  };
  const claimed = await claimTradeOpen(trade);
  if (!claimed) {
    logN("info", `⏭️ ${p.epic}: ya hay posición abierta — duplicado evitado`, p.epic);
    return false;
  }
  try {
    const r = await openPosition({
      epic: p.epic,
      direction: p.direction,
      size: p.size,
      stopDistance: p.stopDist,
      profitDistance: p.tpDist,
    });
    await updateTrade(trade.id, { dealId: r.dealReference });
    b.stats.tradesOpened++;
    logN("trade", p.logMsg, p.epic);
    if (b.config.notify.onTrade)
      await notify(`✅ ${p.direction} ${p.epic} @${p.price.toFixed(2)} · ${p.reason}`);
    return true;
  } catch (err: any) {
    await deleteTrade(trade.id); // libera el reclamo si la orden falla
    logN("error", `No se pudo abrir ${p.epic}: ${err.message}`, p.epic);
    return false;
  }
}

/**
 * Reconcilia: nuestros trades "abiertos" cuya posición ya no existe en Capital
 * (cerrada por SL/TP o por la IA) se marcan cerrados, atribuyendo el P&L por el
 * cambio de balance entre ticks (cerrar realiza el P&L en el balance).
 */
async function reconcileClosedTrades(
  positions: Position[],
  priceByEpic: Map<string, number>,
  deposit: number
): Promise<void> {
  const b = bot();
  const openEpics = new Set(positions.map((p) => p.epic));
  let ourOpen: TradeRecord[] = [];
  try {
    ourOpen = (await getTrades(200)).filter((t) => t.status === "open");
  } catch {
    return;
  }
  const closed = ourOpen.filter((t) => !openEpics.has(t.epic));
  if (closed.length === 0) {
    b.prevDeposit = deposit;
    return;
  }
  // P&L realizado = delta de `deposit` (efectivo) entre ticks. Usamos deposit y NO
  // balance: balance incluye el P&L flotante de las posiciones aún abiertas, que
  // contaminaba la atribución (un cierre perdedor podía aparecer como ganancia).
  const prev = b.prevDeposit > 0 ? b.prevDeposit : deposit;
  const per = Math.round(((deposit - prev) / closed.length) * 100) / 100;
  for (const t of closed) {
    const exit = priceByEpic.get(t.epic) ?? t.entry;
    await updateTrade(t.id, { status: "closed", exit, pnl: per, closedTs: Date.now() });
    b.stats.tradesClosed++;
    logN(
      "trade",
      `${per >= 0 ? "🟢" : "🔴"} Cerrada ${t.epic} · PnL ${per >= 0 ? "+" : ""}${per.toFixed(2)}`,
      t.epic
    );
  }
  b.prevDeposit = deposit;
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
