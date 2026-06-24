import { NextResponse } from "next/server";
import { runEngine, autopilotArmed } from "@/lib/engine";
import { log } from "@/lib/store";

export const dynamic = "force-dynamic";
// Margen amplio: el motor consulta varios endpoints de Capital.com por tick.
export const maxDuration = 60;

/**
 * Endpoint que dispara Vercel Cron cada 15 min (ver vercel.json).
 *
 * Seguridad: si existe CRON_SECRET, exigimos la cabecera
 *   Authorization: Bearer <CRON_SECRET>
 * Vercel la envia automaticamente en sus cron jobs cuando defines CRON_SECRET.
 *
 * Opera de verdad solo si AUTOPILOT_ARMED === "true" (interruptor durable, no
 * depende del estado en memoria que se reinicia entre invocaciones serverless).
 */
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // sin secreto definido -> abierto (solo recomendable en local)
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

async function handle(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const armed = autopilotArmed();
  try {
    const result = await runEngine(armed);
    log(
      "info",
      `⏱ CRON tick — ${armed ? "ARMADO" : "DESARMADO"} · abiertas en este tick: ${result.opened}`
    );
    return NextResponse.json({
      ok: true,
      armed,
      opened: result.opened,
      openPositions: result.openPositions.length,
      equity: result.account
        ? result.account.balance + (result.account.pnl || 0)
        : null,
      ts: Date.now(),
    });
  } catch (err: any) {
    log("error", `CRON fallo: ${err.message}`);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return handle(req);
}
export async function POST(req: Request) {
  return handle(req);
}
