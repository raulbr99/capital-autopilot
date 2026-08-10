"use client";

import { useEffect, useMemo, useState } from "react";
import type { Snapshot, JournalEntry, OpenPos, DeskCategory } from "./types";
import { pnlFmt, fmt, DeskGlyph } from "./ui";
import AppHeader from "./AppHeader";
import SignalMatrix from "./SignalMatrix";
import PositionsTable from "./PositionsTable";
import SentimentBoard from "./SentimentBoard";
import CotPanel from "./CotPanel";

const DESKS: Record<DeskCategory, { label: string; blurb: string }> = {
  forex: { label: "Forex", blurb: "Divisas · 24/5" },
  crypto: { label: "Crypto", blurb: "Cripto · 24/7" },
  stocks: { label: "Stocks", blurb: "Acciones US · sesión de Nueva York" },
  commodities: { label: "Commodities", blurb: "Materias primas · 23/5" },
};

/**
 * Estado de sesión de la mesa según su horario habitual (UTC). Un panel de
 * broker siempre dice si el mercado está abierto AHORA; sin eso, un tablero
 * lleno de "FLAT" parece averiado cuando en realidad está cerrado.
 * Es una estimación por horario: el motor revalida con Capital antes de operar.
 */
function sessionState(cat: DeskCategory, now = new Date()): { open: boolean; label: string } {
  if (cat === "crypto") return { open: true, label: "Mercado abierto · 24/7" };
  const day = now.getUTCDay(); // 0 domingo
  const h = now.getUTCHours() + now.getUTCMinutes() / 60;

  if (cat === "stocks") {
    // Nueva York 13:30–20:00 UTC (horario de verano), L-V
    const open = day >= 1 && day <= 5 && h >= 13.5 && h < 20;
    return { open, label: open ? "Sesión de Nueva York abierta" : "Bolsa de NY cerrada" };
  }
  // Forex y materias primas: de domingo 22:00 UTC a viernes 21:00 UTC
  const open =
    (day > 1 && day < 5) ||
    (day === 1 && h >= 0) ||
    (day === 0 && h >= 22) ||
    (day === 5 && h < 21);
  return { open, label: open ? "Mercado abierto" : "Mercado cerrado · fin de semana" };
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "long" | "short" }) {
  const c = tone === "long" ? "text-long" : tone === "short" ? "text-short" : "text-white";
  return (
    <div className="min-w-0 flex-1 px-4 py-2.5">
      <p className="tag whitespace-nowrap">{label}</p>
      <p className={`mt-0.5 font-mono text-lg font-medium tabular-nums ${c}`}>{value}</p>
      {sub && <p className="mt-0.5 truncate font-mono text-[10px] text-muted">{sub}</p>}
    </div>
  );
}

