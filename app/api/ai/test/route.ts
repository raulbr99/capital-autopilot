import { NextResponse } from "next/server";
import { askAi, aiConfigured } from "@/lib/ai";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Verifica que el AI Gateway responde, con un setup de ejemplo. */
export async function GET() {
  try {
    const verdict = await askAi({
      epic: "EURUSD",
      resolution: "HOUR_4",
      direction: "BUY",
      price: 1.1364,
      reason: "Cruce alcista + RSI neutro",
      indicators: { smaFast: 1.137, smaSlow: 1.135, rsi: 55, adx: 28, atr: 0.004 },
      recentCloses: [1.131, 1.132, 1.134, 1.135, 1.136, 1.1364],
    });
    return NextResponse.json({ ok: true, configured: aiConfigured(), verdict });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, configured: aiConfigured(), error: err.message },
      { status: 200 }
    );
  }
}
