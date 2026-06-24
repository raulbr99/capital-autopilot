import { NextResponse } from "next/server";
import { getEconomicEvents, relevantEvents } from "@/lib/calendar";

export const dynamic = "force-dynamic";

/**
 * Calendario económico.
 *   ?epic=EURUSD   -> eventos de alto impacto relevantes para ese activo (ventana)
 *   (sin epic)     -> próximos eventos de alto impacto de la semana
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const epic = searchParams.get("epic");
  try {
    if (epic) {
      return NextResponse.json({ epic, events: await relevantEvents(epic) });
    }
    const now = Date.now();
    const upcoming = (await getEconomicEvents())
      .filter((e) => e.impact === "High" && e.time >= now - 3600_000)
      .map((e) => ({ ...e, minutesUntil: Math.round((e.time - now) / 60000) }))
      .sort((a, b) => a.time - b.time)
      .slice(0, 25);
    return NextResponse.json({ upcoming });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
