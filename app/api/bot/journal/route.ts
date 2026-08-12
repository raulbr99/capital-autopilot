import { NextResponse } from "next/server";
import { getJournal } from "@/lib/db";

export const dynamic = "force-dynamic";

// Diario del Gestor de Cartera IA (tesis + acciones por ciclo).
export async function GET(req: Request) {
  const desk = (new URL(req.url).searchParams.get("desk") || "").toLowerCase();
  return NextResponse.json({ entries: await getJournal(60, desk || undefined) });
}
