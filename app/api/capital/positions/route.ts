import { NextResponse } from "next/server";
import { getPositions, closePosition } from "@/lib/capital";
import { bot, log } from "@/lib/store";
import { updateTrade, appendLog } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ positions: await getPositions() });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * Cerrar posicion manualmente.
 *   ?dealId=...   cierra posicion REAL en Capital.com
 *   ?paperId=...  cierra un PAPER trade abierto (al precio de entrada, neutro)
 */
export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const dealId = searchParams.get("dealId");
  const paperId = searchParams.get("paperId");

  if (paperId) {
    const t = bot().trades.find((x) => x.id === paperId && x.status === "open");
    if (!t) return NextResponse.json({ error: "Paper trade no encontrado" }, { status: 404 });
    t.status = "closed";
    t.exit = t.entry;
    t.pnl = 0;
    t.closedTs = Date.now();
    bot().stats.tradesClosed++;
    await updateTrade(t.id, { status: "closed", exit: t.entry, pnl: 0, closedTs: t.closedTs });
    log("trade", `📝 PAPER cerrado manualmente ${t.epic}`, t.epic);
    void appendLog(bot().logs[0]);
    return NextResponse.json({ ok: true });
  }

  if (!dealId) {
    return NextResponse.json({ error: "Falta dealId o paperId" }, { status: 400 });
  }
  try {
    const r = await closePosition(dealId);
    bot().stats.tradesClosed++;
    log("trade", `CERRADA manualmente posición ${dealId}`);
    void appendLog(bot().logs[0]);
    return NextResponse.json(r);
  } catch (err: any) {
    log("error", `No se pudo cerrar ${dealId}: ${err.message}`);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
