import { NextResponse } from "next/server";
import { getJournal } from "@/lib/db";

export const dynamic = "force-dynamic";

// Diario del Gestor de Cartera IA (tesis + acciones por ciclo).
export async function GET(req: Request) {
  const desk = (new URL(req.url).searchParams.get("desk") || "").toLowerCase();
  /**
   * El límite va DESPUÉS del filtro, así que pedir 60 con ?desk= devuelve 60
   * entradas de esa mesa — más de las que llegaban sin filtrar (18 de forex
   * dentro de las 60 globales) y más de las que el carril pinta. Filtrar sin
   * bajar el tope hacía la respuesta MÁS grande, no más pequeña.
   */
  return NextResponse.json({
    entries: await getJournal(desk ? 20 : 60, desk || undefined),
  });
}
