import { NextResponse } from "next/server";
import { runEngine, autopilotArmed } from "@/lib/engine";
import { pruneTablas, saveRuntime } from "@/lib/db";
import { bot, log } from "@/lib/store";

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
/**
 * Sin CRON_SECRET esto quedaba ABIERTO. Y no es una ruta cualquiera: ejecuta el
 * motor con el interruptor durable, o sea que una petición sin credencial podía
 * disparar un ciclo de operativa real fuera de su cadencia, las veces que
 * quisiera quien conociera la URL. Además el middleware la exime a propósito
 * —la llama una máquina y no puede pasar por el formulario—, así que esta
 * comprobación es la ÚNICA que hay.
 *
 * Su hermana /api/bot/pm-queue ya falla cerrada: si no hay secreto, rechaza.
 * Esta hacía lo contrario. Ahora fuera de producción sigue abierta, para que el
 * desarrollo local no necesite secreto, y en producción exige credencial
 * siempre. Hoy la variable está definida, así que no cambia nada; lo que cambia
 * es qué pasa el día que falte.
 */
function authorized(req: Request): { ok: boolean; motivo?: string } {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return process.env.VERCEL_ENV === "production"
      ? { ok: false, motivo: "CRON_SECRET no está definida en producción" }
      : { ok: true };
  }
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${secret}` ? { ok: true } : { ok: false };
}

async function handle(req: Request) {
  const permiso = authorized(req);
  if (!permiso.ok) {
    // El motivo se distingue: si el motor deja de latir por una variable que
    // falta, el latido del panel se pone rojo sin explicar por qué. Aquí sí.
    if (permiso.motivo) log("error", `⛔ Cron rechazado: ${permiso.motivo}`);
    return NextResponse.json({ error: permiso.motivo || "No autorizado" }, { status: 401 });
  }

  const armed = autopilotArmed();
  try {
    const result = await runEngine(armed);
    // Sello de latido. Va DESPUÉS de runEngine porque este llama a loadRuntime()
    // y sobreescribiría el valor en memoria con el de la fila anterior.
    bot().lastCronTick = Date.now();
    await saveRuntime();
    log(
      "info",
      `⏱ CRON tick — ${armed ? "ARMADO" : "DESARMADO"} · abiertas en este tick: ${result.opened}`
    );
    // Mantenimiento barato: el cron es el único que corre a ritmo fijo
    const podadas = await pruneTablas();

    return NextResponse.json({
      ok: true,
      podadas,
      armed,
      opened: result.opened,
      openPositions: result.openPositions.length,
      // balance de Capital YA incluye el flotante: sumarlo sería doble conteo
      equity: result.account ? result.account.balance : null,
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
