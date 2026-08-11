"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFocusTrap, useReturnFocus } from "./ui";

export type Command = { id: string; label: string; hint?: string; run: () => void };

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

  useEffect(() => setSel(0), [q, open]);

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
        if (c) {
          c.run();
          setOpen(false);
          setQ("");
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, flat, sel]);

  // Mantener a la vista el elemento seleccionado al navegar
  useEffect(() => {
    listRef.current?.querySelector('[data-sel="true"]')?.scrollIntoView({ block: "nearest" });
  }, [sel]);

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
          className="w-full border-b border-industrial bg-ink px-4 py-3 text-sm text-white placeholder:text-muted focus:outline-none"
        />
        <div ref={listRef} className="max-h-[340px] overflow-y-auto py-1">
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
                      c.run();
                      setOpen(false);
                      setQ("");
                    }}
                    className={`flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-[13px] transition-colors ${
                      on ? "bg-raised text-white" : "text-dim"
                    }`}
                  >
                    <span className="truncate">{c.label}</span>
                    {on && <span className="shrink-0 font-mono text-[10px] text-muted">↵</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between border-t border-industrial px-4 py-2 font-mono text-[10px] text-muted">
          <span>↑↓ navegar · ↵ ejecutar · esc cerrar</span>
          <span>⌘K</span>
        </div>
      </div>
    </div>
  );
}
