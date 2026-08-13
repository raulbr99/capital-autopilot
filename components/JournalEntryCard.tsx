"use client";

import { useState } from "react";
import type { JournalEntry, JournalAction } from "./types";
import { TZ } from "@/lib/model";

/** Jornada de una fecha en la zona de la CUENTA, igual que el resto del panel. */
const diaKey = (d: Date) =>
  d.toLocaleDateString("es-ES", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });

const ACT: Record<string, { label: string; cls: string }> = {
  OPEN: { label: "ABRE", cls: "bg-long/15 text-long" },
  CLOSE: { label: "CIERRA", cls: "bg-short/15 text-short" },
  HOLD: { label: "ESPERA", cls: "bg-industrial text-muted" },
};

// Resultado real de la acción (lo que de verdad pasó al ejecutarla).
const OUTCOME: Record<string, { label: string; cls: string }> = {
  opened: { label: "✓ ABIERTA", cls: "bg-long/15 text-long" },
  closed: { label: "✓ CERRADA", cls: "bg-long/15 text-long" },
  vetoed: { label: "✕ VETADA COMITÉ", cls: "bg-short/15 text-short" },
  skipped: { label: "⊘ NO EJECUTADA", cls: "bg-industrial text-muted" },
  error: { label: "⚠ ERROR", cls: "bg-short/15 text-short" },
};

const THESIS_LIMIT = 230; // a partir de aquí se pliega

/** Qué pasó de verdad en la entrada: es lo que decide su peso visual. */
export function summarize(actions: JournalAction[] = []) {
  const done = actions.filter((a) => a.outcome === "opened" || a.outcome === "closed").length;
  const blocked = actions.filter(
    (a) => a.outcome === "vetoed" || a.outcome === "skipped" || a.outcome === "error"
  ).length;
  if (done)
    return { kind: "traded" as const, label: `${done} ejecutada${done > 1 ? "s" : ""}`, cls: "bg-long/15 text-long" };
  if (blocked)
    return { kind: "blocked" as const, label: `${blocked} sin ejecutar`, cls: "bg-short/10 text-short" };
  return { kind: "held" as const, label: "sin operaciones", cls: "bg-industrial text-muted" };
}

/**
 * Una entrada del diario del Gestor. Vive aquí porque se pinta en DOS sitios
 * —la página de Diario y la barra lateral de cada mesa— y tenerla duplicada ya
 * provocó que la mesa se quedara con el tratamiento viejo: la tesis entera, de
 * 800+ caracteres, sin plegar y en una columna estrecha.
 */
