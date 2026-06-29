"use client";

import { useEffect, useState } from "react";
import type { JournalEntry, JournalAction } from "./types";
import AppHeader from "./AppHeader";

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

export default function JournalPage() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [desk, setDesk] = useState("all");

  useEffect(() => {
    const load = async () => {
      try {
        const r = await fetch("/api/bot/journal");
        const d = await r.json();
        setEntries(d.entries || []);
      } catch {
        /* */
      } finally {
        setLoading(false);
      }
    };
    load();
    const t1 = setInterval(load, 30000);
    return () => clearInterval(t1);
  }, []);

  const shown = entries.filter((e) => desk === "all" || (e as any).desk === desk);

  return (
    <div className="min-h-screen">
      <AppHeader active="/journal" />

      <main className="mx-auto max-w-[960px] px-5 py-6 md:px-8">
        <div className="mb-5">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-white">Diario del Gestor IA</h1>
          <p className="mt-1 text-sm text-dim">
            La tesis de mercado y las decisiones de la IA en cada ciclo. Lee cómo piensa.
          </p>
        </div>

        <div className="mb-6 flex flex-wrap gap-1.5">
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
        </div>

        {loading ? (
          <p className="text-center text-sm text-muted">Cargando…</p>
        ) : shown.length === 0 ? (
          <div className="rounded-xl border border-industrial bg-soft p-16 text-center">
            <p className="text-base font-medium text-dim">El gestor IA aún no ha escrito nada</p>
            <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
              Activa el <span className="text-accent">Gestor de Cartera IA</span> en el panel. En cada ciclo del cron
              escribirá su tesis y sus decisiones aquí.
            </p>
          </div>
        ) : (
          <div className="relative space-y-4 before:absolute before:left-[7px] before:top-2 before:bottom-2 before:w-px before:bg-industrial">
            {shown.map((e) => (
              <article key={e.id} className="relative pl-7">
                <span className="absolute left-0 top-2 h-3.5 w-3.5 rounded-full border-2 border-ink bg-accent" />
                <div className="rounded-xl border border-industrial bg-soft p-4">
                  <div className="mb-2 flex items-center gap-2">
                    {(e as any).desk && (
                      <span className="rounded bg-industrial px-1.5 py-0.5 text-[10px] font-medium uppercase text-dim">
                        {(e as any).desk}
                      </span>
                    )}
                    <span className="font-mono text-[11px] text-muted">
                      {new Date(e.ts).toLocaleString("es-ES", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })}
                    </span>
                    <span className="rounded bg-accent/10 px-1.5 py-0.5 text-[10px] font-medium text-accent">
                      confianza {Math.round((e.confidence || 0) * 100)}%
                    </span>
                    {typeof e.snapshot?.equity === "number" && (
                      <span className="ml-auto font-mono text-[11px] text-muted">
                        equity {e.snapshot.equity.toFixed(2)}
                      </span>
                    )}
                  </div>
                  <p className="text-[13px] leading-relaxed text-dim [overflow-wrap:anywhere]">{e.thesis || "—"}</p>
                  {Array.isArray(e.actions) && e.actions.length > 0 && (
                    <div className="mt-3 space-y-1.5 border-t border-industrial pt-3">
                      {e.actions.map((a: JournalAction, i: number) => {
                        const oc = a.outcome && a.outcome !== "held" ? OUTCOME[a.outcome] : null;
                        const notRun = !!a.outcome && a.outcome !== "opened" && a.outcome !== "closed" && a.outcome !== "held";
                        return (
                          <div key={i} className={`flex flex-wrap items-start gap-2 text-[12px] ${notRun ? "opacity-60" : ""}`}>
                            <span className={`mt-px shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold ${ACT[a.action]?.cls || ACT.HOLD.cls}`}>
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
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
