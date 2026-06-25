"use client";

import { useState } from "react";
import { SectionHead, fmt, pf, Sparkline } from "./ui";

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
  edge: { label: "VENTAJA PROBABLE", cls: "bg-long/15 text-long border-long/40" },
  weak: { label: "VENTAJA DÉBIL", cls: "bg-volt/15 text-volt border-volt/40" },
  none: { label: "SIN VENTAJA", cls: "bg-short/15 text-short border-short/40" },
};

export default function WalkForward({ watchlist }: { watchlist: string[] }) {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState("");
  const [results, setResults] = useState<WFResult[]>([]);
  const [resolution, setResolution] = useState("HOUR");
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const run = async () => {
    setLoading(true);
    setErr(null);
    setResults([]);
    const acc: WFResult[] = [];
    try {
      for (let i = 0; i < watchlist.length; i++) {
        const epic = watchlist[i];
        setProgress(`${epic} (${i + 1}/${watchlist.length})…`);
        const r = await fetch(`/api/bot/walkforward?epic=${epic}&resolution=${resolution}&max=600`);
        const data = await r.json();
        if (data.configured === false) {
          setErr("Conecta Capital.com para validar.");
          break;
        }
        acc.push(data);
        setResults([...acc]);
      }
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
      setProgress("");
    }
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
              className="border border-cement bg-ink px-1.5 py-0.5 font-mono text-[10px] text-dim focus:outline-none"
            >
              {["MINUTE_15", "MINUTE_30", "HOUR", "HOUR_4", "DAY"].map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            <button
              onClick={run}
              disabled={loading}
              className="bg-volt px-3 py-1 font-display text-[11px] text-onaccent disabled:opacity-40"
            >
              {loading ? "…" : "▶ VALIDAR"}
            </button>
          </div>
        }
      />
      <div className="p-4">
        <p className="mb-3 text-[11px] leading-relaxed text-muted">
          Optimiza parámetros en datos de <span className="text-dim">entrenamiento</span> y los prueba en datos{" "}
          <span className="text-dim">no vistos</span>, deslizando la ventana. Las métricas{" "}
          <span className="text-white">OOS</span> son la estimación honesta de la ventaja.
        </p>
        {err && <p className="text-xs text-short">{err}</p>}
        {loading && <p className="font-mono text-[11px] text-volt">Validando {progress}</p>}

        <div className="space-y-2">
          {results.map((r) => (
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
                      <span className={`border px-2 py-0.5 font-mono text-[9px] ${VERDICT[r.verdict].cls}`}>
                        {VERDICT[r.verdict].label}
                      </span>
                    </div>
                    <Sparkline data={r.oosEquity} up={r.oosAggregate.netPnl >= 0} w={110} h={30} />
                  </button>

                  <div className="grid grid-cols-2 gap-px border-t border-industrial bg-industrial md:grid-cols-4">
                    <Cmp label="PNL OOS" is={r.isAggregate.netPnl} oos={r.oosAggregate.netPnl} money />
                    <Cmp label="PROFIT FACTOR" is={r.isAggregate.profitFactor} oos={r.oosAggregate.profitFactor} factor />
                    <Cmp label="WIN RATE" is={r.isAggregate.winRate} oos={r.oosAggregate.winRate} pct />
                    <div className="bg-soft p-2.5">
                      <p className="tag">DEGRADACIÓN IS→OOS</p>
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
                            <th className="px-3 py-1.5 font-normal">FOLD</th>
                            <th className="px-3 py-1.5 font-normal">PARÁMS (f/s/sl/tp)</th>
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
        <span className="text-muted"> · is {f(is)}</span>
      </p>
    </div>
  );
}
