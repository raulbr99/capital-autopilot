import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

// Diagnóstico temporal: ¿lee ap_trades desde la API?
export async function GET() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ env: false });
  try {
    const c = createClient(url, key, { auth: { persistSession: false } });
    const { data, error, count } = await c
      .from("ap_trades")
      .select("*", { count: "exact" })
      .order("ts", { ascending: false })
      .limit(5);
    return NextResponse.json({
      env: true,
      rows: data?.length ?? null,
      totalCount: count ?? null,
      error: error?.message ?? null,
      errorCode: (error as any)?.code ?? null,
      sample: data?.[0] ? { epic: data[0].epic, status: data[0].status, pnl: data[0].pnl } : null,
    });
  } catch (e: any) {
    return NextResponse.json({ env: true, threw: e.message });
  }
}
