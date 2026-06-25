/**
 * Capa de persistencia dual.
 *  - Si SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY estan definidos -> Supabase (durable).
 *  - Si no -> cae al estado en memoria de lib/store.ts.
 *
 * El esquema usa blobs jsonb para config/estado y filas para trades/equity/logs.
 * Ver supabase/schema.sql.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  bot,
  BotConfig,
  DEFAULT_CONFIG,
  TradeRecord,
  EquityPoint,
  LogEntry,
  Instrument,
  DEFAULT_RESOLUTION,
} from "./store";

let client: SupabaseClient | null = null;

export function dbEnabled(): boolean {
  return Boolean(
    process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

// Import estático (Supabase siempre presente) -> evita fallos de import dinámico
// por-ruta que dejaban el cliente en null y la analítica vacía.
async function supa(): Promise<SupabaseClient | null> {
  if (!dbEnabled()) return null;
  if (!client) {
    try {
      client = createClient(
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        {
          auth: { persistSession: false },
          // Next.js cachea fetch() por defecto -> supabase-js usa fetch ->
          // lecturas obsoletas. Forzamos no-store en cada request.
          global: { fetch: (i: any, init: any) => fetch(i, { ...init, cache: "no-store" }) },
        }
      );
    } catch {
      return null;
    }
  }
  return client;
}

/* ---------------- SESSION (token cache compartido) ---------------- */

export async function loadSessionToken(): Promise<{
  cst: string;
  xst: string;
  createdAt: number;
} | null> {
  const s = await supa();
  if (!s) return null;
  try {
    const { data } = await s
      .from("ap_session")
      .select("cst,xst,created_at")
      .eq("id", 1)
      .maybeSingle();
    if (data?.cst && data?.xst) {
      return {
        cst: data.cst,
        xst: data.xst,
        createdAt: new Date(data.created_at).getTime(),
      };
    }
  } catch {
    /* noop */
  }
  return null;
}

export async function saveSessionToken(cst: string, xst: string): Promise<void> {
  const s = await supa();
  if (!s) return;
  try {
    await s
      .from("ap_session")
      .upsert({ id: 1, cst, xst, created_at: new Date().toISOString() });
  } catch {
    /* noop */
  }
}

/* ---------------- CONFIG ---------------- */

export async function loadConfig(): Promise<BotConfig> {
  const s = await supa();
  if (!s) return bot().config;
  try {
    const { data } = await s
      .from("ap_config")
      .select("data")
      .eq("id", 1)
      .maybeSingle();
    if (data?.data) {
      // merge con defaults por si se añaden campos nuevos
      const merged = mergeConfig(DEFAULT_CONFIG, data.data);
      bot().config = merged;
      return merged;
    }
    await saveConfig(bot().config); // siembra fila inicial
    return bot().config;
  } catch {
    return bot().config;
  }
}

export async function saveConfig(cfg: BotConfig): Promise<void> {
  bot().config = cfg;
  const s = await supa();
  if (!s) return;
  try {
    await s.from("ap_config").upsert({ id: 1, data: cfg, updated_at: new Date().toISOString() });
  } catch {
    /* noop */
  }
}

function mergeConfig(base: BotConfig, override: any): BotConfig {
  // instruments: usa los guardados; si no hay (config antigua), derívalos del watchlist
  let instruments: Instrument[];
  if (Array.isArray(override.instruments) && override.instruments.length) {
    instruments = override.instruments
      .filter((i: any) => i && i.epic)
      .map((i: any) => ({
        epic: String(i.epic).toUpperCase().trim(),
        resolution: i.resolution || DEFAULT_RESOLUTION,
        ...(typeof i.regimeFilter === "boolean" ? { regimeFilter: i.regimeFilter } : {}),
        ...(i.category ? { category: i.category } : {}),
      }));
  } else if (Array.isArray(override.watchlist)) {
    instruments = override.watchlist.map((epic: string) => ({
      epic: String(epic).toUpperCase().trim(),
      resolution: DEFAULT_RESOLUTION,
    }));
  } else {
    instruments = base.instruments;
  }
  return {
    ...base,
    ...override,
    strategy: { ...base.strategy, ...(override.strategy || {}) },
    risk: { ...base.risk, ...(override.risk || {}) },
    notify: { ...base.notify, ...(override.notify || {}) },
    instruments,
    watchlist: instruments.map((i) => i.epic),
  };
}

/* ---------------- RUNTIME STATE (dayAnchor, cooldown, stats) ---------------- */

