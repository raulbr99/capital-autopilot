"use client";

import { useEffect, useState } from "react";

export const fmt = (n: number, d = 2) =>
  (Number.isFinite(n) ? n : 0).toLocaleString("en-US", {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });

export const pf = (n: number) =>
  n === Infinity ? "∞" : Number.isFinite(n) ? n.toFixed(2) : "—";

// P&L: el cero es NEUTRO (ni verde ni "+"), solo color con signo real.
const EPS = 0.005;
export const pnlClass = (v: number) =>
  v > EPS ? "text-long" : v < -EPS ? "text-short" : "text-dim";
export const pnlFmt = (v: number, d = 2) => (v > EPS ? "+" : "") + fmt(v, d);

// Glifos monocromos por mesa (sin emoji multicolor).
export function DeskGlyph({ cat, className = "h-4 w-4" }: { cat: string; className?: string }) {
  const paths: Record<string, React.ReactNode> = {
    forex: <path d="M4 7.5h12l-3-3M16 12.5H4l3 3" />,
    crypto: <path d="M10 3l6 3.5v7L10 17l-6-3.5v-7z" />,
    stocks: (
      <>
        <path d="M3 14l4-4 3 2 6-7" />
        <path d="M16 5h1v3" />
      </>
    ),
    commodities: <path d="M10 3c3 4 5 6 5 9a5 5 0 0 1-10 0c0-3 2-5 5-9z" />,
  };
  return (
    <svg
      viewBox="0 0 20 20"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[cat] ?? null}
    </svg>
  );
}

/** Reloj aislado: solo este componente se re-renderiza cada segundo, no la página. */
export function Clock({ className }: { className?: string }) {
  const [now, setNow] = useState("--:--:--");
  useEffect(() => {
    const tick = () => setNow(new Date().toLocaleTimeString("es-ES", { hour12: false }));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return <p className={className}>{now}</p>;
}

export function SectionHead({ label, right }: { label: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-industrial px-5 py-3.5">
      <h2 className="tag">{label}</h2>
      {right ?? <span className="h-1.5 w-1.5 rounded-full bg-accent/70" />}
    </div>
  );
}

export function StatCard({
  label,
  value,
  unit,
  tone,
}: {
  label: string;
  value: string;
  unit?: string;
  tone?: "long" | "short" | "accent";
}) {
  const c =
    tone === "long"
      ? "text-long"
      : tone === "short"
      ? "text-short"
      : tone === "accent"
      ? "text-accent"
      : "text-white";
  return (
    <div className="bg-soft p-5">
      <p className="tag">{label}</p>
      <p className={`mt-2 font-mono text-2xl font-medium tracking-tight ${c}`}>
        {value}{" "}
        {unit && <span className="text-xs font-normal text-muted">{unit}</span>}
      </p>
    </div>
  );
}

export function NumField({
  label,
  value,
  step,
  onCommit,
  busy,
  hint,
  suffix,
}: {
  label: string;
  value: number;
  step: number;
  onCommit: (v: number) => void;
  busy?: boolean;
  hint?: string;
  suffix?: string;
}) {
  const [v, setV] = useState(String(value));
  useEffect(() => setV(String(value)), [value]);
  return (
    <label className="block">
      <span className="tag">{label}</span>
      <div className="relative mt-1.5">
        <input
          type="number"
          step={step}
          value={v}
          disabled={busy}
          onChange={(e) => setV(e.target.value)}
          onBlur={() => {
            const n = parseFloat(v);
            if (Number.isFinite(n) && n !== value) onCommit(n);
          }}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          className="w-full rounded-lg border border-cement bg-base px-2.5 py-2 font-mono text-sm text-white transition-colors focus:border-accent focus:outline-none disabled:opacity-40"
        />
        {suffix && (
          <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 font-mono text-[11px] text-muted">
            {suffix}
          </span>
        )}
      </div>
      {hint && <span className="mt-1 block text-[10px] leading-snug text-muted">{hint}</span>}
    </label>
  );
}

export function Toggle({
  on,
  onClick,
  busy,
  labelOn,
  labelOff,
}: {
  on: boolean;
  onClick: () => void;
  busy?: boolean;
  labelOn: string;
  labelOff: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors disabled:opacity-40 ${
        on ? "border-accent/40 bg-accent/10 text-accent" : "border-cement text-muted hover:text-dim"
      }`}
    >
      <span className={`relative h-3.5 w-6 rounded-full transition-colors ${on ? "bg-accent" : "bg-cement"}`}>
        <span
          className={`absolute top-0.5 h-2.5 w-2.5 rounded-full bg-white transition-all ${
            on ? "left-[13px]" : "left-0.5"
          }`}
        />
      </span>
      {on ? labelOn : labelOff}
    </button>
  );
}

export function Sparkline({
  data,
  up,
  w = 120,
  h = 32,
}: {
  data: number[];
  up?: boolean;
  w?: number;
  h?: number;
}) {
  if (!data || data.length < 2)
    return <div style={{ height: h }} className="w-full rounded bg-industrial/40" />;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const x = (i: number) => (i / (data.length - 1)) * w;
  const y = (val: number) => h - ((val - min) / range) * (h - 4) - 2;
  const line = data.map((d, i) => `${x(i).toFixed(1)},${y(d).toFixed(1)}`).join(" ");
  const isUp = up ?? data[data.length - 1] >= data[0];
  const c = isUp ? "#34C98A" : "#F2567A";
  // Fluido: viewBox como sistema de coordenadas interno + width 100% para que
  // llene su contenedor (antes el ancho fijo desbordaba las tarjetas en móvil).
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      width="100%"
      height={h}
      preserveAspectRatio="none"
      className="block w-full overflow-visible"
    >
      <polyline
        points={line}
        fill="none"
        stroke={c}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
