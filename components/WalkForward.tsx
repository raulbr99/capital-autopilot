"use client";

import { useRef, useState } from "react";
import { SectionHead, fmt, pf, Sparkline } from "./ui";
import { RESOLUCIONES } from "@/lib/model";

type Metrics = {
  trades: number;
  winRate: number;
  netPnl: number;
  profitFactor: number;
  maxDrawdown: number;
};
type Fold = {
  index: number;
  best: { fast: number; slow: number; atrStopMult: number; atrTpMult: number };
  is: Metrics;
  oos: Metrics;
};
type WFResult = {
  epic: string;
  folds: Fold[];
  oosAggregate: Metrics;
  isAggregate: Metrics;
  degradation: number;
  oosEquity: number[];
  verdict: "edge" | "weak" | "none";
  note: string;
  error?: string;
};

const VERDICT: Record<string, { label: string; cls: string }> = {
  edge: { label: "Ventaja probable", cls: "bg-long/15 text-long border-long/40" },
  weak: { label: "Ventaja débil", cls: "bg-accent/15 text-accent border-accent/40" },
  none: { label: "Sin ventaja", cls: "bg-short/15 text-short border-short/40" },
};

/** Con pocas operaciones fuera de muestra el veredicto es ruido, no evidencia. */
const MIN_OOS = 20;