export async function loadRuntime(): Promise<void> {
  const b = bot();
  const s = await supa();
  if (!s) return;
  try {
    const { data } = await s
      .from("ap_state")
      .select("data")
      .eq("id", 1)
      .maybeSingle();
    if (data?.data) {
      b.dayAnchor = data.data.dayAnchor ?? null;
      b.killedDate = data.data.killedDate ?? null;
      b.cooldownUntil = data.data.cooldownUntil ?? 0;
      b.prevBalance = data.data.prevBalance ?? 0;
      b.aiReviewedAt = data.data.aiReviewedAt ?? {};
      b.stats = data.data.stats ?? b.stats;
    }
  } catch {
    /* noop */
  }
}

export async function saveRuntime(): Promise<void> {
  const b = bot();
  const s = await supa();
  if (!s) return;
  try {
    await s.from("ap_state").upsert({
      id: 1,
      data: {
        dayAnchor: b.dayAnchor,
        killedDate: b.killedDate,
        cooldownUntil: b.cooldownUntil,
        prevBalance: b.prevBalance,
        aiReviewedAt: b.aiReviewedAt,
        stats: b.stats,
      },
      updated_at: new Date().toISOString(),
    });
  } catch {
    /* noop */
  }
}

/* ---------------- TRADES ---------------- */

export async function recordTrade(t: TradeRecord): Promise<void> {
  bot().trades.unshift(t);
  if (bot().trades.length > 500) bot().trades.length = 500;
  const s = await supa();
  if (!s) return;
  try {
    await s.from("ap_trades").insert(rowFromTrade(t));
  } catch {
    /* noop */
  }
}

/**
 * Reclama (atómicamente) la apertura de un activo ANTES de mandar la orden a
 * Capital. Inserta el trade con status 'open'; el índice único parcial
 * `ap_trades_one_open_per_epic` hace que solo UN tick gane si varios se solapan
 * (los demás reciben 23505 -> false). Evita posiciones duplicadas del mismo activo.
 */
export async function claimTradeOpen(t: TradeRecord): Promise<boolean> {
  const b = bot();
  // guard rápido en memoria (mismo proceso)
  if (b.trades.some((x) => x.epic === t.epic && x.status === "open")) return false;
  const s = await supa();
  if (!s) {
    b.trades.unshift(t);
    return true;
  }
  try {
    const { error } = await s.from("ap_trades").insert(rowFromTrade(t));
    if (error) return false; // 23505 (índice único) u otro conflicto -> no reclamado
  } catch {
    return false;
  }
  b.trades.unshift(t);
  if (b.trades.length > 500) b.trades.length = 500;
  return true;
}

// Borra un trade (libera el reclamo si Capital rechaza la orden tras el claim).
export async function deleteTrade(id: string): Promise<void> {
  const b = bot();
  const i = b.trades.findIndex((x) => x.id === id);
  if (i >= 0) b.trades.splice(i, 1);
  const s = await supa();
  if (!s) return;
  try {
    await s.from("ap_trades").delete().eq("id", id);
  } catch {
    /* noop */
  }
}

export async function updateTrade(
  id: string,
  patch: Partial<TradeRecord>
): Promise<void> {
  const t = bot().trades.find((x) => x.id === id);
  if (t) Object.assign(t, patch);
  const s = await supa();
  if (!s) return;
  try {
    await s.from("ap_trades").update(rowPatch(patch)).eq("id", id);
  } catch {
    /* noop */
  }
}

export async function getTrades(limit = 100): Promise<TradeRecord[]> {
  const s = await supa();
  if (!s) return bot().trades.slice(0, limit);
  try {
    const { data } = await s
      .from("ap_trades")
      .select("*")
      .order("ts", { ascending: false })
      .limit(limit);
    if (Array.isArray(data)) return data.map(tradeFromRow);
  } catch {
    /* noop */
  }
  return bot().trades.slice(0, limit);
}

function rowFromTrade(t: TradeRecord) {
  return {
    id: t.id,
    ts: new Date(t.ts).toISOString(),
    closed_ts: t.closedTs ? new Date(t.closedTs).toISOString() : null,
    epic: t.epic,
    direction: t.direction,
    size: t.size,
    entry: t.entry,
    exit: t.exit ?? null,
    pnl: t.pnl ?? null,
    status: t.status,
    deal_id: t.dealId ?? null,
    dry_run: t.dryRun,
    reason: t.reason,
  };
}
function rowPatch(p: Partial<TradeRecord>) {
  const o: any = {};
  if (p.closedTs !== undefined)
    o.closed_ts = p.closedTs ? new Date(p.closedTs).toISOString() : null;
  if (p.exit !== undefined) o.exit = p.exit;
  if (p.pnl !== undefined) o.pnl = p.pnl;
  if (p.status !== undefined) o.status = p.status;
  return o;
}
function tradeFromRow(r: any): TradeRecord {
  return {
    id: r.id,
    ts: new Date(r.ts).getTime(),
    closedTs: r.closed_ts ? new Date(r.closed_ts).getTime() : undefined,
    epic: r.epic,
    direction: r.direction,
    size: r.size,
    entry: r.entry,
    exit: r.exit ?? undefined,
    pnl: r.pnl ?? undefined,
    status: r.status,
    dealId: r.deal_id ?? undefined,
    dryRun: r.dry_run,
    reason: r.reason,
  };
}

