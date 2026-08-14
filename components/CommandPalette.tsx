"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFocusTrap, useReturnFocus } from "./ui";

/**
 * `confirmar` marca los comandos que TOCAN EL MOTOR EN VIVO. El resto de la app
 * ya pide dos pasos para cosas mucho menos graves —cerrar una posición
 * (CERRAR → ¿CERRAR?) o quitar un instrumento (✕ → ¿QUITAR?)— mientras que aquí
 * "Detener el piloto" salía PRESELECCIONADO: ⌘K y Enter, sin tocar nada más,
 * paraba la operativa. La acción más consecuente de la aplicación era la más
 * fácil de disparar sin querer.
 */
export type Command = {
  id: string;
  label: string;
  hint?: string;
  /** Texto de la segunda pulsación. Si está, el comando pide confirmación. */
  confirmar?: string;
  run: () => void;
};

/**
 * Abrir la paleta desde fuera. El botón de la cabecera lo hacía FALSIFICANDO una
 * pulsación: document.dispatchEvent(new KeyboardEvent("keydown", {key:"k",
 * metaKey:true})). Un KeyboardEvent construido a mano no burbujea salvo que se
 * le pida (bubbles va a false por defecto), así que nunca llegaba al listener
 * que vive en window: el botón no hacía absolutamente nada.
 *
 * Comprobado en producción con un navegador real: clic en ⌘K → el diálogo no
 * aparece; ⌘K de verdad → aparece.
 */
export const abrirPaleta = () => window.dispatchEvent(new Event("paleta:abrir"));

export default function CommandPalette({ commands }: { commands: Command[] }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  useReturnFocus(open);
  useFocusTrap(boxRef, open);

  // Busca en la etiqueta Y en la categoría: "riesgo" debe encontrar sus mandos
  const filtered = useMemo(() => {
    const t = q.toLowerCase().trim();
    if (!t) return commands;
    return commands.filter((c) => `${c.label} ${c.hint ?? ""}`.toLowerCase().includes(t));
  }, [commands, q]);

  // Agrupado por categoría, conservando el orden de aparición
  const groups = useMemo(() => {
    const m = new Map<string, Command[]>();
    for (const c of filtered) {
      const k = c.hint || "Acciones";
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(c);
    }
    return [...m.entries()];
  }, [filtered]);

  // Orden plano para que las flechas recorran lo mismo que se ve
  const flat = useMemo(() => groups.flatMap(([, list]) => list), [groups]);

  // Cualquier movimiento cancela la confirmación pendiente: solo se confirma
  // el comando que estás mirando ahora mismo.
  const [pendiente, setPendiente] = useState<string | null>(null);
  useEffect(() => setPendiente(null), [sel, q, open]);

  useEffect(() => setSel(0), [q, open]);

  useEffect(() => {
    const abrir = () => setOpen(true);
    window.addEventListener("paleta:abrir", abrir);
    return () => window.removeEventListener("paleta:abrir", abrir);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
        return;
      }
      if (!open) return;
      if (e.key === "Escape") return setOpen(false);
      // Sin teclado, una paleta de comandos no es una paleta de comandos
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSel((s) => (flat.length ? (s + 1) % flat.length : 0));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSel((s) => (flat.length ? (s - 1 + flat.length) % flat.length : 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const c = flat[sel];
        if (!c) return;
        if (c.confirmar && pendiente !== c.id) {
          setPendiente(c.id);
          return;
        }
        c.run();
        setPendiente(null);
        setOpen(false);
        setQ("");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, flat, sel]);

  // Mantener a la vista el elemento seleccionado al navegar
  useEffect(() => {
    listRef.current?.querySelector('[data-sel="true"]')?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  /**
   * ¿Queda lista por debajo del recorte?
   *
   * La lista se corta a 340 px y el último elemento que cabe queda seccionado
   * por la mitad —"Mesa Commodities" partida a la altura de las letras, justo
   * encima del pie—, sin nada que diga que hay más. Es el mismo arreglo que
   * llevan el registro en vivo, el carril de decisiones de las mesas y el
   * historial de Analítica; la paleta se quedó sin él.
   *
   * Se remide al escribir, porque el filtro cambia cuántos elementos hay.
   */
  const [hayMas, setHayMas] = useState(false);
  const medirLista = useCallback(() => {
    const el = listRef.current;
    if (el) setHayMas(el.scrollTop + el.clientHeight < el.scrollHeight - 4);
  }, []);
  useEffect(() => {
    medirLista();
  }, [q, open, medirLista]);

  if (!open) return null;

  let idx = -1;
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 pt-[12vh] backdrop-blur-sm"
      onClick={() => setOpen(false)}
      role="dialog"
      aria-modal="true"
      aria-label="Paleta de comandos"
    >
      <div
        ref={boxRef}
        className="mx-4 w-full max-w-lg overflow-hidden rounded-xl border border-cement bg-soft shadow-elevated"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar comando o página…"
          aria-label="Buscar comando"
          className="w-full border-b border-industrial bg-ink px-4 py-3 text-sm text-white placeholder:text-muted"
        />
        <div className="relative">
        <div ref={listRef} onScroll={medirLista} className="max-h-[340px] overflow-y-auto py-1">
          {flat.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-muted">Ningún comando coincide</p>
          )}
          {groups.map(([group, list]) => (
            <div key={group}>
              <p className="px-4 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wider text-muted">
                {group}
              </p>
              {list.map((c) => {
                idx++;
                const on = idx === sel;
                const myIdx = idx;
                return (
                  <button
                    key={c.id}
                    data-sel={on}
                    onMouseEnter={() => setSel(myIdx)}
                    onClick={() => {
                      if (c.confirmar && pendiente !== c.id) return setPendiente(c.id);
                      c.run();
                      setPendiente(null);
                      setOpen(false);
                      setQ("");
                    }}
                    className={`flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-[13px] transition-colors ${
                      pendiente === c.id
                        ? "bg-short/15 text-short"
                        : on
                          ? "bg-raised text-white"
                          : "text-dim"
                    }`}
                  >
                    <span className="truncate">
                      {pendiente === c.id ? c.confirmar : c.label}
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      {/* Que un comando cambie el estado del motor —y no solo
                          te lleve a otra pantalla— tiene que verse ANTES de
                          pulsarlo: hasta ahora "Mesa Forex" y "Detener el
                          piloto" se veían exactamente igual. */}
                      {c.confirmar && pendiente !== c.id && (
                        <span className="rounded bg-industrial px-1.5 py-0.5 text-[9px] text-muted">
                          motor
                        </span>
                      )}
                      {on && (
                        <span className="font-mono text-[10px] text-muted">
                          {pendiente === c.id ? "↵ confirmar" : "↵"}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        {hayMas && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-soft to-transparent" />
        )}
        </div>
        {/*
          Las pistas de teclado, solo donde hay teclado. En un teléfono el pie
          decía "↑↓ navegar · ↵ ejecutar · esc cerrar" y "⌘K": cuatro
          instrucciones y ninguna ejecutable. Lo que sí funciona ahí es tocar
          fuera, y eso no lo decía nadie.
        */}
        <div className="flex items-center justify-between border-t border-industrial px-4 py-2 font-mono text-[10px] text-muted">
          <span className="hidden sm:inline">↑↓ navegar · ↵ ejecutar · esc cerrar</span>
          <span className="sm:hidden">toca fuera para cerrar</span>
          <span className="hidden sm:inline">⌘K</span>
        </div>
      </div>
    </div>
  );
}
