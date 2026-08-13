import { NextResponse } from "next/server";
import { cot, type CotData } from "@/lib/cot";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const maxDuration = 30;

const FOREX = ["EUR", "GBP", "JPY", "CHF", "NZD", "USD"];
const COMMODITIES = ["GOLD", "SILVER", "OIL_CRUDE", "NATURALGAS", "COPPER"];

// El COT es semanal → caché larga en memoria (best-effort en serverless).
let cache: { t: number; data: unknown } | null = null;
const TTL = 6 * 60 * 60 * 1000; // 6 h

export async function GET() {
  if (cache && Date.now() - cache.t < TTL) {
    return NextResponse.json({ ...(cache.data as object), cached: true });
  }
  try {
    const symbols = [...FOREX, ...COMMODITIES];
    const results = await Promise.all(
      symbols.map((s) => cot(s).catch(() => null))
    );
    const map: Record<string, CotData> = {};
    results.forEach((r) => {
      if (r) map[r.symbol] = r;
    });
    const reportDate = Object.values(map)[0]?.reportDate ?? null;
    const antiguedadDias = reportDate
      ? Math.floor((Date.now() - new Date(reportDate).getTime()) / 86_400_000)
      : null;
    const data = {
      fetchedAt: new Date().toISOString(),
      reportDate,
      /**
       * Cómo leer esto, para el consumidor que no es humano.
       *
       * El panel avisa por escrito de que el COT es semanal, que refleja las
       * posiciones del martes anterior y que es contexto de fondo y NUNCA una
       * señal de entrada. Los Gestores leen este JSON y no veían nada de eso:
       * un `net: -58091` sin fecha interpretable se lee como posicionamiento de
       * hoy. La ruta de funding ya trae su propia `guide`; estas dos no.
       */
      guide:
        `Informe semanal de la CFTC: refleja posiciones del martes anterior` +
        (antiguedadDias != null ? ` (hace ${antiguedadDias} días)` : "") +
        `, no de hoy. Es CONTEXTO DE FONDO, nunca una señal de entrada. ` +
        `net = contratos netos de especuladores no comerciales; net>0 sesgo alcista, net<0 bajista. ` +
        `change = flujo respecto a la semana previa. pctLong >=80 o <=20 marca posicionamiento extremo: ` +
        `el mercado ya está todo del mismo lado y eso suele avisar de agotamiento, no confirmar la tendencia.`,
      antiguedadDias,
      forex: FOREX.map((s) => map[s]).filter(Boolean),
      commodities: COMMODITIES.map((s) => map[s]).filter(Boolean),
    };
    cache = { t: Date.now(), data };
    return NextResponse.json(data);
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "cot failed" },
      { status: 500 }
    );
  }
}
