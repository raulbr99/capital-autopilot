"use client";

import { useMemo, useState } from "react";
import type { LogEntry } from "./types";
import { SectionHead } from "./ui";

const LEVEL: Record<
  LogEntry["level"],
  { label: string; dot: string; text: string; chip: string; bg: string }
> = {
  kill: { label: "KILL", dot: "bg-short", text: "text-short font-medium", chip: "bg-short/15 text-short", bg: "bg-short/[0.06]" },
  error: { label: "ERROR", dot: "bg-short", text: "text-short", chip: "bg-short/10 text-short", bg: "" },
  trade: { label: "TRADE", dot: "bg-accent", text: "text-white", chip: "bg-accent/15 text-accent", bg: "bg-accent/[0.05]" },
  signal: { label: "SEÑAL", dot: "bg-long", text: "text-dim", chip: "bg-long/15 text-long", bg: "" },
  // Lo que el bot decidió NO hacer. Iba marcado como TRADE, que es justo lo
  // contrario de lo que ocurrió: la entrada existe porque la operación se
  // bloqueó. Ni es un error —el sistema funcionó— ni merece el color del
  // dinero, así que va en ámbar y con su propia etiqueta.
  veto: { label: "VETO", dot: "bg-accent", text: "text-dim", chip: "bg-accent/10 text-accent", bg: "" },
  info: { label: "INFO", dot: "bg-muted", text: "text-dim", chip: "bg-industrial text-muted", bg: "" },
};

type Filter = "todo" | "operativa" | "problemas";
const MATCH: Record<Filter, (l: LogEntry) => boolean> = {
  todo: () => true,
  operativa: (l) => l.level === "trade" || l.level === "signal" || l.level === "veto",
  problemas: (l) => l.level === "error" || l.level === "kill",
};

/**
 * Agrupa entradas consecutivas con el mismo mensaje. El motor puede registrar
 * el mismo ajuste dos veces (ticks solapados del cron y del navegador), y una
 * lista con la misma línea repetida parece rota aunque el dato sea correcto.
 */
function collapse(logs: LogEntry[]) {
  const out: (LogEntry & { count: number })[] = [];
  for (const l of logs) {
    const prev = out[out.length - 1];
    if (prev && prev.message === l.message && prev.level === l.level) {
      prev.count++;
      continue;
    }
    out.push({ ...l, count: 1 });
  }
  return out;
}

export default function LogFeed({ logs }: { logs: LogEntry[] }) {
  const [filter, setFilter] = useState<Filter>("todo");

  const counts = useMemo(
    () => ({
      todo: logs.length,
      operativa: logs.filter(MATCH.operativa).length,
      problemas: logs.filter(MATCH.problemas).length,
    }),
    [logs]
  );

  const rows = useMemo(() => collapse(logs.filter(MATCH[filter])), [logs, filter]);

  const chip = (id: Filter, label: string) => {
    const on = filter === id;
    return (
      <button
        key={id}
        onClick={() => setFilter(id)}
        aria-pressed={on}
        className={`rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
          on ? "bg-raised text-white" : "text-muted hover:text-dim"
        } ${id === "problemas" && counts.problemas > 0 && !on ? "text-short" : ""}`}
      >
        {label} <span className="tabular-nums text-[9px] text-muted">{counts[id]}</span>
      </button>
    );
  };

  return (
    <div className="overflow-hidden rounded-xl border border-industrial bg-soft">
      <SectionHead
        label="Registro en vivo"
        right={
          <div className="flex items-center gap-1">
            {chip("todo", "Todo")}
            {chip("operativa", "Operativa")}
            {chip("problemas", "Problemas")}
            <span className="ml-1 h-1.5 w-1.5 rounded-full bg-long animate-pulseDot" />
          </div>
        }
      />
      <div className="max-h-[460px] overflow-y-auto">
        {rows.length === 0 ? (
          <div className="px-5 py-14 text-center">
            <p className="text-sm font-medium text-dim">
              {logs.length === 0 ? "Sin actividad todavía" : "Nada en este filtro"}
            </p>
            <p className="mx-auto mt-1.5 max-w-[230px] text-[11px] leading-relaxed text-muted">
              {logs.length === 0
                ? "Aquí verás en tiempo real las señales, las operaciones y los vetos de la IA."
                : filter === "problemas"
                ? "Ningún error ni parada registrados. Buena señal."
                : "Prueba con otro filtro."}
            </p>
          </div>
        ) : (
          rows.map((l) => {
            const s = LEVEL[l.level] ?? LEVEL.info;
            return (
              <div
                key={l.id}
                className={`flex items-start gap-2.5 border-b border-industrial/50 px-4 py-2.5 last:border-0 ${s.bg}`}
              >
                <span className={`mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full ${s.dot}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`rounded px-1.5 py-0.5 text-[8.5px] font-semibold tracking-wide ${s.chip}`}>
                      {s.label}
                    </span>
                    {l.epic && <span className="font-mono text-[10px] text-muted">{l.epic}</span>}
                    {l.count > 1 && (
                      <span
                        className="rounded bg-industrial px-1 py-0.5 font-mono text-[9px] text-muted"
                        title="Entradas consecutivas idénticas agrupadas"
                      >
                        ×{l.count}
                      </span>
                    )}
                    <span className="ml-auto font-mono text-[10px] tabular-nums text-muted">
                      {new Date(l.ts).toLocaleTimeString("es-ES", { hour12: false })}
                    </span>
                  </div>
                  <p className={`mt-1 line-clamp-3 text-[12px] leading-snug [overflow-wrap:anywhere] ${s.text}`} title={l.message}>
                    {l.message}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
