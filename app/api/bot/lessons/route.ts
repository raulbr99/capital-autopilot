import { NextResponse } from "next/server";
import { getTrades, loadConfig } from "@/lib/db";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

/**
 * Memoria del Gestor: resumen de su histórico de trades cerrados por activo
 * (W/L, P&L) + los más recientes con su tesis. Para que aprenda de su propio
 * track record. ?desk=forex|crypto|stocks|commodities filtra por mesa.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const desk = (searchParams.get("desk") || "").toLowerCase();
  try {
    const cfg = await loadConfig();
    const epicDesk = new Map(cfg.instruments.map((i) => [i.epic, i.category || ""]));
    let trades = (await getTrades(300)).filter(
      (t) => t.status === "closed" && typeof t.pnl === "number"
    );
    if (desk) trades = trades.filter((t) => epicDesk.get(t.epic) === desk);

    const by = new Map<string, { epic: string; trades: number; wins: number; netPnl: number }>();
    for (const t of trades) {
      const o = by.get(t.epic) || { epic: t.epic, trades: 0, wins: 0, netPnl: 0 };
      o.trades++;
      if ((t.pnl || 0) >= 0) o.wins++;
      o.netPnl += t.pnl || 0;
      by.set(t.epic, o);
    }
    const byEpic = [...by.values()]
      .map((o) => ({
        epic: o.epic,
        trades: o.trades,
        winRate: o.trades ? Math.round((o.wins / o.trades) * 100) : 0,
        netPnl: Math.round(o.netPnl * 100) / 100,
      }))
      .sort((a, b) => a.netPnl - b.netPnl);

    const recent = [...trades]
      .sort((a, b) => (b.closedTs || b.ts || 0) - (a.closedTs || a.ts || 0))
      .slice(0, 12)
      .map((t) => ({
        epic: t.epic,
        direction: t.direction,
        pnl: t.pnl,
        reason: (t.reason || "").slice(0, 90),
      }));

    const netTotal = Math.round(trades.reduce((s, t) => s + (t.pnl || 0), 0) * 100) / 100;
    return NextResponse.json({ desk: desk || "all", closed: trades.length, netTotal, byEpic, recent });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "lessons failed" },
      { status: 500 }
    );
  }
}
