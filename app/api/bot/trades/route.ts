import { NextResponse } from "next/server";
import { getTrades } from "@/lib/db";
import { analyze } from "@/lib/analytics";

export const dynamic = "force-dynamic";

// GET -> historial de trades + analitica calculada
export async function GET() {
  const trades = await getTrades(300);
  return NextResponse.json({ trades, analytics: analyze(trades) });
}
