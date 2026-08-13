import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { analyze } from "@/lib/analytics";
import type { TradeRecord } from "@/components/types";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

function tradeFromRow(r: any): TradeRecord {
  return {
    id: r.id,
    ts: new Date(r.ts).getTime(),
    closedTs: r.closed_ts ? new Date(r.closed_ts).getTime() : undefined,
    epic: r.epic,
    direction: r.direction,
    size: r.size,
    entry: r.entry,
    exit: r.exit ?? undefined,
    pnl: r.pnl ?? undefined,
    status: r.status,
    dryRun: r.dry_run,
    reason: r.reason,
  };
}

/**
 * GET -> historial de trades + analítica (lectura directa de Supabase).
 *
 * `?slim=1` devuelve solo los trades. El bloque `analytics` pesa 4,2 kB, se
 * calcula en el servidor recorriendo hasta 300 operaciones —rachas, drawdown,
 * agregado por activo, curva de P&L y cubos diarios— y NINGUNA pantalla lo lee:
 * comprobado con un grep de `.analytics` en components/ y app/. Analítica
 * recalcula exactamente lo mismo en el navegador desde el array de trades que
 * viene al lado, y el panel solo usa los trades.
 *
 * Con Analítica sondeando cada 20 s y el panel cada 60, son 12,6 y 4,2 kB por
 * minuto de payload que se descarta al llegar, más el cálculo repetido en cada
 * petición.
 *
 * La respuesta por defecto NO cambia: las routines del Gestor consultan estas
 * rutas desde fuera del repo y no puedo comprobar qué campos leen. Quitar el
 * bloque a todo el mundo sería romper a ciegas algo que no veo; que lo pidan
 * las dos pantallas que sí controlo es gratis y no le quita nada a nadie.
 */
export async function GET(req: Request) {
  const slim = new URL(req.url).searchParams.get("slim") === "1";
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  let trades: TradeRecord[] = [];
  if (url && key) {
    try {
      const c = createClient(url, key, {
        auth: { persistSession: false },
        global: { fetch: (i: any, init: any) => fetch(i, { ...init, cache: "no-store" }) },
      });
      const { data } = await c
        .from("ap_trades")
        .select("*", { count: "exact" })
        .order("ts", { ascending: false })
        .limit(300);
      trades = (data ?? []).map(tradeFromRow);
    } catch {
      /* noop */
    }
  }
  return NextResponse.json(slim ? { trades } : { trades, analytics: analyze(trades) });
}
