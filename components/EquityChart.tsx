"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { fmt, pnlClass, pnlFmt } from "./ui";

type Point = { ts: number; equity: number };
type Marker = { ts: number; dir: "BUY" | "SELL"; pnl?: number };

const DAY = 86_400_000;
const RANGES = [
  { k: "1d", label: "1D", ms: DAY },
  { k: "1w", label: "1S", ms: 7 * DAY },
  { k: "1m", label: "1M", ms: 30 * DAY },
  { k: "all", label: "Todo", ms: Infinity },
];

export default function EquityChart({ data, markers = [] }: { data: Point[]; markers?: Marker[] }) {
  const [range, setRange] = useState("all");

  const { filtered, fmarkers } = useMemo(() => {
    if (!data?.length) return { filtered: [] as Point[], fmarkers: [] as Marker[] };
    const r = RANGES.find((x) => x.k === range)!;
    if (!Number.isFinite(r.ms)) return { filtered: data, fmarkers: markers };
    const cut = data[data.length - 1].ts - r.ms;
    const f = data.filter((d) => d.ts >= cut);
    return {
      filtered: f.length >= 2 ? f : data, // si el rango no tiene suficiente, muestra todo
      fmarkers: markers.filter((m) => m.ts >= cut),
    };
  }, [data, markers, range]);

  /**
   * Cuánto histórico hay REALMENTE cargado. El snapshot trae las últimas 240
   * filas de ap_equity — filas, no un periodo—, y al ritmo de escritura actual
   * eso son unas 13 h aunque la tabla guarde 120 días. Con eso, los botones
   * 1D/1S/1M pintaban exactamente lo mismo que "Todo": cuatro controles con un
   * único resultado, y encima el filtro caía en silencio a mostrarlo todo
   * cuando el rango pedido no llegaba a dos puntos. Un panel no debe ofrecer
   * una vista de un mes si no tiene un mes.
   */
  const span = data.length >= 2 ? data[data.length - 1].ts - data[0].ts : 0;
  const alcanzable = (ms: number) => !Number.isFinite(ms) || ms <= span * 1.05;

  const spanFiltrado = filtered.length >= 2 ? filtered[filtered.length - 1].ts - filtered[0].ts : 0;
  const periodo =
    spanFiltrado >= DAY
      ? `${Math.round(spanFiltrado / DAY)} d`
      : spanFiltrado >= 3.6e6
        ? `${Math.round(spanFiltrado / 3.6e6)} h`
        : `${Math.max(1, Math.round(spanFiltrado / 60_000))} min`;

  const delta = filtered.length >= 2 ? filtered[filtered.length - 1].equity - filtered[0].equity : 0;
  // En la curva de P&L ACUMULADO la serie arranca en 0, así que el porcentaje
  // no está definido: mostrar "(0.00%)" ahí no informa, desinforma.
  const base = filtered.length ? filtered[0].equity : 0;
  const deltaPct = filtered.length >= 2 && Math.abs(base) > 0.01 ? (delta / base) * 100 : null;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className={`font-mono text-xs tabular-nums ${pnlClass(delta)}`}>
          {pnlFmt(delta)}€{" "}
          <span className="text-muted">
            {deltaPct != null ? `(${pnlFmt(deltaPct)}%) ` : ""}
            {/* "en el periodo" no decía QUÉ periodo, y el eje de abajo solo da
                horas cuando el rango es corto: había que adivinarlo. */}
            en {periodo}
          </span>
        </span>
        <div className="flex overflow-hidden rounded-md border border-industrial">
          {RANGES.map((r) => {
            const puede = alcanzable(r.ms);
            return (
              <button
                key={r.k}
                onClick={() => puede && setRange(r.k)}
                disabled={!puede}
                aria-pressed={range === r.k}
                title={puede ? undefined : `Solo hay ${periodo} de histórico cargado`}
                className={`min-h-[34px] px-3 py-1.5 font-mono text-[11px] transition-colors ${
                  range === r.k
                    ? "bg-accent text-onaccent"
                    : puede
                      ? "text-muted hover:text-dim"
                      : "cursor-not-allowed text-muted/35"
                }`}
              >
                {r.label}
              </button>
            );
          })}
        </div>
      </div>
      <Curve data={filtered} markers={fmarkers} />
    </div>
  );
}

