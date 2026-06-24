"use client";

import { useState } from "react";
import type { BotConfig } from "./types";
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
  const add = () => {
    const v = w.toUpperCase().trim();
    if (!v || cfg.watchlist.includes(v)) return;
    patch({ watchlist: [...cfg.watchlist, v] });
    setW("");
  };
  const remove = (e: string) =>
    patch({ watchlist: cfg.watchlist.filter((x) => x !== e) });

  return (
    <div className="border border-industrial bg-soft">
      <SectionHead label="STRATEGY // WATCHLIST + SEÑALES" />
      <div className="space-y-4 p-4">
        <div>
          <p className="tag mb-2">WATCHLIST</p>
          <div className="flex flex-wrap gap-1.5">
            {cfg.watchlist.map((e) => (
              <button
                key={e}
                onClick={() => remove(e)}
                disabled={busy}
                className="group flex items-center gap-1.5 border border-cement bg-industrial px-2 py-1 font-mono text-[11px] text-dim hover:border-short"
              >
                {e}
                <span className="text-muted group-hover:text-short">✕</span>
              </button>
            ))}
          </div>
          <div className="mt-2 flex gap-1.5">
            <input
              value={w}
              onChange={(e) => setW(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && add()}
              placeholder="EPIC ej. BTCUSD"
              className="w-full border border-cement bg-ink px-2 py-1.5 font-mono text-[11px] text-white placeholder:text-muted focus:border-volt focus:outline-none"
            />
            <button onClick={add} disabled={busy} className="bg-volt px-3 font-display text-xs text-ink disabled:opacity-40">
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
          <p className="tag mb-2">NOTIFICACIONES</p>
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
