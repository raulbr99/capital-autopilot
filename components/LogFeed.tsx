"use client";

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
  info: { label: "INFO", dot: "bg-muted", text: "text-dim", chip: "bg-industrial text-muted", bg: "" },
};

export default function LogFeed({ logs }: { logs: LogEntry[] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-industrial bg-soft">
      <SectionHead
        label="Registro en vivo"
        right={
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-long animate-pulseDot" />
            <span className="font-mono text-[10px] text-muted">{logs.length}</span>
          </span>
        }
      />
      <div className="max-h-[460px] overflow-y-auto">
        {logs.length === 0 ? (
          <div className="px-5 py-14 text-center">
            <p className="text-sm font-medium text-dim">Sin actividad todavía</p>
            <p className="mx-auto mt-1.5 max-w-[230px] text-[11px] leading-relaxed text-muted">
              Aquí verás en tiempo real las señales, las operaciones y los vetos de la IA.
            </p>
          </div>
        ) : (
          logs.map((l) => {
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
                    <span className="ml-auto font-mono text-[10px] tabular-nums text-muted">
                      {new Date(l.ts).toLocaleTimeString("es-ES", { hour12: false })}
                    </span>
                  </div>
                  <p className={`mt-1 text-[12px] leading-snug [overflow-wrap:anywhere] ${s.text}`}>{l.message}</p>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
