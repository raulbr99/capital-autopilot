"use client";

import { useState } from "react";
import type { BotConfig } from "./types";
import { RESOLUTIONS } from "./types";
import { SectionHead, NumField } from "./ui";

const DESK_ORDER = [
  { key: "forex", label: "Forex" },
  { key: "crypto", label: "Crypto" },
  { key: "stocks", label: "Stocks" },
  { key: "commodities", label: "Commodities" },
  { key: "otros", label: "Sin mesa" },
];

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
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const instruments = cfg.instruments ?? [];
  const byDesk = instruments.reduce<Record<string, typeof instruments>>((acc, i) => {
    const k = i.category || "otros";
    (acc[k] ||= []).push(i);
    return acc;
  }, {});
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
  const togglePaused = (epic: string) =>
    patch({
      instruments: instruments.map((i) => (i.epic === epic ? { ...i, paused: !i.paused } : i)),
    });

  return (
    <div className="border border-industrial bg-soft rounded-xl">
      <SectionHead label="Instrumentos y señal" />
      <div className="space-y-4 p-4">
        <div>
          <div className="mb-2 flex items-baseline justify-between">
            <p className="tag">Universo · {instruments.length} instrumentos</p>
            <p className="text-[10px] text-muted">activo · resolución · ADX · pausa</p>
          </div>
          {/* Agrupado por mesa: 20 activos en lista plana no hay quien los lea */}
          <div className="space-y-3">
            {DESK_ORDER.filter((d) => byDesk[d.key]?.length).map((d) => (
              <div key={d.key}>
                <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted">
                  {d.label} <span className="text-dim">{byDesk[d.key].length}</span>
                </p>
                <div className="space-y-1.5">
            {byDesk[d.key].map((i) => (
              <div key={i.epic} className={`flex items-center gap-1.5 ${i.paused ? "opacity-55" : ""}`}>
                <span className="flex min-w-0 flex-1 items-center gap-1.5 border border-cement bg-industrial px-2 py-1.5 font-mono text-[11px] text-white">
                  <span className="truncate">{i.epic}</span>
                  {i.longOnly && (
                    <span className="shrink-0 rounded bg-long/15 px-1 text-[8px] text-long" title="Solo compras: el motor bloquea los cortos">
                      LONG
                    </span>
                  )}
                  {i.paused && (
                    <span className="shrink-0 rounded bg-short/15 px-1 text-[8px] text-short" title="Pausado: no abre nuevas posiciones">
                      PAUSA
                    </span>
                  )}
                </span>
                <select
                  value={i.resolution}
                  disabled={busy}
                  aria-label={`Resolución de ${i.epic}`}
                  onChange={(e) => setRes(i.epic, e.target.value)}
                  className="rounded-md border border-cement bg-ink px-1.5 py-1.5 font-mono text-[10px] text-accent focus:outline-none"
                >
                  {RESOLUTIONS.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
                <button
                  onClick={() => toggleRegime(i.epic)}
                  disabled={busy}
                  aria-pressed={!!i.regimeFilter}
                  title="Filtro de régimen ADX para este activo"
                  className={`rounded-md border px-1.5 py-1.5 font-mono text-[9px] ${
                    i.regimeFilter ? "border-accent text-accent" : "border-cement text-muted"
                  }`}
                >
                  ADX
                </button>
                <button
                  onClick={() => togglePaused(i.epic)}
                  disabled={busy}
                  aria-pressed={!!i.paused}
                  title={i.paused ? "Pausado por circuit breaker (no abre nuevas). Clic para reactivar." : "Pausar este activo (no abrirá nuevas posiciones)."}
                  className={`rounded-md border px-1.5 py-1.5 font-mono text-[9px] ${
                    i.paused ? "border-short text-short" : "border-cement text-muted"
                  }`}
                >
                  ⛔
                </button>
                {/* Quitar un activo saca al bot de ese mercado: se confirma */}
                {confirmDel === i.epic ? (
                  <button
                    onClick={() => {
                      remove(i.epic);
                      setConfirmDel(null);
                    }}
                    disabled={busy}
                    className="rounded-md border border-short bg-short/10 px-2 py-1.5 font-mono text-[9px] text-short"
                  >
                    ¿QUITAR?
                  </button>
                ) : (
                  <button
                    onClick={() => setConfirmDel(i.epic)}
                    disabled={busy}
                    aria-label={`Quitar ${i.epic}`}
                    className="rounded-md border border-cement px-2 py-1.5 font-mono text-[11px] text-muted hover:border-short hover:text-short"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-2 flex gap-1.5">
            <input
              value={w}
              onChange={(e) => setW(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && add()}
              placeholder="EPIC ej. NZDUSD"
              className="w-full border border-cement bg-ink px-2 py-1.5 font-mono text-[11px] text-white placeholder:text-muted focus:border-accent focus:outline-none"
            />
            <button onClick={add} disabled={busy} aria-label="Añadir instrumento" className="rounded-lg bg-accent px-3 font-display text-xs text-onaccent disabled:opacity-40">
              +
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 border-t border-industrial pt-3">
          <NumField label="SMA rápida" value={cfg.strategy.fast} step={1} busy={busy}
            onCommit={(v) => patch({ strategy: { fast: v } })} />
          <NumField label="SMA lenta" value={cfg.strategy.slow} step={1} busy={busy}
            onCommit={(v) => patch({ strategy: { slow: v } })} />
          <NumField label="Periodo RSI" value={cfg.strategy.rsiPeriod} step={1} busy={busy}
            onCommit={(v) => patch({ strategy: { rsiPeriod: v } })} />
          <NumField label="Confianza mínima" value={cfg.strategy.minConfidence} step={0.05} busy={busy}
            onCommit={(v) => patch({ strategy: { minConfidence: v } })} />
        </div>

        <div className="border-t border-industrial pt-3">
          <button
            disabled={busy}
            onClick={() => patch({ strategy: { useRegimeFilter: !cfg.strategy.useRegimeFilter } })}
            className={`mb-2 flex w-full items-center justify-between border px-3 py-2 font-mono text-[11px] ${
              cfg.strategy.useRegimeFilter ? "border-accent text-accent" : "border-cement text-muted"
            }`}
          >
            FILTRO RÉGIMEN (ADX) — solo opera en tendencia
            <span>{cfg.strategy.useRegimeFilter ? "ON" : "OFF"}</span>
          </button>
          <div className="grid grid-cols-2 gap-3">
            <NumField label="Periodo ADX" value={cfg.strategy.adxPeriod} step={1} busy={busy}
              onCommit={(v) => patch({ strategy: { adxPeriod: v } })} />
            <NumField label="Umbral ADX" value={cfg.strategy.adxThreshold} step={1} busy={busy}
              onCommit={(v) => patch({ strategy: { adxThreshold: v } })} />
          </div>
        </div>

        <div className="space-y-2 border-t border-industrial pt-3">
          <button
            disabled={busy}
            onClick={() => patch({ pmMode: !cfg.pmMode })}
            className={`flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-[11px] font-medium ${
              cfg.pmMode ? "border-accent/50 bg-accent/10 text-accent ring-accent" : "border-cement text-muted"
            }`}
          >
            🧠 GESTOR DE CARTERA IA — la IA decide
            <span>{cfg.pmMode ? "ON" : "OFF"}</span>
          </button>
          {cfg.pmMode && (
            <p className="text-[10px] leading-snug text-muted">
              La IA lee mercado + noticias y decide abrir/cerrar (dentro de tus límites de riesgo); el motor
              técnico queda en pausa. Mira el{" "}
              <a href="/journal" className="text-accent underline">Diario IA</a>.
            </p>
          )}
          <button
            disabled={busy}
            onClick={() => patch({ aiFilter: !cfg.aiFilter })}
            className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-[11px] font-medium ${
              cfg.aiFilter ? "border-accent/40 bg-accent/10 text-accent" : "border-cement text-muted"
            }`}
          >
            🤖 Capa IA (filtro) — revisa/veta cada señal
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
        on && env ? "border-accent text-accent" : "border-cement text-muted"
      }`}
    >
      {label}
      <span>{!env ? "SIN_ENV" : on ? "ON" : "OFF"}</span>
    </button>
  );
}
