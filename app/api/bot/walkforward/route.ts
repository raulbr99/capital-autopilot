import { NextResponse } from "next/server";
import { getPrices, capitalConfigured } from "@/lib/capital";
import { loadConfig } from "@/lib/db";
import { walkForward } from "@/lib/walkforward";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Validación walk-forward de un activo.
 *   ?epic=BTCUSD        (obligatorio: 1 activo por llamada para no agotar el timeout)
 *   ?resolution=HOUR    resolución de velas (def. HOUR)
 *   ?max=600            nº de velas (def. 600, máx 1000)
 *   ?isBars=250&oosBars=80   tamaños de ventana
 */
export async function GET(req: Request) {
  if (!capitalConfigured()) {
    return NextResponse.json({ configured: false });
  }
  const { searchParams } = new URL(req.url);
  const epic = (searchParams.get("epic") || "").toUpperCase();
  if (!epic) {
    return NextResponse.json({ error: "Falta ?epic=" }, { status: 400 });
  }
  const resolution = searchParams.get("resolution") || "HOUR";
  const max = Math.min(1000, Number(searchParams.get("max") || 600));
  const isBars = Number(searchParams.get("isBars") || 250);
  const oosBars = Number(searchParams.get("oosBars") || 80);

  try {
    const cfg = await loadConfig();
    // A/B del filtro de régimen: ?regime=on|off sobreescribe la config
    const regime = searchParams.get("regime");
    const strategy = { ...cfg.strategy };
    if (regime === "on") strategy.useRegimeFilter = true;
    if (regime === "off") strategy.useRegimeFilter = false;
    const adxTh = searchParams.get("adxThreshold");
    if (adxTh) strategy.adxThreshold = Number(adxTh);

    const candles = await getPrices(epic, resolution, max);
    if (candles.length < isBars + oosBars) {
      return NextResponse.json({
        configured: true,
        epic,
        error: `Histórico insuficiente (${candles.length} velas, hacen falta ≥ ${isBars + oosBars}).`,
      });
    }
    const result = walkForward(epic, candles, strategy, cfg.risk, cfg.sizePerTrade, {
      isBars,
      oosBars,
    });
    return NextResponse.json({ configured: true, resolution, ...result });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
