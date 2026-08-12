import { NextResponse } from "next/server";
import { getAccount, getPositions, capitalConfigured } from "@/lib/capital";
import { bot } from "@/lib/store";
import { loadConfig, getTrades } from "@/lib/db";
import { analyze } from "@/lib/analytics";

/** Dos decimales por defecto: el informe lo lee un modelo, no una calculadora. */
const redondear = (n: number, d = 2) =>
  Number.isFinite(n) ? Math.round(n * 10 ** d) / 10 ** d : n;

export const dynamic = "force-dynamic";

/**
 * Informe de seguimiento en JSON. Lo consume la rutina Claude diaria.
 */
export async function GET() {
  if (!capitalConfigured()) return NextResponse.json({ configured: false });
  const cfg = await loadConfig();
  try {
    const [account, positions, trades] = await Promise.all([
      getAccount(),
      getPositions(),
      getTrades(300),
    ]);
    const analytics = analyze(trades);
    const floatPnl = positions.reduce((s, p) => s + (p.upl || 0), 0);
    return NextResponse.json({
      configured: true,
      generatedAt: new Date().toISOString(),
      mode: "live",
      armed: process.env.AUTOPILOT_ARMED === "true",
      killedToday: bot().killedDate === new Date().toISOString().slice(0, 10),
      account: {
        balance: account.balance,
        available: account.available,
        pnl: account.pnl,
        // OJO: Capital ya define balance = deposit + profitLoss, así que el
        // flotante YA está dentro. Sumarlo otra vez era doble conteo (se
        // corrigió en el motor en junio y esta ruta se quedó atrás).
        equity: account.balance,
        currency: account.currency,
      },
      floatingPnl: floatPnl,
      openPositions: positions.map((p) => ({
        epic: p.epic,
        direction: p.direction,
        size: p.size,
        level: p.level,
        upl: p.upl,
      })),
      /**
       * Lo que lee el analista diario.
       *
       * Este bloque escogía los campos a mano, así que las cuatro métricas que
       * se añadieron a analyze() en la pasada 93 —payoff, umbral de equilibrio,
       * reparto largos/cortos y si hay muestra suficiente— nunca llegaron aquí.
       * Justo las que dan sentido al resto: un 36 % de acierto no significa
       * nada sin saber que el equilibrio está en el 45 %, y el problema de este
       * bot son los cortos (25 % frente al 46 % de los largos), cosa invisible
       * sin el desglose. El analista llevaba desde entonces juzgando el
       * rendimiento con la mitad de los datos.
       *
       * Los números van redondeados: antes salían dobles en crudo
       * ("profitFactor": 0.6843305843130374), que no aportan precisión y sí
       * ruido a un texto que lee un modelo.
       */
      performance: {
        closed: analytics.closed,
        winRate: analytics.winRate,
        netPnl: redondear(analytics.netPnl),
        profitFactor: redondear(analytics.profitFactor),
        maxDrawdown: redondear(analytics.maxDrawdown),
        expectancy: redondear(analytics.expectancy),
        payoff: redondear(analytics.payoff),
        breakevenWinRate: redondear(analytics.breakevenWinRate, 1),
        /** Con menos de 30 cerradas, todo lo de arriba es ruido estadístico. */
        muestraSuficiente: analytics.enough,
        byDirection: analytics.byDirection.map((d) => ({
          ...d,
          winRate: redondear(d.winRate, 1),
          pnl: redondear(d.pnl),
        })),
        byEpic: analytics.byEpic.map((e) => ({ ...e, winRate: redondear(e.winRate, 1) })),
      },
      config: {
        watchlist: cfg.watchlist,
        risk: cfg.risk,
      },
      recentEvents: bot().logs.slice(0, 25).map((l) => ({
        ts: new Date(l.ts).toISOString(),
        level: l.level,
        message: l.message,
      })),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
