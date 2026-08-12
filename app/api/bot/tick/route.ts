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

/**
 * Recorta lo que no necesita quien solo mira precios y posiciones.
 * La respuesta completa pesa ~34 kB y el navegador la pide cada 6 s: el 60% son
 * el histórico de equity (240 puntos), 50 líneas de log y los sparklines — datos
 * que cambian despacio o que esa vista ni usa. La cabecera, por ejemplo, pedía
 * los 34 kB cada 30 s solo para pintar el equity.
 *
 *   ?slim=1   sin logs, sin curva de equity, sin trades   (mesas)
 *   ?slim=2   además sin sparklines ni evaluaciones       (cabecera)
 */
function adelgazar(r: any, nivel: number) {
  if (!nivel) return r;
  const out = {
    ...r,
    state: { ...r.state, logs: [], equity: [], trades: [] },
  };
  if (nivel >= 2) {
    out.evals = [];
    out.state = { ...out.state, config: undefined };
  }
  return out;
}

export async function GET(req: Request) {
  try {
    const slim = Number(new URL(req.url).searchParams.get("slim") || 0);
    return NextResponse.json(adelgazar(await runEngine(false), slim));
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
