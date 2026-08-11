"use client";

import { useState } from "react";

export default function LoginForm() {
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const entrar = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (r.ok) {
        const volver = new URLSearchParams(window.location.search).get("volver");
        window.location.href = volver && volver.startsWith("/") ? volver : "/";
      } else {
        const d = await r.json().catch(() => ({}));
        setErr(d.error || "No se pudo entrar");
      }
    } catch {
      setErr("Error de red");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen place-items-center px-5">
      <form onSubmit={entrar} className="w-full max-w-sm rounded-xl border border-industrial bg-soft p-6">
        <div className="flex items-center gap-2.5">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-onaccent">
            <span className="font-display text-base font-bold leading-none">A</span>
          </div>
          <span className="font-display text-[15px] font-semibold tracking-tight text-white">
            Capital Autopilot
          </span>
        </div>

        <h1 className="mt-5 font-display text-xl font-semibold tracking-tight text-white">Acceso al panel</h1>
        <p className="mt-1.5 text-[13px] leading-relaxed text-dim">
          Este panel opera sobre una cuenta real: puede abrir y cerrar posiciones.
        </p>

        <label className="mt-5 block">
          <span className="tag">Contraseña</span>
          <input
            type="password"
            autoFocus
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1.5 w-full rounded-lg border border-cement bg-base px-3 py-2.5 text-sm text-white focus:border-accent focus:outline-none"
          />
        </label>

        {err && <p className="mt-2 text-[12px] text-short">{err}</p>}

        <button
          type="submit"
          disabled={busy || !password}
          className="mt-4 w-full rounded-lg bg-accent px-4 py-2.5 text-[13px] font-semibold text-onaccent transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {busy ? "Comprobando…" : "Entrar"}
        </button>

        <p className="mt-4 border-t border-industrial pt-3 text-[11px] leading-relaxed text-muted">
          El motor sigue operando con o sin sesión abierta: esta puerta protege el mando, no el bot.
        </p>
      </form>
    </div>
  );
}
