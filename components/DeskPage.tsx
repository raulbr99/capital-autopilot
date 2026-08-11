"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Snapshot, JournalEntry, OpenPos, DeskCategory } from "./types";
import { pnlFmt, fmt, DeskGlyph, deskSession, usePoll, positionRisk, deskMap } from "./ui";
import AppHeader from "./AppHeader";
import SignalMatrix from "./SignalMatrix";
import PositionsTable from "./PositionsTable";
import SentimentBoard from "./SentimentBoard";
import CotPanel from "./CotPanel";
import JournalEntryCard from "./JournalEntryCard";

const DESKS: Record<DeskCategory, { label: string; blurb: string }> = {
  forex: { label: "Forex", blurb: "Divisas · 24/5" },
  crypto: { label: "Crypto", blurb: "Cripto · 24/7" },
  stocks: { label: "Stocks", blurb: "Acciones US · sesión de Nueva York" },
  commodities: { label: "Commodities", blurb: "Materias primas · 23/5" },
};

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
  // Momento del disparo: sirve para reconocer la decisión que llegue DESPUÉS
  const [firedAt, setFiredAt] = useState<number | null>(null);
  const [esperaSeg, setEsperaSeg] = useState(0);

  const load = useCallback(async () => {
    try {
      const [s, j] = await Promise.all([
        fetch("/api/bot/tick").then((r) => r.json()),
        fetch("/api/bot/journal").then((r) => r.json()),
      ]);
      setSnap(s);
      setJournal(((j.entries || []) as JournalEntry[]).filter((e) => (e.desk || null) === category));
    } catch {
      /* */
    }
  }, [category]);

  usePoll(load, 12000, [load]);

  // Mientras se espera al Gestor, un contador — y en cuanto aparece una entrada
  // de diario POSTERIOR al disparo, se anuncia. Antes el botón decía "decidirá
  // en ~1 min" y te dejaba ahí: sin saber si llegó, falló, o qué decidió.
  useEffect(() => {
    if (!firedAt) return;
    const t = setInterval(() => setEsperaSeg(Math.floor((Date.now() - firedAt) / 1000)), 1000);
    return () => clearInterval(t);
  }, [firedAt]);

  const decisionNueva = useMemo(
    () => (firedAt ? journal.find((e) => new Date(e.ts).getTime() > firedAt) : undefined),
    [journal, firedAt]
  );

  useEffect(() => {
    if (!decisionNueva) return;
    const n = (decisionNueva.actions || []).filter(
      (a) => a.outcome === "opened" || a.outcome === "closed"
    ).length;
    setFireMsg({
      ok: true,
      text: n ? `Decisión recibida · ${n} operación${n > 1 ? "es" : ""}` : "Decisión recibida · sin operar",
    });
    setFiredAt(null);
  }, [decisionNueva]);

  const instruments = snap?.state.config.instruments ?? [];
  const epicCat = useMemo(() => deskMap(instruments), [instruments]);

  const evals = (snap?.evals ?? []).filter((e) => epicCat.get(e.epic) === category);
  const positions = (snap?.openPositions ?? []).filter((p) => epicCat.get(p.epic) === category);
  const deskPnl = positions.reduce((s, p) => s + (p.upl || 0), 0);
  // Exposición nocional y riesgo hasta el stop: las dos cifras que mira un operador
  const exposure = positions.reduce((s, p) => s + Math.abs(p.size * p.entry), 0);
  const riskAtStop = positions.reduce((s, p) => s + (positionRisk(p).risk ?? 0), 0);
  const maxPerDesk = snap?.state.config.maxPerDesk ?? 4;
  const currency = snap?.account?.currency ?? "";
  const session = deskSession(category);
  const signals = evals.filter((e) => e.signal.type !== "FLAT").length;

  const runGestor = async () => {
    if (firing) return;
    setFiring(true);
    setFireMsg(null);
    try {
      const res = await fetch(`/api/bot/run-gestor?desk=${category}`, { method: "POST" });
      const d = await res.json();
      if (d.ok) {
        setFireMsg({ ok: true, text: "Gestor lanzado — pensando…", url: d.sessionUrl });
        setFiredAt(Date.now());
        setEsperaSeg(0);
      } else setFireMsg({ ok: false, text: d.error || "No se pudo lanzar" });
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
            {firedAt != null && (
              <p className="flex items-center gap-1.5 text-right text-xs text-accent">
                <span className="h-1.5 w-1.5 animate-pulseDot rounded-full bg-accent" />
                Pensando… {esperaSeg}s
              </p>
            )}
            {fireMsg && firedAt == null && (
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

        {category === "stocks" && <SentimentBoard className="mb-5" evals={evals} />}
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
                  <JournalEntryCard key={e.id} entry={e} compact />
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
