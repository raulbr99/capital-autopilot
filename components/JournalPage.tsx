"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { JournalEntry, JournalAction } from "./types";
import ThemeToggle from "./ThemeToggle";
import { Clock } from "./ui";

const ACT: Record<string, { label: string; cls: string }> = {
  OPEN: { label: "ABRE", cls: "bg-long/15 text-long" },
  CLOSE: { label: "CIERRA", cls: "bg-short/15 text-short" },
  HOLD: { label: "ESPERA", cls: "bg-industrial text-muted" },
};

export default function JournalPage() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);

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

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 flex h-[64px] items-center justify-between border-b border-industrial bg-ink/80 px-5 backdrop-blur md:px-8">
        <div className="flex items-center gap-5">
          <Link href="/" className="flex items-center gap-3">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-onaccent">
              <span className="font-display text-base font-bold leading-none">A</span>
            </div>
            <span className="hidden font-display text-[15px] font-semibold tracking-tight text-white sm:block">
              Capital Autopilot
            </span>
          </Link>
          <nav className="flex items-center gap-1 rounded-lg border border-industrial p-0.5">
            <Link href="/" className="rounded-md px-3 py-1.5 text-[13px] font-medium text-muted transition-colors hover:text-dim">Panel</Link>
            <Link href="/analytics" className="rounded-md px-3 py-1.5 text-[13px] font-medium text-muted transition-colors hover:text-dim">Analítica</Link>
            <span className="rounded-md bg-raised px-3 py-1.5 text-[13px] font-medium text-white">Diario IA</span>
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <Clock className="hidden font-mono text-sm text-white lg:block" />
        </div>
      </header>

      <main className="mx-auto max-w-[820px] px-5 py-6 md:px-8">
        <div className="mb-6">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-white">Diario del Gestor IA</h1>
          <p className="mt-1 text-sm text-dim">
            La tesis de mercado y las decisiones de la IA en cada ciclo. Lee cómo piensa.
          </p>
        </div>

        {loading ? (
          <p className="text-center text-sm text-muted">Cargando…</p>
        ) : entries.length === 0 ? (
          <div className="rounded-xl border border-industrial bg-soft p-16 text-center">
            <p className="text-base font-medium text-dim">El gestor IA aún no ha escrito nada</p>
            <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
              Activa el <span className="text-accent">Gestor de Cartera IA</span> en el panel. En cada ciclo del cron
              escribirá su tesis y sus decisiones aquí.
            </p>
          </div>
        ) : (
          <div className="relative space-y-4 before:absolute before:left-[7px] before:top-2 before:bottom-2 before:w-px before:bg-industrial">
            {entries.map((e) => (
              <article key={e.id} className="relative pl-7">
                <span className="absolute left-0 top-2 h-3.5 w-3.5 rounded-full border-2 border-ink bg-accent" />
                <div className="rounded-xl border border-industrial bg-soft p-4">
                  <div className="mb-2 flex items-center gap-2">
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
                      {e.actions.map((a: JournalAction, i: number) => (
                        <div key={i} className="flex items-start gap-2 text-[12px]">
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
                          <span className="min-w-0 text-muted [overflow-wrap:anywhere]">{a.reason}</span>
                        </div>
                      ))}
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
