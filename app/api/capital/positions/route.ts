import { NextResponse } from "next/server";
import { getPositions, closePosition } from "@/lib/capital";
import { bot, log } from "@/lib/store";
import { appendLog } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ positions: await getPositions() });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// Cerrar posición manualmente: ?dealId=...  (el P&L lo reconcilia el motor en el siguiente tick)
export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const dealId = searchParams.get("dealId");
  if (!dealId) {
    return NextResponse.json({ error: "Falta dealId" }, { status: 400 });
  }
  try {
    const r = await closePosition(dealId);
    log("trade", `CERRADA manualmente posición ${dealId}`);
    void appendLog(bot().logs[0]);
    return NextResponse.json(r);
  } catch (err: any) {
    log("error", `No se pudo cerrar ${dealId}: ${err.message}`);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
