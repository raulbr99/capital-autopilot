/**
 * Capa de persistencia dual.
 *  - Si SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY estan definidos -> Supabase (durable).
 *  - Si no -> cae al estado en memoria de lib/store.ts.
 *
 * El esquema usa blobs jsonb para config/estado y filas para trades/equity/logs.
 * Ver supabase/schema.sql.
 */

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

type SupaClient = {
  from: (t: string) => any;
};

let client: SupaClient | null = null;
let triedInit = false;

export function dbEnabled(): boolean {
  return Boolean(
    process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

async function supa(): Promise<SupaClient | null> {
  if (!dbEnabled()) return null;
  if (client || triedInit) return client;
  triedInit = true;
  try {
    const { createClient } = await import("@supabase/supabase-js");
    client = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    ) as unknown as SupaClient;
  } catch (e) {
    client = null;
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
