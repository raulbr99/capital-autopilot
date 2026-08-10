"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Snapshot, OpenPos, TradeRecord, Instrument } from "./types";
import { fmt, pnlFmt, pnlClass, SectionHead, StatCard, DeskGlyph } from "./ui";
import EquityChart from "./EquityChart";
import PositionsTable from "./PositionsTable";
import RiskPanel from "./RiskPanel";
import LogFeed from "./LogFeed";
import ExpectancyPanel from "./ExpectancyPanel";
import CommandPalette, { type Command } from "./CommandPalette";
import AppHeader from "./AppHeader";
import Link from "next/link";

const TICK_MS = 6000;
const TRADES_MS = 12000;

export default function Dashboard() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [trades, setTrades] = useState<TradeRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<"long" | "short" | null>(null);
  const prevClosed = useRef(0);
  const prevOpened = useRef(0);
  const router = useRouter();

  const tick = useCallback(async (active: boolean) => {
    try {
      const res = await fetch("/api/bot/tick", { method: active ? "POST" : "GET" });
      const data: Snapshot = await res.json();
      if (!(data as any).error) setSnap(data);
    } catch {
      /* transient */
    }
  }, []);

  const loadTrades = useCallback(async () => {
    try {
      const r = await fetch("/api/bot/trades");
      const d = await r.json();
      setTrades(d.trades || []);
    } catch {
      /* */
    }
  }, []);

  // arranque + loops + reloj
  useEffect(() => {
    tick(false);
    loadTrades();
    fetch("/api/capital/session").catch(() => {});
    // solo-lectura: el navegador NO opera (evita gastar IA cada 6s).
    // El trading autónomo lo dispara el cron cada 15 min.
    const t1 = setInterval(() => tick(false), TICK_MS);
    const t2 = setInterval(loadTrades, TRADES_MS);
    return () => {
      clearInterval(t1);
      clearInterval(t2);
    };
  }, [tick, loadTrades]);

  // alertas: flash + beep cuando cambian aperturas/cierres
  useEffect(() => {
    if (!snap) return;
    const o = snap.state.stats.tradesOpened;
    const c = snap.state.stats.tradesClosed;
    if (prevOpened.current && o > prevOpened.current) {
      setFlash("long");
      beep(660);
      loadTrades();
      setTimeout(() => setFlash(null), 600);
    } else if (prevClosed.current && c > prevClosed.current) {
      setFlash("short");
      beep(440);
      loadTrades();
      setTimeout(() => setFlash(null), 600);
    }
    prevOpened.current = o;
    prevClosed.current = c;
  }, [snap, loadTrades]);

  const patch = useCallback(
    async (body: any) => {
      setBusy(true);
      try {
        await fetch("/api/bot", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        await tick(false);
      } finally {
        setBusy(false);
      }
    },
    [tick]
  );

  const closePos = async (p: OpenPos) => {
    setBusy(true);
    try {
      await fetch(`/api/capital/positions?dealId=${p.dealId}`, { method: "DELETE" });
      await tick(false);
      await loadTrades();
    } finally {
      setBusy(false);
    }
  };

  const cfg = snap?.state.config;
  const acc = snap?.account;
  const positions = snap?.openPositions ?? [];
  const evals = snap?.evals ?? [];
  const floatPnl = positions.reduce((s, p) => s + (p.upl || 0), 0);
  const equity = snap?.state.equity ?? [];
  const lastEquity = equity.length ? equity[equity.length - 1].equity : 0;
  const configured = snap?.configured ?? true;
  const enabled = cfg?.enabled ?? false;

  // Riesgo agregado (para vigilar dinero real)
  const openRisk = positions.reduce(
    (s, p) => s + (p.stopLevel != null ? Math.abs(p.entry - p.stopLevel) * p.size : 0),
    0
  );
  const dayPnlPct = snap?.dailyPnlPct ?? 0;
  const killPct = cfg?.risk.maxDailyLossPct ?? 0;
  const lossUsed = dayPnlPct < 0 ? Math.min(-dayPnlPct / killPct, 1) : 0; // 0..1 del presupuesto de pérdida diaria

  // Límite por mesa (sin límite global): rojo si alguna mesa excede su cupo
  const deskFull = (() => {
    if (!cfg) return false;
    const byDesk: Record<string, number> = {};
    for (const p of positions) {
      const d = cfg.instruments.find((i) => i.epic === p.epic)?.category || "otros";
      byDesk[d] = (byDesk[d] || 0) + 1;
    }
    return Object.values(byDesk).some((n) => n > cfg.maxPerDesk);
  })();

  const markers = trades
    .filter((t) => t.status === "closed" && t.closedTs)
    .map((t) => ({ ts: t.closedTs!, dir: t.direction, pnl: t.pnl }));

  const commands: Command[] = [
    { id: "toggle", label: enabled ? "Detener piloto" : "Activar piloto", hint: "ENGINE", run: () => patch({ enabled: !enabled }) },
    { id: "lab", label: "Ir al Lab (estrategia + ajustes)", hint: "PÁGINA", run: () => router.push("/lab") },
    { id: "perf", label: "Ir a Analítica", hint: "PÁGINA", run: () => router.push("/analytics") },
    { id: "journal", label: "Ir al Diario IA", hint: "PÁGINA", run: () => router.push("/journal") },
    { id: "atr", label: "Toggle SL/TP por ATR", hint: "RISK", run: () => patch({ risk: { useAtrStops: !cfg?.risk.useAtrStops } }) },
  ];

  return (
    <div className="min-h-screen grid-bg">
      {flash && (
        <div
          className={`pointer-events-none fixed inset-0 z-40 ${
            flash === "long" ? "bg-long/10" : "bg-short/10"
          }`}
        />
      )}
      <CommandPalette commands={commands} />

      <Ticker evals={evals} />

      <AppHeader
        active="/"
        live={{
          equity: lastEquity || null,
          dayPnlPct,
          currency: acc?.currency ?? "",
          configured,
          enabled,
        }}
        right={
          <>
            {snap?.killedToday && (
              <span className="rounded border border-short bg-short/10 px-2 py-1 font-mono text-[10px] text-short">
                🛑 KILL
              </span>
            )}
            <button
              onClick={() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))}
              className="hidden rounded-md border border-industrial px-2 py-1 font-mono text-[10px] text-muted transition-colors hover:border-cement hover:text-dim md:block"
            >
              ⌘K
            </button>
          </>
        }
      />

      <main className="mx-auto max-w-[1400px] overflow-x-clip px-5 py-6 md:px-8">
        {!configured && <ConfigWarning />}

        {/* HERO */}
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-[380px_1fr]">
          <div className={`relative min-w-0 overflow-hidden rounded-xl border bg-soft p-6 transition-shadow ${enabled ? "border-accent/40 ring-accent" : "border-industrial"}`}>
            <p className="tag">Motor</p>
            <div className="mt-4 flex items-center gap-2.5">
              <span className={`h-2.5 w-2.5 rounded-full ${enabled ? "animate-pulseDot bg-long" : "bg-muted"}`} />
              <span className={`font-display text-3xl font-semibold tracking-tight ${enabled ? "text-white" : "text-dim"}`}>
                {enabled ? "Activo" : "En espera"}
              </span>
            </div>
            <p className="mt-2 max-w-[280px] text-xs leading-relaxed text-muted">
              Opera en tu cuenta real de Capital.com con las señales validadas. Las órdenes son reales.
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              <span className="flex items-center gap-1.5 rounded-lg border border-industrial px-3 py-2 text-xs font-medium text-dim">
                Cron 24/7
                <span className={`h-2 w-2 rounded-full ${snap?.armed ? "animate-pulseDot bg-long" : "bg-muted"}`} />
                <span className={snap?.armed ? "text-long" : "text-muted"}>
                  {snap?.armed ? "armado" : "off"}
                </span>
              </span>
            </div>

            <button
              onClick={() => patch({ enabled: !enabled })}
              disabled={busy || !configured}
              className={`mt-4 w-full rounded-lg px-6 py-3.5 text-sm font-semibold transition-opacity disabled:opacity-40 ${
                enabled ? "bg-short text-[#fff] hover:opacity-90" : "bg-accent text-onaccent hover:opacity-90"
              }`}
            >
              {enabled ? "Detener piloto" : "Activar piloto"}
            </button>

            {/* lo que importa HOY (no contadores de por vida) */}
            <div className="mt-5 grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-industrial bg-industrial text-center">
              <MiniStat
                label="PNL HOY"
                value={`${dayPnlPct >= 0 ? "+" : ""}${dayPnlPct.toFixed(2)}%`}
                tone={Math.abs(dayPnlPct) < 0.005 ? undefined : dayPnlPct > 0 ? "long" : "short"}
              />
              <MiniStat label="TRADES HOY" value={`${snap?.tradesToday ?? 0}/${cfg?.risk.maxTradesPerDay ?? "—"}`} />
              <MiniStat
                label="POSICIONES"
                value={`${positions.length}`}
                tone={deskFull ? "short" : undefined}
              />
            </div>

            {/* guardarrailes en vivo */}
            <div className="mt-3 space-y-2 rounded-lg border border-industrial bg-base p-3.5 text-xs">
              <Row label="Riesgo abierto" value={openRisk > 0 ? `≈${fmt(openRisk)} ${acc?.currency ?? ""}` : "—"} />
              <Row label="Cooldown" value={cooldownLabel(snap?.cooldownUntil ?? 0)} />
              {killPct > 0 ? (
                <div className="pt-1.5">
                  <div className="mb-1 flex items-center justify-between text-[10px] text-muted">
                    <span>Margen al freno diario (−{killPct}%)</span>
                    <span className={lossUsed > 0.7 ? "text-short" : "text-dim"}>{(lossUsed * 100).toFixed(0)}% usado</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-industrial">
                    <div
                      className={`h-full rounded-full transition-all ${lossUsed > 0.7 ? "bg-short" : lossUsed > 0.4 ? "bg-accent" : "bg-long"}`}
                      style={{ width: `${Math.max(2, lossUsed * 100)}%` }}
                    />
                  </div>
                </div>
              ) : (
                <Row label="Freno diario" value="desactivado" />
              )}
            </div>
          </div>

          <div className="min-w-0 overflow-hidden rounded-xl border border-industrial bg-soft p-5">
            <div className="mb-3 flex items-end justify-between">
              <div>
                <p className="tag">Equity</p>
                <p className="mt-1.5 font-mono text-3xl font-medium tracking-tight text-white">
                  {fmt(lastEquity)} <span className="text-sm font-normal text-muted">{acc?.currency}</span>
                </p>
              </div>
            </div>
            <EquityChart data={equity} markers={markers} />
          </div>
        </section>

        {/* STATS */}
        <section className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-industrial bg-industrial md:grid-cols-4">
          <StatCard label="Efectivo" value={acc ? fmt(acc.deposit) : "—"} unit={acc?.currency} />
          <StatCard label="Disponible" value={acc ? fmt(acc.available) : "—"} unit={acc?.currency} />
          <StatCard label="PnL flotante" value={pnlFmt(floatPnl)} unit={acc?.currency} tone={Math.abs(floatPnl) < 0.005 ? undefined : floatPnl > 0 ? "long" : "short"} />
          <StatCard
            label="Posiciones"
            value={`${positions.length}`}
            unit={deskFull ? "mesa sobre el límite" : cfg ? `máx ${cfg.maxPerDesk}/mesa` : undefined}
            tone={deskFull ? "short" : undefined}
          />
        </section>

        {/* ACTIVIDAD + RIESGO — triage: lo accionable justo después del dinero */}
        <section className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_380px]">
          <div className="min-w-0 space-y-4">
            <PositionsTable positions={positions} onClose={closePos} busy={busy} />
            <LogFeed logs={snap?.state.logs ?? []} />
          </div>

          <div className="min-w-0 space-y-4">
            {cfg && <RiskPanel cfg={cfg} busy={busy} patch={patch} />}
            <Link
              href="/lab"
              className="block rounded-xl border border-industrial bg-soft p-5 transition-colors hover:border-cement"
            >
              <p className="tag">Herramientas</p>
              <p className="mt-1.5 font-display text-base font-semibold text-white">Lab — estrategia y ajustes</p>
              <p className="mt-1 text-xs text-muted">Configuración del bot, backtest y validación walk-forward.</p>
              <p className="mt-2 text-xs font-medium text-accent">Abrir →</p>
            </Link>
          </div>
        </section>

        {/* LAS 4 MESAS */}
        <DesksOverview evals={evals} positions={positions} instruments={cfg?.instruments ?? []} />

        {/* EXPECTATIVA REAL (análisis, no triage) */}
        <ExpectancyPanel className="mt-4" />

        <footer className="mt-10 flex flex-col items-center justify-between gap-2 border-t border-industrial py-6 text-[11px] text-muted sm:flex-row">
          <p>Capital Autopilot</p>
          <p>Cuenta real · órdenes reales · no es consejo financiero</p>
        </footer>
      </main>
    </div>
  );
}

