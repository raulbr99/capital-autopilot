"use client";

import { AppFooter, AvisoSinConexion } from "./ui";

import { useCallback, useEffect, useState } from "react";
import type { Snapshot } from "./types";
import AppHeader from "./AppHeader";
import ConfigPanel from "./ConfigPanel";
import BacktestPanel from "./BacktestPanel";
import WalkForward from "./WalkForward";
import SecurityCard from "./SecurityCard";

type Tab = "config" | "research";

export default function LabPage() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<Tab>("config");

  /**
   * slim=1 quita registro, curva de equity y operaciones: 17 kB en vez de 35, y
   * esta página solo lee `config` y `notifyEnv`. slim=2 no vale, porque tira
   * justo la configuración.
   */
  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/bot/tick?slim=1");
      const d = await r.json();
      if (!d.error) setSnap(d);
    } catch {
      /* */
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /**
   * Guardar un ajuste hacía DOS peticiones: el PATCH y, detrás, un /api/bot/tick
   * entero para releer la configuración. Y el PATCH ya devuelve la configuración
   * actualizada — es literalmente lo que responde.
   *
   * El segundo viaje no era gratis. /api/bot/tick ejecuta el motor: evalúa los
   * veinte instrumentos pidiendo 150 velas de cada uno a Capital y, si el bot
   * está encendido, corre además la gestión activa de las posiciones abiertas
   * (trailing, breakeven, scaling out) sobre la cuenta real. O sea que marcar
   * una casilla en el Lab disparaba una evaluación completa del universo y podía
   * mover un stop. Con una veintena de mandos en este panel, configurar el bot
   * eran veinte evaluaciones completas.
   *
   * Y se notaba: `busy` deshabilita TODO el panel mientras dura, así que cada
   * clic congelaba la configuración entera hasta que volvía el motor.
   */
  const patch = useCallback(
    async (body: any) => {
      setBusy(true);
      try {
        const r = await fetch("/api/bot", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const cfgNuevo = await r.json();
        if (cfgNuevo && !cfgNuevo.error) {
          setSnap((s) => (s ? { ...s, state: { ...s.state, config: cfgNuevo } } : s));
        } else {
          await load();
        }
      } catch {
        // Si el guardado falla, releer es lo único que devuelve la verdad a la
        // pantalla: sin esto quedarían los mandos con el valor que no se guardó.
        await load();
      } finally {
        setBusy(false);
      }
    },
    [load]
  );

  const cfg = snap?.state.config;

  const tabBtn = (id: Tab, label: string, hint: string) => {
    const on = tab === id;
    return (
      <button
        key={id}
        onClick={() => setTab(id)}
        aria-pressed={on}
        className={`min-w-0 flex-1 rounded-lg px-4 py-2.5 text-left transition-colors sm:flex-none ${
          on ? "bg-raised" : "hover:bg-raised/50"
        }`}
      >
        <span className={`block text-[13px] font-medium ${on ? "text-white" : "text-muted"}`}>{label}</span>
        {/* "simulación · no toca la cuenta" se cortaba en "…no toca la c…" a
            390 px, que es justo la mitad que importa de esa frase. */}
        <span className="mt-0.5 block text-[11px] leading-snug text-muted">{hint}</span>
      </button>
    );
  };

  return (
    <div className="min-h-screen">
      <AppHeader active="/lab" />

      <main className="mx-auto max-w-[1100px] px-5 py-6 md:px-8">
        {/*
          Aquí NO se pasa `lastOk` a propósito: el Lab carga una vez y no
          sondea, así que su antigüedad crecería sin parar y el aviso saldría
          en el funcionamiento normal. Lo que ve esta pantalla es una foto de la
          configuración, no una cotización.
        */}
        <AvisoSinConexion />
        <div className="mb-4">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-white">Lab</h1>
          <p className="mt-1 text-sm text-dim">Estrategia, validación y configuración del bot.</p>
        </div>

        {/* Separar lo que toca la cuenta de lo que solo simula: mezclarlos
            invita a cambiar riesgo real creyendo que se está experimentando. */}
        <div className="mb-5 flex items-stretch gap-1 rounded-xl border border-industrial bg-soft p-1">
          {tabBtn("config", "Configuración", "afecta al motor en vivo")}
          {tabBtn("research", "Investigación", "simulación · no toca la cuenta")}
        </div>

        {tab === "config" ? (
          <div className="space-y-5">
            <div className="flex items-start gap-3 rounded-xl border border-short/30 bg-short/5 px-4 py-3">
              <span className="mt-0.5 text-sm" aria-hidden>
                ⚠️
              </span>
              <p className="text-[12.5px] leading-relaxed text-dim">
                Estos ajustes entran en vigor en el <span className="font-medium text-white">siguiente ciclo del motor</span>{" "}
                sobre la cuenta real. Afectan a operaciones nuevas; las posiciones ya abiertas mantienen su stop.
              </p>
            </div>

            <SecurityCard />

            {cfg ? (
              <>
                <ConfigPanel
                  cfg={cfg}
                  busy={busy}
                  patch={patch}
                  notifyEnv={snap?.state.notifyEnv ?? { telegram: false, discord: false }}
                />
                <p className="px-1 text-[12px] text-muted">
                  Los límites de riesgo (tamaño por operación, máximo por mesa, freno diario) se editan en el{" "}
                  <a href="/" className="text-accent underline-offset-2 hover:underline">
                    panel
                  </a>
                  , junto a las posiciones abiertas que afectan.
                </p>
              </>
            ) : (
              <div className="space-y-3" aria-busy>
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-24 animate-pulse rounded-xl border border-industrial bg-soft" />
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex items-start gap-3 rounded-xl border border-industrial bg-base px-4 py-3">
              <span className="mt-0.5 text-sm" aria-hidden>
                🧪
              </span>
              <p className="text-[12.5px] leading-relaxed text-muted">
                Simulación sobre histórico: <span className="text-dim">no envía órdenes ni cambia la configuración</span>.
                El walk-forward optimiza en una ventana y verifica en la siguiente, que es lo único que dice algo del futuro.
              </p>
            </div>
            <BacktestPanel />
            <WalkForward watchlist={cfg?.watchlist ?? []} instruments={cfg?.instruments ?? []} />
          </div>
        )}
              <AppFooter />
      </main>
    </div>
  );
}
