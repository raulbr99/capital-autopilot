"use client";

import { useEffect, useState } from "react";

export const fmt = (n: number, d = 2) =>
  (Number.isFinite(n) ? n : 0).toLocaleString("en-US", {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });

export const pf = (n: number) =>
  n === Infinity ? "∞" : Number.isFinite(n) ? n.toFixed(2) : "—";

export function SectionHead({ label, right }: { label: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-industrial px-4 py-2.5">
      <span className="tag !text-dim">{label}</span>
      {right ?? <span className="h-1.5 w-1.5 bg-volt" />}
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
  tone?: "long" | "short" | "volt";
}) {
  const c =
    tone === "long"
      ? "text-long"
      : tone === "short"
      ? "text-short"
      : tone === "volt"
      ? "text-volt"
      : "text-white";
  return (
    <div className="bg-soft p-4">
      <p className="tag">{label}</p>
      <p className={`mt-2 font-display text-2xl ${c}`}>
        {value} {unit && <span className="font-mono text-xs text-muted">{unit}</span>}
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
}: {
  label: string;
  value: number;
  step: number;
  onCommit: (v: number) => void;
  busy?: boolean;
}) {
  const [v, setV] = useState(String(value));
  useEffect(() => setV(String(value)), [value]);
  return (
    <label className="block">
      <span className="tag">{label}</span>
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
        className="mt-1 w-full border border-cement bg-ink px-2 py-1.5 font-mono text-sm text-white focus:border-volt focus:outline-none disabled:opacity-40"
      />
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
      className={`flex items-center gap-2 border px-3 py-1.5 font-mono text-[11px] transition disabled:opacity-40 ${
        on ? "border-volt text-volt" : "border-cement text-muted"
      }`}
    >
      <span className={`h-2.5 w-4 ${on ? "bg-volt" : "bg-cement"} relative`}>
        <span
          className={`absolute top-0 h-2.5 w-2 bg-ink transition-all ${
            on ? "left-2" : "left-0"
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
    return <div style={{ width: w, height: h }} className="bg-industrial/40" />;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const x = (i: number) => (i / (data.length - 1)) * w;
  const y = (v: number) => h - ((v - min) / range) * (h - 4) - 2;
  const line = data.map((d, i) => `${x(i).toFixed(1)},${y(d).toFixed(1)}`).join(" ");
  const isUp = up ?? data[data.length - 1] >= data[0];
  const c = isUp ? "#26FF8A" : "#FF3B5C";
  return (
    <svg width={w} height={h} className="overflow-visible">
      <polyline points={line} fill="none" stroke={c} strokeWidth="1.5" />
      <circle cx={x(data.length - 1)} cy={y(data[data.length - 1])} r="2" fill={c} />
    </svg>
  );
}
