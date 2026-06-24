"use client";

import type { EpicEval } from "./types";
import { SectionHead, Sparkline } from "./ui";

export default function SignalMatrix({ evals }: { evals: EpicEval[] }) {
  return (
    <div className="border border-industrial bg-soft">
      <SectionHead label="SIGNAL_MATRIX // EVALUACIÓN_EN_VIVO" />
      <div className="grid grid-cols-1 gap-px bg-industrial p-px sm:grid-cols-2 xl:grid-cols-3">
        {evals.length === 0 && (
          <div className="col-span-full bg-soft p-8 text-center">
            <span className="tag">SIN_ACTIVOS_EN_WATCHLIST</span>
          </div>
        )}
        {evals.map((e) => (
          <SignalCard key={e.epic} e={e} />
        ))}
      </div>
    </div>
  );
}

function SignalCard({ e }: { e: EpicEval }) {
  const s = e.signal;
  const buy = s.type === "BUY";
  const sell = s.type === "SELL";
  const conf = Math.round((s.confidence ?? 0) * 100);
  const confColor = buy ? "text-long" : sell ? "text-short" : "text-muted";
  return (
    <div className="group relative overflow-hidden bg-soft p-4 transition hover:bg-[#121212]">
      <span className="scanline -top-2 opacity-0 transition group-hover:animate-scan group-hover:opacity-100" />
      <div className="flex items-start justify-between">
        <div>
          <span className="font-display text-base">{e.epic}</span>
          <span className="ml-1.5 bg-industrial px-1 py-0.5 font-mono text-[8px] text-volt">{e.resolution}</span>
          <p className="font-mono text-[10px] text-muted">@{e.price ? e.price.toFixed(2) : "—"}</p>
        </div>
        <span
          className={`px-2 py-0.5 font-mono text-[10px] ${
            buy ? "bg-long/15 text-long" : sell ? "bg-short/15 text-short" : "bg-cement text-muted"
          }`}
        >
          {buy ? "▲ LONG" : sell ? "▼ SHORT" : "● FLAT"}
        </span>
      </div>

      <div className="mt-2">
        <Sparkline data={e.spark} w={240} h={36} />
      </div>

      <div className="mt-2 h-1.5 w-full bg-industrial">
        <div
          className={`h-full ${buy ? "bg-long" : sell ? "bg-short" : "bg-muted"}`}
          style={{ width: `${conf}%` }}
        />
      </div>
      <div className="mt-1 flex justify-between font-mono text-[10px] text-muted">
        <span>CONFIANZA</span>
        <span className={confColor}>{conf}%</span>
      </div>

      <p className="mt-2 text-[11px] leading-snug text-dim">{s.reason}</p>

      <div className="mt-3 grid grid-cols-4 gap-2 border-t border-industrial pt-3 font-mono text-[10px]">
        <Ind label="SMA-F" v={s.indicators.smaFast} />
        <Ind label="SMA-S" v={s.indicators.smaSlow} />
        <Ind label="RSI" v={s.indicators.rsi} d={0} />
        <div>
          <p className="text-muted">ADX</p>
          <p className={s.indicators.adx >= 25 ? "text-long" : "text-muted"}>
            {Number.isFinite(s.indicators.adx) ? s.indicators.adx.toFixed(0) : "—"}
            <span className="ml-1 text-[8px]">{s.indicators.adx >= 25 ? "TREND" : "RANGE"}</span>
          </p>
        </div>
      </div>
      {e.hasPosition && (
        <p className="mt-2 inline-block bg-volt/10 px-2 py-0.5 font-mono text-[9px] text-volt">
          POSICIÓN_ABIERTA
        </p>
      )}
    </div>
  );
}

function Ind({ label, v, d = 2 }: { label: string; v: number; d?: number }) {
  return (
    <div>
      <p className="text-muted">{label}</p>
      <p className="text-white">{Number.isFinite(v) ? v.toFixed(d) : "—"}</p>
    </div>
  );
}
