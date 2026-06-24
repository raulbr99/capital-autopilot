"use client";

import type { BotConfig } from "./types";
import { SectionHead, NumField } from "./ui";

export default function RiskPanel({
  cfg,
  busy,
  patch,
}: {
  cfg: BotConfig;
  busy: boolean;
  patch: (b: any) => void;
}) {
  const r = cfg.risk;
  return (
    <div className="border border-industrial bg-soft rounded-xl">
      <SectionHead label="Gestión de riesgo" />
      <div className="space-y-4 p-4">
        {/* sizing mode */}
        <div>
          <p className="tag mb-2">SIZING</p>
          <div className="grid grid-cols-2 gap-px border border-industrial bg-industrial">
            {(["percent", "fixed"] as const).map((m) => (
              <button
                key={m}
                disabled={busy}
                onClick={() => patch({ risk: { sizingMode: m } })}
                className={`py-2 font-mono text-[11px] ${
                  r.sizingMode === m ? "bg-volt text-onaccent" : "bg-soft text-muted"
                }`}
              >
                {m === "percent" ? "% RIESGO" : "UNIDADES FIJAS"}
              </button>
            ))}
          </div>
        </div>

        {r.sizingMode === "percent" ? (
          <NumField label="RIESGO_% POR TRADE" value={r.riskPercent} step={0.25}
            busy={busy} onCommit={(v) => patch({ risk: { riskPercent: v } })} />
        ) : (
          <NumField label="SIZE_FIJO" value={cfg.sizePerTrade} step={0.01}
            busy={busy} onCommit={(v) => patch({ sizePerTrade: v })} />
        )}

        {/* ATR stops */}
        <div className="border-t border-industrial pt-3">
          <button
            disabled={busy}
            onClick={() => patch({ risk: { useAtrStops: !r.useAtrStops } })}
            className={`mb-2 flex w-full items-center justify-between border px-3 py-2 font-mono text-[11px] ${
              r.useAtrStops ? "border-volt text-volt" : "border-cement text-muted"
            }`}
          >
            SL/TP POR ATR (VOLATILIDAD)
            <span>{r.useAtrStops ? "ON" : "OFF"}</span>
          </button>
          {r.useAtrStops ? (
            <div className="grid grid-cols-3 gap-2">
              <NumField label="ATR_PER" value={r.atrPeriod} step={1} busy={busy}
                onCommit={(v) => patch({ risk: { atrPeriod: v } })} />
              <NumField label="SL_×ATR" value={r.atrStopMult} step={0.5} busy={busy}
                onCommit={(v) => patch({ risk: { atrStopMult: v } })} />
              <NumField label="TP_×ATR" value={r.atrTpMult} step={0.5} busy={busy}
                onCommit={(v) => patch({ risk: { atrTpMult: v } })} />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <NumField label="STOP_DIST" value={cfg.stopDistance} step={10} busy={busy}
                onCommit={(v) => patch({ stopDistance: v })} />
              <NumField label="TAKE_PROFIT" value={cfg.profitDistance} step={10} busy={busy}
                onCommit={(v) => patch({ profitDistance: v })} />
            </div>
          )}
        </div>

        {/* limits */}
        <div className="grid grid-cols-2 gap-2 border-t border-industrial pt-3">
          <NumField label="KILL_PÉRDIDA_%/DÍA" value={r.maxDailyLossPct} step={0.5}
            busy={busy} onCommit={(v) => patch({ risk: { maxDailyLossPct: v } })} />
          <NumField label="MÁX_TRADES/DÍA" value={r.maxTradesPerDay} step={1}
            busy={busy} onCommit={(v) => patch({ risk: { maxTradesPerDay: v } })} />
          <NumField label="COOLDOWN_MIN" value={r.cooldownMin} step={5}
            busy={busy} onCommit={(v) => patch({ risk: { cooldownMin: v } })} />
          <NumField label="MÁX_POSICIONES" value={cfg.maxOpenPositions} step={1}
            busy={busy} onCommit={(v) => patch({ maxOpenPositions: v })} />
        </div>
      </div>
    </div>
  );
}
