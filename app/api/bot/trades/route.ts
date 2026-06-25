import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getTrades } from "@/lib/db";
import { analyze } from "@/lib/analytics";

export const dynamic = "force-dynamic";

// GET -> historial de trades + analitica calculada
export async function GET() {
  const trades = await getTrades(300);
  let fresh = -1;
  try {
    const c = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );
    const { data } = await c.from("ap_trades").select("*").order("ts", { ascending: false }).limit(300);
    fresh = data?.length ?? -2;
  } catch {
    fresh = -3;
  }
  return NextResponse.json({
    trades,
    analytics: analyze(trades),
    _dbg: { getTrades: trades.length, fresh },
  });
}
