import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { analyze } from "@/lib/analytics";
import type { TradeRecord } from "@/components/types";

export const dynamic = "force-dynamic";

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
    dryRun: r.dry_run,
    reason: r.reason,
  };
}

// GET -> historial de trades + analítica (lectura directa de Supabase)
export async function GET() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  let trades: TradeRecord[] = [];
  if (url && key) {
    try {
      const c = createClient(url, key, { auth: { persistSession: false } });
      const { data } = await c
        .from("ap_trades")
        .select("*", { count: "exact" })
        .order("ts", { ascending: false })
        .limit(300);
      trades = (data ?? []).map(tradeFromRow);
    } catch {
      /* noop */
    }
  }
  return NextResponse.json({ trades, analytics: analyze(trades) });
}