/* ---- helpers UI ---- */

let _audioCtx: AudioContext | null = null;
function beep(freq: number) {
  try {
    const Ctx = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
    if (!_audioCtx) _audioCtx = new Ctx();
    const ctx = _audioCtx;
    if (ctx.state === "suspended") void ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = freq;
    osc.type = "square";
    gain.gain.value = 0.04;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
  } catch {
    /* sin audio */
  }
}

function cooldownLabel(until: number) {
  const ms = until - Date.now();
  if (ms <= 0) return "—";
  const m = Math.ceil(ms / 60000);
  return `${m} min`;
}

function Row({ label, value, tone }: { label: string; value: string; tone?: "long" | "short" }) {
  const c = tone === "long" ? "text-long" : tone === "short" ? "text-short" : "text-dim";
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted">{label}</span>
      <span className={c}>{value}</span>
    </div>
  );
}

const DESK_META = [
  { key: "forex", label: "Forex" },
  { key: "crypto", label: "Crypto" },
  { key: "stocks", label: "Stocks" },
  { key: "commodities", label: "Commodities" },
] as const;

function DesksOverview({
  evals,
  positions,
  instruments,
}: {
  evals: Snapshot["evals"];
  positions: OpenPos[];
  instruments: Instrument[];
}) {
  const catOf = (epic: string) => instruments.find((i) => i.epic === epic)?.category;
  // posiciones de activos que ya no están en el universo (quedaron abiertas al podarlo)
  const legacy = positions.filter((p) => !catOf(p.epic));
  return (
    <section className="mt-4">
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {DESK_META.map((d) => {
        const ev = evals.filter((e) => catOf(e.epic) === d.key);
        const pos = positions.filter((p) => catOf(p.epic) === d.key);
        const pnl = pos.reduce((s, p) => s + (p.upl || 0), 0);
        const longs = ev.filter((e) => e.signal?.type === "BUY").length;
        const shorts = ev.filter((e) => e.signal?.type === "SELL").length;
        return (
          <Link
            key={d.key}
            href={`/${d.key}`}
            className="group min-w-0 rounded-xl border border-industrial bg-soft p-4 transition-colors hover:border-cement"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-1.5 font-display text-sm font-semibold text-white">
                <DeskGlyph cat={d.key} className="h-4 w-4 shrink-0 text-accent" />
                <span className="truncate">{d.label}</span>
              </span>
              <span className="shrink-0 font-mono text-[10px] text-muted transition-colors group-hover:text-accent">
                {ev.length} →
              </span>
            </div>
            <div className="mt-3 flex items-end justify-between">
              <div>
                <p className="tag">Posiciones</p>
                <p className="mt-0.5 font-mono text-lg font-medium text-white">{pos.length}</p>
              </div>
              <div className="text-right">
                <p className="tag">P&amp;L</p>
                <p className={`mt-0.5 font-mono text-lg font-medium ${pnlClass(pnl)}`}>{pnlFmt(pnl)}</p>
              </div>
            </div>
            {(longs > 0 || shorts > 0) && (
              <p className="mt-2 font-mono text-[10px] text-muted">
                {longs > 0 && <span className="text-long">{longs}▲ </span>}
                {shorts > 0 && <span className="text-short">{shorts}▼ </span>}
                señales
              </p>
            )}
          </Link>
        );
      })}
    </div>
    {legacy.length > 0 && (
      <p className="mt-2 font-mono text-[11px] text-muted">
        + {legacy.length} posición{legacy.length > 1 ? "es" : ""} de activos fuera del universo actual (
        {legacy.map((p) => p.epic).join(", ")}) — se gestionan hasta su cierre, no se reabren.
      </p>
    )}
    </section>
  );
}

