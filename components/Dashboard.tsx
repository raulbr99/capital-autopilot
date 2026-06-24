"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Snapshot, OpenPos, Analytics as A, TradeRecord } from "./types";
import { fmt, SectionHead, StatCard, Toggle } from "./ui";
import EquityChart from "./EquityChart";
import SignalMatrix from "./SignalMatrix";
import PositionsTable from "./PositionsTable";
import RiskPanel from "./RiskPanel";
import ConfigPanel from "./ConfigPanel";
import BacktestPanel from "./BacktestPanel";
import WalkForward from "./WalkForward";
import Analytics from "./Analytics";
import LogFeed from "./LogFeed";
import CommandPalette, { type Command } from "./CommandPalette";

const TICK_MS = 6000;
const TRADES_MS = 12000;

export default function Dashboard() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [analytics, setAnalytics] = useState<A | null>(null);
  const [trades, setTrades] = useState<TradeRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState("--:--:--");
  const [flash, setFlash] = useState<"long" | "short" | null>(null);
  const prevClosed = useRef(0);
  const prevOpened = useRef(0);

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
      setAnalytics(d.analytics || null);
    } catch {
      /* */
    }
  }, []);

  // arranque + loops + reloj
  useEffect(() => {
    tick(false);
    loadTrades();
    fetch("/api/capital/session").catch(() => {});
    const t1 = setInterval(() => tick(true), TICK_MS);
    const t2 = setInterval(loadTrades, TRADES_MS);
    const t3 = setInterval(
      () => setNow(new Date().toLocaleTimeString("es-ES", { hour12: false })),
      1000
    );
    return () => {
      clearInterval(t1);
      clearInterval(t2);
      clearInterval(t3);
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
      const qs = p.paper ? `paperId=${p.key}` : `dealId=${p.dealId}`;
      await fetch(`/api/capital/positions?${qs}`, { method: "DELETE" });
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
  const dryRun = cfg?.dryRun ?? true;

  const markers = trades
    .filter((t) => t.status === "closed" && t.closedTs)
    .map((t) => ({ ts: t.closedTs!, dir: t.direction, pnl: t.pnl }));

  const commands: Command[] = [
    { id: "toggle", label: enabled ? "Detener piloto" : "Activar piloto", hint: "ENGINE", run: () => patch({ enabled: !enabled }) },
    { id: "mode", label: dryRun ? "Cambiar a LIVE (opera de verdad)" : "Cambiar a PAPER (dry-run)", hint: "MODE", run: () => patch({ dryRun: !dryRun }) },
    { id: "bt", label: "Ir a Backtest", hint: "SCROLL", run: () => document.getElementById("backtest")?.scrollIntoView({ behavior: "smooth" }) },
    { id: "wf", label: "Ir a Walk-Forward (validación)", hint: "SCROLL", run: () => document.getElementById("walkforward")?.scrollIntoView({ behavior: "smooth" }) },
    { id: "perf", label: "Ir a Performance", hint: "SCROLL", run: () => document.getElementById("perf")?.scrollIntoView({ behavior: "smooth" }) },
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

      {/* HEADER */}
      <header className="sticky top-0 z-30 flex h-[64px] items-center justify-between border-b border-industrial bg-ink/85 px-5 backdrop-blur md:px-8">
        <div className="flex items-center gap-3">
          <div className="grid h-8 w-8 place-items-center bg-volt text-ink">
            <span className="font-display text-base leading-none">A</span>
          </div>
          <div>
            <h1 className="font-display text-[15px] leading-none tracking-tight">CAPITAL AUTOPILOT</h1>
            <p className="tag mt-1">MOTOR_DE_POSICIONES_AUTÓNOMAS</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <ModeBadge dryRun={dryRun} />
          {snap?.killedToday && (
            <span className="border border-short bg-short/10 px-2 py-1 font-mono text-[10px] text-short">
              🛑 KILL-SWITCH
            </span>
          )}
          <ConnBadge configured={configured} enabled={enabled} />
          <button
            onClick={() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))}
            className="hidden border border-cement px-2 py-1 font-mono text-[10px] text-muted hover:text-volt md:block"
          >
            ⌘K
          </button>
          <div className="hidden text-right lg:block">
            <p className="font-mono text-sm text-white">{now}</p>
            <p className="tag">DEMO // CAPITAL.COM</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-5 py-6 md:px-8">
        {!configured && <ConfigWarning />}

        {/* HERO */}
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-[380px_1fr]">
          <div className={`relative overflow-hidden border ${enabled ? "border-volt glow-volt" : "border-cement"} bg-soft p-6`}>
            <p className="tag">AUTOPILOT_ENGINE</p>
            <div className="mt-4 flex items-center gap-3">
              <span className={`h-3 w-3 ${enabled ? "bg-long animate-pulseDot" : "bg-muted"}`} />
              <span className={`font-display text-3xl ${enabled ? "text-glow text-volt" : "text-dim"}`}>
                {enabled ? "RUNNING" : "STANDBY"}
              </span>
            </div>
            <p className="mt-2 max-w-[280px] text-xs leading-relaxed text-muted">
              {dryRun
                ? "Modo PAPER: simula entradas/salidas y mide el rendimiento SIN arriesgar. Ideal para ver al bot operar antes de armarlo."
                : "Modo LIVE: abre operaciones reales en tu cuenta DEMO de Capital.com."}
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              <Toggle on={dryRun} busy={busy} labelOn="PAPER" labelOff="LIVE" onClick={() => patch({ dryRun: !dryRun })} />
              <span className="flex items-center gap-1.5 border border-cement px-3 py-1.5 font-mono text-[11px]">
                CRON
                <span className={`h-2 w-2 ${snap?.armed ? "bg-long animate-pulseDot" : "bg-muted"}`} />
                <span className={snap?.armed ? "text-long" : "text-muted"}>
                  {snap?.armed ? "ARMADO" : "OFF"}
                </span>
              </span>
            </div>

            <button
              onClick={() => patch({ enabled: !enabled })}
              disabled={busy || !configured}
              className={`mt-4 w-full px-6 py-4 font-display text-sm tracking-wide transition disabled:opacity-40 ${
                enabled ? "bg-short text-white hover:opacity-90" : "bg-volt text-ink hover:opacity-90"
              }`}
            >
              {enabled ? "■ DETENER PILOTO" : "▶ ACTIVAR PILOTO"}
            </button>

            <div className="mt-5 grid grid-cols-3 gap-px border border-industrial bg-industrial text-center">
              <MiniStat label="SEÑALES" value={snap?.state.stats.signals ?? 0} />
              <MiniStat label="ABIERTAS" value={snap?.state.stats.tradesOpened ?? 0} />
              <MiniStat label="CERRADAS" value={snap?.state.stats.tradesClosed ?? 0} />
            </div>

            {/* guardarrailes en vivo */}
            <div className="mt-3 space-y-1.5 border border-industrial bg-ink p-3 font-mono text-[10px]">
              <Row label="PNL_HOY" value={`${(snap?.dailyPnlPct ?? 0) >= 0 ? "+" : ""}${(snap?.dailyPnlPct ?? 0).toFixed(2)}%`} tone={(snap?.dailyPnlPct ?? 0) >= 0 ? "long" : "short"} />
              <Row label="TRADES_HOY" value={`${snap?.tradesToday ?? 0} / ${cfg?.risk.maxTradesPerDay ?? "—"}`} />
              <Row label="COOLDOWN" value={cooldownLabel(snap?.cooldownUntil ?? 0)} />
            </div>
          </div>

          <div className="border border-industrial bg-soft p-5">
            <div className="mb-3 flex items-end justify-between">
              <div>
                <p className="tag">EQUITY_CURVE {dryRun ? "// PAPER" : "// LIVE"}</p>
                <p className="mt-1 font-display text-3xl">
                  {fmt(lastEquity)} <span className="font-mono text-sm text-muted">{acc?.currency}</span>
                </p>
              </div>
              <PnlPill value={floatPnl} currency={acc?.currency} />
            </div>
            <EquityChart data={equity} markers={markers} />
          </div>
        </section>

        {/* STATS */}
        <section className="mt-4 grid grid-cols-2 gap-px border border-industrial bg-industrial md:grid-cols-4">
          <StatCard label="BALANCE" value={acc ? fmt(acc.balance) : "—"} unit={acc?.currency} />
          <StatCard label="DISPONIBLE" value={acc ? fmt(acc.available) : "—"} unit={acc?.currency} />
          <StatCard label="PNL_FLOTANTE" value={fmt(floatPnl)} unit={acc?.currency} tone={floatPnl >= 0 ? "long" : "short"} />
          <StatCard label="POSICIONES" value={`${positions.length}/${cfg?.maxOpenPositions ?? "—"}`} />
        </section>

        {/* MAIN GRID */}
        <section className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_380px]">
          <div className="space-y-4">
            <SignalMatrix evals={evals} />
            <PositionsTable positions={positions} onClose={closePos} busy={busy} />
            <div id="backtest">
              <BacktestPanel />
            </div>
            <div id="walkforward">
              <WalkForward watchlist={cfg?.watchlist ?? []} />
            </div>
            <div id="perf">
              <Analytics a={analytics} trades={trades} />
            </div>
          </div>

          <div className="space-y-4">
            {cfg && <RiskPanel cfg={cfg} busy={busy} patch={patch} />}
            {cfg && <ConfigPanel cfg={cfg} busy={busy} patch={patch} notifyEnv={snap?.state.notifyEnv ?? { telegram: false, discord: false }} />}
            <LogFeed logs={snap?.state.logs ?? []} />
          </div>
        </section>

        <footer className="mt-8 flex items-center justify-between border-t border-industrial py-5">
          <p className="tag">CAPITAL_AUTOPILOT // BUILD_DEMO</p>
          <p className="tag">⚠ SOLO DEMO — NO ES CONSEJO FINANCIERO</p>
        </footer>
      </main>
    </div>
  );
}

