import { NextResponse } from "next/server";
import { getJournal } from "@/lib/db";

export const dynamic = "force-dynamic";

// Diario del Gestor de Cartera IA (tesis + acciones por ciclo).
export async function GET() {
  return NextResponse.json({ entries: await getJournal(60) });
}
