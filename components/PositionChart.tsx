"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  createChart,
  ColorType,
  CrosshairMode,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
} from "lightweight-charts";
import type { OpenPos } from "./types";
import { RESOLUCIONES } from "@/lib/model";
import { fmt, pdec, pnlClass, pnlFmt, uds, useFocusTrap, useReturnFocus } from "./ui";

type Candle = { time: string; open: number; high: number; low: number; close: number };

const RES = RESOLUCIONES.map((r) => ({ k: r.k, label: r.label, max: r.maxGrafico }));

export default function PositionChart({
  pos,
  onClose,
  divisa = "",
  marcoMotor,
  rMult,
}: {
  pos: OpenPos;
  onClose: () => void;
  /** Divisa de la cuenta: el P&L de la cabecera llevaba un € fijo. */
  divisa?: string;
  /** Resolución con la que el motor decide en ESTE activo. */
  marcoMotor?: string;
  /**
   * Resultado en múltiplos de RIESGO. Lo calcula la tabla —que es quien tiene
   * el cambio de divisa para llevar el riesgo a la moneda de la cuenta— y se
   * pasa hecho, en vez de traer aquí toda esa fontanería.
   */
  rMult?: number | null;
}) {
  /**
   * Abrir en el marco que usa el motor para este activo, no en 4 horas fijas.
   *
   * Las líneas que dibuja el gráfico —entrada, stop y objetivo— se calcularon
   * con el ATR de SU resolución. Con 13 de los 20 activos operando en diario,
   * abrir el modal en 4 horas enseñaba esos niveles sobre velas que no son las
   * que los produjeron: un stop a 2×ATR diario se ve arbitrario sobre un
   * gráfico de 4 horas. Los otros marcos siguen a un clic.
   */
  const [res, setRes] = useState(
    marcoMotor && RES.some((r) => r.k === marcoMotor) ? marcoMotor : "HOUR_4"
  );
  const [loading, setLoading] = useState(true);
  const [empty, setEmpty] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  useReturnFocus(true);
  useFocusTrap(boxRef, true);

  // El modal se abre sin foco dentro: quien navega con teclado seguiría en la
  // página de detrás. Lo llevamos al botón de cerrar, que es la salida.
  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  const dec = pdec(pos.entry);
  const cur = pos.currentPrice ?? pos.entry;
  const curFavor = cur === pos.entry ? 0 : pos.direction === "BUY" ? cur - pos.entry : pos.entry - cur;
  const curTone = curFavor > 0 ? "text-long" : curFavor < 0 ? "text-short" : "text-dim";
  /**
   * Cuánto recorrido queda hasta el stop. Es la cifra que dice si la posición
   * está holgada o al borde, y la tabla de posiciones ya la enseña; aquí, con
   * el nivel delante en el gráfico, faltaba justamente el "a cuánto está".
   */
  const distStop =
    pos.stopLevel == null || !cur
      ? undefined
      : `${((Math.abs(cur - pos.stopLevel) / cur) * 100).toFixed(2)}% de recorrido`;

  // crear el chart una vez (pos es estable durante la vida del modal)
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    // lightweight-charts pinta en canvas y no entiende variables CSS: hay que
    // leer los tokens del tema y pasárselos como color. Sin esto el gráfico
    // sale siempre oscuro, también sobre el tema claro.
    // lightweight-charts trae su propio parser de color y NO entiende la
    // sintaxis moderna con espacios —`rgb(140 148 160)`—, que es como vienen
    // los tokens. Hay que pasárselo con comas o revienta al crear el gráfico.
    const tok = (name: string, alpha?: number) => {
      const raw = getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim();
      const [r, g, b] = (raw || "140 148 160").split(/[\s,]+/).map(Number);
      return alpha == null ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${alpha})`;
    };
    const C = {
      text: tok("muted"),
      grid: tok("industrial", 0.6),
      border: tok("industrial"),
      up: tok("long"),
      down: tok("short"),
      entry: tok("dim"),
      tp: tok("accent"),
    };
    const chart = createChart(el, {
      width: el.clientWidth || 760,
      height: 360,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: C.text,
        fontFamily: "ui-monospace, SFMono-Regular, monospace",
      },
      grid: {
        vertLines: { color: C.grid },
        horzLines: { color: C.grid },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: C.border },
      timeScale: { borderColor: C.border, timeVisible: true, secondsVisible: false },
    });
    const series = chart.addCandlestickSeries({
      upColor: C.up,
      downColor: C.down,
      wickUpColor: C.up,
      wickDownColor: C.down,
      borderVisible: false,
      priceFormat: { type: "price", precision: dec, minMove: Math.pow(10, -dec) },
    });
    /**
     * `etiquetaEje` decide si la línea pone además su valor en el eje de precios.
     *
     * La de ENTRADA no lo pone, y no es capricho: el eje ya dibuja siempre la
     * etiqueta del último precio, y una posición recién abierta tiene la entrada
     * pegada al precio actual. Visto en una captura de SILVER, con entrada
     * 64,561 y precio 64,356 sobre una escala de 52 a 70: las dos etiquetas se
     * montaban una encima de otra, y el rótulo "Entrada" acababa solapando
     * también al del stop. Justo la esquina donde se leen los niveles.
     *
     * El stop y el objetivo sí la llevan: están a 2 y 3 ATR del precio por
     * construcción, así que no colisionan. Y los cuatro valores exactos están
     * en la rejilla de abajo.
     */
    const mkLine = (
      price: number | null | undefined,
      color: string,
      title: string,
      dashed = false,
      etiquetaEje = true
    ) =>
      price == null
        ? null
        : series.createPriceLine({
            price,
            color,
            lineWidth: 1,
            lineStyle: dashed ? LineStyle.Dashed : LineStyle.Solid,
            axisLabelVisible: etiquetaEje,
            title,
          });
    mkLine(pos.entry, C.entry, "Entrada", true, false);
    mkLine(pos.stopLevel, C.down, "SL");
    mkLine(pos.limitLevel, C.tp, "TP");

    // Marca de ENTRADA en su vela: el gráfico enseñaba los niveles pero no
    // CUÁNDO se entró, que es lo primero que se busca al abrirlo.
    if (pos.openedAt) {
      const t = Date.parse(pos.openedAt);
      if (Number.isFinite(t)) {
        series.setMarkers([
          {
            time: Math.floor(t / 1000) as any,
            position: pos.direction === "BUY" ? "belowBar" : "aboveBar",
            color: pos.direction === "BUY" ? C.up : C.down,
            shape: pos.direction === "BUY" ? "arrowUp" : "arrowDown",
            text: `Entrada ${pos.direction === "BUY" ? "LONG" : "SHORT"}`,
          },
        ]);
      }
    }

    chartRef.current = chart;
    seriesRef.current = series;

    /**
     * Reajuste de ancho por observador, además del evento de ventana.
     *
     * AVISO para quien lea esto: NO se añadió por un fallo comprobado. Creí
     * medir un lienzo de 266 px dentro de un contenedor de 358 y di por hecho
     * que sobraba un 26 %; al medir bien resultó que el contenedor son 332 y
     * que los lienzos suman 266 (panel) + 66 (eje de precios) = 332 exactos.
     * El gráfico ya ocupaba todo su sitio. Lo que comparé fue el lienzo del
     * panel contra un envoltorio distinto.
     *
     * Se queda porque cubre un caso que el evento de ventana no cubre —que el
     * contenedor cambie de ancho sin que cambie la ventana— y no cuesta nada,
     * pero que conste que aquí no había nada roto.
     */
    const aplicarAncho = () => {
      const w = el?.clientWidth;
      if (chartRef.current && w) chart.applyOptions({ width: w });
    };
    const anchoObs = new ResizeObserver(aplicarAncho);
    if (el) anchoObs.observe(el);
    const onResize = aplicarAncho;
    window.addEventListener("resize", onResize);

    // Si se cambia de tema con el modal abierto, repintar con los tokens nuevos
    const themeObs = new MutationObserver(() => {
      chart.applyOptions({
        layout: { textColor: tok("muted") },
        grid: { vertLines: { color: tok("industrial", 0.6) }, horzLines: { color: tok("industrial", 0.6) } },
        rightPriceScale: { borderColor: tok("industrial") },
        timeScale: { borderColor: tok("industrial") },
      });
      series.applyOptions({
        upColor: tok("long"),
        downColor: tok("short"),
        wickUpColor: tok("long"),
        wickDownColor: tok("short"),
      });
    });
    themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    return () => {
      themeObs.disconnect();
      anchoObs.disconnect();
      window.removeEventListener("resize", onResize);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // cargar velas al cambiar de temporalidad
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setEmpty(false);
    const r = RES.find((x) => x.k === res);
    fetch(`/api/bot/candles?epic=${encodeURIComponent(pos.epic)}&resolution=${res}&max=${r?.max ?? 150}`)
      .then((rp) => rp.json())
      .then((d) => {
        if (!alive || !seriesRef.current) return;
        const cs: Candle[] = Array.isArray(d.candles) ? d.candles : [];
        if (!cs.length) {
          setEmpty(true);
          seriesRef.current.setData([]);
          return;
        }
        const seen = new Set<number>();
        const data = cs
          .map((c) => ({ time: Math.floor(Date.parse(c.time) / 1000), open: c.open, high: c.high, low: c.low, close: c.close }))
          .filter((c) => Number.isFinite(c.time))
          .sort((a, b) => a.time - b.time)
          .filter((c) => (seen.has(c.time) ? false : (seen.add(c.time), true)));
        seriesRef.current.setData(data as never);
        chartRef.current?.timeScale().fitContent();
      })
      .catch(() => alive && setEmpty(true))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [res, pos.epic]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  /**
   * El modal se cuelga del <body>, no del sitio del árbol donde vive la tabla.
   *
   * Con `fixed inset-0` uno espera que el fondo cubra la ventana entera. Medido
   * contra producción, no lo hacía: en una ventana de 1280×900 el diálogo salía
   * de 1280×884 empezando en y=16, dejando una banda de 16 px arriba sin
   * atenuar y sin responder al clic-para-cerrar, justo sobre la cabecera.
   *
   * La causa es el CONTENEDOR PADRE, no el modal. La tabla de posiciones vive
   * dentro de un `space-y-4`, que en Tailwind es `> * + * { margin-top: 1rem }`.
   * El modal es un hijo más de ese contenedor, así que heredaba 16 px de margen
   * superior — y en un elemento fijo con las cuatro anclas puestas, el margen no
   * lo desplaza: le RESTA tamaño. 900 − 16 = 884. Cuadra al píxel.
   *
   * Lo comprobé metiendo un div de prueba con `fixed inset-0` en cada nivel del
   * árbol: todos daban 1280×900 en (0,0). El árbol no era el problema; el
   * margen que le ponía su hermano sí.
   *
   * El portal lo saca del alcance de cualquier `space-y-*`, `gap` o margen del
   * contenedor que lo aloje. Es la solución que no depende de dónde se monte.
   */
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/80 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        ref={boxRef}
        className="w-full max-w-4xl overflow-hidden rounded-xl border border-industrial bg-soft shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* header */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-industrial px-5 py-3.5">
          <div className="flex items-center gap-3">
            <span className="font-mono text-sm font-semibold text-white">{pos.epic}</span>
            {/*
              El TAMAÑO faltaba en toda esta pantalla: cabecera, niveles y pie.
              Sin él, el P&L de al lado no se puede reconciliar con el recorrido
              de precio que enseña el gráfico — que es justo para lo que se abre
              este modal. Y la fila de la tabla desde la que se llega SÍ lo trae:
              el detalle perdía un dato que ya estaba a la vista un clic antes.
              Es el mismo hueco que tenía el historial de operaciones cerradas.
            */}
            <span className={`font-mono text-xs ${pos.direction === "BUY" ? "text-long" : "text-short"}`}>
              {pos.direction === "BUY" ? "▲ LONG" : "▼ SHORT"}
              <span className="ml-1.5 text-muted" title="Tamaño de la posición">
                {uds(pos.size)}
              </span>
            </span>
            {/*
              El múltiplo de R al lado del P&L, como en la tabla ("PNL · R").
              Es la forma en que un operador puntúa una posición viva —"voy
              +1,2R"— y es lo que la hace comparable con las demás aunque los
              importes sean de tamaños distintos. Estaba en la fila desde la que
              se abre este modal y se perdía al abrirlo, igual que le pasaba al
              tamaño hasta la pasada 205.
            */}
            <span className={`font-mono text-xs ${pnlClass(pos.upl)}`}>
              {pnlFmt(pos.upl)}
              {divisa && <span className="ml-1 text-muted">{divisa}</span>}
              {rMult != null && (
                <span className="ml-1.5 text-muted" title="Resultado en múltiplos del riesgo hasta el stop">
                  {pnlFmt(rMult)}R
                </span>
              )}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex overflow-hidden rounded-md border border-industrial">
              {RES.map((r) => (
                <button
                  key={r.k}
                  onClick={() => setRes(r.k)}
                  className={`px-2 py-1 font-mono text-[11px] transition-colors ${
                    res === r.k ? "bg-accent text-onaccent" : "text-muted hover:text-dim"
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <button
              onClick={onClose}
              ref={closeRef}
              aria-label="Cerrar"
              className="rounded-md border border-cement px-2.5 py-1 text-xs text-muted transition hover:border-short hover:text-white"
            >
              ✕
            </button>
          </div>
        </div>

        {/* chart */}
        <div className="relative px-3 py-3">
          <div ref={wrapRef} className="h-[360px] w-full" />
          {loading && <div className="dotgrid absolute inset-3 rounded-lg" />}
          {empty && !loading && (
            <div className="absolute inset-3 flex items-center justify-center text-sm text-muted">
              Sin datos para esta temporalidad
            </div>
          )}
          <p className="mt-1 text-center font-mono text-[10px] text-muted">
            arrastra para mover · rueda para zoom · doble clic para reencuadrar
          </p>
        </div>

        {/* niveles */}
        <div className="grid grid-cols-2 gap-px border-t border-industrial bg-industrial sm:grid-cols-4">
          <Detail label="ENTRADA" value={fmt(pos.entry, dec)} />
          <Detail label="ACTUAL" value={fmt(cur, dec)} tone={curTone} />
          <Detail
            label="STOP LOSS"
            value={pos.stopLevel == null ? "—" : fmt(pos.stopLevel, dec)}
            sub={distStop}
            tone={pos.stopLevel == null ? "text-muted" : "text-short"}
          />
          {/*
            Decía "trailing" cuando no había objetivo. Eso no es un dato, es una
            explicación inventada: que el broker no tenga orden de objetivo solo
            significa eso, y si el trailing está activo o no depende de la
            configuración de riesgo, que esta ventana ni siquiera recibe. Peor
            aún, la excusa tapó durante semanas un fallo real — el PUT de Capital
            borraba el take-profit en el primer ajuste del stop— porque la
            pantalla daba su ausencia por normal. La celda de al lado, con el
            mismo caso, ya ponía "—".
          */}
          <Detail
            label="TAKE PROFIT"
            value={pos.limitLevel == null ? "—" : fmt(pos.limitLevel, dec)}
            sub={pos.limitLevel == null ? "sin orden de objetivo" : undefined}
            tone={pos.limitLevel == null ? "text-muted" : "text-accent"}
          />
        </div>
      </div>
    </div>,
    document.body
  );
}

function Detail({
  label,
  value,
  sub,
  tone = "text-white",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: string;
}) {
  return (
    <div className="bg-soft px-4 py-3">
      <p className="tag">{label}</p>
      <p className={`mt-1 font-mono text-sm ${tone}`}>{value}</p>
      {sub && <p className="mt-0.5 font-mono text-[10px] text-muted">{sub}</p>}
    </div>
  );
}
