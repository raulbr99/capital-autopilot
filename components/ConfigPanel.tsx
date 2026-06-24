"use client";

import { useState } from "react";
import type { BotConfig } from "./types";
import { RESOLUTIONS } from "./types";
import { SectionHead, NumField } from "./ui";

export default function ConfigPanel({
  cfg,
  busy,
  patch,
  notifyEnv,
}: {
  cfg: BotConfig;
  busy: boolean;
  patch: (b: any) => void;
  notifyEnv: { telegram: boolean; discord: boolean };
}) {
  const [w, setW] = useState("");
  const instruments = cfg.instruments ?? [];
  const add = () => {
    const v = w.toUpperCase().trim();
    if (!v || instruments.some((i) => i.epic === v)) return;
    patch({ instruments: [...instruments, { epic: v, resolution: "HOUR_4" }] });
    setW("");
  };
  const remove = (epic: string) =>
    patch({ instruments: instruments.filter((i) => i.epic !== epic) });
  const setRes = (epic: string, resolution: string) =>
    patch({
      instruments: instruments.map((i) => (i.epic === epic ? { ...i, resolution } : i)),
    });
  const toggleRegime = (epic: string) =>
    patch({
      instruments: instruments.map((i) =>
        i.epic === epic ? { ...i, regimeFilter: !i.regimeFilter } : i
      ),
    });

  return (
    <div className="border border-industrial bg-soft rounded-xl">
      <SectionHead label="Instrumentos y señal" />
      <div className="space-y-4 p-4">
        <div>
          <p className="tag mb-2">INSTRUMENTOS (activo · resolución de señal)</p>
          <div className="space-y-1.5">
            {instruments.map((i) => (
              <div key={i.epic} className="flex items-center gap-1.5">
                <span className="flex-1 border border-cement bg-industrial px-2 py-1.5 font-mono text-[11px] text-white">
                  {i.epic}
                </span>
                <select
                  value={i.resolution}
                  disabled={busy}
                  onChange={(e) => setRes(i.epic, e.target.value)}
                  className="border border-cement bg-ink px-1.5 py-1.5 font-mono text-[10px] text-volt focus:outline-none"
                >
                  {RESOLUTIONS.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
                <button
                  onClick={() => toggleRegime(i.epic)}
                  disabled={busy}
                  title="Filtro de régimen ADX para este activo"
                  className={`border px-1.5 py-1.5 font-mono text-[9px] ${
                    i.regimeFilter ? "border-volt text-volt" : "border-cement text-muted"
                  }`}
                >
                  ADX
                </button>
                <button
                  onClick={() => remove(i.epic)}
                  disabled={busy}
                  className="border border-cement px-2 py-1.5 font-mono text-[11px] text-muted hover:border-short hover:text-short"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
          <div className="mt-2 flex gap-1.5">
            <input
              value={w}
              onChange={(e) => setW(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && add()}
              placeholder="EPIC ej. NZDUSD"
              className="w-full border border-cement bg-ink px-2 py-1.5 font-mono text-[11px] text-white placeholder:text-muted focus:border-volt focus:outline-none"
            />
            <button onClick={add} disabled={busy} className="bg-volt px-3 font-display text-xs text-onaccent disabled:opacity-40">
              +
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 border-t border-industrial pt-3">
          <NumField label="SMA_RÁPIDA" value={cfg.strategy.fast} step={1} busy={busy}
            onCommit={(v) => patch({ strategy: { fast: v } })} />
          <NumField label="SMA_LENTA" value={cfg.strategy.slow} step={1} busy={busy}
            onCommit={(v) => patch({ strategy: { slow: v } })} />
          <NumField label="RSI_PERIODO" value={cfg.strategy.rsiPeriod} step={1} busy={busy}
            onCommit={(v) => patch({ strategy: { rsiPeriod: v } })} />
          <NumField label="CONF_MÍN" value={cfg.strategy.minConfidence} step={0.05} busy={busy}
            onCommit={(v) => patch({ strategy: { minConfidence: v } })} />
        </div>

        <div className="border-t border-industrial pt-3">
          <button
            disabled={busy}
            onClick={() => patch({ strategy: { useRegimeFilter: !cfg.strategy.useRegimeFilter } })}
            className={`mb-2 flex w-full items-center justify-between border px-3 py-2 font-mono text-[11px] ${
              cfg.strategy.useRegimeFilter ? "border-volt text-volt" : "border-cement text-muted"
            }`}
          >
            FILTRO RÉGIMEN (ADX) — solo opera en tendencia
            <span>{cfg.strategy.useRegimeFilter ? "ON" : "OFF"}</span>
          </button>
          <div className="grid grid-cols-2 gap-3">
            <NumField label="ADX_PERIODO" value={cfg.strategy.adxPeriod} step={1} busy={busy}
              onCommit={(v) => patch({ strategy: { adxPeriod: v } })} />
            <NumField label="ADX_UMBRAL" value={cfg.strategy.adxThreshold} step={1} busy={busy}
              onCommit={(v) => patch({ strategy: { adxThreshold: v } })} />
          </div>
        </div>

        <div className="border-t border-industrial pt-3">
          <button
            disabled={busy}
            onClick={() => patch({ aiFilter: !cfg.aiFilter })}
            className={`flex w-full items-center justify-between border px-3 py-2 font-mono text-[11px] ${
              cfg.aiFilter ? "border-volt text-volt" : "border-cement text-muted"
            }`}
          >
            🤖 CAPA IA — Claude revisa/veta cada señal
            <span>{cfg.aiFilter ? "ON" : "OFF"}</span>
          </button>
        </div>

        <div className="border-t border-industrial pt-3">
          <p className="tag mb-2">Notificaciones</p>
          <div className="grid grid-cols-2 gap-2">
            <NotifyRow
              label="TELEGRAM"
              env={notifyEnv.telegram}
              on={cfg.notify.telegram}
              busy={busy}
              onClick={() => patch({ notify: { telegram: !cfg.notify.telegram } })}
            />
            <NotifyRow
              label="DISCORD"
              env={notifyEnv.discord}
              on={cfg.notify.discord}
              busy={busy}
              onClick={() => patch({ notify: { discord: !cfg.notify.discord } })}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function NotifyRow({
  label,
  env,
  on,
  busy,
  onClick,
}: {
  label: string;
  env: boolean;
  on: boolean;
  busy: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={busy || !env}
      title={env ? "" : "Configura las variables de entorno"}
      className={`flex items-center justify-between border px-3 py-2 font-mono text-[11px] disabled:opacity-40 ${
        on && env ? "border-volt text-volt" : "border-cement text-muted"
      }`}
    >
      {label}
      <span>{!env ? "SIN_ENV" : on ? "ON" : "OFF"}</span>
    </button>
  );
}
