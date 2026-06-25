"use client";

type Point = { ts: number; equity: number };
type Marker = { ts: number; dir: "BUY" | "SELL"; pnl?: number };

export default function EquityChart({
  data,
  markers = [],
}: {
  data: Point[];
  markers?: Marker[];
}) {
  const W = 720;
  const H = 200;
  const pad = 8;

  if (!data || data.length < 2) {
    return (
      <div className="dotgrid flex h-[200px] flex-col items-center justify-center rounded-lg border border-industrial text-center">
        <p className="text-sm font-medium text-dim">Sin datos de equity todavía</p>
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

  // sombreado de drawdown: zonas por debajo del maximo acumulado
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
        <circle
          key={i}
          cx={xt(m.ts)}
          cy={H - pad - 4}
          r="2.5"
          fill={(m.pnl ?? 0) >= 0 ? "#34C98A" : "#F2567A"}
        />
      ))}
      <circle cx={x(data.length - 1)} cy={y(values[values.length - 1])} r="3.5" fill={stroke} />
    </svg>
  );
}
