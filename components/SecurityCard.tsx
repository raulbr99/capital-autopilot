"use client";

import { useEffect, useState } from "react";
import { SectionHead } from "./ui";

/**
 * Estado de la puerta de acceso. Existe porque una protección que no se ve no
 * se recuerda: sin esto, el panel puede llevar meses abierto a internet y nada
 * en pantalla lo indica.
 */
/** Definir la variable no protege nada hasta el redespliegue: los dos pasos van juntos. */
const COMANDOS = `vercel env add DASHBOARD_PASSWORD production\nvercel deploy --prod`;

export default function SecurityCard() {
  const [estado, setEstado] = useState<{ protegido: boolean; sesion: boolean } | null>(null);
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    fetch("/api/auth")
      .then((r) => r.json())
      .then(setEstado)
      .catch(() => {});
  }, []);

  if (!estado) return null;

  return (
    <div className="rounded-xl border border-industrial bg-soft">
      <SectionHead label="Acceso al panel" />
      <div className="p-4">
        {estado.protegido ? (
          <>
            <p className="flex items-center gap-2 text-[13px] font-medium text-long">
              <span className="h-2 w-2 rounded-full bg-long" aria-hidden />
              Protegido con contraseña
            </p>
            <p className="mt-1.5 text-[12px] leading-relaxed text-muted">
              Las páginas piden acceso y la API responde 401 a quien no tenga sesión. El cron del bot y
              las routines del Gestor siguen entrando con su propia clave por cabecera.
            </p>
            <button
              onClick={async () => {
                await fetch("/api/auth", { method: "DELETE" });
                window.location.href = "/login";
              }}
              className="mt-3 rounded-lg border border-cement px-3 py-2 text-[12px] font-medium text-dim transition-colors hover:border-short hover:text-short"
            >
              Cerrar sesión
            </button>
          </>
        ) : (
          <>
            <p className="flex items-center gap-2 text-[13px] font-medium text-short">
              <span className="h-2 w-2 rounded-full bg-short" aria-hidden />
              Sin protección — abierto a internet
            </p>
            <p className="mt-1.5 text-[12px] leading-relaxed text-dim">
              Cualquiera con la URL puede <span className="text-white">cerrar posiciones</span>, parar el
              motor o cambiar el riesgo. La puerta está montada pero desactivada: se enciende
              definiendo la variable y volviendo a desplegar.
            </p>
            {/*
              El bloque enseñaba solo el primer paso de dos: definir la variable
              no protege nada hasta que se vuelve a desplegar, y eso iba suelto
              en la prosa. Un comando que se queda a medias es peor que ninguno,
              porque deja creer que ya está hecho. Ahora van los dos, en orden y
              copiables de una vez — nadie transcribe a mano una variable de
              entorno desde una pantalla.
            */}
            <div className="mt-3 overflow-hidden rounded-lg border border-industrial bg-base">
              <div className="flex items-center justify-between border-b border-industrial px-3 py-1.5">
                <span className="font-mono text-[10px] uppercase tracking-wider text-muted">
                  Los dos pasos
                </span>
                <button
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(COMANDOS);
                      setCopiado(true);
                      setTimeout(() => setCopiado(false), 1800);
                    } catch {
                      /* sin permiso de portapapeles: el texto sigue seleccionable */
                    }
                  }}
                  className={`rounded px-2 py-0.5 font-mono text-[10px] transition-colors ${
                    copiado ? "text-long" : "text-muted hover:text-accent"
                  }`}
                >
                  {copiado ? "copiado ✓" : "copiar"}
                </button>
              </div>
              <pre className="overflow-x-auto px-3 py-2 font-mono text-[11px] leading-relaxed text-dim">
                {COMANDOS}
              </pre>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
