"use client";

import { useMemo, useState } from "react";
import type { JournalEntry } from "./types";
import AppHeader from "./AppHeader";
import { Skeleton, usePoll, pl, AppFooter, AvisoSinConexion } from "./ui";
import { TZ } from "@/lib/model";
import JournalEntryCard, { summarize } from "./JournalEntryCard";
import LessonsPanel from "./LessonsPanel";

const DESK_FILTERS = [
  { key: "all", label: "Todas" },
  { key: "forex", label: "Forex" },
  { key: "crypto", label: "Crypto" },
  { key: "stocks", label: "Stocks" },
  { key: "commodities", label: "Commodities" },
];

/** La jornada se parte en la zona de la CUENTA, no en la del navegador: es la
 *  misma con la que el bot cuenta su día. */
const dayKey = (ts: string) =>
  new Date(ts).toLocaleDateString("es-ES", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" });

export default function JournalPage() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  /** Últimas 60 sin filtrar: de ahí salen los recuentos de las pestañas. */
  const [global_, setGlobal] = useState<JournalEntry[]>([]);
  const [cargadoDe, setCargadoDe] = useState<string | null>(null);
  const [lastOk, setLastOk] = useState<number | null>(null);
  const [desk, setDesk] = useState("all");
  const [open, setOpen] = useState<Set<number>>(new Set());

  /**
   * Filtrar por mesa se hacía en el navegador sobre las 60 entradas más
   * recientes del diario entero. La ruta acepta ?desk= desde hace pasadas —el
   * panel de lecciones de esta misma página ya lo usa— y aplica el límite
   * DESPUÉS del filtro, así que devuelve 20 de esa mesa en vez de las que
   * quepan dentro de una ventana global.
   *
   * La diferencia no es teórica. Medido contra producción:
   *   Stocks filtrado en el navegador →  6 entradas, todas del 12-13 de agosto
   *   Stocks pedido al servidor       → 20 entradas, del 6 de julio al 12 de agosto
   *
   * O sea que la mesa de acciones enseñaba seis decisiones y escondía más de un
   * mes de diario. Y como esa mesa solo opera en sesión de Nueva York, sus
   * entradas son las que antes se caen de una ventana global — el filtro
   * castigaba justo a la mesa con menos actividad. Este fichero llegó a
   * explicar el hueco como una consecuencia del horario; era el recorte.
   */
  usePoll(() => {
    const q = desk === "all" ? "" : `?desk=${encodeURIComponent(desk)}`;
    fetch(`/api/bot/journal${q}`)
      .then((r) => r.json())
      .then((d) => {
        const list: JournalEntry[] = Array.isArray(d.entries) ? d.entries : [];
        setEntries(list);
        setLastOk(Date.now());
        if (desk === "all") setGlobal(list);
      })
      .catch(() => {})
      .finally(() => setCargadoDe(desk));
  }, 60000, [desk]);

  /** Mientras la respuesta de la mesa nueva no ha llegado, lo cargado es de otra. */
  const loading = cargadoDe !== desk;
  const shown = entries;

  // Agrupado por día: un diario se lee por jornadas, no como lista infinita
  const days = useMemo(() => {
    const m = new Map<string, JournalEntry[]>();
    for (const e of shown) {
      const k = dayKey(e.ts);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(e);
    }
    return [...m.entries()];
  }, [shown]);

  const toggle = (id: number) =>
    setOpen((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const traded = shown.filter((e) => summarize(e.actions).kind === "traded").length;

  /**
   * Entradas por mesa. Los filtros de señales y los del registro en vivo llevan
   * su recuento desde hace pasadas; estos no, así que había que pulsarlos uno a
   * uno para descubrir cuáles tienen algo.
   */
  /**
   * Ojo con estos números: son cuántas entradas de cada mesa hay entre las 60
   * más recientes del diario, no cuántas tiene la mesa. Sirven para ver de un
   * vistazo qué mesas están activas; el total de cada una es lo que se lista al
   * seleccionarla. El title lo dice para que el número no se lea como un total.
   */
  const porMesa = useMemo(() => {
    const m: Record<string, number> = { all: global_.length };
    for (const e of global_) if (e.desk) m[e.desk] = (m[e.desk] || 0) + 1;
    return m;
  }, [global_]);

  return (
    <div className="min-h-screen">
      <AppHeader active="/journal" />

      <main className="mx-auto max-w-[900px] px-5 py-6 md:px-8">
        <AvisoSinConexion lastOk={lastOk} cadaMs={60000} />
        <div className="mb-5">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-white">Diario del Gestor IA</h1>
          <p className="mt-1 text-sm text-dim">
            La tesis de mercado y las decisiones de la IA en cada ciclo. Lee cómo piensa.
          </p>
        </div>

        <div className="mb-6 flex flex-wrap items-center gap-1.5">
          {DESK_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setDesk(f.key)}
              className={`min-h-[34px] rounded-md px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
                desk === f.key ? "bg-accent text-onaccent" : "border border-industrial text-muted hover:text-dim"
              }`}
            >
              {f.label}
              {porMesa[f.key] != null && (
                <span
                  title={
                    f.key === "all"
                      ? "Entradas cargadas"
                      : "Entradas de esta mesa entre las 60 más recientes del diario"
                  }
                  className={`ml-1.5 tabular-nums ${desk === f.key ? "opacity-70" : "text-muted"}`}
                >
                  {porMesa[f.key]}
                </span>
              )}
            </button>
          ))}
          {shown.length > 0 && (
            <span className="ml-auto font-mono text-[11px] text-muted">
              {shown.length} {pl(shown.length, "entrada", "entradas")} · {traded} con operación
            </span>
          )}
        </div>

        <div className="mb-6">
          <LessonsPanel desk={desk} />
        </div>

        {loading ? (
          <div className="space-y-3" aria-busy>
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
        ) : shown.length === 0 ? (
          /*
            Un solo mensaje para dos situaciones distintas, igual que pasaba en
            Analítica hasta la pasada 112: con 60 entradas en el histórico,
            filtrar por una mesa sin actividad decía "el gestor IA aún no ha
            escrito nada" — es decir, negaba todo el diario por culpa de un
            filtro.
            Y la instrucción mandaba al sitio equivocado: el interruptor del
            Gestor no está en el panel, está en el Lab, y desde la pasada 141 se
            llama "Gestor en la nube". Un estado vacío que da una indicación
            falsa es peor que uno que no dice nada.
          */
          <div className="rounded-xl border border-industrial bg-soft p-16 text-center">
            {global_.length > 0 ? (
              <>
                <p className="text-base font-medium text-dim">Ninguna entrada en esta mesa</p>
                <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
                  Hay {global_.length} {pl(global_.length, "entrada", "entradas")} recientes en el diario, pero
                  ninguna de{" "}
                  <span className="text-dim">
                    {DESK_FILTERS.find((f) => f.key === desk)?.label ?? desk}
                  </span>
                  .
                </p>
                <button
                  onClick={() => setDesk("all")}
                  className="mt-4 min-h-[34px] rounded-lg border border-cement px-3.5 py-2 text-[13px] font-medium text-dim transition-colors hover:border-accent hover:text-accent"
                >
                  Ver todas
                </button>
              </>
            ) : (
              <>
                <p className="text-base font-medium text-dim">El Gestor aún no ha escrito nada</p>
                <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
                  Enciende el <span className="text-accent">Gestor en la nube</span> en el{" "}
                  <a href="/lab" className="text-accent underline">Lab</a>. En cada ciclo del cron
                  escribirá aquí su tesis y sus decisiones.
                </p>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-7">
            {days.map(([day, list]) => (
              <section key={day}>
                <h2 className="mb-3 border-b border-industrial pb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted">
                  {day}
                </h2>
                <div className="relative space-y-3 before:absolute before:bottom-2 before:left-[7px] before:top-2 before:w-px before:bg-industrial">
                  {list.map((e) => {
                    const sum = summarize(e.actions);
                    return (
                      <article key={e.id} className="relative pl-7">
                        <span
                          className={`absolute left-0 top-3 h-3.5 w-3.5 rounded-full border-2 border-ink ${
                            sum.kind === "traded" ? "bg-long" : sum.kind === "blocked" ? "bg-short" : "bg-industrial"
                          }`}
                        />
                        <JournalEntryCard entry={e} showDesk />
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
              <AppFooter />
      </main>
    </div>
  );
}
