"use client";

import { useMemo, useState } from "react";
import { pnlClass, pnlFmt } from "./ui";

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

  const delta = filtered.length >= 2 ? filtered[filtered.length - 1].equity - filtered[0].equity : 0;
  const deltaPct = filtered.length >= 2 && filtered[0].equity ? (delta / filtered[0].equity) * 100 : 0;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className={`font-mono text-xs ${pnlClass(delta)}`}>
          {pnlFmt(delta)}€ <span className="text-muted">({pnlFmt(deltaPct)}%) en el periodo</span>
        </span>
        <div className="flex overflow-hidden rounded-md border border-industrial">
          {RANGES.map((r) => (
            <button
              key={r.k}
              onClick={() => setRange(r.k)}
              className={`px-2.5 py-1 font-mono text-[11px] transition-colors ${
                range === r.k ? "bg-accent text-onaccent" : "text-muted hover:text-dim"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>
      <Curve data={filtered} markers={fmarkers} />
    </div>
  );
}

function Curve({ data, markers }: { data: Point[]; markers: Marker[] }) {
  const W = 720;
  const H = 200;
  const pad = 8;

  if (!data || data.length < 2) {
    return (
      <div className="dotgrid flex h-[200px] flex-col items-center justify-center rounded-lg border border-industrial text-center">
        <p className="text-sm font-medium text-dim">Sin datos de equity en este rango</p>
        <p className="mt-1 text-xs text-muted">La curva aparece cuando el bot registra movimientos de cuenta.</p>
      </div>
    );
  }

  const values = data.map((d) => d.equity);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const flat = max === min;
  const range = max - min || 1;
  const t0 = data[0].ts;
  const tN = data[data.length - 1].ts || t0 + 1;
  const tRange = tN - t0 || 1;

  const x = (i: number) => pad + (i / (data.length - 1)) * (W - pad * 2);
  const xt = (ts: number) => pad + ((ts - t0) / tRange) * (W - pad * 2);
  const y = (v: number) => (flat ? H / 2 : H - pad - ((v - min) / range) * (H - pad * 2));

  const line = data.map((d, i) => `${x(i)},${y(d.equity)}`).join(" ");
  const area = `${pad},${H - pad} ${line} ${W - pad},${H - pad}`;

  let peak = values[0];
  const ddPts: string[] = [];
  data.forEach((d, i) => {
    peak = Math.max(peak, d.equity);
    ddPts.push(`${x(i)},${y(peak)}`);
  });
  const ddArea = `${ddPts.join(" ")} ${data
    .map((d, i) => `${x(data.length - 1 - i)},${y(values[data.length - 1 - i])}`)
    .join(" ")}`;

  const up = values[values.length - 1] >= values[0];
  const stroke = up ? "#34C98A" : "#F2567A";

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-[200px] w-full">
      <defs>
        <linearGradient id="eqfill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.28" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((g) => (
        <line key={g} x1={pad} x2={W - pad} y1={pad + g * (H - pad * 2)} y2={pad + g * (H - pad * 2)} stroke="#8891a0" strokeOpacity="0.18" strokeWidth="1" />
      ))}
      <polygon points={ddArea} fill="#F2567A" opacity="0.06" />
      <polygon points={area} fill="url(#eqfill)" />
      <polyline points={line} fill="none" stroke={stroke} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {markers.map((m, i) => (
        <circle key={i} cx={xt(m.ts)} cy={H - pad - 4} r="2.5" fill={(m.pnl ?? 0) >= 0 ? "#34C98A" : "#F2567A"} />
      ))}
      <circle cx={x(data.length - 1)} cy={y(values[values.length - 1])} r="3.5" fill={stroke} />
    </svg>
  );
}
