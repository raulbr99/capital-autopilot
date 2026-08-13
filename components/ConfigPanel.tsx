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
          <p className="tag mb-2">Universo · {instruments.length} instrumentos</p>
          {/*
            Tabla de datos, no 20 formularios apilados. Antes cada fila era una
            caja con borde para un símbolo de 6 letras que se estiraba a todo el
            ancho (flex-1), así que los controles quedaban a 700 px de la fila a
            la que pertenecen y la leyenda "activo · resolución · ADX · pausa"
            flotaba suelta arriba a la derecha sin alinearse con nada. Ahora las
            cabeceras son reales y comparten anchura con sus celdas.
          */}
          <div className="overflow-hidden rounded-lg border border-industrial">
            <div className="flex items-center gap-1.5 border-b border-industrial bg-base px-2.5 py-1.5 text-[9px] font-medium uppercase tracking-wider text-muted">
              <span className="flex-1">Activo</span>
              <span className="w-[76px] text-center">Marco</span>
              <span className="w-[40px] text-center" title="Filtro de régimen: solo opera en tendencia">ADX</span>
              <span className="w-[40px] text-center">Pausa</span>
              <span className="w-[36px]" aria-hidden />
            </div>
            {DESK_ORDER.filter((d) => byDesk[d.key]?.length).map((d) => (
              <div key={d.key}>
                <p className="border-b border-industrial bg-base/60 px-2.5 py-1 text-[9px] font-medium uppercase tracking-wider text-dim">
                  {d.label} <span className="text-muted">{byDesk[d.key].length}</span>
                </p>
                {byDesk[d.key].map((i) => (
                  <div
                    key={i.epic}
                    className={`flex items-center gap-1.5 border-b border-industrial/70 px-2.5 py-1 last:border-b-0 ${
                      i.paused ? "opacity-55" : ""
                    }`}
                  >
                    <span className="flex min-w-0 flex-1 items-center gap-1.5">
                      <span className="truncate font-mono text-[11px] text-white">{i.epic}</span>
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
                      className="min-h-[34px] w-[76px] rounded-md border border-cement bg-ink px-1 font-mono text-[10px] text-accent"
                    >
                      {RESOLUTIONS.map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => toggleRegime(i.epic)}
                      disabled={busy}
                      aria-pressed={!!i.regimeFilter}
                      aria-label={`Filtro de régimen ADX en ${i.epic}`}
                      title="Filtro de régimen ADX para este activo"
                      className={`min-h-[34px] w-[40px] rounded-md border font-mono text-[9px] ${
                        i.regimeFilter ? "border-accent text-accent" : "border-cement text-muted"
                      }`}
                    >
                      ADX
                    </button>
                    {/*
                      Era un emoji ⛔. Los emoji se pintan con su propio color y
                      se saltan las clases de texto, así que el botón salía rojo
                      chillón SIEMPRE: activo y pausado se veían idénticos y el
                      estado del control era invisible. Ahora es un glifo que
                      hereda currentColor y dibuja la ACCIÓN (pausar / reanudar),
                      mientras la insignia de la fila dice el estado.
                    */}
                    <button
                      onClick={() => togglePaused(i.epic)}
                      disabled={busy}
                      aria-pressed={!!i.paused}
                      aria-label={i.paused ? `Reanudar ${i.epic}` : `Pausar ${i.epic}`}
                      title={i.paused ? "Pausado (no abre nuevas). Clic para reactivar." : "Pausar este activo (no abrirá nuevas posiciones)."}
                      className={`grid min-h-[34px] w-[40px] place-items-center rounded-md border ${
                        i.paused ? "border-short text-short" : "border-cement text-muted hover:text-white"
                      }`}
                    >
                      <svg viewBox="0 0 10 10" className="h-2.5 w-2.5" fill="currentColor" aria-hidden="true">
                        {i.paused ? (
                          <path d="M2 1l7 4-7 4z" />
                        ) : (
                          <>
                            <rect x="1.5" y="1" width="2.6" height="8" rx="0.4" />
                            <rect x="5.9" y="1" width="2.6" height="8" rx="0.4" />
                          </>
                        )}
                      </svg>
                    </button>
                    {/* Quitar un activo saca al bot de ese mercado: se confirma */}
                    {confirmDel === i.epic ? (
                      <button
                        onClick={() => {
                          remove(i.epic);
                          setConfirmDel(null);
                        }}
                        disabled={busy}
                        className="min-h-[34px] rounded-md border border-short bg-short/10 px-2 font-mono text-[9px] text-short"
                      >
                        ¿QUITAR?
                      </button>
                    ) : (
                      <button
                        onClick={() => setConfirmDel(i.epic)}
                        disabled={busy}
                        aria-label={`Quitar ${i.epic}`}
                        className="min-h-[34px] w-[36px] rounded-md border border-cement font-mono text-[11px] text-muted hover:border-short hover:text-short"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div className="mt-2 flex gap-1.5">
            <input
              value={w}
              onChange={(e) => setW(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && add()}
              placeholder="EPIC ej. NZDUSD"
              className="min-h-[36px] w-full border border-cement bg-ink px-2 py-1.5 font-mono text-[11px] text-white placeholder:text-muted focus:border-accent"
            />
            <button onClick={add} disabled={busy} aria-label="Añadir instrumento" className="min-h-[36px] min-w-[40px] rounded-lg bg-accent px-3 font-display text-xs text-onaccent disabled:opacity-40">
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
          <p className="tag mb-2">Avisos</p>
          <div className="grid grid-cols-2 gap-2">
            <NotifyRow
              label="Telegram"
              env={notifyEnv.telegram}
              on={cfg.notify.telegram}
              busy={busy}
              vars="TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID"
              onClick={() => patch({ notify: { telegram: !cfg.notify.telegram } })}
            />
            <NotifyRow
              label="Discord"
              env={notifyEnv.discord}
              on={cfg.notify.discord}
              busy={busy}
              vars="DISCORD_WEBHOOK_URL"
              onClick={() => patch({ notify: { discord: !cfg.notify.discord } })}
            />
          </div>
          {/* Un canal sin configurar es un callejón sin salida si no dice QUÉ
              falta. Y sin avisos, una parada del bot puede pasar semanas
              inadvertida — ya ocurrió: el Gestor estuvo un mes desconectado. */}
          {(!notifyEnv.telegram || !notifyEnv.discord) && (
            <p className="mt-2 text-[10px] leading-relaxed text-muted">
              Sin ningún canal configurado, una parada del bot no avisa a nadie. Para activarlos,
              define en Vercel{" "}
              {!notifyEnv.telegram && (
                <span className="font-mono text-dim">TELEGRAM_BOT_TOKEN</span>
              )}
              {!notifyEnv.telegram && " y "}
              {!notifyEnv.telegram && <span className="font-mono text-dim">TELEGRAM_CHAT_ID</span>}
              {!notifyEnv.telegram && !notifyEnv.discord && ", o bien "}
              {!notifyEnv.discord && <span className="font-mono text-dim">DISCORD_WEBHOOK_URL</span>}
              .
            </p>
          )}
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
  vars,
  onClick,
}: {
  label: string;
  env: boolean;
  on: boolean;
  busy: boolean;
  vars: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={busy || !env}
      title={env ? "" : `Falta por definir: ${vars}`}
      className={`flex min-h-[38px] items-center justify-between rounded-lg border px-3 py-2 text-[11px] disabled:opacity-40 ${
        on && env ? "border-accent text-accent" : "border-cement text-muted"
      }`}
    >
      {label}
      <span className="font-mono text-[10px]">
        {!env ? "sin configurar" : on ? "activo" : "apagado"}
      </span>
    </button>
  );
}
