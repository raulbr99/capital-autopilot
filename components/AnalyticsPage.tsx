"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { TradeRecord, DeskCategory } from "./types";
/**
 * UNA sola implementación de analyze(), la de lib/.
 *
 * Había un espejo en components/analytics-util.ts porque se dio por hecho que
 * el cliente no puede importar de lib/. No es cierto aquí: lib/analytics.ts
 * solo tiene un `import type`, que TypeScript borra al compilar, así que es una
 * función pura sin nada de servidor dentro. La frontera de Next importa cuando
 * un módulo arrastra código de servidor en tiempo de ejecución; este no.
 *
 * El coste de la copia fue real y medido: el win rate se calculaba de dos
 * formas distintas (pasada 54), payoff/breakevenWinRate/byDirection existían
 * solo en el cliente mientras el analista diario leía la versión del servidor
 * sin ellos (pasada 93), y las rachas contaban los empates como pérdidas en
 * ambas pero se corrigieron por separado (pasada 106). Tres divergencias en un
 * único fichero duplicado.
 */
import { analyze } from "@/lib/analytics";
import { TZ, MUESTRA_MIN, EPS_PNL } from "@/lib/model";
import { fmt, pf, pnlFmt, pnlClass, SectionHead, Skeleton, usePoll, deskMap, price, pl, AppFooter, AvisoSinConexion, pdec, uds, duracionMs } from "./ui";
import EquityChart from "./EquityChart";
import AppHeader from "./AppHeader";

/**
 * Mesa de activos RETIRADOS del universo. Solo sirve de respaldo: sus
 * operaciones siguen en el histórico y deben poder filtrarse. Los activos
 * vigentes salen de la configuración en vivo, para que añadir uno nuevo no
 * lo haga desaparecer del filtro por mesa sin que nadie se entere.
 */
const LEGACY_DESK: Record<string, DeskCategory> = {
  TSLA: "stocks", NFLX: "stocks", AMD: "stocks", MU: "stocks",
  AVGO: "stocks", QCOM: "stocks", SMCI: "stocks", ARM: "stocks",
  SNOW: "stocks", CRWD: "stocks", PLTR: "stocks", COIN: "stocks",
  MSTR: "stocks", HOOD: "stocks", SOFI: "stocks", GME: "stocks",
  BABA: "stocks", DIS: "stocks", BA: "stocks", UBER: "stocks",
  PYPL: "stocks", ORCL: "stocks", CRM: "stocks", ADBE: "stocks",
  WMT: "stocks", XOM: "stocks", PFE: "stocks",
};
const DESK_FILTERS = [
  { key: "", label: "Todas" },
  { key: "forex", label: "Forex" },
  { key: "crypto", label: "Crypto" },
  { key: "stocks", label: "Stocks" },
  { key: "commodities", label: "Commodities" },
];