export default function WalkForward({
  watchlist,
  instruments = [],
}: {
  watchlist: string[];
  /** Con su resolución real: es la que el motor usa para decidir en cada uno. */
  instruments?: { epic: string; resolution: string }[];
}) {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState("");
  const [results, setResults] = useState<WFResult[]>([]);
  /**
   * "motor" = validar cada activo en SU resolución, la que el bot usa de verdad.
   *
   * El valor por defecto era "HOUR", y el motor no opera NI UN activo en
   * horaria: son 13 en diario y 7 en cuatro horas. O sea que la herramienta de
   * validación estaba midiendo una estrategia que no existe — parámetros
   * óptimos, retenciones y veredictos de un sistema que nadie ejecuta.
   * Se mantiene la opción de forzar una resolución concreta para experimentar,
   * pero deja de ser lo que sale por defecto.
   */
  const [resolution, setResolution] = useState("motor");
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  /**
   * Validar el universo entero son 20 llamadas en serie: medido, entre 25 y 55
   * segundos. No había forma de pararlo — el botón simplemente se deshabilitaba
   * y ponía "…" — así que si te equivocabas de resolución tocaba esperar el
   * minuto entero o recargar la página, tirando los resultados ya obtenidos.
   */
  const cancelar = useRef(false);
  const aborto = useRef<AbortController | null>(null);
  const [hecho, setHecho] = useState({ n: 0, total: 0 });
  const [detenido, setDetenido] = useState(false);

  // Lo prometedor arriba: con 20 activos, una lista sin orden esconde lo poco
  // que de verdad tiene ventaja entre lo que no.
  const rank = (r: WFResult) =>
    r.error ? -99 : (r.oosAggregate.trades < MIN_OOS ? -1 : 0) + (r.oosAggregate.profitFactor || 0);
  const ranked = [...results].sort((a, b) => rank(b) - rank(a));

  const run = async () => {
    setLoading(true);
    setErr(null);
    setResults([]);
    setDetenido(false);
    cancelar.current = false;
    setHecho({ n: 0, total: watchlist.length });
    const acc: WFResult[] = [];
    try {
      for (let i = 0; i < watchlist.length; i++) {
        if (cancelar.current) {
          setDetenido(true);
          break;
        }
        const epic = watchlist[i];
        const res =
          resolution === "motor"
            ? instruments.find((x) => x.epic === epic)?.resolution || "HOUR_4"
            : resolution;
        setProgress(epic);
        setHecho({ n: i, total: watchlist.length });
        aborto.current = new AbortController();
        const r = await fetch(
          /**
           * 1000 velas, no 600. La ruta admite hasta mil y el panel pedía la
           * mitad larga, con una consecuencia que solo se ve al ejecutar la
           * validación entera: NINGUNO de los 20 activos alcanzaba las 20
           * operaciones fuera de muestra, así que el walk-forward no podía
           * concluir nada. Medido en MSFT: con 600 velas salen 19 operaciones
           * OOS en 4 ventanas; con 1000, 41 en 9 — y el profit factor pasa de
           * 1,47 a 1,34, que es la lectura honesta: más datos, algo menos de
           * brillo y por fin una muestra defendible.
           *
           * Cuesta tiempo: de 1,6 a 3,8 s por activo (medido en GOLD), o sea
           * que los 20 pasan de ~40 s a ~80. Aceptable para una herramienta que
           * se lanza a mano, tiene barra de progreso y se puede detener desde
           * la pasada 90. Un validador rápido que nunca valida no sirve de nada.
           */
          `/api/bot/walkforward?epic=${epic}&resolution=${res}&max=1000`,
          { signal: aborto.current.signal }
        );
        const data = await r.json();
        if (data.configured === false) {
          setErr("Conecta Capital.com para validar.");
          break;
        }
        acc.push(data);
        setResults([...acc]);
        setHecho({ n: i + 1, total: watchlist.length });
      }
    } catch (e: any) {
      // Abortar es una decisión del usuario, no un error que reportar
      if (e?.name !== "AbortError") setErr(e.message);
      else setDetenido(true);
    } finally {
      setLoading(false);
      setProgress("");
      aborto.current = null;
    }
  };

  const detener = () => {
    cancelar.current = true;
    aborto.current?.abort();
  };

  return (
    <div className="border border-industrial bg-soft rounded-xl">
      <SectionHead
        label="Walk-forward · validación"
        right={
          <div className="flex items-center gap-2">
            <select
              value={resolution}
              aria-label="Resolución de velas"
              onChange={(e) => setResolution(e.target.value)}
              className="border border-cement bg-ink px-1.5 py-0.5 font-mono text-[10px] text-dim"
            >
              <option value="motor">la del motor</option>
              {RESOLUCIONES.map((r) => (
                <option key={r.k} value={r.k}>{r.label}</option>
              ))}
            </select>
            {/*
              Sin universo cargado el bucle daba cero vueltas: pulsar "Validar"
              en los primeros segundos —antes de que llegue la configuración—
              no hacía absolutamente nada y no lo decía. Un botón que no hace
              nada tiene que verse como tal.
            */}
            <button
              onClick={loading ? detener : run}
              disabled={!loading && watchlist.length === 0}
              title={!loading && watchlist.length === 0 ? "Cargando el universo de activos…" : undefined}
              className={`px-3 py-1 font-display text-[11px] disabled:cursor-not-allowed disabled:opacity-40 ${
                loading ? "border border-short text-short" : "bg-accent text-onaccent"
              }`}
            >
              {loading ? "Detener" : `▶ Validar${watchlist.length ? ` ${watchlist.length}` : ""}`}
            </button>
          </div>
        }
      />
      <div className="p-4">
        <p className="mb-3 text-[11px] leading-relaxed text-muted">
          Busca los mejores parámetros en un tramo del histórico y los prueba en el tramo{" "}
          <span className="text-dim">siguiente, que no ha visto</span>, deslizando la ventana. Solo cuenta
          lo que rinde <span className="text-white">fuera de muestra</span>: cualquiera puede encontrar
          parámetros que brillan sobre el pasado que ya conoce. La{" "}
          <span className="text-dim">retención</span> mide cuánto de la ventaja sobrevive a ese salto —
          por debajo del 60 % es sobreajuste. Las cifras ya incluyen el coste de la horquilla.
        </p>
        {err && <p className="text-xs text-short">{err}</p>}
        {loading && (
          <div className="mb-3">
            <div className="mb-1 flex items-baseline justify-between font-mono text-[11px]">
              <span className="text-accent">Validando {progress}…</span>
              <span className="tabular-nums text-muted">
                {hecho.n}/{hecho.total}
              </span>
            </div>
            <div className="h-1 w-full overflow-hidden rounded-full bg-industrial">
              <div
                className="h-full rounded-full bg-accent transition-all"
                style={{ width: `${hecho.total ? (hecho.n / hecho.total) * 100 : 0}%` }}
              />
            </div>
          </div>
        )}
        {detenido && !loading && (
          <p className="mb-3 font-mono text-[11px] text-muted">
            Detenido en {results.length} de {hecho.total}. Lo validado se mantiene.
          </p>
        )}

        {/*
          Mismo aviso que el backtest, y aquí pesa más: esta pantalla emite
          VEREDICTOS ("con ventaja", "se degrada") sobre una simulación que
          mantiene el stop y el objetivo fijos, mientras el motor en vivo mueve
          el stop a la entrada, lo arrastra y cierra parte de la posición.
          En producción, 8 de las 35 cerradas terminaron a cero —la firma del
          breakeven— y esta simulación no puede producir ninguna.
        */}
        {results.length > 0 && (
          <p className="mb-3 flex items-start gap-1.5 rounded-lg border border-industrial bg-base px-3 py-2 text-[11px] leading-relaxed text-muted">
            <span aria-hidden>⚠️</span>
            <span>
              El veredicto mide una estrategia de stop y objetivo fijos.{" "}
              <span className="text-dim">No simula la gestión activa</span> —stop a la entrada,
              trailing y cierre parcial— que el motor sí aplica en vivo.
            </span>
          </p>
        )}
        {results.length > 1 && (
          <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-industrial bg-base px-3 py-2 text-[11px]">
            <span className="text-muted">
              {results.filter((r) => !r.error).length} activos validados
            </span>
            <span className="text-long">
              {results.filter((r) => r.verdict === "edge" && r.oosAggregate.trades >= MIN_OOS).length} con ventaja
            </span>
            <span className="text-muted">
              {results.filter((r) => !r.error && r.oosAggregate.trades < MIN_OOS).length} con muestra corta
            </span>
          </div>
        )}

        <div className="space-y-2">
          {ranked.map((r) => (
            <div key={r.epic} className="border border-industrial bg-ink">
              {r.error ? (
                <div className="flex items-center justify-between px-3 py-2">
                  <span className="font-display text-sm">{r.epic}</span>
                  <span className="font-mono text-[10px] text-muted">{r.error}</span>
                </div>
              ) : (
                <>
                  <button
                    onClick={() => setOpen(open === r.epic ? null : r.epic)}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-display text-sm">{r.epic}</span>
                      {(() => {
                        // Con muestra corta el veredicto NO se pinta en verde:
                        // decir "ventaja probable" en la tarjeta y "0 con
                        // ventaja" en el resumen es contradecirse en pantalla.
                        const corta = r.oosAggregate.trades < MIN_OOS;
                        return (
                          <>
                            <span
                              className={`whitespace-nowrap rounded border px-2 py-0.5 text-[9px] font-medium ${
                                corta ? "border-cement text-muted" : VERDICT[r.verdict].cls
                              }`}
                              title={corta ? "Sin muestra suficiente para sostener este veredicto" : undefined}
                            >
                              {/*
                                Con muestra corta el color ya se neutralizaba,
                                pero el TEXTO seguía dictando sentencia:
                                "Ventaja probable" sobre 15 operaciones, o
                                "Sin ventaja" sobre 3. Y el resumen de arriba
                                decía a la vez "0 con ventaja". Dos afirmaciones
                                opuestas en la misma tarjeta, y la de la fila es
                                la que se lee primero. Sin muestra no hay
                                veredicto que dar, ni a favor ni en contra.
                              */}
                              {corta ? "Sin concluir" : VERDICT[r.verdict].label}
                            </span>
                            {corta && (
                              <span
                                className="whitespace-nowrap rounded border border-cement px-2 py-0.5 text-[9px] text-muted"
                                title={`Solo ${r.oosAggregate.trades} ${r.oosAggregate.trades === 1 ? "operación" : "operaciones"} fuera de muestra: por debajo de ${MIN_OOS} el veredicto es ruido`}
                              >
                                sin muestra · {r.oosAggregate.trades}
                              </span>
                            )}
                          </>
                        );
                      })()}
                    </div>
                    <Sparkline data={r.oosEquity} up={r.oosAggregate.netPnl >= 0} w={110} h={30} />
                  </button>

                  <div className="grid grid-cols-2 gap-px border-t border-industrial bg-industrial md:grid-cols-4">
                    <Cmp label="P&L fuera de muestra" is={r.isAggregate.netPnl} oos={r.oosAggregate.netPnl} money />
                    <Cmp label="Profit factor" is={r.isAggregate.profitFactor} oos={r.oosAggregate.profitFactor} factor />
                    <Cmp label="Aciertos" is={r.isAggregate.winRate} oos={r.oosAggregate.winRate} pct />
                    <div className="bg-soft p-2.5">
                      <p className="tag">Retención fuera de muestra</p>
                      <p className={`font-mono text-sm ${r.degradation >= 0.6 ? "text-long" : "text-short"}`}>
                        {(r.degradation * 100).toFixed(0)}%
                      </p>
                    </div>
                  </div>

                  <p className="border-t border-industrial px-3 py-2 text-[11px] text-dim">{r.note}</p>

                  {open === r.epic && (
                    <div className="overflow-x-auto border-t border-industrial">
                      <table className="w-full text-left font-mono text-[10px]">
                        <thead>
                          <tr className="text-muted">
                            <th className="px-3 py-1.5 font-normal">Ventana</th>
                            <th className="px-3 py-1.5 font-normal">Params (SMA r/l · stop/obj)</th>
                            <th className="px-3 py-1.5 font-normal">IS PnL</th>
                            <th className="px-3 py-1.5 font-normal">OOS PnL</th>
                            <th className="px-3 py-1.5 font-normal">OOS PF</th>
                          </tr>
                        </thead>
                        <tbody>
                          {r.folds.map((f) => (
                            <tr key={f.index} className="border-t border-industrial/50">
                              <td className="px-3 py-1.5 text-dim">#{f.index + 1}</td>
                              <td className="px-3 py-1.5 text-white">
                                {f.best.fast}/{f.best.slow}/{f.best.atrStopMult}/{f.best.atrTpMult}
                              </td>
                              <td className={`px-3 py-1.5 ${f.is.netPnl >= 0 ? "text-long" : "text-short"}`}>{fmt(f.is.netPnl)}</td>
                              <td className={`px-3 py-1.5 ${f.oos.netPnl >= 0 ? "text-long" : "text-short"}`}>{fmt(f.oos.netPnl)}</td>
                              <td className="px-3 py-1.5 text-dim">{pf(f.oos.profitFactor)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Cmp({
  label,
  is,
  oos,
  money,
  factor,
  pct,
}: {
  label: string;
  is: number;
  oos: number;
  money?: boolean;
  factor?: boolean;
  pct?: boolean;
}) {
  const f = (v: number) => (factor ? pf(v) : pct ? `${v.toFixed(0)}%` : fmt(v));
  return (
    <div className="bg-soft p-2.5">
      <p className="tag">{label}</p>
      <p className="font-mono text-sm">
        <span className={oos >= (factor ? 1 : 0) ? "text-long" : "text-short"}>{f(oos)}</span>
        <span className="text-muted" title="Dentro de muestra (el tramo donde se optimizó)">
          {" "}· dentro {f(is)}
        </span>
      </p>
    </div>
  );
}
