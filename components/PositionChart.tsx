"use client";

import { useEffect, useRef, useState } from "react";
import {
  createChart,
  ColorType,
  CrosshairMode,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
} from "lightweight-charts";
import type { OpenPos } from "./types";
import { fmt, pdec, pnlClass, pnlFmt, useFocusTrap, useReturnFocus } from "./ui";

type Candle = { time: string; open: number; high: number; low: number; close: number };

const RES = [
  { k: "MINUTE_5", label: "5m", max: 200 },
  { k: "MINUTE_15", label: "15m", max: 200 },
  { k: "MINUTE_30", label: "30m", max: 200 },
  { k: "HOUR", label: "1H", max: 200 },
  { k: "HOUR_4", label: "4H", max: 180 },
  { k: "DAY", label: "1D", max: 200 },
  { k: "WEEK", label: "1W", max: 150 },
];

export default function PositionChart({ pos, onClose }: { pos: OpenPos; onClose: () => void }) {
  const [res, setRes] = useState("HOUR_4");
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
    const mkLine = (price: number | null | undefined, color: string, title: string, dashed = false) =>
      price == null
        ? null
        : series.createPriceLine({
            price,
            color,
            lineWidth: 1,
            lineStyle: dashed ? LineStyle.Dashed : LineStyle.Solid,
            axisLabelVisible: true,
            title,
          });
    mkLine(pos.entry, C.entry, "Entrada", true);
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

    const onResize = () => chartRef.current && el && chart.applyOptions({ width: el.clientWidth });
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

  return (
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
            <span className={`font-mono text-xs ${pos.direction === "BUY" ? "text-long" : "text-short"}`}>
              {pos.direction === "BUY" ? "▲ LONG" : "▼ SHORT"}
            </span>
            <span className={`font-mono text-xs ${pnlClass(pos.upl)}`}>{pnlFmt(pos.upl)} €</span>
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
    </div>
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