export default function AnalyticsPage() {
  const [trades, setTrades] = useState<TradeRecord[]>([]);
  const [instruments, setInstruments] = useState<{ epic: string; category?: DeskCategory }[]>([]);
  const [equity, setEquity] = useState<number | null>(null);
  /**
   * La divisa de la cuenta. Esta pantalla la ignoraba y enseñaba importes
   * desnudos: "Ganas 4.33 de media y pierdes 3.56". El panel de expectativa
   * escribe esa MISMA frase con € — así que la app decía el mismo dato con y
   * sin unidad según dónde lo leyeras. Y un importe sin moneda en un panel de
   * trading es ambiguo de verdad: podrían ser euros, puntos o múltiplos de R.
   */
  const [divisa, setDivisa] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [epic, setEpic] = useState<string>("");
  const [desk, setDesk] = useState<string>("");
  /** Última lectura buena: el aviso de datos viejos la necesita para saberlo. */
  const [lastOk, setLastOk] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/bot/trades?slim=1");
      const d = await r.json();
      /**
       * Array.isArray y no `|| []`: el segundo solo cubre undefined. Si la API
       * devuelve el campo con OTRA forma —un objeto, una cadena, un fragmento
       * de respuesta cortada— el `|| []` lo deja pasar y el primer .filter()
       * revienta la página entera. Comprobado forzando {trades:{roto:true}}:
       * Analítica caía a la pantalla de "no se ha podido dibujar".
       * La frontera de error hace su trabajo, pero para un panel de vigilancia
       * es mucho mejor enseñar la pantalla vacía que perderla toda.
       */
      setTrades(Array.isArray(d.trades) ? d.trades : []);
      setLastOk(Date.now());
    } catch {
      /* */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // El universo manda: la clasificación por mesa se lee del config en vivo
    fetch("/api/bot/tick?slim=1")
      .then((r) => r.json())
      .then((d) => {
        setInstruments(d?.state?.config?.instruments ?? []);
        setEquity(typeof d?.account?.balance === "number" ? d.account.balance : null);
        setDivisa(d?.account?.currency ?? "");
      })
      .catch(() => {});
  }, []);

  usePoll(load, 20000);

  // Universo vivo por encima del legado: añadir un instrumento no debe hacerlo
  // desaparecer del filtro, y los retirados deben seguir filtrándose.
  const deskOf = useMemo(() => {
    const m = new Map<string, string>(Object.entries(LEGACY_DESK));
    for (const [epic, cat] of deskMap(instruments)) if (cat !== "otros") m.set(epic, cat);
    return (epic: string) => m.get(epic);
  }, [instruments]);

  /**
   * Activos que se pueden elegir CON LA MESA ACTUAL.
   *
   * El desplegable ofrecía los veinte del histórico entero pasara lo que
   * pasara, así que elegir la mesa Forex y luego AAPL —que es de Stocks— daba
   * cero resultados garantizados. Ese callejón está descrito en el comentario
   * del estado vacío de más abajo: se arregló el mensaje que salía al caer en
   * él, pero no que el desplegable siguiera ofreciendo el camino.
   *
   * Un filtro de broker acota lo que ofrece a lo que existe detrás.
   */
  const epics = useMemo(
    () =>
      Array.from(
        new Set(trades.filter((t) => !desk || deskOf(t.epic) === desk).map((t) => t.epic))
      ).sort(),
    [trades, desk, deskOf]
  );

  const filtered = useMemo(
    () => trades.filter((t) => (!epic || t.epic === epic) && (!desk || deskOf(t.epic) === desk)),
    [trades, epic, desk, deskOf]
  );

  const a = useMemo(() => analyze(filtered), [filtered]);

  /** ¿Hay histórico REAL, al margen de los filtros activos? */
  const cerradasTotales = useMemo(() => trades.filter((t) => t.status === "closed").length, [trades]);
  const hayHistorico = cerradasTotales > 0;

  /** Operaciones cerradas por mesa, para que el filtro diga qué hay detrás. */
  const cerradasPorMesa = useMemo(() => {
    const m: Record<string, number> = {};
    const cerradas = trades.filter((t) => t.status === "closed");
    m[""] = cerradas.length;
    for (const t of cerradas) {
      const d = deskOf(t.epic);
      if (d) m[d] = (m[d] || 0) + 1;
    }
    return m;
  }, [trades, deskOf]);
  const closedTrades = filtered
    .filter((t) => t.status === "closed")
    .sort((x, y) => (y.closedTs || y.ts) - (x.closedTs || x.ts));
  /**
   * Marcadores de operación bajo la curva. El gráfico los pinta VERDES o ROJOS
   * según su P&L —`(m.pnl ?? 0) >= 0 ? fill-long : fill-short`— y aquí se
   * construían a mano con `dir: "BUY"` y `pnl: 0` fijos para todos.
   *
   * O sea que la pantalla de Analítica dibujaba cada operación cerrada como una
   * ganadora. Con el histórico actual —34 cerradas: 10 ganadas, 16 perdidas, 8 a
   * cero— eran dieciséis pérdidas pintadas de verde, en la única pantalla cuyo
   * trabajo es juzgar el rendimiento.
   *
   * Los datos ya estaban aquí: closedTrades lleva el P&L y la dirección reales,
   * y respeta los filtros de mesa y activo igual que la curva. El panel
   * principal ya los construye así.
   */
  const markers = closedTrades
    .filter((t) => t.closedTs)
    .map((t) => ({ ts: t.closedTs!, dir: t.direction, pnl: t.pnl }));

  return (
    <div className="min-h-screen">
      <AppHeader active="/analytics" />

      <main className="mx-auto max-w-[1400px] px-5 py-6 md:px-8">
        <AvisoSinConexion lastOk={lastOk} cadaMs={20000} />
        {/* título + filtros */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight text-white">Analítica</h1>
            <p className="mt-1 text-sm text-dim">
              Rendimiento de {a.closed} {pl(a.closed, "operación cerrada", "operaciones cerradas")}{epic && ` · ${epic}`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap gap-1">
              {DESK_FILTERS.map((f) => (
                <button
                  key={f.key}
                  onClick={() => {
                    setDesk(f.key);
                    // Si el activo elegido no es de la mesa nueva, la
                    // combinación no tiene resultados posibles: se suelta.
                    if (epic && f.key && deskOf(epic) !== f.key) setEpic("");
                  }}
                  className={`rounded-md px-2.5 py-1.5 text-[12px] font-medium transition-colors ${
                    desk === f.key ? "bg-accent text-onaccent" : "border border-industrial text-muted hover:text-dim"
                  }`}
                >
                  {f.label}
                  {cerradasPorMesa[f.key] != null && (
                    <span className={`ml-1.5 tabular-nums ${desk === f.key ? "opacity-70" : "text-muted"}`}>
                      {cerradasPorMesa[f.key]}
                    </span>
                  )}
                </button>
              ))}
            </div>
            <select
              value={epic}
              onChange={(e) => setEpic(e.target.value)}
              aria-label="Filtrar por instrumento"
              className="rounded-lg border border-cement bg-base px-3 py-2 font-mono text-[12px] text-dim focus:border-accent"
            >
              <option value="">Todos los activos</option>
              {epics.map((e) => (
                <option key={e} value={e}>{e}</option>
              ))}
            </select>
          </div>
        </div>

        {loading ? (
          <div className="mt-6 space-y-4" aria-busy>
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-industrial bg-industrial md:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="bg-soft p-5">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="mt-2 h-7 w-24" />
                </div>
              ))}
            </div>
            <Skeleton className="h-64 rounded-xl" />
          </div>
        ) : a.closed === 0 ? (
          /*
            Había un solo estado vacío para dos situaciones muy distintas. Con
            33 operaciones en el histórico, elegir la mesa Forex y el activo
            AAPL —que es de Stocks— dejaba cero resultados y la página
            respondía "Sin operaciones cerradas todavía · Cuando el bot abra y
            cierre operaciones…": o sea, afirmaba que el bot nunca ha operado.
            Es falso y además deja al usuario sin la única acción que arregla lo
            que le pasa, que es quitar el filtro.
          */
          <div className="mt-6 rounded-xl border border-industrial bg-soft p-16 text-center">
            {hayHistorico ? (
              <>
                <p className="text-base font-medium text-dim">Ninguna operación cumple el filtro</p>
                <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
                  Hay {cerradasTotales} {pl(cerradasTotales, "operación cerrada", "operaciones cerradas")} en
                  el histórico, pero ninguna
                  {desk && <> en la mesa <span className="text-dim">{DESK_FILTERS.find((f) => f.key === desk)?.label}</span></>}
                  {desk && epic && " y"}
                  {epic && <> en <span className="text-dim">{epic}</span></>}.
                </p>
                <button
                  onClick={() => {
                    setDesk("");
                    setEpic("");
                  }}
                  className="mt-4 rounded-lg border border-cement px-3.5 py-2 text-[13px] font-medium text-dim transition-colors hover:border-accent hover:text-accent"
                >
                  Quitar filtros
                </button>
              </>
            ) : (
              <>
                <p className="text-base font-medium text-dim">Sin operaciones cerradas todavía</p>
                <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
                  Cuando el bot abra y cierre operaciones, aquí verás aciertos, profit factor, caída
                  máxima, desglose por activo y el historial completo.
                </p>
              </>
            )}
          </div>
        ) : (
          <>
            {/*
              Vocabulario unificado con el panel principal. Las mismas tres
              métricas se llamaban distinto en cada pantalla —"Win rate" aquí y
              "Aciertos" allí, "Expectancy" aquí y "Por operación" allí, "PnL
              neto" aquí y "Resultado neto" allí— y cuatro de las ocho etiquetas
              estaban en inglés en una aplicación que ya tradujo su jerga
              (FOLD → Ventana, DEGRADACIÓN IS→OOS → Retención) y barrió el
              snake_case. Que el mismo número cambie de nombre al cambiar de
              pantalla obliga a reconocerlo dos veces.
              "Profit factor" se queda: es idéntico en las dos y no tiene
              traducción asentada entre operadores.
              "Caída máxima" es el término que ya usa el backtest.
            */}
            {/* KPIs */}
            <section className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-industrial bg-industrial md:grid-cols-4">
              <Kpi
                label="Resultado neto"
                value={pnlFmt(a.netPnl)}
                unidad={divisa}
                sub={equity ? `${pnlFmt((a.netPnl / equity) * 100)}% del capital` : undefined}
                tone={Math.abs(a.netPnl) < EPS_PNL ? undefined : a.netPnl > 0 ? "long" : "short"}
                big
              />
              {/* El color lo decide el umbral, no el capricho: verde solo si
                  el acierto basta para ser rentable con ese payoff. */}
              <Kpi
                label="Aciertos"
                value={`${a.winRate.toFixed(0)}%`}
                sub={`equilibrio en ${a.breakevenWinRate.toFixed(0)}% · sin contar las de a cero`}
                tone={a.winRate >= a.breakevenWinRate ? "long" : "short"}
                big
              />
              <Kpi
                label="Profit factor"
                value={pf(a.profitFactor)}
                sub={a.profitFactor >= 1 ? "gana más de lo que pierde" : "pierde más de lo que gana"}
                tone={a.profitFactor >= 1 ? "long" : "short"}
                big
              />
              {/* Un drawdown en euros no dice nada sin saber sobre qué capital */}
              <Kpi
                label="Caída máxima"
                value={fmt(a.maxDrawdown)}
                unidad={divisa}
                sub={equity ? `${((a.maxDrawdown / equity) * 100).toFixed(1)}% del capital` : "peor racha acumulada"}
                tone="short"
                big
              />
              <Kpi
                label="Operaciones"
                value={String(a.closed)}
                sub={`${a.wins} ganadas · ${a.losses} perdidas${
                  a.closed - a.wins - a.losses > 0 ? ` · ${a.closed - a.wins - a.losses} a cero` : ""
                }`}
              />
              <Kpi label="Por operación" value={fmt(a.expectancy)} unidad={divisa} sub="media de las cerradas" />
              <Kpi label="Media ganancia" value={`+${fmt(a.avgWin)}`} unidad={divisa} sub={`−${fmt(a.avgLoss)} de media en las perdedoras`} />
              {/* Los signos eran decorativos: una racha se cuenta en operaciones, y
                  en este panel el + y el − significan dinero. "+2 / −5" se leía
                  como euros o como R. */}
              <Kpi
                label="Racha"
                value={`${a.bestStreak} / ${Math.abs(a.worstStreak)}`}
                sub="ganadoras / perdedoras seguidas"
              />
            </section>

            {/* Mecánica: un win rate suelto no dice nada sin su punto de equilibrio */}
            <section className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_400px]">
              <div className="rounded-xl border border-industrial bg-soft">
                <SectionHead label="Mecánica del sistema" />
                <div className="space-y-3 p-5">
                  <p className="text-sm leading-relaxed text-dim">
                    Ganas <span className="font-mono text-long">{fmt(a.avgWin)}{divisa && ` ${divisa}`}</span> de
                    media y pierdes{" "}
                    <span className="font-mono text-short">{fmt(a.avgLoss)}{divisa && ` ${divisa}`}</span>, así que
                    cada acierto vale{" "}
                    <span className="font-mono text-white">{a.payoff.toFixed(2)}</span> fallos.
                  </p>
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-industrial pt-3">
                    <div>
                      <p className="tag">Necesitas acertar</p>
                      <p className="mt-0.5 font-mono text-lg tabular-nums text-dim">
                        {a.breakevenWinRate.toFixed(0)}%
                      </p>
                    </div>
                    <div>
                      <p className="tag">Aciertas</p>
                      <p
                        className={`mt-0.5 font-mono text-lg tabular-nums ${
                          a.winRate >= a.breakevenWinRate ? "text-long" : "text-short"
                        }`}
                      >
                        {a.winRate.toFixed(0)}%
                      </p>
                    </div>
                    <span
                      className={`rounded-md px-2.5 py-1 text-[11px] font-medium ${
                        a.winRate >= a.breakevenWinRate
                          ? "bg-long/10 text-long"
                          : "bg-short/10 text-short"
                      }`}
                    >
                      {a.winRate >= a.breakevenWinRate
                        ? "✓ por encima del equilibrio"
                        : "✗ por debajo del equilibrio"}
                    </span>
                  </div>
                  {!a.enough && (
                    <p className="border-t border-industrial pt-3 text-xs leading-relaxed text-muted">
                      Con {a.closed} {pl(a.closed, "operación cerrada", "operaciones cerradas")} estos números son orientativos: hacen falta
                      unas 30 para que dejen de ser ruido estadístico.
                    </p>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-industrial bg-soft">
                <SectionHead label="Largos vs cortos" />
                <div className="p-5">
                  {a.byDirection.length === 0 ? (
                    <p className="text-sm text-muted">Sin operaciones cerradas.</p>
                  ) : (
                    <div className="space-y-3">
                      {/*
                        La barra medía el acierto pero se pintaba según la
                        DIRECCIÓN: largos en verde, cortos en rojo, pasara lo
                        que pasara. Como aquí el verde y el rojo son dinero, la
                        tarjeta parecía decir "los largos van bien y los cortos
                        mal" por el color, no por el dato — y habría seguido
                        diciéndolo con los papeles cambiados. La dirección ya la
                        da el nombre y su flecha.
                        Ahora el color sale de comparar cada acierto con SU
                        umbral de equilibrio, que además es la lectura que este
                        desglose necesita: con 45,1% de umbral, los largos
                        (46,2%) lo superan y los cortos (25%) no llegan ni de
                        lejos. Sin la marca, ese cruce era invisible.
                      */}
                      {a.byDirection.map((d) => {
                        const supera = a.breakevenWinRate > 0 && d.winRate >= a.breakevenWinRate;
                        return (
                          <div key={d.dir}>
                            <div className="flex items-baseline justify-between gap-2">
                              <span className="text-sm font-medium text-dim">
                                {d.dir === "BUY" ? "▲ Largos" : "▼ Cortos"}
                              </span>
                              <span className="font-mono text-[11px] tabular-nums text-muted">
                                {d.trades} {pl(d.trades, "op", "ops")} ·{" "}
                                <span className={supera ? "text-long" : "text-short"}>
                                  {d.winRate.toFixed(0)}%
                                </span>{" "}
                                acierto
                              </span>
                            </div>
                            <div className="relative mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-industrial">
                              <div
                                className={`h-full ${supera ? "bg-long" : "bg-short"}`}
                                style={{ width: `${Math.min(100, d.winRate)}%` }}
                              />
                              {a.breakevenWinRate > 0 && (
                                <span
                                  className="absolute top-0 h-full w-px bg-white/70"
                                  style={{ left: `${Math.min(100, a.breakevenWinRate)}%` }}
                                  title={`Equilibrio en ${a.breakevenWinRate.toFixed(0)}%`}
                                />
                              )}
                            </div>
                            <p className={`mt-1 font-mono text-sm tabular-nums ${pnlClass(d.pnl)}`}>
                              {pnlFmt(d.pnl)}
                            </p>
                          </div>
                        );
                      })}
                      <p className="border-t border-industrial pt-2.5 text-[10px] leading-snug text-muted">
                        La marca blanca es el acierto mínimo para no perder dinero con el payoff
                        actual ({a.breakevenWinRate.toFixed(0)}%).
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </section>

            {/* curva PnL + por instrumento */}
            {/* items-start: sin esto, la tarjeta de la curva se estiraba hasta
                la altura de la lista de instrumentos y dejaba un hueco muerto */}
            {/*
              Estas dos tarjetas iban lado a lado (1fr + 400px) y no se parecen
              en nada de alto: la curva mide ~300 px y la lista, con 21 activos,
              pasaba de 1.100 — media pantalla en blanco a la izquierda. Ahora
              cada una ocupa su ancho completo y la lista fluye en columnas.
            */}
            <section className="mt-4 rounded-xl border border-industrial bg-soft">
              <SectionHead label="PnL acumulado" />
              <div className="p-5">
                <EquityChart data={a.pnlCurve.map((p) => ({ ts: p.ts, equity: p.cum }))} markers={markers} />
              </div>
            </section>

            <section className="mt-4 rounded-xl border border-industrial bg-soft">
              <SectionHead label={`Por instrumento · ${a.byEpic.length}`} />
              <ByInstrument rows={a.byEpic} />
            </section>

            {/* P&L diario */}
            <section className="mt-4 rounded-xl border border-industrial bg-soft">
              <SectionHead label="PnL diario" />
              <div className="p-5">
                <DailyBars data={a.dailyPnl} />
              </div>
            </section>

            {/* historial */}
            <section className="mt-4 rounded-xl border border-industrial bg-soft">
              <SectionHead
                label={`Historial · ${closedTrades.length}`}
                right={
                  <button
                    onClick={() => exportarCsv(closedTrades, desk || epic || "todo", divisa)}
                    className="min-h-[32px] rounded-md border border-cement px-3 py-1.5 text-[11px] font-medium text-dim transition-colors hover:border-accent hover:text-accent"
                    title="Descargar las operaciones filtradas en CSV"
                  >
                    ↓ CSV
                  </button>
                }
              />
              <TradeTable trades={closedTrades} />
            </section>
          </>
        )}

        <AppFooter />
      </main>
    </div>
  );
}

function Kpi({
  label,
  value,
  sub,
  tone,
  big,
  unidad,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "long" | "short" | "accent";
  big?: boolean;
  /** Divisa de la cuenta. El panel principal ya etiqueta sus importes; aquí
   *  las cifras de dinero salían desnudas y no se distinguían de un % o de R. */
  unidad?: string;
}) {
  const c =
    tone === "long" ? "text-long" : tone === "short" ? "text-short" : tone === "accent" ? "text-accent" : "text-white";
  return (
    <div className="bg-soft p-5">
      <p className="tag">{label}</p>
      <p className={`mt-2 font-mono ${big ? "text-2xl" : "text-xl"} font-medium tracking-tight ${c}`}>
        {value}
        {unidad && <span className="ml-1 text-xs font-normal text-muted">{unidad}</span>}
      </p>
      {sub && <p className="mt-0.5 text-[11px] text-muted">{sub}</p>}
    </div>
  );
}



function ByInstrument({ rows }: { rows: { epic: string; pnl: number; trades: number; winRate: number }[] }) {
  if (!rows.length) return <div className="p-8 text-center text-sm text-muted">Sin datos</div>;
  const max = Math.max(...rows.map((r) => Math.abs(r.pnl)), 1);
  // Se parte en dos mitades en vez de usar una rejilla de 2 columnas: así cada
  // columna se lee de arriba abajo y el ranking (de más ganador a más perdedor)
  // sigue siendo el orden de lectura.
  const corte = Math.ceil(rows.length / 2);
  const columnas = [rows.slice(0, corte), rows.slice(corte)].filter((c) => c.length);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2">
      {columnas.map((col, ci) => (
        <div
          key={ci}
          className={`divide-y divide-industrial/60 ${ci > 0 ? "border-t border-industrial lg:border-l lg:border-t-0" : ""}`}
        >
          {col.map((r) => (
            <div key={r.epic} className="flex items-center gap-3 px-4 py-2.5">
              {/* w-20 no daba para NATURALGAS ni OIL_CRUDE: el nombre se salía
                  de su celda y llegaba a tocar la barra de al lado. */}
              <div className="w-24 shrink-0">
                <p className="truncate font-display text-sm" title={r.epic}>{r.epic}</p>
                {/* "1t · 100%" sobre una sola operación no es un acierto del
                    100%, es una moneda que cayó una vez. Y la unidad "t" no la
                    define nadie. */}
                <p className="font-mono text-[10px] text-muted">
                  {r.trades} {r.trades === 1 ? "op" : "ops"}
                  {r.trades >= MUESTRA_MIN ? ` · ${r.winRate.toFixed(0)}%` : ""}
                </p>
              </div>
              <div className="flex-1">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-industrial">
                  <div
                    className={`h-full rounded-full ${r.pnl >= 0 ? "bg-long" : "bg-short"}`}
                    style={{ width: `${(Math.abs(r.pnl) / max) * 100}%` }}
                  />
                </div>
              </div>
              <span className={`w-16 shrink-0 text-right font-mono text-[13px] ${pnlClass(r.pnl)}`}>
                {r.pnl >= 0 ? "+" : ""}
                {fmt(r.pnl)}
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * P&L por sesión. Antes era una fila de barras sin una sola cifra: ni fechas,
 * ni escala, ni nada que dijera si la barra roja más alta valía −2 € o −27 €.
 * El único acceso al dato era el `title` nativo del navegador, que tarda un
 * segundo en salir y no existe en pantalla táctil. Y la línea de cero se
 * dibujaba DENTRO de cada columna, así que con la separación entre barras
 * quedaba una fila de guiones sueltos con aspecto de render roto.
 */
const DIAS_VISIBLES = 60;

function DailyBars({ data }: { data: { date: string; pnl: number }[] }) {
  const [foco, setFoco] = useState<number | null>(null);
  if (!data.length) return <div className="dotgrid h-28 rounded-lg border border-industrial" />;

  const vista = data.slice(-DIAS_VISIBLES);
  const ocultos = data.length - vista.length;
  const max = Math.max(...vista.map((d) => Math.abs(d.pnl)), 1);
  const mejor = vista.reduce((a, b) => (b.pnl > a.pnl ? b : a));
  const peor = vista.reduce((a, b) => (b.pnl < a.pnl ? b : a));
  // 'date' viene como AAAA-MM-DD en la zona de la cuenta; el mediodía evita que
  // el desplazamiento horario retroceda la etiqueta un día.
  const fecha = (s: string) =>
    new Date(`${s}T12:00:00`).toLocaleDateString("es-ES", { day: "2-digit", month: "short" });
  const activa = foco != null ? vista[foco] : null;

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-[11px] text-muted">
        {/*
          El signo iba escrito a mano: "+" delante de la mejor sesión y nada
          delante de la peor. Y "mejor" es solo la MENOS MALA cuando todas
          pierden — que con un filtro de activo es lo normal: hoy, ocho de los
          veinte activos del histórico tienen todas sus sesiones en rojo, así que
          filtrar por AAPL pintaba "Mejor +−1.51" y filtrar por MU, "+−27.00".
          pnlFmt ya pone el signo que toca; el resto del panel lo usa desde hace
          pasadas. El color también sale del valor, no del puesto en el ranking.
        */}
        <span>
          Mejor <span className={`font-mono ${pnlClass(mejor.pnl)}`}>{pnlFmt(mejor.pnl)}</span> ·
          Peor <span className={`font-mono ${pnlClass(peor.pnl)}`}>{pnlFmt(peor.pnl)}</span>
        </span>
        <span>
          {vista.length} {vista.length === 1 ? "sesión" : "sesiones"}
          {/* Un recorte silencioso se lee como "esto es todo": si sobran días, se dice. */}
          {ocultos > 0 && ` · ${ocultos} anteriores fuera del gráfico`}
        </span>
      </div>

      <div className="relative h-[132px] pr-10">
        {/* Escala: sin ella la barra más alta no tiene valor conocido */}
        <span className="absolute right-0 top-0 font-mono text-[10px] leading-none text-muted">
          +{fmt(max)}
        </span>
        <span className="absolute right-0 top-1/2 -translate-y-1/2 font-mono text-[10px] leading-none text-dim">
          0
        </span>
        <span className="absolute bottom-0 right-0 font-mono text-[10px] leading-none text-muted">
          −{fmt(max)}
        </span>
        {/* Línea de cero continua, fuera de las columnas */}
        <div className="absolute left-0 right-10 top-1/2 h-px bg-cement" />

        {activa && (
          <div
            className="pointer-events-none absolute -top-1 z-10 -translate-x-1/2 whitespace-nowrap rounded-md border border-cement bg-ink px-2 py-1 font-mono text-[10px] shadow-lg"
            style={{
              left: `${Math.min(88, Math.max(12, ((foco! + 0.5) / vista.length) * 100))}%`,
            }}
          >
            <span className="text-muted">{fecha(activa.date)}</span>{" "}
            <span className={pnlClass(activa.pnl)}>
              {activa.pnl >= 0 ? "+" : ""}
              {fmt(activa.pnl)}
            </span>
          </div>
        )}

        <div className="flex h-full items-stretch gap-1">
          {vista.map((d, i) => {
            const alto = (Math.abs(d.pnl) / max) * 100;
            const up = d.pnl >= 0;
            const on = foco === i;
            return (
              <div
                key={d.date}
                title={`${fecha(d.date)}: ${d.pnl >= 0 ? "+" : ""}${fmt(d.pnl)}`}
                onMouseEnter={() => setFoco(i)}
                onMouseLeave={() => setFoco(null)}
                onTouchStart={() => setFoco(i)}
                className="flex min-w-0 flex-1 cursor-default flex-col"
              >
                <div className="flex h-1/2 w-full items-end justify-center">
                  {up && (
                    <div
                      className={`w-full max-w-[18px] rounded-t bg-long ${on ? "" : "opacity-90"}`}
                      // Las jornadas planas dejaban la columna vacía y se leían
                      // como día sin datos; 2 px dicen "cerró en cero".
                      style={{ height: `${Math.max(alto, d.pnl === 0 ? 0 : 2)}%`, minHeight: d.pnl === 0 ? 2 : 0 }}
                    />
                  )}
                </div>
                <div className="flex h-1/2 w-full items-start justify-center">
                  {!up && (
                    <div
                      className={`w-full max-w-[18px] rounded-b bg-short ${on ? "" : "opacity-90"}`}
                      style={{ height: `${Math.max(alto, 2)}%` }}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-1.5 flex justify-between pr-10 font-mono text-[10px] text-muted">
        <span>{fecha(vista[0].date)}</span>
        <span>{fecha(vista[vista.length - 1].date)}</span>
      </div>
    </div>
  );
}

/**
 * Descarga el histórico filtrado en CSV. Hasta ahora los datos solo salían por
 * la API: para Hacienda, para analizarlos fuera o simplemente para conservarlos
 * había que pelearse con curl. Exporta lo que se está viendo, filtros incluidos.
 */
/**
 * Descarga el histórico filtrado. Verificado descargándolo de verdad, y salieron
 * tres cosas que la revisión de código no habría dado:
 *
 *  · La columna se llamaba "pnl_eur", con la divisa clavada — justo lo que se
 *    quitó de toda la interfaz en las pasadas 118 y 119. Ahora la toma de la
 *    cuenta.
 *  · Los precios salían en crudo: "4371.620000000001", "64.68799999999999".
 *    Son dobles sin redondear; en la hoja de cálculo aparecen tal cual.
 *  · Las fechas iban en UTC (toISOString), mientras el panel muestra todo en la
 *    zona de la cuenta. Exportabas y las horas no cuadraban con la pantalla:
 *    dos horas de diferencia en verano.
 */
function exportarCsv(trades: TradeRecord[], etiqueta: string, divisa: string) {
  const cab = [
    "apertura",
    "cierre",
    "activo",
    "direccion",
    "tamano",
    "entrada",
    "salida",
    `pnl${divisa ? `_${divisa.toLowerCase()}` : ""}`,
    "duracion_min",
    "origen",
    "motivo",
  ];
  const esc = (v: unknown) => {
    const t = String(v ?? "");
    return /[",;\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  // Zona de la cuenta, no UTC, y desde la constante compartida: tenerla escrita
  // a mano aquí era la tercera copia del mismo dato.
  // 'sv-SE' formatea como AAAA-MM-DD HH:MM:SS, que es lo que ordena bien.
  const iso = (ms?: number) =>
    ms ? new Date(ms).toLocaleString("sv-SE", { timeZone: TZ }) : "";
  /** Precio con los decimales del activo; sin esto salen dobles en crudo. */
  const num = (v: number | undefined, d: number) =>
    v == null || !Number.isFinite(v) ? "" : Number(v.toFixed(d));
  const filas = trades.map((t) =>
    [
      iso(t.ts),
      iso(t.closedTs),
      t.epic,
      t.direction === "BUY" ? "LARGO" : "CORTO",
      num(t.size, 4),
      num(t.entry, pdec(t.entry)),
      // Mismo criterio que la tabla: una salida no fiable se exporta vacía en
      // vez de propagar el precio inventado a una hoja de cálculo.
      salidaFiable(t) ? num(t.exit, pdec(t.entry)) : "",
      num(t.pnl, 2),
      t.closedTs && t.ts ? Math.round((t.closedTs - t.ts) / 60000) : "",
      (t.reason || "").startsWith("IA:") ? "gestor_ia" : "motor_tecnico",
      (t.reason || "").replace(/^IA:\s*/, ""),
    ]
      .map(esc)
      .join(",")
  );
  // BOM para que Excel respete los acentos al abrirlo
  const csv = "\uFEFF" + [cab.join(","), ...filas].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `capital-autopilot-${etiqueta}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Cuánto estuvo abierta la operación. */
function duracion(t: TradeRecord) {
  if (!t.closedTs || !t.ts) return "—";
  return duracionMs(t.closedTs - t.ts);
}

/**
 * ¿Es creíble el precio de salida guardado? Salir al mismo precio exacto al que
 * entraste y aun así mover ±27 € es imposible, así que esas filas son el rastro
 * del `?? t.entry` que tenía el motor: cuando el activo no traía cotización en
 * el tick del cierre, rellenaba el hueco con el precio de ENTRADA. Ya no lo
 * hace, pero 5 de las 33 operaciones cerradas se guardaron así y no se puede
 * reconstruir el precio real a posteriori. Mejor decir que no está.
 */
/**
 * ¿El precio de salida es real o el marcador que deja un cierre sin capturar?
 *
 * La regla pedía además que el P&L fuera distinto de cero: `exit === entry` con
 * resultado ~0 se daba por buena. Pero una salida EXACTAMENTE en el precio de
 * entrada, al quinto decimal, no ocurre en un mercado real — ocurre cuando el
 * cierre se reconcilia después y no había precio que registrar, así que se
 * copió el de entrada. El resultado ~0 no es prueba de nada: es lo que sale
 * cuando el stop se movió a la entrada y saltó ahí.
 *
 * Medido sobre las 35 cerradas de producción: 5 tienen exit == entry y solo 3
 * se marcaban como no registradas. Las otras dos se pintaban como "258,58 →
 * 258,58", que es un precio inventado con cinco decimales de precisión.
 *
 * El P&L no se toca en ningún caso: ese sí es real, sale del efectivo de la
 * cuenta y no de estos dos números.
 */
function salidaFiable(t: TradeRecord): boolean {
  if (t.exit == null) return false;
  return t.exit !== t.entry;
}

/**
 * El historial enseñaba dirección, precios, duración y P&L — todo menos CUÁNTO.
 * Sin el tamaño, la columna de P&L no se puede reconciliar con el movimiento de
 * precio que hay a su izquierda: medido sobre las 34 cerradas de producción, el
 * mismo activo se opera con tamaños muy distintos —GOLD entre 0,03 y 0,12, o
 * sea 4×; SILVER entre 1 y 4; BTCUSD entre 0,0007 y 0,0018— así que dos
 * operaciones con idéntico recorrido de precio dan resultados que se diferencian
 * en un múltiplo, sin nada en pantalla que lo explique.
 *
 * El dato ya se consideraba imprescindible: la exportación a CSV lleva su
 * columna "tamano" desde siempre. Era la única que no estaba en la vista.
 */
function TradeTable({ trades }: { trades: TradeRecord[] }) {
  return (
    <>
    {/*
      En móvil esta tabla mide 799 px dentro de una caja de 348: solo se veían
      las columnas "Cierre" y "Activo", y la dirección, los precios, la duración
      y el P&L quedaban fuera, alcanzables únicamente arrastrando en horizontal
      dentro de la tarjeta. El auditor no lo marcaba porque el desbordamiento es
      interno, no de la página. La tabla de posiciones ABIERTAS tiene su versión
      en tarjetas desde la pasada 3; el historial —el registro de lo que el bot
      hizo con el dinero— se quedó sin ella.
    */}
    <div className="hidden max-h-[520px] overflow-auto md:block">
      <table className="w-full text-left font-mono text-[12px]">
        <thead className="sticky top-0 bg-soft">
          <tr className="border-b border-industrial text-muted">
            <th scope="col" className="px-4 py-2.5 font-normal">Cierre</th>
            <th scope="col" className="px-4 py-2.5 font-normal">Activo</th>
            <th scope="col" className="px-4 py-2.5 font-normal">Dir</th>
            <th scope="col" className="px-4 py-2.5 font-normal">Tamaño · entrada → salida</th>
            <th scope="col" className="px-4 py-2.5 text-right font-normal">Duración</th>
            <th scope="col" className="px-4 py-2.5 text-right font-normal">PnL</th>
          </tr>
        </thead>
        <tbody>
          {trades.map((t) => {
            // De la IA o del motor técnico: executePmDecision prefija "IA:"
            const deIA = (t.reason || "").startsWith("IA:");
            const motivo = (t.reason || "").replace(/^IA:\s*/, "");
            return (
              <tr key={t.id} className="border-b border-industrial/50 align-top hover:bg-raised">
                <td className="px-4 py-2.5 tabular-nums text-muted">
                  {new Date(t.closedTs || t.ts).toLocaleString("es-ES", {
                    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
                  })}
                </td>
                <td className="px-4 py-2.5">
                  <span className="text-white">{t.epic}</span>
                  {/* Quién la abrió: separa el criterio de la IA del del motor */}
                  <span
                    className={`ml-1.5 rounded px-1 py-0.5 text-[8px] ${
                      deIA ? "bg-accent/15 text-accent" : "bg-industrial text-muted"
                    }`}
                    title={deIA ? "Abierta por el Gestor IA" : "Abierta por el motor técnico"}
                  >
                    {deIA ? "IA" : "TEC"}
                  </span>
                  {/* El porqué: sin esto la tabla es una lista de números sin auditoría */}
                  {motivo && (
                    <p className="mt-0.5 max-w-[380px] truncate text-[10px] text-muted" title={motivo}>
                      {motivo}
                    </p>
                  )}
                </td>
                <td className="px-4 py-2.5">
                  <span className={t.direction === "BUY" ? "text-long" : "text-short"}>
                    {t.direction === "BUY" ? "▲" : "▼"}
                  </span>
                </td>
                <td className="px-4 py-2.5 tabular-nums text-dim">
                  <span className="text-muted">{uds(t.size)}&nbsp;×&nbsp;</span>
                  {price(t.entry)}
                  {salidaFiable(t) ? (
                    ` → ${price(t.exit!)}`
                  ) : (
                    <span
                      className="text-muted"
                      title="El precio de cierre no se capturó en su momento. El P&L sí es real: sale del efectivo de la cuenta, no de estos dos precios."
                    >
                      {" → sin registrar"}
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-muted">{duracion(t)}</td>
                <td className={`px-4 py-2.5 text-right tabular-nums ${pnlClass(t.pnl || 0)}`}>
                  {t.pnl != null ? `${t.pnl >= 0 ? "+" : ""}${fmt(t.pnl)}` : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>

    {/* Móvil: una tarjeta por operación, con el resultado primero */}
    <div className="max-h-[520px] space-y-2 overflow-y-auto p-3 md:hidden">
      {trades.map((t) => {
        const deIA = (t.reason || "").startsWith("IA:");
        const motivo = (t.reason || "").replace(/^IA:\s*/, "");
        return (
          <div key={t.id} className="rounded-lg border border-industrial bg-base p-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className="flex min-w-0 items-baseline gap-1.5">
                <span className="truncate font-mono text-sm text-white">{t.epic}</span>
                <span
                  className={`shrink-0 rounded px-1 py-0.5 text-[8px] ${
                    deIA ? "bg-accent/15 text-accent" : "bg-industrial text-muted"
                  }`}
                >
                  {deIA ? "IA" : "TEC"}
                </span>
              </span>
              <span className={`shrink-0 font-mono text-sm tabular-nums ${pnlClass(t.pnl || 0)}`}>
                {t.pnl != null ? `${t.pnl >= 0 ? "+" : ""}${fmt(t.pnl)}` : "—"}
              </span>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-y-2 font-mono text-[11px] tabular-nums">
              <MiniCelda label="DIR" valor={t.direction === "BUY" ? "▲ LONG" : "▼ SHORT"} tono={t.direction === "BUY" ? "text-long" : "text-short"} />
              <MiniCelda label="DURACIÓN" valor={duracion(t)} />
              <MiniCelda
                label="CIERRE"
                valor={new Date(t.closedTs || t.ts).toLocaleString("es-ES", {
                  day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
                })}
              />
              <div className="col-span-3">
                <p className="tag">Tamaño · entrada → salida</p>
                <p className="mt-0.5 text-dim">
                  <span className="text-muted">{uds(t.size)} × </span>
                  {price(t.entry)}
                  {salidaFiable(t) ? ` → ${price(t.exit!)}` : <span className="text-muted"> → sin registrar</span>}
                </p>
              </div>
            </div>
            {motivo && (
              <p className="mt-2 border-t border-industrial pt-2 text-[11px] leading-snug text-muted">
                {motivo}
              </p>
            )}
          </div>
        );
      })}
    </div>
    </>
  );
}

function MiniCelda({ label, valor, tono = "text-dim" }: { label: string; valor: string; tono?: string }) {
  return (
    <div className="min-w-0">
      <p className="tag">{label}</p>
      <p className={`mt-0.5 truncate ${tono}`}>{valor}</p>
    </div>
  );
}
