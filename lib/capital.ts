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

const BASE_URL =
  process.env.CAPITAL_BASE_URL ||
  "https://demo-api-capital.backend-capital.com";

type Session = { cst: string; xst: string; createdAt: number };

let cached: Session | null = null;
const SESSION_TTL = 9 * 60 * 1000; // 9 minutos

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

  const res = await fetch(`${BASE_URL}/api/v1/session`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-CAP-API-KEY": process.env.CAPITAL_API_KEY!,
    },
    body: JSON.stringify({
      identifier: process.env.CAPITAL_IDENTIFIER,
      password: process.env.CAPITAL_PASSWORD,
    }),
    cache: "no-store",
  });

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
  return cached;
}

async function authed(
  path: string,
  init: RequestInit = {},
  retry = true
): Promise<Response> {
  const s = await getSession();
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

export async function getAccount(): Promise<AccountInfo> {
  const data = await json<any>(await authed("/api/v1/accounts"));
  const acc = data.accounts?.[0] ?? {};
  const b = acc.balance ?? {};
  return {
    accountId: acc.accountId ?? "—",
    balance: b.balance ?? 0,
    available: b.available ?? 0,
    deposit: b.deposit ?? 0,
    pnl: b.profitLoss ?? 0,
    currency: acc.currency ?? "USD",
  };
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
};

export async function getPositions(): Promise<Position[]> {
  const data = await json<any>(await authed("/api/v1/positions"));
  return (data.positions ?? []).map((p: any) => ({
    dealId: p.position.dealId,
    epic: p.market.epic,
    direction: p.position.direction,
    size: p.position.size,
    level: p.position.level,
    upl: p.position.upl ?? 0,
    currency: p.position.currency ?? "USD",
    createdDate: p.position.createdDateUTC ?? p.position.createdDate ?? "",
  }));
}

export async function openPosition(params: {
  epic: string;
  direction: "BUY" | "SELL";
  size: number;
  stopDistance?: number;
  profitDistance?: number;
}): Promise<{ dealReference: string }> {
  return json(
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
}

export async function closePosition(
  dealId: string
): Promise<{ dealReference: string }> {
  return json(
    await authed(`/api/v1/positions/${dealId}`, { method: "DELETE" })
  );
}

export type Candle = { time: string; open: number; high: number; low: number; close: number };

export async function getPrices(
  epic: string,
  resolution = "MINUTE",
  max = 60
): Promise<Candle[]> {
  const data = await json<any>(
    await authed(
      `/api/v1/prices/${encodeURIComponent(
        epic
      )}?resolution=${resolution}&max=${max}`
    )
  );
  return (data.prices ?? []).map((p: any) => ({
    time: p.snapshotTimeUTC ?? p.snapshotTime,
    open: mid(p.openPrice),
    high: mid(p.highPrice),
    low: mid(p.lowPrice),
    close: mid(p.closePrice),
  }));
}

function mid(p: any): number {
  if (typeof p === "number") return p;
  if (p && typeof p.bid === "number" && typeof p.ask === "number")
    return (p.bid + p.ask) / 2;
  return p?.bid ?? p?.ask ?? 0;
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