/* ---- helpers UI ---- */

function beep(freq: number) {
  try {
    const Ctx = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
    const ctx = new Ctx();
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

function Ticker({ evals }: { evals: Snapshot["evals"] }) {
  const items = evals.length > 0 ? evals : [{ epic: "—", signal: { type: "FLAT", confidence: 0 } } as any];
  const row = [...items, ...items];
  return (
    <div className="overflow-hidden border-b border-industrial bg-black">
      <div className="flex w-max animate-ticker whitespace-nowrap py-1.5">
        {row.map((e, i) => (
          <span key={i} className="mx-6 inline-flex items-center gap-2 font-mono text-[11px]">
            <span className="text-dim">{e.epic}</span>
            <span className={e.signal.type === "BUY" ? "text-long" : e.signal.type === "SELL" ? "text-short" : "text-muted"}>
              {e.signal.type === "BUY" ? "▲ LONG" : e.signal.type === "SELL" ? "▼ SHORT" : "● FLAT"}
            </span>
            <span className="text-muted">{Math.round((e.signal.confidence ?? 0) * 100)}%</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function ConnBadge({ configured, enabled }: { configured: boolean; enabled: boolean }) {
  const color = !configured ? "bg-short" : enabled ? "bg-long" : "bg-volt";
  const label = !configured ? "SIN_CREDENCIALES" : enabled ? "LIVE" : "CONECTADO";
  return (
    <div className="flex items-center gap-2 border border-cement px-3 py-1.5">
      <span className={`h-2 w-2 ${color} ${enabled ? "animate-pulseDot" : ""}`} />
      <span className="tag !text-dim">{label}</span>
    </div>
  );
}

function ModeBadge({ dryRun }: { dryRun: boolean }) {
  return (
    <span
      className={`px-2 py-1 font-mono text-[10px] ${
        dryRun ? "bg-volt/10 text-volt" : "bg-short/15 text-short"
      }`}
    >
      {dryRun ? "📝 PAPER" : "💸 LIVE"}
    </span>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-soft py-3">
      <p className="font-display text-xl text-white">{value}</p>
      <p className="tag mt-0.5">{label}</p>
    </div>
  );
}

function PnlPill({ value, currency }: { value: number; currency?: string }) {
  const pos = value >= 0;
  return (
    <div className={`border px-3 py-2 text-right ${pos ? "border-long/40 bg-long/5" : "border-short/40 bg-short/5"}`}>
      <p className="tag">PNL_FLOTANTE</p>
      <p className={`font-mono text-lg ${pos ? "text-long" : "text-short"}`}>
        {pos ? "+" : ""}
        {fmt(value)} {currency}
      </p>
    </div>
  );
}

function ConfigWarning() {
  return (
    <div className="mb-5 border border-short/40 bg-short/5 p-4">
      <p className="font-display text-sm text-short">⚠ CREDENCIALES NO CONFIGURADAS</p>
      <p className="mt-2 text-xs leading-relaxed text-dim">
        Copia <code className="bg-industrial px-1 font-mono text-volt">.env.local.example</code> a{" "}
        <code className="bg-industrial px-1 font-mono text-volt">.env.local</code> con tus credenciales DEMO de Capital.com.
        El dashboard funciona en modo PAPER local hasta entonces.
      </p>
    </div>
  );
}