function Ticker({ evals }: { evals: Snapshot["evals"] }) {
  const items = evals.length > 0 ? evals : [{ epic: "—", signal: { type: "FLAT", confidence: 0 } } as any];
  const row = [...items, ...items];
  return (
    <div className="overflow-hidden border-b border-industrial bg-base">
      <div className="flex w-max animate-ticker whitespace-nowrap py-2">
        {row.map((e, i) => (
          <span key={i} className="mx-5 inline-flex items-center gap-2 font-mono text-[11px]">
            <span className="text-dim">{e.epic}</span>
            <span className={e.signal.type === "BUY" ? "text-long" : e.signal.type === "SELL" ? "text-short" : "text-muted"}>
              {e.signal.type === "BUY" ? "▲ long" : e.signal.type === "SELL" ? "▼ short" : "· flat"}
            </span>
            <span className="text-muted">{Math.round((e.signal.confidence ?? 0) * 100)}%</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: string | number; tone?: "long" | "short" }) {
  const c = tone === "long" ? "text-long" : tone === "short" ? "text-short" : "text-white";
  return (
    <div className="bg-soft py-3.5">
      <p className={`font-mono text-xl font-medium tabular-nums ${c}`}>{value}</p>
      <p className="tag mt-0.5">{label}</p>
    </div>
  );
}

function PnlPill({ value, currency }: { value: number; currency?: string }) {
  const pos = value >= 0;
  return (
    <div className={`rounded-lg border px-3.5 py-2 text-right ${pos ? "border-long/30 bg-long/5" : "border-short/30 bg-short/5"}`}>
      <p className="tag">PnL flotante</p>
      <p className={`font-mono text-lg font-medium ${pos ? "text-long" : "text-short"}`}>
        {pos ? "+" : ""}
        {fmt(value)} {currency}
      </p>
    </div>
  );
}

function ConfigWarning() {
  return (
    <div className="mb-5 rounded-xl border border-short/30 bg-short/5 p-4">
      <p className="text-sm font-semibold text-short">Credenciales no configuradas</p>
      <p className="mt-2 text-xs leading-relaxed text-dim">
        Copia <code className="rounded bg-industrial px-1 font-mono text-accent">.env.local.example</code> a{" "}
        <code className="rounded bg-industrial px-1 font-mono text-accent">.env.local</code> con tus credenciales de Capital.com.
        El panel no podrá operar hasta entonces.
      </p>
    </div>
  );
}
