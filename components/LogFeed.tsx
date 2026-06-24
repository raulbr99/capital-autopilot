"use client";

import type { LogEntry } from "./types";
import { SectionHead } from "./ui";

export default function LogFeed({ logs }: { logs: LogEntry[] }) {
  const color = (l: LogEntry["level"]) =>
    l === "kill"
      ? "text-short font-bold"
      : l === "trade"
      ? "text-volt"
      : l === "signal"
      ? "text-long"
      : l === "error"
      ? "text-short"
      : "text-muted";
  return (
    <div className="border border-industrial bg-soft rounded-xl">
      <SectionHead
        label="Registro en vivo"
        right={<span className="h-1.5 w-1.5 rounded-full animate-pulseDot bg-volt" />}
      />
      <div className="max-h-[300px] space-y-px overflow-y-auto p-px">
        {logs.length === 0 && (
          <div className="bg-soft p-6 text-center">
            <span className="tag">SIN_EVENTOS_TODAVÍA</span>
          </div>
        )}
        {logs.map((l) => (
          <div key={l.id} className="flex gap-2 bg-soft px-3 py-2 font-mono text-[11px] leading-snug">
            <span className="shrink-0 text-muted">
              {new Date(l.ts).toLocaleTimeString("es-ES", { hour12: false })}
            </span>
            <span className={color(l.level)}>{l.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
