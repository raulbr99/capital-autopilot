"use client";

import { useState } from "react";
import type { BotConfig } from "./types";
import { RESOLUCIONES, DEFAULT_RESOLUTION, LIMITES, EPIC_RE, MAX_INSTRUMENTOS } from "@/lib/model";
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
  /** Mesa del activo nuevo. Sin valor por defecto: elegir mal cuesta dinero. */
  const [mesa, setMesa] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const instruments = cfg.instruments ?? [];
  const byDesk = instruments.reduce<Record<string, typeof instruments>>((acc, i) => {
    const k = i.category || "otros";
    (acc[k] ||= []).push(i);
    return acc;
  }, {});
  /**
   * Añadir un instrumento creaba `{ epic, resolution }` y nada más: sin mesa.
   * Y la mesa no es una etiqueta para agrupar la lista — decide el APALANCAMIENTO
   * con el que el motor calcula el tamaño de cada posición:
   *
   *   forex 30 · commodities 10 · stocks 5 · crypto 2 · sin mesa → 5
   *
   * Como el tamaño sale de (equity·margen%)·apalancamiento/precio, un par de
   * divisas añadido desde aquí se abría SEIS VECES más pequeño de lo que dicta
   * la configuración de margen, y una cripto DOS VECES Y MEDIA más grande — en
   * la clase más volátil del universo. Además el activo caía en la mesa
   * fantasma "otros": compartía el cupo de maxPerDesk con cualquier otro
   * huérfano y ningún Gestor de mesa lo miraba.
   *
   * No había forma de asignar la mesa desde la interfaz, así que un instrumento
   * añadido aquí quedaba mal dimensionado para siempre. Ahora se elige al
   * crearlo, y sin valor por defecto: no hay ninguno que sea correcto por
   * omisión.
   */
  const add = () => {
    const v = w.toUpperCase().trim();
    /**
     * Antes cualquier texto valía. Escribir "hola mundo" creaba un instrumento
     * que Capital no reconoce, y a partir de ahí cada ciclo del motor gastaba
     * una petición en él para fallar y dejar una tarjeta "sin datos" en la
     * rejilla, para siempre, sin que nada dijera por qué. El aviso sale ahora
     * al lado del campo en vez de que el botón no haga nada.
     */
    if (!v || !mesa) return;
    if (!EPIC_RE.test(v)) return setAviso("Formato no válido: letras, números, punto y guion bajo (máx. 20).");
    if (instruments.some((i) => i.epic === v)) return setAviso(`${v} ya está en el universo.`);
    if (instruments.length >= MAX_INSTRUMENTOS)
      return setAviso(`Tope de ${MAX_INSTRUMENTOS} instrumentos: cada uno cuesta una petición por ciclo.`);
    setAviso(null);
    patch({
      instruments: [...instruments, { epic: v, resolution: DEFAULT_RESOLUTION, category: mesa }],
    });
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
  /**
   * Solo-compra por activo. El motor descarta los SELL de estos instrumentos, y
   * la rejilla de señales ya los marca como "bloqueada" — pero el flag solo
   * existía en la semilla del código: no había forma de ponerlo ni de quitarlo
   * desde ninguna pantalla. O sea que un valor añadido desde aquí quedaba como
   * el ÚNICO de su mesa que se puede vender en corto, en silencio, mientras los
   * otros ocho llevan longOnly desde el primer día.
   *
   * Va como interruptor en la propia insignia que ya existía, para no meter una
   * sexta columna en una fila que en móvil vive con 348 px.
   */
  const toggleLongOnly = (epic: string) =>
    patch({
      instruments: instruments.map((i) =>
        i.epic === epic ? { ...i, longOnly: !i.longOnly } : i
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
                      <button
                        onClick={() => toggleLongOnly(i.epic)}
                        disabled={busy}
                        aria-pressed={!!i.longOnly}
                        aria-label={
                          i.longOnly
                            ? `Permitir cortos en ${i.epic}`
                            : `Solo compras en ${i.epic}`
                        }
                        title={
                          i.longOnly
                            ? "Solo compras: el motor bloquea los cortos. Clic para permitirlos."
                            : "Cortos permitidos. Clic para limitarlo a solo compras."
                        }
                        /*
                          32×14 medía al convertir la insignia en interruptor
                          (pasada 188): comprobé que la fila no desbordaba y no
                          miré el tamaño táctil, así que dejé veinte dianas de
                          catorce píxeles de alto en el Lab. La altura mínima no
                          ensancha la fila —la marcan los controles de 34 px de
                          al lado—, que era justo lo que quería evitar.
                        */
                        className={`inline-flex min-h-[32px] shrink-0 items-center rounded px-1 text-[8px] ${
                          i.longOnly
                            ? "bg-long/15 text-long"
                            : "border border-cement text-muted hover:text-dim"
                        }`}
                      >
                        LONG
                      </button>
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
                      {RESOLUCIONES.map((r) => (
                        <option key={r.k} value={r.k}>{r.label}</option>
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
          {/*
            Un activo sin mesa no es un activo sin clasificar: es un activo mal
            dimensionado. Si alguno queda así, hay que decir qué implica.
          */}
          {!!byDesk.otros?.length && (
            <p className="mt-2 flex items-start gap-1.5 rounded-lg border border-short/30 bg-short/5 px-2.5 py-2 text-[11px] leading-relaxed text-dim">
              <span aria-hidden>⚠️</span>
              <span>
                {byDesk.otros.length}{" "}
                {byDesk.otros.length === 1 ? "instrumento está" : "instrumentos están"} sin mesa: el
                motor los dimensiona con apalancamiento 5 por defecto —no el de su clase de activo— y
                ningún Gestor de mesa los sigue. Quítalos y vuélvelos a añadir eligiendo mesa.
              </span>
            </p>
          )}
          {aviso && (
            <p role="alert" className="mt-2 text-[11px] leading-relaxed text-short">
              {aviso}
            </p>
          )}
          <div className="mt-2 flex gap-1.5">
            <input
              value={w}
              onChange={(e) => {
                setW(e.target.value);
                if (aviso) setAviso(null);
              }}
              onKeyDown={(e) => e.key === "Enter" && add()}
              placeholder="EPIC ej. NZDUSD"
              className="min-h-[36px] w-full min-w-0 border border-cement bg-ink px-2 py-1.5 font-mono text-[11px] text-white placeholder:text-muted focus:border-accent"
            />
            <select
              value={mesa}
              onChange={(e) => setMesa(e.target.value)}
              disabled={busy}
              aria-label="Mesa del instrumento nuevo"
              title="Decide el apalancamiento con el que se calcula el tamaño"
              className={`min-h-[36px] shrink-0 rounded-md border border-cement bg-ink px-1 font-mono text-[10px] ${
                mesa ? "text-accent" : "text-muted"
              }`}
            >
              <option value="">Mesa…</option>
              {DESK_ORDER.filter((d) => d.key !== "otros").map((d) => (
                <option key={d.key} value={d.key}>
                  {d.label}
                </option>
              ))}
            </select>
            <button
              onClick={add}
              disabled={busy || !w.trim() || !mesa}
              aria-label="Añadir instrumento"
              title={!mesa ? "Elige la mesa: define el apalancamiento" : "Añadir instrumento"}
              className="min-h-[36px] min-w-[40px] rounded-lg bg-accent px-3 font-display text-xs text-onaccent disabled:opacity-40"
            >
              +
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 border-t border-industrial pt-3">
          <NumField label="SMA rápida" value={cfg.strategy.fast} step={1} busy={busy} min={LIMITES.strategy.fast[0]} max={LIMITES.strategy.fast[1]}
            onCommit={(v) => patch({ strategy: { fast: v } })} />
          <NumField label="SMA lenta" value={cfg.strategy.slow} step={1} busy={busy} min={LIMITES.strategy.slow[0]} max={LIMITES.strategy.slow[1]}
            onCommit={(v) => patch({ strategy: { slow: v } })} />
          <NumField label="Periodo RSI" value={cfg.strategy.rsiPeriod} step={1} busy={busy} min={LIMITES.strategy.rsiPeriod[0]} max={LIMITES.strategy.rsiPeriod[1]}
            onCommit={(v) => patch({ strategy: { rsiPeriod: v } })} />
          <NumField label="Confianza mínima" value={cfg.strategy.minConfidence} step={0.05} busy={busy} min={LIMITES.strategy.minConfidence[0]} max={LIMITES.strategy.minConfidence[1]}
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
            <NumField label="Periodo ADX" value={cfg.strategy.adxPeriod} step={1} busy={busy} min={LIMITES.strategy.adxPeriod[0]} max={LIMITES.strategy.adxPeriod[1]}
              onCommit={(v) => patch({ strategy: { adxPeriod: v } })} />
            <NumField label="Umbral ADX" value={cfg.strategy.adxThreshold} step={1} busy={busy} min={LIMITES.strategy.adxThreshold[0]} max={LIMITES.strategy.adxThreshold[1]}
              onCommit={(v) => patch({ strategy: { adxThreshold: v } })} />
          </div>
        </div>

        <div className="space-y-2 border-t border-industrial pt-3">
          <p className="tag">Quién decide</p>
          {/*
            Esta sección MENTÍA. El único interruptor visible estaba atado a
            pmMode —el Gestor inline por OpenRouter, deprecado y apagado— y se
            rotulaba "GESTOR DE CARTERA IA — la IA decide: OFF". Mientras tanto
            quien decide de verdad cada operación es cloudPm, que está encendido
            y no tenía NINGÚN control ni indicador aquí. O sea que la pantalla
            de configuración afirmaba que la IA no manda, en un bot donde la IA
            manda: comprobado contra la config en vivo (pmMode false, cloudPm
            true) y contra el diario, lleno de sus decisiones.
          */}
          <button
            disabled={busy}
            onClick={() => patch({ cloudPm: !cfg.cloudPm })}
            className={`flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-[11px] font-medium ${
              cfg.cloudPm ? "border-accent/50 bg-accent/10 text-accent" : "border-cement text-muted"
            }`}
          >
            🧠 Gestor en la nube — decide cada ciclo
            <span>{cfg.cloudPm ? "ON" : "OFF"}</span>
          </button>
          <p className="text-[10px] leading-snug text-muted">
            {cfg.cloudPm ? (
              <>
                Cuatro routines de Claude —una por mesa— leen mercado, noticias y su propio histórico, y
                dejan sus decisiones en cola; el motor las ejecuta dentro de tus límites de riesgo. Sus
                tesis están en el{" "}
                <a href="/journal" className="text-accent underline">Diario IA</a>.
              </>
            ) : (
              <>Apagado: abre y cierra solo el motor técnico, con sus reglas de SMA, RSI y ADX.</>
            )}
          </p>
          <div className="flex items-center justify-between rounded-lg border border-industrial px-3 py-2 text-[11px]">
            <span className="text-muted">🗳️ Comité IA — vota antes de abrir</span>
            <span className={cfg.committee ? "text-long" : "text-muted"}>
              {cfg.committee ? `ON · ${cfg.committeeMinApprovals ?? 1} aprob. mín.` : "OFF"}
            </span>
          </div>
          {cfg.pmMode && (
            <div className="flex items-center justify-between rounded-lg border border-short/40 bg-short/5 px-3 py-2 text-[11px]">
              <span className="text-short">Gestor inline (OpenRouter) — deprecado, gasta por tick</span>
              <button disabled={busy} onClick={() => patch({ pmMode: false })} className="underline">
                apagar
              </button>
            </div>
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