const H = 200;
const AXIS_H = 18; // banda inferior para las fechas
const PAD_R = 48; // espacio para los valores del eje
const PAD_Y = 10;

function Curve({ data, markers }: { data: Point[]; markers: Marker[] }) {
  const [w, setW] = useState(320); // se corrige al medir; nunca debe empujar el layout
  const [hover, setHover] = useState<number | null>(null);

  /**
   * Medimos el ancho real del contenedor. Va como REF DE CALLBACK a propósito:
   * con un useEffect de dependencias vacías, el observador se intentaba montar
   * en el primer render — cuando aún no hay datos y este componente devuelve el
   * estado vacío, así que la ref era null y no llegaba a crearse NUNCA. El
   * viewBox se quedaba en 320 y el SVG se dibujaba letterboxeado, ocupando un
   * tercio de su tarjeta. Con la callback, se observa en cuanto el nodo existe.
   */
  const observador = useRef<ResizeObserver | null>(null);
  const wrap = useCallback((el: HTMLDivElement | null) => {
    observador.current?.disconnect();
    if (!el) return;
    setW(Math.max(240, el.getBoundingClientRect().width));
    observador.current = new ResizeObserver(([e]) => setW(Math.max(240, e.contentRect.width)));
    observador.current.observe(el);
  }, []);

  const geom = useMemo(() => {
    if (!data || data.length < 2) return null;
    const values = data.map((d) => d.equity);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const flat = max === min;
    const span = max - min || 1;
    const plotW = w - PAD_R;
    const plotH = H - AXIS_H;
    const t0 = data[0].ts;
    const tN = data[data.length - 1].ts || t0 + 1;
    const tSpan = tN - t0 || 1;

    const x = (i: number) => (i / (data.length - 1)) * plotW;
    const xt = (ts: number) => ((ts - t0) / tSpan) * plotW;
    const y = (v: number) => (flat ? plotH / 2 : plotH - PAD_Y - ((v - min) / span) * (plotH - PAD_Y * 2));

    const line = data.map((d, i) => `${x(i)},${y(d.equity)}`).join(" ");
    const area = `0,${plotH} ${line} ${plotW},${plotH}`;

    // Zona bajo agua: entre el máximo alcanzado y la curva (el drawdown vivido)
    let peak = values[0];
    const peakPts: string[] = [];
    data.forEach((d, i) => {
      peak = Math.max(peak, d.equity);
      peakPts.push(`${x(i)},${y(peak)}`);
    });
    const back = data.map((_, i) => `${x(data.length - 1 - i)},${y(values[data.length - 1 - i])}`);
    const ddArea = `${peakPts.join(" ")} ${back.join(" ")}`;

    return { values, min, max, plotW, plotH, x, xt, y, line, area, ddArea, up: values[values.length - 1] >= values[0] };
  }, [data, w]);

  if (!geom) {
    return (
      <div className="dotgrid flex h-[200px] flex-col items-center justify-center rounded-lg border border-industrial text-center">
        <p className="text-sm font-medium text-dim">Sin datos de equity en este rango</p>
        <p className="mt-1 text-xs text-muted">La curva aparece cuando el bot registra movimientos de cuenta.</p>
      </div>
    );
  }

  const { values, min, max, plotW, plotH, x, xt, y, line, area, ddArea, up } = geom;
  const tone = up ? "long" : "short";
  const hi = hover != null ? data[hover] : null;
  // Con menos de un día de datos, repetir la fecha en los dos extremos no
  // informa de nada: se muestra la hora.
  const sameDay = data[data.length - 1].ts - data[0].ts < DAY;
  const eje = (ts: number, hora: boolean) =>
    new Date(ts).toLocaleString("es-ES", hora ? { hour: "2-digit", minute: "2-digit", hour12: false } : { day: "2-digit", month: "short" });
  const fecha = (ts: number) =>
    new Date(ts).toLocaleString("es-ES", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });

  /** Índice del punto más cercano al cursor. */
  const onMove = (e: React.PointerEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const px = e.clientX - rect.left;
    if (px > plotW) return setHover(null);
    setHover(Math.max(0, Math.min(data.length - 1, Math.round((px / plotW) * (data.length - 1)))));
  };

  return (
    <div
      ref={wrap}
      className="relative w-full max-w-full touch-pan-y"
      onPointerMove={onMove}
      onPointerLeave={() => setHover(null)}
    >
      <svg
        width={w}
        height={H}
        viewBox={`0 0 ${w} ${H}`}
        className="block w-full overflow-visible"
        role="img"
        aria-label="Curva de equity"
      >
        <defs>
          <linearGradient id="eqfill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" className={up ? "text-long" : "text-short"} stopColor="currentColor" stopOpacity="0.26" />
            <stop offset="100%" className={up ? "text-long" : "text-short"} stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* rejilla recesiva + valor de referencia a la derecha */}
        {[0, 0.5, 1].map((g) => {
          const gy = PAD_Y + g * (plotH - PAD_Y * 2);
          const val = max - g * (max - min);
          return (
            <g key={g}>
              <line x1={0} x2={plotW} y1={gy} y2={gy} className="stroke-industrial" strokeWidth="1" />
              <text x={plotW + 8} y={gy + 3.5} className="fill-muted font-mono text-[10px]">
                {fmt(val, values[0] > 1000 ? 0 : 2)}
              </text>
            </g>
          );
        })}

        <polygon points={ddArea} className="fill-short" opacity="0.07" />
        <polygon points={area} fill="url(#eqfill)" />
        <polyline
          points={line}
          fill="none"
          className={up ? "stroke-long" : "stroke-short"}
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* operaciones cerradas, sobre la banda inferior */}
        {markers.map((m, i) => (
          <circle
            key={i}
            cx={xt(m.ts)}
            cy={plotH - 3}
            r="2.5"
            className={(m.pnl ?? 0) >= 0 ? "fill-long" : "fill-short"}
            opacity="0.75"
          />
        ))}

        {/* punto actual */}
        <circle cx={x(data.length - 1)} cy={y(values[values.length - 1])} r="3.5" className={up ? "fill-long" : "fill-short"} />

        {/* cruz de lectura: sin esto el gráfico es una forma sin cifras */}
        {hi && (
          <g>
            <line x1={x(hover!)} x2={x(hover!)} y1={0} y2={plotH} className="stroke-cement" strokeWidth="1" strokeDasharray="3 3" />
            <circle cx={x(hover!)} cy={y(hi.equity)} r="4.5" className={`${up ? "fill-long" : "fill-short"} stroke-soft`} strokeWidth="2" />
          </g>
        )}

        {/* fechas de los extremos */}
        <text x={0} y={H - 4} className="fill-muted font-mono text-[10px]">
          {eje(data[0].ts, sameDay)}
        </text>
        <text x={plotW} y={H - 4} textAnchor="end" className="fill-muted font-mono text-[10px]">
          {eje(data[data.length - 1].ts, sameDay)}
        </text>
      </svg>

      {hi && (
        <div
          className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-lg border border-cement bg-raised px-2.5 py-1.5 shadow-elevated"
          style={{ left: Math.min(Math.max(x(hover!), 52), plotW - 52) }}
        >
          <p className="font-mono text-[11px] tabular-nums text-white">{fmt(hi.equity)} €</p>
          <p className="font-mono text-[9px] text-muted">{fecha(hi.ts)}</p>
        </div>
      )}
    </div>
  );
}