export default function DeskPage({ category }: { category: DeskCategory }) {
  const meta = DESKS[category];
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [journal, setJournal] = useState<JournalEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [firing, setFiring] = useState(false);
  const [fireMsg, setFireMsg] = useState<{ ok: boolean; text: string; url?: string } | null>(null);

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
  // Exposición nocional y riesgo hasta el stop: las dos cifras que mira un operador
  const exposure = positions.reduce((s, p) => s + Math.abs(p.size * p.entry), 0);
  const riskAtStop = positions.reduce(
    (s, p) => s + (p.stopLevel != null ? Math.abs(p.entry - p.stopLevel) * p.size : 0),
    0
  );
  const maxPerDesk = snap?.state.config.maxPerDesk ?? 4;
  const currency = snap?.account?.currency ?? "";
  const session = sessionState(category);
  const signals = evals.filter((e) => e.signal.type !== "FLAT").length;

  const runGestor = async () => {
    if (firing) return;
    setFiring(true);
    setFireMsg(null);
    try {
      const res = await fetch(`/api/bot/run-gestor?desk=${category}`, { method: "POST" });
      const d = await res.json();
      if (d.ok) setFireMsg({ ok: true, text: "Gestor lanzado — decidirá en ~1 min", url: d.sessionUrl });
      else setFireMsg({ ok: false, text: d.error || "No se pudo lanzar" });
    } catch (e) {
      setFireMsg({ ok: false, text: e instanceof Error ? e.message : "Error de red" });
    } finally {
      setFiring(false);
    }
  };

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
        {/* Barra de mesa: identidad + estado de sesión + acción principal */}
        <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="flex items-center gap-2.5 font-display text-2xl font-semibold tracking-tight text-white">
              <DeskGlyph cat={category} className="h-6 w-6 text-accent" />
              Mesa {meta.label}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${
                  session.open ? "border-long/30 bg-long/10 text-long" : "border-industrial bg-raised text-muted"
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${session.open ? "animate-pulseDot bg-long" : "bg-muted"}`} />
                {session.label}
              </span>
              <span className="text-[11px] text-muted">{meta.blurb}</span>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <button
              onClick={runGestor}
              disabled={firing}
              className="inline-flex items-center gap-2 rounded-lg bg-accent px-3.5 py-2 text-[13px] font-semibold text-onaccent transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {firing ? "Lanzando…" : "▶ Ejecutar Gestor ahora"}
            </button>
            {fireMsg && (
              <p className={`text-right text-xs ${fireMsg.ok ? "text-long" : "text-short"}`}>
                {fireMsg.text}
                {fireMsg.url && (
                  <>
                    {" · "}
                    <a href={fireMsg.url} target="_blank" rel="noreferrer" className="underline hover:text-accent">
                      ver sesión
                    </a>
                  </>
                )}
              </p>
            )}
          </div>
        </div>

        {/* Cifras de la mesa: cupo, exposición, riesgo a stop y resultado abierto */}
        <div className="mb-5 grid grid-cols-2 divide-x divide-industrial overflow-hidden rounded-xl border border-industrial bg-soft sm:grid-cols-4 sm:divide-y-0 [&>*:nth-child(-n+2)]:border-b [&>*:nth-child(-n+2)]:border-industrial sm:[&>*]:border-b-0">
          <Kpi
            label="Posiciones"
            value={`${positions.length}/${maxPerDesk}`}
            sub={positions.length >= maxPerDesk ? "mesa llena" : `${maxPerDesk - positions.length} libres`}
            tone={positions.length > maxPerDesk ? "short" : undefined}
          />
          <Kpi
            label="Exposición"
            value={exposure > 0 ? fmt(exposure, 0) : "—"}
            sub={exposure > 0 ? currency : `${evals.length} activos · ${signals} con señal`}
          />
          <Kpi
            label="Riesgo a stop"
            value={riskAtStop > 0 ? `≈${fmt(riskAtStop)}` : "—"}
            sub={riskAtStop > 0 ? `${currency} si saltan todos` : "sin posiciones"}
          />
          <Kpi
            label="P&L flotante"
            value={pnlFmt(deskPnl)}
            sub={currency}
            tone={Math.abs(deskPnl) < 0.005 ? undefined : deskPnl > 0 ? "long" : "short"}
          />
        </div>

        {category === "stocks" && <SentimentBoard className="mb-5" />}
        {(category === "forex" || category === "commodities") && (
          <CotPanel category={category} className="mb-5" />
        )}

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
                        {e.actions.map((a: any, i: number) => {
                          const run = a.outcome === "opened" || a.outcome === "closed";
                          const blocked = a.outcome === "vetoed" || a.outcome === "skipped" || a.outcome === "error";
                          const cls = blocked
                            ? "bg-industrial text-muted"
                            : a.action === "OPEN"
                            ? "bg-long/15 text-long"
                            : a.action === "CLOSE"
                            ? "bg-short/15 text-short"
                            : "bg-industrial text-muted";
                          const label = a.action === "OPEN" ? "ABRE" : a.action === "CLOSE" ? "CIERRA" : "ESPERA";
                          const mark = run ? "✓ " : a.outcome === "vetoed" ? "✕ " : blocked ? "⊘ " : "";
                          return (
                            <span
                              key={i}
                              title={a.outcomeNote || ""}
                              className={`rounded px-1.5 py-0.5 text-[9px] font-semibold ${cls} ${blocked ? "opacity-70" : ""}`}
                            >
                              {mark}
                              {label} {a.epic || ""}
                            </span>
                          );
                        })}
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