/* ---------------- EQUITY ---------------- */

export async function appendEquity(pt: EquityPoint): Promise<void> {
  const s = await supa();
  if (!s) return;
  try {
    await s.from("ap_equity").insert({
      ts: new Date(pt.ts).toISOString(),
      equity: pt.equity,
    });
  } catch {
    /* noop */
  }
}

export async function clearEquity(): Promise<void> {
  bot().equity = [];
  const s = await supa();
  if (!s) return;
  try {
    await s.from("ap_equity").delete().neq("id", 0);
  } catch {
    /* noop */
  }
}

export async function getEquity(limit = 300): Promise<EquityPoint[]> {
  const s = await supa();
  if (!s) return bot().equity.slice(-limit);
  try {
    const { data } = await s
      .from("ap_equity")
      .select("*")
      .order("ts", { ascending: false })
      .limit(limit);
    if (Array.isArray(data))
      return data
        .map((r) => ({ ts: new Date(r.ts).getTime(), equity: Number(r.equity) }))
        .reverse();
  } catch {
    /* noop */
  }
  return bot().equity.slice(-limit);
}

/* ---------------- JOURNAL (Gestor IA) ---------------- */

export async function recordJournal(entry: {
  thesis: string;
  confidence: number;
  actions: any[];
  snapshot: any;
  desk?: string | null;
}): Promise<void> {
  const s = await supa();
  if (!s) return;
  try {
    await s.from("ap_journal").insert({
      ts: new Date().toISOString(),
      thesis: entry.thesis,
      confidence: entry.confidence,
      actions: entry.actions,
      snapshot: entry.snapshot,
      desk: entry.desk ?? null,
    });
  } catch {
    /* noop */
  }
}

export async function getJournal(limit = 50): Promise<any[]> {
  const s = await supa();
  if (!s) return [];
  try {
    const { data } = await s
      .from("ap_journal")
      .select("*")
      .order("ts", { ascending: false })
      .limit(limit);
    if (Array.isArray(data)) return data;
  } catch {
    /* noop */
  }
  return [];
}

/* ---------------- COLA DEL GESTOR EN LA NUBE ---------------- */
// La routine Claude (cada hora) inserta sus decisiones aquí; el motor las drena.

export type PmQueueRow = {
  id: number;
  thesis: string;
  confidence: number;
  actions: any[];
  desk: string | null;
};

export async function getPendingPmDecisions(): Promise<PmQueueRow[]> {
  const s = await supa();
  if (!s) return [];
  try {
    const { data } = await s
      .from("ap_pm_queue")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    if (Array.isArray(data))
      return data.map((r: any) => ({
        id: r.id,
        thesis: r.thesis ?? "",
        confidence: typeof r.confidence === "number" ? r.confidence : 0.5,
        actions: Array.isArray(r.actions) ? r.actions : [],
        desk: r.desk ?? null,
      }));
  } catch {
    /* noop */
  }
  return [];
}

export async function markPmConsumed(ids: number[]): Promise<void> {
  const s = await supa();
  if (!s || !ids.length) return;
  try {
    await s
      .from("ap_pm_queue")
      .update({ status: "consumed", consumed_at: new Date().toISOString() })
      .in("id", ids);
  } catch {
    /* noop */
  }
}

/* ---------------- LOGS ---------------- */

export async function appendLog(entry: LogEntry): Promise<void> {
  const s = await supa();
  if (!s) return;
  try {
    await s.from("ap_logs").insert({
      ts: new Date(entry.ts).toISOString(),
      level: entry.level,
      epic: entry.epic ?? null,
      message: entry.message,
    });
  } catch {
    /* noop */
  }
}

// Lee los logs persistidos (el navegador pega a instancias frías sin memoria).
export async function getLogs(limit = 60): Promise<LogEntry[]> {
  const s = await supa();
  if (!s) return bot().logs.slice(0, limit);
  try {
    const { data } = await s
      .from("ap_logs")
      .select("*")
      .order("ts", { ascending: false })
      .limit(limit);
    if (Array.isArray(data))
      return data.map((r: any, i: number) => ({
        id: r.id != null ? String(r.id) : `${new Date(r.ts).getTime()}-${i}`,
        ts: new Date(r.ts).getTime(),
        level: r.level,
        epic: r.epic ?? undefined,
        message: r.message,
      }));
  } catch {
    /* noop */
  }
  return bot().logs.slice(0, limit);
}
