"use client";

import { useMemo, useState } from "react";
import type { JournalEntry } from "./types";
import AppHeader from "./AppHeader";
import { Skeleton, usePoll, pl, AppFooter } from "./ui";
import JournalEntryCard, { summarize } from "./JournalEntryCard";
import LessonsPanel from "./LessonsPanel";

const DESK_FILTERS = [
  { key: "all", label: "Todas" },
  { key: "forex", label: "Forex" },
  { key: "crypto", label: "Crypto" },
  { key: "stocks", label: "Stocks" },
  { key: "commodities", label: "Commodities" },
];

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
