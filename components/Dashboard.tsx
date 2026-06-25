"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Snapshot, OpenPos, Analytics as A, TradeRecord, Instrument } from "./types";
import { fmt, pnlFmt, pnlClass, SectionHead, StatCard, Clock, DeskGlyph } from "./ui";
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
import ThemeToggle from "./ThemeToggle";
import Nav from "./Nav";
import Link from "next/link";

const TICK_MS = 6000;
const TRADES_MS = 12000;

export default function Dashboard() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [analytics, setAnalytics] = useState<A | null>(null);
  const [trades, setTrades] = useState<TradeRecord[]>([]);
  const [busy, setBusy] = useState(false);
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

  const markers = trades
    .filter((t) => t.status === "closed" && t.closedTs)
    .map((t) => ({ ts: t.closedTs!, dir: t.direction, pnl: t.pnl }));

  const commands: Command[] = [
    { id: "toggle", label: enabled ? "Detener piloto" : "Activar piloto", hint: "ENGINE", run: () => patch({ enabled: !enabled }) },
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
        <div className="flex items-center gap-5">
          <div className="flex items-center gap-3">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-onaccent">
              <span className="font-display text-base font-bold leading-none">A</span>
            </div>
            <div>
              <h1 className="font-display text-[15px] font-semibold leading-none tracking-tight text-white">
                Capital Autopilot
              </h1>
              <p className="mt-1 text-[11px] text-muted">Trading autónomo · Capital.com</p>
            </div>
          </div>
          <div className="hidden md:block">
            <Nav active="/" />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 rounded-md bg-accent/12 px-2.5 py-1 text-[11px] font-semibold text-accent">
            <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulseDot" />
            LIVE · real
          </span>
          {snap?.killedToday && (
            <span className="border border-short bg-short/10 px-2 py-1 font-mono text-[10px] text-short">
              🛑 KILL-SWITCH
            </span>
          )}
          <ConnBadge configured={configured} enabled={enabled} />
          <ThemeToggle />
          <button
            onClick={() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))}
            className="hidden rounded-md border border-industrial px-2 py-1 font-mono text-[10px] text-muted transition-colors hover:border-cement hover:text-dim md:block"
          >
            ⌘K
          </button>
          <div className="hidden text-right lg:block">
            <Clock className="font-mono text-sm text-white" />
            <p className="tag">Capital.com</p>
          </div>
        </div>
      </header>

      {/* Nav en móvil (en escritorio va en el header) */}
      <div className="sticky top-[64px] z-20 border-b border-industrial bg-ink/80 px-4 py-2 backdrop-blur md:hidden">
        <Nav active="/" />
      </div>

      <main className="mx-auto max-w-[1400px] px-5 py-6 md:px-8">
        {!configured && <ConfigWarning />}

        {/* HERO */}
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-[380px_1fr]">
          <div className={`relative overflow-hidden rounded-xl border bg-soft p-6 transition-shadow ${enabled ? "border-accent/40 ring-accent" : "border-industrial"}`}>
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

            <div className="mt-5 grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-industrial bg-industrial text-center">
              <MiniStat label="SEÑALES" value={snap?.state.stats.signals ?? 0} />
              <MiniStat label="ABIERTAS" value={snap?.state.stats.tradesOpened ?? 0} />
              <MiniStat label="CERRADAS" value={snap?.state.stats.tradesClosed ?? 0} />
            </div>

            {/* guardarrailes en vivo */}
            <div className="mt-3 space-y-2 rounded-lg border border-industrial bg-base p-3.5 text-xs">
              <Row label="PnL hoy" value={`${(snap?.dailyPnlPct ?? 0) >= 0 ? "+" : ""}${(snap?.dailyPnlPct ?? 0).toFixed(2)}%`} tone={(snap?.dailyPnlPct ?? 0) >= 0 ? "long" : "short"} />
              <Row label="Trades hoy" value={`${snap?.tradesToday ?? 0} / ${cfg?.risk.maxTradesPerDay ?? "—"}`} />
              <Row label="Cooldown" value={cooldownLabel(snap?.cooldownUntil ?? 0)} />
            </div>
          </div>

          <div className="rounded-xl border border-industrial bg-soft p-5">
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
          <StatCard label="Balance" value={acc ? fmt(acc.balance) : "—"} unit={acc?.currency} />
          <StatCard label="Disponible" value={acc ? fmt(acc.available) : "—"} unit={acc?.currency} />
          <StatCard label="PnL flotante" value={pnlFmt(floatPnl)} unit={acc?.currency} tone={Math.abs(floatPnl) < 0.005 ? undefined : floatPnl > 0 ? "long" : "short"} />
          <StatCard label="Posiciones" value={`${positions.length}/${cfg?.maxOpenPositions ?? "—"}`} />
        </section>

        {/* LAS 4 MESAS */}
        <DesksOverview evals={evals} positions={positions} instruments={cfg?.instruments ?? []} />

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
            <LogFeed logs={snap?.state.logs ?? []} />
            {cfg && <RiskPanel cfg={cfg} busy={busy} patch={patch} />}
            {cfg && <ConfigPanel cfg={cfg} busy={busy} patch={patch} notifyEnv={snap?.state.notifyEnv ?? { telegram: false, discord: false }} />}
          </div>
        </section>

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
  return (
    <section className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
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
            className="group rounded-xl border border-industrial bg-soft p-4 transition-colors hover:border-cement"
          >
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 font-display text-sm font-semibold text-white">
                <DeskGlyph cat={d.key} className="h-4 w-4 text-accent" />
                {d.label}
              </span>
              <span className="font-mono text-[10px] text-muted transition-colors group-hover:text-accent">
                {ev.length} activos →
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

function ConnBadge({ configured, enabled }: { configured: boolean; enabled: boolean }) {
  const color = !configured ? "bg-short" : enabled ? "bg-long" : "bg-accent";
  const label = !configured ? "sin credenciales" : enabled ? "live" : "conectado";
  return (
    <div className="flex items-center gap-2 rounded-lg border border-industrial px-3 py-1.5">
      <span className={`h-2 w-2 rounded-full ${color} ${enabled ? "animate-pulseDot" : ""}`} />
      <span className="text-[11px] font-medium text-dim">{label}</span>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-soft py-3.5">
      <p className="font-mono text-xl font-medium text-white">{value}</p>
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
