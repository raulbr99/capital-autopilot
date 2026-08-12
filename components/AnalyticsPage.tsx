"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { TradeRecord, DeskCategory } from "./types";
import { analyze } from "./analytics-util";
import { fmt, pf, pnlFmt, pnlClass, SectionHead, Skeleton, usePoll, deskMap, price } from "./ui";
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
  const [loading, setLoading] = useState(true);
  const [epic, setEpic] = useState<string>("");
  const [desk, setDesk] = useState<string>("");

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/bot/trades");
      const d = await r.json();
      setTrades(d.trades || []);
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

  const epics = useMemo(
    () => Array.from(new Set(trades.map((t) => t.epic))).sort(),
    [trades]
  );

  const filtered = useMemo(
    () => trades.filter((t) => (!epic || t.epic === epic) && (!desk || deskOf(t.epic) === desk)),
    [trades, epic, desk, deskOf]
  );

  const a = useMemo(() => analyze(filtered), [filtered]);
  const closedTrades = filtered
    .filter((t) => t.status === "closed")
    .sort((x, y) => (y.closedTs || y.ts) - (x.closedTs || x.ts));
  const markers = a.pnlCurve.map((p) => ({ ts: p.ts, dir: "BUY" as const, pnl: 0 }));

  return (
    <div className="min-h-screen">
      <AppHeader active="/analytics" />

      <main className="mx-auto max-w-[1400px] px-5 py-6 md:px-8">
        {/* título + filtros */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight text-white">Analítica</h1>
            <p className="mt-1 text-sm text-dim">
              Rendimiento de {a.closed} operaciones cerradas{epic && ` · ${epic}`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap gap-1">
              {DESK_FILTERS.map((f) => (
                <button
                  key={f.key}
                  onClick={() => setDesk(f.key)}
                  className={`rounded-md px-2.5 py-1.5 text-[12px] font-medium transition-colors ${
                    desk === f.key ? "bg-accent text-onaccent" : "border border-industrial text-muted hover:text-dim"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <select
              value={epic}
              onChange={(e) => setEpic(e.target.value)}
              aria-label="Filtrar por instrumento"
              className="rounded-lg border border-cement bg-base px-3 py-2 font-mono text-[12px] text-dim focus:border-accent focus:outline-none"
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
          <div className="mt-6 rounded-xl border border-industrial bg-soft p-16 text-center">
            <p className="text-base font-medium text-dim">Sin operaciones cerradas todavía</p>
            <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
              Cuando el bot abra y cierre operaciones, aquí verás win rate, profit factor, drawdown,
              desglose por activo y el historial completo.
            </p>
          </div>
        ) : (
          <>
            {/* KPIs */}
            <section className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-industrial bg-industrial md:grid-cols-4">
              <Kpi
                label="PnL neto"
                value={pnlFmt(a.netPnl)}
                sub={equity ? `${pnlFmt((a.netPnl / equity) * 100)}% del capital` : "€"}
                tone={Math.abs(a.netPnl) < 0.005 ? undefined : a.netPnl > 0 ? "long" : "short"}
                big
              />
              {/* El color lo decide el umbral, no el capricho: verde solo si
                  el acierto basta para ser rentable con ese payoff. */}
              <Kpi
                label="Win rate"
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
                label="Max drawdown"
                value={fmt(a.maxDrawdown)}
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
              <Kpi label="Expectancy" value={fmt(a.expectancy)} sub="por operación" />
              <Kpi label="Media ganancia" value={`+${fmt(a.avgWin)}`} sub={`−${fmt(a.avgLoss)} media pérdida`} />
              <Kpi label="Racha" value={`${a.bestStreak >= 0 ? "+" : ""}${a.bestStreak} / ${a.worstStreak}`} sub="mejor / peor" />
            </section>

            {/* Mecánica: un win rate suelto no dice nada sin su punto de equilibrio */}
            <section className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_400px]">
              <div className="rounded-xl border border-industrial bg-soft">
                <SectionHead label="Mecánica del sistema" />
                <div className="space-y-3 p-5">
                  <p className="text-sm leading-relaxed text-dim">
                    Ganas <span className="font-mono text-long">{fmt(a.avgWin)}</span> de media y pierdes{" "}
                    <span className="font-mono text-short">{fmt(a.avgLoss)}</span>, así que cada acierto vale{" "}
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
                      Con {a.closed} operaciones cerradas estos números son orientativos: hacen falta
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
                      {a.byDirection.map((d) => (
                        <div key={d.dir}>
                          <div className="flex items-baseline justify-between">
                            <span className={`text-sm font-medium ${d.dir === "BUY" ? "text-long" : "text-short"}`}>
                              {d.dir === "BUY" ? "▲ Largos" : "▼ Cortos"}
                            </span>
                            <span className="font-mono text-[11px] tabular-nums text-muted">
                              {d.trades} ops · {d.winRate.toFixed(0)}% acierto
                            </span>
                          </div>
                          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-industrial">
                            <div
                              className={`h-full ${d.dir === "BUY" ? "bg-long" : "bg-short"}`}
                              style={{ width: `${Math.min(100, d.winRate)}%` }}
                            />
                          </div>
                          <p className={`mt-1 font-mono text-sm tabular-nums ${pnlClass(d.pnl)}`}>
                            {pnlFmt(d.pnl)}
                          </p>
                        </div>
                      ))}
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
                    onClick={() => exportarCsv(closedTrades, desk || epic || "todo")}
                    className="rounded-md border border-cement px-2.5 py-1 text-[11px] font-medium text-dim transition-colors hover:border-accent hover:text-accent"
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

        <footer className="mt-10 flex items-center justify-between border-t border-industrial py-6 text-[11px] text-muted">
          <p>Capital Autopilot</p>
          <p>Cuenta real · no es consejo financiero</p>
        </footer>
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
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "long" | "short" | "accent";
  big?: boolean;
}) {
  const c =
    tone === "long" ? "text-long" : tone === "short" ? "text-short" : tone === "accent" ? "text-accent" : "text-white";
  return (
    <div className="bg-soft p-5">
      <p className="tag">{label}</p>
      <p className={`mt-2 font-mono ${big ? "text-2xl" : "text-xl"} font-medium tracking-tight ${c}`}>{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-muted">{sub}</p>}
    </div>
  );
}

/** Igual que en el panel del Diario: bajo esta muestra el % no es una tasa. */
const MUESTRA_MIN = 5;

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

function DailyBars({ data }: { data: { date: string; pnl: number }[] }) {
  if (!data.length) return <div className="dotgrid h-28 rounded-lg border border-industrial" />;
  const max = Math.max(...data.map((d) => Math.abs(d.pnl)), 1);
  return (
    <div className="flex h-32 items-stretch gap-1.5">
      {data.slice(-40).map((d) => {
        const h = (Math.abs(d.pnl) / max) * 56;
        const up = d.pnl >= 0;
        return (
          <div key={d.date} title={`${d.date}: ${d.pnl.toFixed(2)}`} className="group flex flex-1 flex-col items-center justify-center">
            <div className="flex h-[56px] w-full items-end justify-center">
              {up && <div className="w-full max-w-[18px] rounded-t bg-long transition-opacity group-hover:opacity-80" style={{ height: h }} />}
            </div>
            <div className="h-px w-full bg-cement" />
            <div className="flex h-[56px] w-full items-start justify-center">
              {!up && <div className="w-full max-w-[18px] rounded-b bg-short transition-opacity group-hover:opacity-80" style={{ height: h }} />}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Descarga el histórico filtrado en CSV. Hasta ahora los datos solo salían por
 * la API: para Hacienda, para analizarlos fuera o simplemente para conservarlos
 * había que pelearse con curl. Exporta lo que se está viendo, filtros incluidos.
 */
function exportarCsv(trades: TradeRecord[], etiqueta: string) {
  const cab = [
    "apertura",
    "cierre",
    "activo",
    "direccion",
    "tamano",
    "entrada",
    "salida",
    "pnl_eur",
    "duracion_min",
    "origen",
    "motivo",
  ];
  const esc = (v: unknown) => {
    const t = String(v ?? "");
    return /[",;\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const iso = (ms?: number) => (ms ? new Date(ms).toISOString().slice(0, 19).replace("T", " ") : "");
  const filas = trades.map((t) =>
    [
      iso(t.ts),
      iso(t.closedTs),
      t.epic,
      t.direction === "BUY" ? "LARGO" : "CORTO",
      t.size,
      t.entry,
      t.exit ?? "",
      t.pnl ?? "",
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
  const min = Math.max(0, Math.round((t.closedTs - t.ts) / 60000));
  if (min < 60) return `${min} min`;
  const h = Math.round(min / 6) / 10;
  return h < 48 ? `${h} h` : `${Math.round(h / 24)} d`;
}

function TradeTable({ trades }: { trades: TradeRecord[] }) {
  return (
    <div className="max-h-[520px] overflow-auto">
      <table className="w-full text-left font-mono text-[12px]">
        <thead className="sticky top-0 bg-soft">
          <tr className="border-b border-industrial text-muted">
            <th scope="col" className="px-4 py-2.5 font-normal">Cierre</th>
            <th scope="col" className="px-4 py-2.5 font-normal">Activo</th>
            <th scope="col" className="px-4 py-2.5 font-normal">Dir</th>
            <th scope="col" className="px-4 py-2.5 font-normal">Entrada → Salida</th>
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
                  {price(t.entry)}
                  {t.exit != null ? ` → ${price(t.exit)}` : ""}
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
  );
}
