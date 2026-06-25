"use client";

import { useEffect, useMemo, useState } from "react";
import type { Snapshot, JournalEntry, OpenPos, DeskCategory } from "./types";
import { pnlFmt, DeskGlyph } from "./ui";
import AppHeader from "./AppHeader";
import SignalMatrix from "./SignalMatrix";
import PositionsTable from "./PositionsTable";

const DESKS: Record<DeskCategory, { label: string; blurb: string }> = {
  forex: { label: "Forex", blurb: "Divisas · operan 24/5" },
  crypto: { label: "Crypto", blurb: "Cripto · 24/7" },
  stocks: { label: "Stocks", blurb: "Acciones US · horario NY (15:30–22:00 Madrid)" },
  commodities: { label: "Commodities", blurb: "Materias primas" },
};

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "long" | "short" }) {
  const c = tone === "long" ? "text-long" : tone === "short" ? "text-short" : "text-white";
  return (
    <div className="rounded-lg border border-industrial bg-soft px-4 py-2">
      <p className="tag">{label}</p>
      <p className={`mt-0.5 font-mono text-lg font-medium tabular-nums ${c}`}>{value}</p>
    </div>
  );
}

export default function DeskPage({ category }: { category: DeskCategory }) {
  const meta = DESKS[category];
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [journal, setJournal] = useState<JournalEntry[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const [s, j] = await Promise.all([
          fetch("/api/bot/tick").then((r) => r.json()),
          fetch("/api/bot/journal").then((r) => r.json()),
        ]);
        setSnap(s);
        setJournal(((j.entries || []) as JournalEntry[]).filter((e: any) => (e.desk || null) === category));
      } catch {
        /* */
      }
    };
    load();
    const t = setInterval(load, 12000);
    return () => clearInterval(t);
  }, [category]);

  const instruments = snap?.state.config.instruments ?? [];
  const epicCat = useMemo(() => {
    const m = new Map<string, string>();
    instruments.forEach((i) => m.set(i.epic, i.category || ""));
    return m;
  }, [instruments]);

  const evals = (snap?.evals ?? []).filter((e) => epicCat.get(e.epic) === category);
  const positions = (snap?.openPositions ?? []).filter((p) => epicCat.get(p.epic) === category);
  const deskPnl = positions.reduce((s, p) => s + (p.upl || 0), 0);

  const closePos = async (p: OpenPos) => {
    if (!p.dealId || busy) return;
    setBusy(true);
    try {
      await fetch(`/api/capital/positions?dealId=${p.dealId}`, { method: "DELETE" });
    } catch {
      /* */
    }
    setBusy(false);
  };

  return (
    <div className="min-h-screen">
      <AppHeader active={`/${category}`} />

      <main className="mx-auto max-w-[1100px] px-5 py-6 md:px-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2.5 font-display text-2xl font-semibold tracking-tight text-white">
              <DeskGlyph cat={category} className="h-6 w-6 text-accent" />
              Mesa {meta.label}
            </h1>
            <p className="mt-1 text-sm text-dim">{meta.blurb}</p>
          </div>
          <div className="flex gap-2">
            <Kpi label="Activos" value={String(evals.length)} />
            <Kpi label="Posiciones" value={String(positions.length)} />
            <Kpi
              label="P&L flotante"
              value={pnlFmt(deskPnl)}
              tone={Math.abs(deskPnl) < 0.005 ? undefined : deskPnl > 0 ? "long" : "short"}
            />
          </div>
        </div>

        <div className={`grid gap-5 ${journal.length > 0 ? "lg:grid-cols-[1fr_340px]" : "grid-cols-1"}`}>
          <div className="min-w-0 space-y-5">
            <SignalMatrix evals={evals} />
            <PositionsTable positions={positions} onClose={closePos} busy={busy} />
            {journal.length === 0 && (
              <div className="dotgrid rounded-xl border border-industrial bg-soft px-5 py-7 text-center">
                <p className="text-sm font-medium text-dim">El gestor IA de {meta.label} decide cada hora</p>
                <p className="mx-auto mt-1.5 max-w-md text-xs leading-relaxed text-muted">
                  Sus tesis de mercado y operaciones aparecerán aquí, y también en el{" "}
                  <a href="/journal" className="text-accent underline">Diario IA</a>.
                </p>
              </div>
            )}
          </div>

          {journal.length > 0 && (
            <div className="overflow-hidden rounded-xl border border-industrial bg-soft">
              <div className="flex items-center justify-between border-b border-industrial px-5 py-3.5">
                <h2 className="tag">Gestor {meta.label} · decisiones</h2>
                <span className="h-1.5 w-1.5 rounded-full bg-accent/70" />
              </div>
              <div className="max-h-[600px] space-y-2 overflow-y-auto p-3">
                {journal.map((e) => (
                  <div key={e.id} className="rounded-lg border border-industrial bg-base p-3">
                    <div className="mb-1 flex items-center gap-2">
                      <span className="font-mono text-[10px] text-muted">
                        {new Date(e.ts).toLocaleString("es-ES", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })}
                      </span>
                      <span className="rounded bg-accent/10 px-1.5 py-0.5 text-[9px] text-accent">
                        conf {Math.round((e.confidence || 0) * 100)}%
                      </span>
                    </div>
                    <p className="text-[12px] leading-relaxed text-dim [overflow-wrap:anywhere]">{e.thesis}</p>
                    {Array.isArray(e.actions) && e.actions.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {e.actions.map((a: any, i: number) => (
                          <span
                            key={i}
                            className={`rounded px-1.5 py-0.5 text-[9px] font-semibold ${
                              a.action === "OPEN" ? "bg-long/15 text-long" : a.action === "CLOSE" ? "bg-short/15 text-short" : "bg-industrial text-muted"
                            }`}
                          >
                            {a.action === "OPEN" ? "ABRE" : a.action === "CLOSE" ? "CIERRA" : "ESPERA"} {a.epic || ""}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
