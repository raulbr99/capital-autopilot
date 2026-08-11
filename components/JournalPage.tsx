"use client";

import { useMemo, useState } from "react";
import type { JournalEntry, JournalAction } from "./types";
import AppHeader from "./AppHeader";
import { Skeleton, usePoll } from "./ui";

const ACT: Record<string, { label: string; cls: string }> = {
  OPEN: { label: "ABRE", cls: "bg-long/15 text-long" },
  CLOSE: { label: "CIERRA", cls: "bg-short/15 text-short" },
  HOLD: { label: "ESPERA", cls: "bg-industrial text-muted" },
};

// Resultado real de la acción (lo que de verdad pasó al ejecutarla).
const OUTCOME: Record<string, { label: string; cls: string }> = {
  opened: { label: "✓ ABIERTA", cls: "bg-long/15 text-long" },
  closed: { label: "✓ CERRADA", cls: "bg-long/15 text-long" },
  vetoed: { label: "✕ VETADA COMITÉ", cls: "bg-short/15 text-short" },
  skipped: { label: "⊘ NO EJECUTADA", cls: "bg-industrial text-muted" },
  error: { label: "⚠ ERROR", cls: "bg-short/15 text-short" },
};

const DESK_FILTERS = [
  { key: "all", label: "Todas" },
  { key: "forex", label: "Forex" },
  { key: "crypto", label: "Crypto" },
  { key: "stocks", label: "Stocks" },
  { key: "commodities", label: "Commodities" },
];

const THESIS_LIMIT = 230; // a partir de aquí se pliega

/** Qué pasó de verdad en la entrada: es lo que decide su peso visual. */
function summarize(actions: JournalAction[] = []) {
  const done = actions.filter((a) => a.outcome === "opened" || a.outcome === "closed").length;
  const blocked = actions.filter(
    (a) => a.outcome === "vetoed" || a.outcome === "skipped" || a.outcome === "error"
  ).length;
  if (done) return { kind: "traded" as const, label: `${done} ejecutada${done > 1 ? "s" : ""}`, cls: "bg-long/15 text-long" };
  if (blocked) return { kind: "blocked" as const, label: `${blocked} sin ejecutar`, cls: "bg-short/10 text-short" };
  return { kind: "held" as const, label: "sin operaciones", cls: "bg-industrial text-muted" };
}

const dayKey = (ts: string) => new Date(ts).toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });

export default function JournalPage() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [desk, setDesk] = useState("all");
  const [open, setOpen] = useState<Set<number>>(new Set());

  usePoll(() => {
    fetch("/api/bot/journal")
      .then((r) => r.json())
      .then((d) => setEntries(d.entries || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, 30000);

  const shown = useMemo(
    () => entries.filter((e) => desk === "all" || e.desk === desk),
    [entries, desk]
  );

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

  return (
    <div className="min-h-screen">
      <AppHeader active="/journal" />

      <main className="mx-auto max-w-[900px] px-5 py-6 md:px-8">
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
              className={`rounded-md px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
                desk === f.key ? "bg-accent text-onaccent" : "border border-industrial text-muted hover:text-dim"
              }`}
            >
              {f.label}
            </button>
          ))}
          {shown.length > 0 && (
            <span className="ml-auto font-mono text-[11px] text-muted">
              {shown.length} entradas · {traded} con operación
            </span>
          )}
        </div>

        {loading ? (
          <div className="space-y-3" aria-busy>
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
        ) : shown.length === 0 ? (
          <div className="rounded-xl border border-industrial bg-soft p-16 text-center">
            <p className="text-base font-medium text-dim">El gestor IA aún no ha escrito nada</p>
            <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
              Activa el <span className="text-accent">Gestor de Cartera IA</span> en el panel. En cada ciclo del cron
              escribirá su tesis y sus decisiones aquí.
            </p>
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
                    const expanded = open.has(e.id);
                    const thesis = e.thesis || "—";
                    const long = thesis.length > THESIS_LIMIT;
                    const quiet = sum.kind === "held";
                    return (
                      <article key={e.id} className="relative pl-7">
                        <span
                          className={`absolute left-0 top-3 h-3.5 w-3.5 rounded-full border-2 border-ink ${
                            sum.kind === "traded" ? "bg-long" : sum.kind === "blocked" ? "bg-short" : "bg-industrial"
                          }`}
                        />
                        <div
                          className={`rounded-xl border bg-soft p-4 ${
                            sum.kind === "traded" ? "border-long/25" : "border-industrial"
                          }`}
                        >
                          <div className="mb-2 flex flex-wrap items-center gap-2">
                            {e.desk && (
                              <span className="rounded bg-industrial px-1.5 py-0.5 text-[10px] font-medium uppercase text-dim">
                                {e.desk}
                              </span>
                            )}
                            <span className="font-mono text-[11px] tabular-nums text-muted">
                              {new Date(e.ts).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", hour12: false })}
                            </span>
                            <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${sum.cls}`}>{sum.label}</span>
                            <span className="rounded bg-accent/10 px-1.5 py-0.5 text-[10px] font-medium text-accent">
                              confianza {Math.round((e.confidence || 0) * 100)}%
                            </span>
                            {typeof e.snapshot?.equity === "number" && (
                              <span className="ml-auto font-mono text-[11px] tabular-nums text-muted">
                                equity {e.snapshot.equity.toFixed(2)}
                              </span>
                            )}
                          </div>

                          {/* Las tesis son de 800+ caracteres: plegadas por defecto,
                              si no la página es un muro de prosa imposible de barrer. */}
                          <p
                            className={`text-[13px] leading-relaxed [overflow-wrap:anywhere] ${
                              quiet ? "text-muted" : "text-dim"
                            } ${long && !expanded ? "line-clamp-2" : ""}`}
                          >
                            {thesis}
                          </p>
                          {long && (
                            <button
                              onClick={() => toggle(e.id)}
                              className="mt-1 text-[11px] font-medium text-accent transition-opacity hover:opacity-80"
                            >
                              {expanded ? "Mostrar menos" : "Leer tesis completa"}
                            </button>
                          )}

                          {Array.isArray(e.actions) && e.actions.length > 0 && (
                            <div className="mt-3 space-y-1.5 border-t border-industrial pt-3">
                              {e.actions.map((a: JournalAction, i: number) => {
                                const oc = a.outcome && a.outcome !== "held" ? OUTCOME[a.outcome] : null;
                                const notRun =
                                  !!a.outcome && a.outcome !== "opened" && a.outcome !== "closed" && a.outcome !== "held";
                                return (
                                  <div
                                    key={i}
                                    className={`flex flex-wrap items-start gap-2 text-[12px] ${notRun ? "opacity-60" : ""}`}
                                  >
                                    <span
                                      className={`mt-px shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold ${
                                        ACT[a.action]?.cls || ACT.HOLD.cls
                                      }`}
                                    >
                                      {ACT[a.action]?.label || a.action}
                                    </span>
                                    {a.epic && (
                                      <span className="shrink-0 font-mono text-white">
                                        {a.epic}
                                        {a.direction ? ` ${a.direction === "BUY" ? "▲" : "▼"}` : ""}
                                        {a.riskPct ? ` ${a.riskPct}%` : ""}
                                      </span>
                                    )}
                                    {oc && (
                                      <span className={`mt-px shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold ${oc.cls}`}>
                                        {oc.label}
                                      </span>
                                    )}
                                    <span className="min-w-0 text-muted [overflow-wrap:anywhere]">
                                      {a.reason}
                                      {notRun && a.outcomeNote ? <span className="text-short/80"> · {a.outcomeNote}</span> : null}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
