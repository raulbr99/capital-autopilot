import { NextResponse } from "next/server";
import { fundingRates } from "@/lib/funding";
import { FUNDING_ALTO, FUNDING_NEUTRO } from "@/lib/model";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
// Binance bloquea IPs de EE.UU. (HTTP 451) y la región por defecto de Vercel es
// iad1 (Washington DC) — esta route DEBE correr en una región no-US.
export const preferredRegion = "fra1";

/** Funding rates de Binance para la mesa cripto (BTC/ETH). */
export async function GET() {
  try {
    const funding = await fundingRates();
    return NextResponse.json({
      fetchedAt: new Date().toISOString(),
      guide:
        `funding >0: longs pagan (mercado cargado de longs); >=${FUNDING_ALTO}%/8h sobrecalentado (riesgo long squeeze); <0: shorts pagan (combustible de squeeze alcista); por debajo de ±${FUNDING_NEUTRO}%/8h se considera neutral`,
      funding,
    });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "funding failed" },
      { status: 500 }
    );
  }
}