export default function JournalEntryCard({
  entry,
  compact = false,
  showDesk = false,
}: {
  entry: JournalEntry;
  compact?: boolean;
  showDesk?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const sum = summarize(entry.actions);
  // Los HOLD sin activo no aportan nada y llegan de cinco en cinco (uno por
  // instrumento evaluado): se resumen en una sola línea en vez de una fila de
  // etiquetas idénticas y vacías.
  const todas = Array.isArray(entry.actions) ? entry.actions : [];
  const esperasVacias = todas.filter((a) => a.action === "HOLD" && !a.epic).length;
  const acciones = todas.filter((a) => !(a.action === "HOLD" && !a.epic));
  const fechaEntrada = new Date(entry.ts);
  const esHoy = diaKey(fechaEntrada) === diaKey(new Date());
  const diaCorto =
    diaKey(fechaEntrada) === diaKey(new Date(Date.now() - 86_400_000))
      ? "ayer"
      : fechaEntrada.toLocaleDateString("es-ES", { timeZone: TZ, day: "2-digit", month: "short" });
  const hora = fechaEntrada.toLocaleTimeString("es-ES", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const fechaCompleta = fechaEntrada.toLocaleString("es-ES", { timeZone: TZ, hour12: false });
  const thesis = entry.thesis || "—";
  const long = thesis.length > THESIS_LIMIT;
  const quiet = sum.kind === "held";
  // La tesis se plegaba pero las razones de cada acción no, así que una entrada
  // sin operar seguía ocupando media pantalla. Se muestran dos y el resto entra
  // en el mismo desplegable.
  const MAX_VISIBLES = 2;
  const ocultas = Math.max(0, acciones.length - MAX_VISIBLES);
  const visibles = open ? acciones : acciones.slice(0, MAX_VISIBLES);
  const desplegable = long || ocultas > 0;
  const etiqueta = open
    ? "Mostrar menos"
    : long
    ? "Leer tesis completa"
    : `Ver las ${acciones.length} decisiones`;

  return (
    <div
      className={`rounded-lg border p-3 ${compact ? "bg-base" : "bg-soft"} ${
        sum.kind === "traded" ? "border-long/25" : "border-industrial"
      }`}
    >
      <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
        {showDesk && entry.desk && (
          <span className="rounded bg-industrial px-1.5 py-0.5 text-[10px] font-medium uppercase text-dim">
            {entry.desk}
          </span>
        )}
        {/*
          En la página de Diario la fecha la pone la cabecera de cada jornada.
          En el carril de una mesa no hay cabeceras, así que cada decisión salía
          rotulada solo con su hora — "20:44" — sin decir de cuándo.
          Medido contra producción: el carril de Stocks lista veinte entradas que
          van del 6 de julio al 12 de agosto, treinta y siete días, todas con
          pinta de haber pasado hoy. En un registro de decisiones sobre dinero,
          cuándo se tomó una decisión no es un adorno.
          Se añade el día solo cuando NO es hoy, y solo donde falta la cabecera.
        */}
        <span className="font-mono text-[10px] tabular-nums text-muted" title={fechaCompleta}>
          {compact && !esHoy && <span className="text-dim">{diaCorto} · </span>}
          {hora}
        </span>
        <span className={`rounded px-1.5 py-0.5 text-[9px] font-medium ${sum.cls}`}>{sum.label}</span>
        <span className="rounded bg-accent/10 px-1.5 py-0.5 text-[9px] font-medium text-accent">
          conf {Math.round((entry.confidence || 0) * 100)}%
        </span>
        {!compact && typeof entry.snapshot?.equity === "number" && (
          <span className="ml-auto font-mono text-[11px] tabular-nums text-muted">
            equity {entry.snapshot.equity.toFixed(2)}
          </span>
        )}
      </div>

      <p
        className={`text-[12px] leading-relaxed [overflow-wrap:anywhere] ${quiet ? "text-muted" : "text-dim"} ${
          long && !open ? "line-clamp-2" : ""
        }`}
      >
        {thesis}
      </p>
      {desplegable && (
        <button
          onClick={() => setOpen((o) => !o)}
          className="-mx-1 mt-0.5 min-h-[32px] px-1 text-[11px] font-medium text-accent transition-opacity hover:opacity-80"
        >
          {etiqueta}
        </button>
      )}

      {visibles.length > 0 && (
        <div className="mt-2 space-y-1.5 border-t border-industrial pt-2">
          {visibles.map((a, i) => {
            const oc = a.outcome && a.outcome !== "held" ? OUTCOME[a.outcome] : null;
            const notRun =
              !!a.outcome && a.outcome !== "opened" && a.outcome !== "closed" && a.outcome !== "held";
            return (
              /*
                La razón era un elemento más del mismo flex-wrap, así que su
                sitio dependía de lo larga que fuese: corta se quedaba pegada al
                activo ("ESPERA BTCUSD Cruce SMA bajista…", sin separación entre
                el símbolo y la prosa) y larga saltaba a su propia línea. El
                mismo dato con dos formatos dentro de la misma tarjeta, decidido
                por el número de caracteres. Ahora la fila de etiquetas es
                siempre una línea y la explicación siempre va debajo.
              */
              <div key={i} className={notRun ? "opacity-60" : ""}>
                <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
                  <span
                    className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold ${
                      ACT[a.action]?.cls || ACT.HOLD.cls
                    }`}
                  >
                    {ACT[a.action]?.label || a.action}
                  </span>
                  {a.epic && (
                    <span className="shrink-0 font-mono text-white">
                      {a.epic}
                      {a.direction ? ` ${a.direction === "BUY" ? "▲" : "▼"}` : ""}
                    </span>
                  )}
                  {oc && (
                    <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold ${oc.cls}`}>
                      {oc.label}
                    </span>
                  )}
                </div>
                {!compact && a.reason && (
                  <p className="mt-0.5 text-[12px] leading-snug text-muted [overflow-wrap:anywhere]">
                    {a.reason}
                    {notRun && a.outcomeNote ? <span className="text-short/80"> · {a.outcomeNote}</span> : null}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!open && ocultas > 0 && (
        <p className="mt-1.5 text-[11px] text-muted">
          y {ocultas} {ocultas > 1 ? "decisiones" : "decisión"} más
        </p>
      )}

      {esperasVacias > 0 && (
        <p className="mt-2 border-t border-industrial pt-2 text-[11px] text-muted">
          Sin acción en {esperasVacias} {esperasVacias === 1 ? "activo" : "activos"} más.
        </p>
      )}
    </div>
  );
}
