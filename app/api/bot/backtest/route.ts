import { NextResponse } from "next/server";
import { getPrices, capitalConfigured } from "@/lib/capital";
import { loadConfig } from "@/lib/db";
import { backtest } from "@/lib/backtest";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Backtest sobre histórico. Por defecto corre toda la watchlist.
 *   ?epic=BTCUSD       limita a un activo
 *   ?resolution=HOUR   resolucion de velas (def. MINUTE)
 *   ?max=400           nº de velas
 */
export async function GET(req: Request) {
  if (!capitalConfigured()) {
    return NextResponse.json({ configured: false });
  }
  const { searchParams } = new URL(req.url);
  const cfg = await loadConfig();
  /**
   * "motor" = cada activo en SU resolución, la que el bot usa para decidir.
   *
   * Antes esta ruta corría los 20 activos con UNA sola resolución para todos.
   * Con el universo actual —13 en diario y 7 en cuatro horas— eso significa que
   * al menos siete resultados de cada ejecución medían una estrategia que no
   * existe. El mismo fallo que el walk-forward, y aquí afectaba de golpe a todo
   * el listado, incluido el agregado de la cabecera.
   */
  const resolution = searchParams.get("resolution") || "motor";
  const max = Math.min(1000, Number(searchParams.get("max") || 400));
  const epicParam = searchParams.get("epic");
  const epics = epicParam ? [epicParam.toUpperCase()] : cfg.watchlist;

  try {
    const porEpic = new Map(cfg.instruments.map((i) => [i.epic, i.resolution]));
    const resDe = (epic: string) =>
      resolution === "motor" ? porEpic.get(epic) || "HOUR_4" : resolution;
    const results = [];
    for (const epic of epics) {
      const candles = await getPrices(epic, resDe(epic), max);
      results.push({
        ...backtest(epic, candles, cfg.strategy, cfg.risk, cfg.sizePerTrade),
        /** Con qué marco se midió: sin esto la fila no se puede interpretar. */
        resolution: resDe(epic),
      });
    }
    const agg = {
      trades: results.reduce((s, r) => s + r.trades, 0),
      netPnl: results.reduce((s, r) => s + r.netPnl, 0),
      wins: results.reduce((s, r) => s + r.wins, 0),
      spreadCost: results.reduce((s, r) => s + (r.spreadCost || 0), 0),
    };
    return NextResponse.json({
      configured: true,
      resolution,
      max,
      // Con qué se calculó. La pestaña de Configuración puede cambiar estos
      // valores en cualquier momento, así que un resultado sin ellos no se
      // puede interpretar ni distinguir de uno viejo.
      strategy: {
        fast: cfg.strategy.fast,
        slow: cfg.strategy.slow,
        rsiPeriod: cfg.strategy.rsiPeriod,
        minConfidence: cfg.strategy.minConfidence,
        adxThreshold: cfg.strategy.adxThreshold,
        useRegimeFilter: cfg.strategy.useRegimeFilter,
      },
      results,
      aggregate: {
        ...agg,
        winRate: agg.trades ? (agg.wins / agg.trades) * 100 : 0,
        // % medio de retorno por activo (cada uno arriesga el mismo nocional)
        returnPct: results.length
          ? results.reduce((s, r) => s + r.returnPct, 0) / results.length
          : 0,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
