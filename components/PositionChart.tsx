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
import { fmt, pnlClass, pnlFmt } from "./ui";

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

function pdec(n: number) {
  const a = Math.abs(n);
  return a < 10 ? 5 : a < 100 ? 3 : a < 1000 ? 2 : 1;
}

export default function PositionChart({ pos, onClose }: { pos: OpenPos; onClose: () => void }) {
  const [res, setRes] = useState("HOUR_4");
  const [loading, setLoading] = useState(true);
  const [empty, setEmpty] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

  const dec = pdec(pos.entry);
  const cur = pos.currentPrice ?? pos.entry;
  const curFavor = cur === pos.entry ? 0 : pos.direction === "BUY" ? cur - pos.entry : pos.entry - cur;
  const curTone = curFavor > 0 ? "text-long" : curFavor < 0 ? "text-short" : "text-dim";

  // crear el chart una vez (pos es estable durante la vida del modal)
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const chart = createChart(el, {
      width: el.clientWidth || 760,
      height: 360,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#8b94a3",
        fontFamily: "ui-monospace, SFMono-Regular, monospace",
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.04)" },
        horzLines: { color: "rgba(255,255,255,0.04)" },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: "#252525" },
      timeScale: { borderColor: "#252525", timeVisible: true, secondsVisible: false },
    });
    const series = chart.addCandlestickSeries({
      upColor: "#34C98A",
      downColor: "#F2567A",
      wickUpColor: "#34C98A",
      wickDownColor: "#F2567A",
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
    mkLine(pos.entry, "#9aa3b2", "Entrada", true);
    mkLine(pos.stopLevel, "#F2567A", "SL");
    mkLine(pos.limitLevel, "#6E7CF7", "TP");

    chartRef.current = chart;
    seriesRef.current = series;

    const onResize = () => chartRef.current && el && chart.applyOptions({ width: el.clientWidth });
    window.addEventListener("resize", onResize);
    return () => {
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
          <Detail label="STOP LOSS" value={pos.stopLevel == null ? "—" : fmt(pos.stopLevel, dec)} tone={pos.stopLevel == null ? "text-muted" : "text-short"} />
          <Detail label="TAKE PROFIT" value={pos.limitLevel == null ? "trailing" : fmt(pos.limitLevel, dec)} tone={pos.limitLevel == null ? "text-muted" : "text-accent"} />
        </div>
      </div>
    </div>
  );
}

function Detail({ label, value, tone = "text-white" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="bg-soft px-4 py-3">
      <p className="tag">{label}</p>
      <p className={`mt-1 font-mono text-sm ${tone}`}>{value}</p>
    </div>
  );
}
