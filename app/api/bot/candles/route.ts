import { NextResponse } from "next/server";
import { getPrices } from "@/lib/capital";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const ALLOWED = new Set(["MINUTE_5", "MINUTE_15", "MINUTE_30", "HOUR", "HOUR_4", "DAY", "WEEK"]);

/** Velas OHLC de un activo para el gráfico de una posición. ?epic=&resolution=&max= */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const epic = searchParams.get("epic");
  const resolution = searchParams.get("resolution") || "HOUR_4";
  const max = Math.min(Math.max(Number(searchParams.get("max")) || 90, 20), 200);
  if (!epic) return NextResponse.json({ error: "epic requerido" }, { status: 400 });
  if (!ALLOWED.has(resolution)) return NextResponse.json({ error: "resolución no válida" }, { status: 400 });
  try {
    const candles = await getPrices(epic, resolution, max);
    return NextResponse.json({ epic, resolution, candles });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "candles failed" },
      { status: 500 }
    );
  }
}
