"use client";

import { useEffect, useState } from "react";

export default function LoginForm() {
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /**
   * ¿Hay puerta que abrir?
   *
   * Sin DASHBOARD_PASSWORD definida —que es el estado de hoy— esta pantalla
   * enseñaba un formulario de contraseña con el botón deshabilitado hasta
   * escribir algo, y la única forma de descubrir que no hay contraseña era
   * inventarse una y enviarla. Un callejón sin salida: ni entras, ni te vas,
   * porque tampoco había un enlace de vuelta al panel.
   *
   * El endpoint que lo dice ya existe y lo consume la tarjeta de Acceso del
   * Lab: GET /api/auth devuelve { protegido }. Se pregunta al montar.
   */
  const [protegido, setProtegido] = useState<boolean | null>(null);
  useEffect(() => {
    fetch("/api/auth")
      .then((r) => r.json())
      .then((d) => setProtegido(!!d?.protegido))
      .catch(() => setProtegido(true)); // ante la duda, se pide contraseña
  }, []);

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
      const d0 = r.ok ? await r.clone().json().catch(() => ({})) : null;
      if (d0?.sinPassword) {
        // No hay DASHBOARD_PASSWORD definida: la puerta no existe todavía. Sin
        // esto, el formulario aceptaba cualquier cosa y te dejaba pasar sin
        // explicar por qué — parecía que la contraseña había sido correcta.
        setErr("No hay contraseña configurada: el panel está abierto. Entrando…");
        setTimeout(() => (window.location.href = "/"), 1200);
        return;
      }
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

        {protegido === false && (
          <div className="mt-4 rounded-lg border border-accent/30 bg-accent/5 px-3 py-2.5">
            <p className="text-[12.5px] leading-relaxed text-dim">
              <span className="font-medium text-accent">No hay contraseña configurada.</span> El panel
              está abierto: no hace falta entrar por aquí.
            </p>
            <a
              href="/"
              className="mt-2 inline-flex min-h-[34px] items-center rounded-lg border border-cement px-3 text-[13px] font-medium text-dim transition-colors hover:border-accent hover:text-accent"
            >
              Ir al panel
            </a>
          </div>
        )}

        <label className="mt-5 block">
          <span className="tag">Contraseña</span>
          <input
            type="password"
            autoFocus
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1.5 w-full rounded-lg border border-cement bg-base px-3 py-2.5 text-sm text-white focus:border-accent"
          />
        </label>

        {err && (
          <p role="alert" className="mt-2 text-[12px] text-short">
            {err}
          </p>
        )}

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
