/**
 * Cliente minimo de la Capital.com Trading API (entorno DEMO).
 * Docs: https://open-api.capital.com/
 *
 * Flujo de auth:
 *   POST /api/v1/session  con header X-CAP-API-KEY + body { identifier, password }
 *   -> devuelve los tokens CST y X-SECURITY-TOKEN en las CABECERAS de respuesta.
 *   Esos dos tokens se reenvian en el resto de llamadas.
 *
 * Cacheamos la sesion en memoria del servidor (~9 min) para no re-loguear en cada tick.
 */

import { loadSessionToken, saveSessionToken } from "./db";

const BASE_URL =
  process.env.CAPITAL_BASE_URL ||
  "https://demo-api-capital.backend-capital.com";

type Session = { cst: string; xst: string; createdAt: number };

let cached: Session | null = null;
const SESSION_TTL = 8 * 60 * 1000; // 8 minutos (sesion Capital ~10 min de inactividad)

export function capitalConfigured(): boolean {
  return Boolean(
    process.env.CAPITAL_API_KEY &&
      process.env.CAPITAL_IDENTIFIER &&
      process.env.CAPITAL_PASSWORD
  );
}

export async function getSession(force = false): Promise<Session> {
  if (!capitalConfigured()) {
    throw new Error(
      "Faltan credenciales de Capital.com. Copia .env.local.example a .env.local."
    );
  }
  if (!force && cached && Date.now() - cached.createdAt < SESSION_TTL) {
    return cached;
  }

  // Cache compartido en Supabase: reutiliza el token entre invocaciones
  // serverless en vez de re-loguear en cada arranque en frio (evita el 429).
  if (!force) {
    const shared = await loadSessionToken();
    if (shared && Date.now() - shared.createdAt < SESSION_TTL) {
      cached = shared;
      return cached;
    }
  }

  // El endpoint /session tiene un rate-limit MUY estricto (≈1 req/s). En un
  // arranque en frio con el token compartido recien expirado, un 429/5xx
  // transitorio en el login dejaria sin evaluar al instrumento. Reintentamos
  // con backoff — igual que hace authed() para el resto de llamadas.
  const doLogin = () =>
    fetch(`${BASE_URL}/api/v1/session`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CAP-API-KEY": process.env.CAPITAL_API_KEY!,
      },
      body: JSON.stringify({
        identifier: process.env.CAPITAL_IDENTIFIER,
        password: process.env.CAPITAL_PASSWORD,
        encryptedPassword: false,
      }),
      cache: "no-store",
    });

  let res = await doLogin();
  // 429 (rate-limit) o 5xx transitorio -> esperar y reintentar (2 intentos extra).
  for (let attempt = 0; attempt < 2 && (res.status === 429 || res.status >= 500); attempt++) {
    await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    res = await doLogin();
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Login Capital.com fallo (${res.status}): ${text}`);
  }

  const cst = res.headers.get("CST");
  const xst = res.headers.get("X-SECURITY-TOKEN");
  if (!cst || !xst) {
    throw new Error("Capital.com no devolvio los tokens de sesion.");
  }

  cached = { cst, xst, createdAt: Date.now() };
  void saveSessionToken(cst, xst);
  return cached;
}

// Throttle global: espacia las llamadas a Capital ~140ms (≈7 req/s) para no
// superar su límite (429 too-many-requests), clave con 17 instrumentos por tick.
let nextSlot = 0;
function throttle(): Promise<void> {
  const now = Date.now();
  const slot = Math.max(now, nextSlot);
  nextSlot = slot + 140;
  const wait = slot - now;
  return wait > 0 ? new Promise((r) => setTimeout(r, wait)) : Promise.resolve();
}

async function authed(
  path: string,
  init: RequestInit = {},
  retry = true
): Promise<Response> {
  const s = await getSession();
  await throttle();
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      CST: s.cst,
      "X-SECURITY-TOKEN": s.xst,
      ...(init.headers || {}),
    },
    cache: "no-store",
  });

  // Token expirado -> re-login una vez
  if ((res.status === 401 || res.status === 403) && retry) {
    await getSession(true);
    return authed(path, init, false);
  }
  // Rate limit -> esperar y reintentar una vez
  if (res.status === 429 && retry) {
    await new Promise((r) => setTimeout(r, 900));
    return authed(path, init, false);
  }
  // Glitch transitorio de Capital: 5xx (cualquier método) o 404 en GET idempotente
  // (p.ej. error.not-found.epic en /prices tras un mantenimiento) -> reintentar una vez.
  // Los POST/PUT/DELETE NO se reintentan en 404 para no arriesgar doble ejecución.
  const method = (init.method || "GET").toUpperCase();
  if (retry && (res.status >= 500 || (res.status === 404 && method === "GET"))) {
    await new Promise((r) => setTimeout(r, 500));
    return authed(path, init, false);
  }
  return res;
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Capital.com ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

/* ---------------- Endpoints ---------------- */

export type AccountInfo = {
  accountId: string;
  balance: number;
  available: number;
  deposit: number;
  pnl: number;
  currency: string;
};

// Cachés cortas: el dashboard hace polling cada 6s; sin esto saturamos el
// rate-limit de Capital (429). Las invalidamos al abrir/cerrar posiciones.
let accountCache: { d: AccountInfo; t: number } | null = null;
let positionsCache: { d: Position[]; t: number } | null = null;
const pricesCache = new Map<string, { d: Candle[]; t: number }>();

export function invalidateCaches() {
  accountCache = null;
  positionsCache = null;
}

export async function getAccount(): Promise<AccountInfo> {
  if (accountCache && Date.now() - accountCache.t < 15000) return accountCache.d;
  const data = await json<any>(await authed("/api/v1/accounts"));
  const acc = data.accounts?.[0] ?? {};
  const b = acc.balance ?? {};
  const out: AccountInfo = {
    accountId: acc.accountId ?? "—",
    balance: b.balance ?? 0,
    available: b.available ?? 0,
    deposit: b.deposit ?? 0,
    pnl: b.profitLoss ?? 0,
    currency: acc.currency ?? "USD",
  };
  accountCache = { d: out, t: Date.now() };
  return out;
}

export type Position = {
  dealId: string;
  epic: string;
  direction: "BUY" | "SELL";
  size: number;
  level: number;
  upl: number;
  currency: string;
  createdDate: string;
  stopLevel: number | null;
  limitLevel: number | null;
  currentPrice: number | null;
};

export async function getPositions(): Promise<Position[]> {
  if (positionsCache && Date.now() - positionsCache.t < 8000) return positionsCache.d;
  const data = await json<any>(await authed("/api/v1/positions"));
  const out: Position[] = (data.positions ?? []).map((p: any) => {
    const bid = typeof p.market?.bid === "number" ? p.market.bid : null;
    const offer = typeof p.market?.offer === "number" ? p.market.offer : null;
    const mid = bid != null && offer != null ? (bid + offer) / 2 : bid ?? offer;
    return {
      dealId: p.position.dealId,
      epic: p.market.epic,
      direction: p.position.direction,
      size: p.position.size,
      level: p.position.level,
      upl: p.position.upl ?? 0,
      currency: p.position.currency ?? "USD",
      createdDate: p.position.createdDateUTC ?? p.position.createdDate ?? "",
      stopLevel: typeof p.position.stopLevel === "number" ? p.position.stopLevel : null,
      limitLevel: typeof p.position.limitLevel === "number" ? p.position.limitLevel : null,
      currentPrice: mid ?? null,
    };
  });
  positionsCache = { d: out, t: Date.now() };
  return out;
}

export async function openPosition(params: {
  epic: string;
  direction: "BUY" | "SELL";
  size: number;
  stopDistance?: number;
  profitDistance?: number;
}): Promise<{ dealReference: string }> {
  const r = await json<{ dealReference: string }>(
    await authed("/api/v1/positions", {
      method: "POST",
      body: JSON.stringify({
        epic: params.epic,
        direction: params.direction,
        size: params.size,
        guaranteedStop: false,
        ...(params.stopDistance ? { stopDistance: params.stopDistance } : {}),
        ...(params.profitDistance
          ? { profitDistance: params.profitDistance }
          : {}),
      }),
    })
  );
  invalidateCaches(); // cuenta/posiciones cambian tras abrir
  return r;
}

export async function closePosition(
  dealId: string
): Promise<{ dealReference: string }> {
  const r = await json<{ dealReference: string }>(
    await authed(`/api/v1/positions/${dealId}`, { method: "DELETE" })
  );
  invalidateCaches();
  return r;
}

/** Amendar una posición abierta (mover SL/TP). Para trailing stop + breakeven. */
export async function updatePosition(
  dealId: string,
  body: { stopLevel?: number; limitLevel?: number }
): Promise<{ dealReference: string }> {
  const r = await json<{ dealReference: string }>(
    await authed(`/api/v1/positions/${dealId}`, { method: "PUT", body: JSON.stringify(body) })
  );
  invalidateCaches();
  return r;
}

/**
 * Cierre PARCIAL: orden opuesta de `size` con forceOpen:false → Capital netea y
 * reduce la posición existente (no abre una nueva). Para scaling out.
 */
export async function reducePosition(
  epic: string,
  positionDir: "BUY" | "SELL",
  size: number
): Promise<{ dealReference: string }> {
  const r = await json<{ dealReference: string }>(
    await authed("/api/v1/positions", {
      method: "POST",
      body: JSON.stringify({
        epic,
        direction: positionDir === "BUY" ? "SELL" : "BUY",
        size,
        forceOpen: false,
        guaranteedStop: false,
      }),
    })
  );
  invalidateCaches();
  return r;
}

export type Candle = { time: string; open: number; high: number; low: number; close: number };

export async function getPrices(
  epic: string,
  resolution = "MINUTE",
  max = 60
): Promise<Candle[]> {
  const key = `${epic}:${resolution}:${max}`;
  const cached = pricesCache.get(key);
  if (cached && Date.now() - cached.t < 60000) return cached.d;
  const data = await json<any>(
    await authed(
      `/api/v1/prices/${encodeURIComponent(
        epic
      )}?resolution=${resolution}&max=${max}`
    )
  );
  const out: Candle[] = (data.prices ?? []).map((p: any) => ({
    time: p.snapshotTimeUTC ?? p.snapshotTime,
    open: mid(p.openPrice),
    high: mid(p.highPrice),
    low: mid(p.lowPrice),
    close: mid(p.closePrice),
  }));
  pricesCache.set(key, { d: out, t: Date.now() });
  return out;
}

function mid(p: any): number {
  if (typeof p === "number") return p;
  if (p && typeof p.bid === "number" && typeof p.ask === "number")
    return (p.bid + p.ask) / 2;
  return p?.bid ?? p?.ask ?? 0;
}

export type MarketDetails = {
  epic: string;
  minDealSize: number;
  sizeStep: number;
  maxDealSize: number;
  marketStatus: string; // TRADEABLE | CLOSED | EDITS_ONLY ... (importante para acciones)
};

const mdCache = new Map<string, { d: MarketDetails; t: number }>();

function ruleVal(o: any): number | null {
  const v = o?.value;
  return typeof v === "number" ? v : null;
}

/** Reglas de tamaño + estado del mercado — caché 5 min (el estado cambia al abrir/cerrar bolsa). */
export async function getMarketDetails(epic: string): Promise<MarketDetails> {
  const c = mdCache.get(epic);
  if (c && Date.now() - c.t < 300_000) return c.d;
  const data = await json<any>(
    await authed(`/api/v1/markets/${encodeURIComponent(epic)}`)
  );
  const r = data.dealingRules ?? {};
  const minDealSize = ruleVal(r.minDealSize) ?? 0.01;
  const d: MarketDetails = {
    epic,
    minDealSize,
    sizeStep: ruleVal(r.minSizeIncrement) ?? minDealSize,
    maxDealSize: ruleVal(r.maxDealSize) ?? Number.MAX_SAFE_INTEGER,
    marketStatus: data.snapshot?.marketStatus ?? "TRADEABLE",
  };
  mdCache.set(epic, { d, t: Date.now() });
  return d;
}

export type Transaction = {
  epic: string;
  pnl: number;
  date: string;
  type: string;
};

/** Transacciones recientes (para reconstruir PnL realizado de posiciones cerradas). */
export async function getTransactions(lastDays = 1): Promise<Transaction[]> {
  try {
    const data = await json<any>(
      await authed(`/api/v1/history/transactions?lastPeriod=${lastDays * 86400}`)
    );
    return (data.transactions ?? []).map((t: any) => ({
      epic: t.instrumentName ?? t.epic ?? "",
      pnl: parseFloat(t.size ?? t.profitAndLoss ?? "0") || 0,
      date: t.date ?? t.dateUtc ?? "",
      type: t.transactionType ?? "",
    }));
  } catch {
    return [];
  }
}

export async function searchMarket(term: string): Promise<
  { epic: string; name: string; bid: number; ask: number }[]
> {
  const data = await json<any>(
    await authed(`/api/v1/markets?searchTerm=${encodeURIComponent(term)}`)
  );
  return (data.markets ?? []).slice(0, 8).map((m: any) => ({
    epic: m.epic,
    name: m.instrumentName,
    bid: m.bid ?? 0,
    ask: m.offer ?? 0,
  }));
}
