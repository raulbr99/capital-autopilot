"use client";

import { useEffect, useState } from "react";
import type { OpenPos } from "./types";
import { fmt, pnlClass, pnlFmt } from "./ui";

type Candle = { time: string; open: number; high: number; low: number; close: number };
const RES = [
  { k: "HOUR", label: "1H" },
  { k: "HOUR_4", label: "4H" },
  { k: "DAY", label: "1D" },
];

function pdec(n: number) {
  const a = Math.abs(n);
  return a < 10 ? 5 : a < 100 ? 3 : a < 1000 ? 2 : 1;
}

export default function PositionChart({ pos, onClose }: { pos: OpenPos; onClose: () => void }) {
  const [res, setRes] = useState("HOUR_4");
  const [candles, setCandles] = useState<Candle[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`/api/bot/candles?epic=${encodeURIComponent(pos.epic)}&resolution=${res}&max=90`)
      .then((r) => r.json())
      .then((d) => alive && Array.isArray(d.candles) && setCandles(d.candles))
      .catch(() => {})
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [pos.epic, res]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const dec = pdec(pos.entry);
  const cur = pos.currentPrice ?? pos.entry;
  const curFavor = cur === pos.entry ? 0 : pos.direction === "BUY" ? cur - pos.entry : pos.entry - cur;
  const curTone = curFavor > 0 ? "text-long" : curFavor < 0 ? "text-short" : "text-dim";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/80 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-3xl overflow-hidden rounded-xl border border-industrial bg-soft shadow-2xl"
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
                  className={`px-2.5 py-1 font-mono text-[11px] transition-colors ${
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
        <div className="p-4">
          {loading ? (
            <div className="dotgrid h-[340px] rounded-lg" />
          ) : !candles || candles.length < 2 ? (
            <div className="dotgrid flex h-[340px] items-center justify-center rounded-lg text-sm text-muted">
              Sin datos de precio para esta resolución
            </div>
          ) : (
            <Chart candles={candles} pos={pos} cur={cur} dec={dec} />
          )}
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

function Chart({ candles, pos, cur, dec }: { candles: Candle[]; pos: OpenPos; cur: number; dec: number }) {
  const W = 760, H = 340, padR = 70, padT = 12, padB = 8, padL = 8;
  const levels = [pos.entry, cur, pos.stopLevel, pos.limitLevel].filter(
    (v): v is number => v != null && Number.isFinite(v)
  );
  const lo = Math.min(...candles.map((c) => c.low), ...levels);
  const hi = Math.max(...candles.map((c) => c.high), ...levels);
  const pad = (hi - lo) * 0.06 || 1;
  const min = lo - pad, max = hi + pad;
  const y = (v: number) => padT + (1 - (v - min) / (max - min)) * (H - padT - padB);
  const cw = (W - padL - padR) / candles.length;
  const x = (i: number) => padL + i * cw + cw / 2;
  const bodyW = Math.max(1, cw * 0.62);

  const Level = ({ v, color, dash }: { v: number | null | undefined; color: string; dash?: boolean }) =>
    v == null ? null : (
      <g>
        <line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} stroke={color} strokeWidth={1} strokeDasharray={dash ? "4 3" : undefined} opacity={0.85} />
        <rect x={W - padR + 2} y={y(v) - 7.5} width={padR - 3} height={15} fill={color} opacity={0.16} />
        <text x={W - padR + 6} y={y(v) + 3.5} fontSize={10.5} fill={color} fontFamily="monospace">{fmt(v, dec)}</text>
      </g>
    );

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" className="block overflow-visible">
      {candles.map((c, i) => {
        const up = c.close >= c.open;
        const col = up ? "#34C98A" : "#F2567A";
        const yo = y(c.open), yc = y(c.close);
        return (
          <g key={i}>
            <line x1={x(i)} x2={x(i)} y1={y(c.high)} y2={y(c.low)} stroke={col} strokeWidth={1} opacity={0.7} />
            <rect x={x(i) - bodyW / 2} y={Math.min(yo, yc)} width={bodyW} height={Math.max(1, Math.abs(yc - yo))} fill={col} opacity={0.9} />
          </g>
        );
      })}
      <Level v={pos.limitLevel} color="#6E7CF7" />
      <Level v={pos.stopLevel} color="#F2567A" />
      <Level v={pos.entry} color="#9aa3b2" dash />
      <Level v={cur} color="#E6EAF2" dash />
    </svg>
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
