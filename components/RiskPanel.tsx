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
          <p className="tag mb-2">Cómo calcula el tamaño de cada operación</p>
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-industrial bg-industrial">
            {(["percent", "fixed"] as const).map((m) => (
              <button
                key={m}
                disabled={busy}
                onClick={() => patch({ risk: { sizingMode: m } })}
                className={`py-2 text-[11px] font-medium ${
                  r.sizingMode === m ? "bg-accent text-onaccent" : "bg-soft text-muted"
                }`}
              >
                {m === "percent" ? "% del capital" : "Unidades fijas"}
              </button>
            ))}
          </div>
        </div>

        {r.sizingMode === "percent" ? (
          <NumField
            label="Riesgo por operación"
            suffix="%"
            value={r.riskPercent}
            step={0.25}
            busy={busy}
            hint="% del capital que arriesgas en cada trade (lo que pierdes si salta el stop). Conservador: 1-2%."
            onCommit={(v) => patch({ risk: { riskPercent: v } })}
          />
        ) : (
          <NumField
            label="Tamaño fijo por operación"
            value={cfg.sizePerTrade}
            step={0.01}
            busy={busy}
            hint="Unidades fijas por trade, sin escalar con el capital."
            onCommit={(v) => patch({ sizePerTrade: v })}
          />
        )}

        {/* ATR stops */}
        <div className="border-t border-industrial pt-3">
          <button
            disabled={busy}
            onClick={() => patch({ risk: { useAtrStops: !r.useAtrStops } })}
            className={`mb-1 flex w-full items-center justify-between rounded-lg border px-3 py-2 text-[11px] font-medium ${
              r.useAtrStops ? "border-accent/40 bg-accent/10 text-accent" : "border-cement text-muted"
            }`}
          >
            Stop y objetivo según volatilidad (ATR)
            <span>{r.useAtrStops ? "ON" : "OFF"}</span>
          </button>
          <p className="mb-2 text-[10px] leading-snug text-muted">
            El stop-loss y el take-profit se adaptan a la volatilidad de cada activo (ATR), en vez de
            una distancia fija.
          </p>
          {r.useAtrStops ? (
            <div className="grid grid-cols-3 gap-2">
              <NumField label="Periodo ATR" value={r.atrPeriod} step={1} busy={busy}
                hint="Velas para medir la volatilidad." onCommit={(v) => patch({ risk: { atrPeriod: v } })} />
              <NumField label="Stop = ×ATR" value={r.atrStopMult} step={0.5} busy={busy}
                hint="Distancia del stop = este nº × ATR." onCommit={(v) => patch({ risk: { atrStopMult: v } })} />
              <NumField label="Objetivo = ×ATR" value={r.atrTpMult} step={0.5} busy={busy}
                hint="Distancia del take-profit = este nº × ATR." onCommit={(v) => patch({ risk: { atrTpMult: v } })} />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <NumField label="Stop (puntos)" value={cfg.stopDistance} step={10} busy={busy}
                hint="Distancia fija del stop-loss." onCommit={(v) => patch({ stopDistance: v })} />
              <NumField label="Objetivo (puntos)" value={cfg.profitDistance} step={10} busy={busy}
                hint="Distancia fija del take-profit." onCommit={(v) => patch({ profitDistance: v })} />
            </div>
          )}
        </div>

        {/* limits */}
        <div className="space-y-3 border-t border-industrial pt-3">
          <p className="tag">Límites de seguridad</p>
          <div className="grid grid-cols-2 gap-2">
            <NumField
              label="Freno diario"
              suffix="%"
              value={r.maxDailyLossPct}
              step={0.5}
              busy={busy}
              hint="Si pierdes este % del capital en el día, el bot se desarma solo (kill-switch)."
              onCommit={(v) => patch({ risk: { maxDailyLossPct: v } })}
            />
            <NumField
              label="Máx. operaciones/día"
              value={r.maxTradesPerDay}
              step={1}
              busy={busy}
              hint="Tope de trades que abre por día."
              onCommit={(v) => patch({ risk: { maxTradesPerDay: v } })}
            />
            <NumField
              label="Pausa tras pérdida"
              suffix="min"
              value={r.cooldownMin}
              step={5}
              busy={busy}
              hint="Minutos sin operar después de un trade perdedor."
              onCommit={(v) => patch({ risk: { cooldownMin: v } })}
            />
            <NumField
              label="Máx. posiciones"
              value={cfg.maxOpenPositions}
              step={1}
              busy={busy}
              hint="Posiciones abiertas a la vez como máximo."
              onCommit={(v) => patch({ maxOpenPositions: v })}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
