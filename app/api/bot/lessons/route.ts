import { NextResponse } from "next/server";
import { getTrades, loadConfig, getJournal } from "@/lib/db";
import { recorta } from "@/lib/store";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

/**
 * Memoria del Gestor: resumen de su histórico de trades cerrados por activo
 * (W/L, P&L) + los más recientes con su tesis. Para que aprenda de su propio
 * track record. ?desk=forex|crypto|stocks|commodities filtra por mesa.
 */
// Un cierre a CERO es un empate, no un acierto. Cuenta aparte, y el porcentaje
// se mide sobre las que se decidieron — igual que en /api/bot/expectancy y en
// analyze(). Antes esta ruta inflaba el acierto del Gestor con sus propios
// breakevens, y es el resumen que los Gestores leen para juzgarse.
const EPS_PNL = 0.005;
/** Bajo esta muestra, un porcentaje no es una tasa. Igual que en la interfaz. */
const MUESTRA_MIN = 5;
const gano = (p?: number) => (p || 0) > EPS_PNL;
const perdio = (p?: number) => (p || 0) < -EPS_PNL;

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

    const by = new Map<string, { epic: string; trades: number; wins: number; losses: number; netPnl: number }>();
    for (const t of trades) {
      const o = by.get(t.epic) || { epic: t.epic, trades: 0, wins: 0, losses: 0, netPnl: 0 };
      o.trades++;
      if (gano(t.pnl)) o.wins++;
      else if (perdio(t.pnl)) o.losses++;
      o.netPnl += t.pnl || 0;
      by.set(t.epic, o);
    }
    const byEpic = [...by.values()]
      .map((o) => ({
        epic: o.epic,
        trades: o.trades,
        winRate: o.wins + o.losses ? Math.round((o.wins / (o.wins + o.losses)) * 100) : 0,
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
        reason: recorta(t.reason || "", 90),
      }));

    const netTotal = Math.round(trades.reduce((s, t) => s + (t.pnl || 0), 0) * 100) / 100;

    // ---- Lessons 2.0: el Gestor aprende de SUS propias decisiones ----
    // Trades originados por el Gestor llevan reason "IA: ..." (executePmDecision);
    // el resto son del motor técnico. Contrastar ambos = feedback de calidad de criterio.
    const isAI = (t: { reason?: string }) => (t.reason || "").startsWith("IA:");
    const stat = (arr: typeof trades) => {
      const g = arr.filter((t) => gano(t.pnl));
      const p = arr.filter((t) => perdio(t.pnl));
      const net = Math.round(arr.reduce((s, t) => s + (t.pnl || 0), 0) * 100) / 100;
      // payoff = euros ganados por cada euro perdido; con él, el % de acierto
      // mínimo para no perder dinero. Un 41% es excelente con payoff 2 y ruina
      // con payoff 0,5: el acierto suelto no significa nada sin su umbral.
      const avgWin = g.length ? g.reduce((s, t) => s + (t.pnl || 0), 0) / g.length : 0;
      const avgLoss = p.length ? Math.abs(p.reduce((s, t) => s + (t.pnl || 0), 0)) / p.length : 0;
      const payoff = avgLoss > 0 ? avgWin / avgLoss : 0;
      return {
        trades: arr.length,
        wins: g.length,
        losses: p.length,
        winRate: g.length + p.length ? Math.round((g.length / (g.length + p.length)) * 100) : 0,
        netPnl: net,
        payoff: Math.round(payoff * 100) / 100,
        breakevenWinRate: payoff > 0 ? Math.round(100 / (1 + payoff)) : 0,
      };
    };
    const aiTrades = trades.filter(isAI);
    const gestor = stat(aiTrades);
    const tecnico = stat(trades.filter((t) => !isAI(t)));
    const failedTheses = [...aiTrades]
      .filter((t) => (t.pnl || 0) < 0)
      .sort((a, b) => (b.closedTs || b.ts || 0) - (a.closedTs || a.ts || 0))
      .slice(0, 5)
      .map((t) => ({
        epic: t.epic,
        direction: t.direction,
        pnl: t.pnl,
        thesis: recorta((t.reason || "").replace(/^IA:\s*/, ""), 120),
      }));

    // Resultado de sus decisiones recientes en el diario (qué se ejecutó, qué vetó el comité)
    let decisiones: Record<string, number> = {};
    try {
      const entries = (await getJournal(120)).filter((e: any) => !desk || e.desk === desk);
      for (const e of entries.slice(0, 30)) {
        for (const a of e.actions || []) {
          const key = a.outcome || (a.action === "HOLD" ? "held" : "sin_outcome");
          decisiones[key] = (decisiones[key] || 0) + 1;
        }
      }
    } catch {
      /* journal opcional */
    }

    const peor = failedTheses[0];
    /**
     * Este texto es LO QUE LEE el Gestor; los objetos de arriba son para la
     * interfaz. Y omitía justo lo que hace interpretable el resto:
     *
     *  · El umbral de equilibrio. El Gestor leía "41% de acierto" sin saber
     *    que con su payoff necesita un 48% — o sea, sin poder deducir que está
     *    por debajo del punto en que se empieza a ganar dinero. La cifra se
     *    calculaba desde la pasada 65 y se quedaba sin usar.
     *  · El tamaño de muestra. "Motor técnico: 4 cerrados, 0% acierto" invita a
     *    concluir que el motor técnico es un desastre; con cuatro operaciones
     *    eso no es una conclusión, es ruido.
     *  · Los errores. El recuento incluye `error`, pero la frase solo hablaba
     *    de abiertas, vetadas y omitidas: dos acciones fallidas no llegaban.
     */
    const juicio = (l: { trades: number; winRate: number; breakevenWinRate: number }) => {
      if (l.trades < MUESTRA_MIN) return `muestra corta (${l.trades}), sin conclusión`;
      if (!l.breakevenWinRate) return `${l.winRate}% acierto`;
      const dif = l.winRate - l.breakevenWinRate;
      return `${l.winRate}% acierto frente a un equilibrio de ${l.breakevenWinRate}% (${
        dif >= 0 ? `+${dif.toFixed(0)}` : dif.toFixed(0)
      } pts)`;
    };
    const summary =
      `Tus trades (Gestor IA): ${gestor.trades} cerrados, ${juicio(gestor)}, net ${gestor.netPnl}. ` +
      `Motor técnico: ${tecnico.trades} cerrados, ${juicio(tecnico)}, net ${tecnico.netPnl}. ` +
      (peor ? `Tu última tesis perdedora: ${peor.epic} ${peor.direction} (${peor.pnl}) "${peor.thesis}". ` : "") +
      `Decisiones recientes: ${decisiones.opened || 0} abiertas, ${decisiones.vetoed || 0} vetadas por el comité, ` +
      `${decisiones.skipped || 0} omitidas por límites` +
      (decisiones.error ? `, ${decisiones.error} con error de ejecución` : "") +
      `. ` +
      `Aprende: no repitas tesis que ya perdieron; si tu acierto está por debajo del equilibrio, el problema no es el número de aciertos sino la relación entre lo que ganas y lo que pierdes.`;

    return NextResponse.json({
      desk: desk || "all",
      closed: trades.length,
      netTotal,
      byEpic,
      recent,
      gestor,
      tecnico,
      failedTheses,
      decisiones,
      summary,
    });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "lessons failed" },
      { status: 500 }
    );
  }
}
