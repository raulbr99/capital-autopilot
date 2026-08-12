"use client";

import type { BotConfig } from "./types";
import { SectionHead, NumField, fmt, pl } from "./ui";

export default function RiskPanel({
  cfg,
  busy,
  patch,
  equity,
  currency,
}: {
  cfg: BotConfig;
  busy: boolean;
  patch: (b: any) => void;
  equity?: number;
  currency?: string;
}) {
  const r = cfg.risk;

  // Traducir los mandos a sus consecuencias: un panel de riesgo que solo
  // enseña los números que introduces no informa de nada. Lo que importa es
  // cuántos euros arriesgas y qué acierto mínimo exige esa relación.
  const riesgoEur = equity && r.sizingMode === "percent" ? (equity * r.riskPercent) / 100 : null;
  const rr = r.useAtrStops
    ? r.atrStopMult > 0
      ? r.atrTpMult / r.atrStopMult
      : null
    : cfg.stopDistance > 0
    ? cfg.profitDistance / cfg.stopDistance
    : null;
  const equilibrio = rr && rr > 0 ? 100 / (1 + rr) : null;
  const peorDia = riesgoEur != null ? riesgoEur * r.maxTradesPerDay : null;

  return (
    <div className="border border-industrial bg-soft rounded-xl">
      <SectionHead label="Gestión de riesgo" />

      {/* Consecuencias en vivo de la configuración actual */}
      <div className="grid grid-cols-3 gap-px border-b border-industrial bg-industrial">
        <Consequence
          label="Por operación"
          value={riesgoEur != null ? `${fmt(riesgoEur)}` : "—"}
          sub={riesgoEur != null ? `${currency ?? ""} si salta el stop` : "modo unidades fijas"}
        />
        <Consequence
          label="Relación R:R"
          value={rr ? `${rr.toFixed(2)}:1` : "—"}
          sub={rr ? (rr >= 1 ? "ganas más de lo que arriesgas" : "arriesgas más de lo que ganas") : ""}
          tone={rr ? (rr >= 1 ? "long" : "short") : undefined}
        />
        {/*
          Esta cifra sale de la CONFIGURACIÓN (objetivo ÷ stop), no del histórico.
          En la misma pantalla, el panel de expectativa enseña su propio umbral
          calculado con las operaciones reales — hoy 40 % aquí y 45 % allí— y
          nada decía cuál era cuál: parecían el mismo dato con dos valores.
          Son plan y realidad, y difieren porque casi ninguna salida ocurre
          exactamente en el stop o en el objetivo, menos aún con el trailing
          moviendo el stop. El subtítulo lo dice ahora explícitamente.
        */}
        <Consequence
          label="Acierto mínimo"
          value={equilibrio ? `${equilibrio.toFixed(0)}%` : "—"}
          sub={
            equilibrio
              ? r.activeManage
                ? "en teoría · el trailing mueve el stop"
                : "en teoría · si cada salida fuera en el stop o el objetivo"
              : ""
          }
        />
      </div>

      {/* Avisos: un límite de seguridad apagado no puede pasar desapercibido */}
      {(r.maxDailyLossPct <= 0 || peorDia != null) && (
        <div className="space-y-1.5 border-b border-industrial px-4 py-3">
          {peorDia != null && (
            <p className="text-[11px] leading-relaxed text-muted">
              Con {r.maxTradesPerDay} {pl(r.maxTradesPerDay, "operación", "operaciones")} al día y {cfg.maxPerDesk} por mesa, el peor día abriendo
              el cupo completo arriesga <span className="font-mono text-dim">≈{fmt(peorDia)} {currency ?? ""}</span> en
              posiciones nuevas.
            </p>
          )}
          {r.maxDailyLossPct <= 0 && (
            <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-short">
              <span aria-hidden>⚠️</span>
              Freno diario <span className="font-medium">desactivado</span>: nada detiene al bot si encadena
              pérdidas en una misma jornada.
            </p>
          )}
        </div>
      )}

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
              hint="Si pierdes este % del capital en el día, el bot se desarma solo (kill-switch). 0 = desactivado."
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
              label="Máx. por mesa"
              value={cfg.maxPerDesk}
              step={1}
              busy={busy}
              hint="Posiciones abiertas a la vez como máximo en cada mesa (forex, crypto, stocks, commodities). No hay límite global."
              onCommit={(v) => patch({ maxPerDesk: v })}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function Consequence({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "long" | "short";
}) {
  const c = tone === "long" ? "text-long" : tone === "short" ? "text-short" : "text-white";
  return (
    <div className="min-w-0 bg-soft px-3 py-2.5">
      <p className="tag whitespace-nowrap">{label}</p>
      <p className={`mt-0.5 font-mono text-base font-medium tabular-nums ${c}`}>{value}</p>
      {sub && <p className="mt-0.5 text-[10px] leading-tight text-muted">{sub}</p>}
    </div>
  );
}
