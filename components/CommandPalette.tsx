"use client";

import { useEffect, useState } from "react";

export type Command = { id: string; label: string; hint?: string; run: () => void };

export default function CommandPalette({ commands }: { commands: Command[] }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!open) return null;
  const filtered = commands.filter((c) =>
    c.label.toLowerCase().includes(q.toLowerCase())
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 pt-[14vh] backdrop-blur-sm"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-lg border border-cement bg-soft glow-volt"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Ejecutar comando…"
          className="w-full border-b border-industrial bg-ink px-4 py-3 font-mono text-sm text-white placeholder:text-muted focus:outline-none"
        />
        <div className="max-h-[300px] overflow-y-auto">
          {filtered.length === 0 && (
            <p className="px-4 py-6 text-center tag">SIN_RESULTADOS</p>
          )}
          {filtered.map((c) => (
            <button
              key={c.id}
              onClick={() => {
                c.run();
                setOpen(false);
                setQ("");
              }}
              className="flex w-full items-center justify-between px-4 py-3 text-left font-mono text-[13px] text-dim hover:bg-industrial hover:text-volt"
            >
              {c.label}
              {c.hint && <span className="text-[10px] text-muted">{c.hint}</span>}
            </button>
          ))}
        </div>
        <div className="border-t border-industrial px-4 py-2">
          <span className="tag">⌘K // COMMAND_PALETTE</span>
        </div>
      </div>
    </div>
  );
}
