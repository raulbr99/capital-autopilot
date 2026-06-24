import { NextResponse } from "next/server";
import { runEngine } from "@/lib/engine";
import { bot, log } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * Tick desde el navegador.
 *  POST = activo: opera si el toggle de la UI esta ON (bot.enabled).
 *  GET  = solo lectura: evalua senales pero no abre operaciones.
 */
export async function POST() {
  try {
    return NextResponse.json(await runEngine(bot().config.enabled));
  } catch (err: any) {
    log("error", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function GET() {
  try {
    return NextResponse.json(await runEngine(false));
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
