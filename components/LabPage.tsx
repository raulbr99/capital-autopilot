"use client";

import { useCallback, useEffect, useState } from "react";
import type { Snapshot } from "./types";
import AppHeader from "./AppHeader";
import ConfigPanel from "./ConfigPanel";
import BacktestPanel from "./BacktestPanel";
import WalkForward from "./WalkForward";

export default function LabPage() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/bot/tick");
      const d = await r.json();
      if (!d.error) setSnap(d);
    } catch {
      /* */
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const patch = useCallback(
    async (body: any) => {
      setBusy(true);
      try {
        await fetch("/api/bot", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        await load();
      } finally {
        setBusy(false);
      }
    },
    [load]
  );

  const cfg = snap?.state.config;

  return (
    <div className="min-h-screen">
      <AppHeader active="/lab" />

      <main className="mx-auto max-w-[1100px] space-y-5 px-5 py-6 md:px-8">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-white">Lab</h1>
          <p className="mt-1 text-sm text-dim">
            Estrategia, validación y configuración del bot. Los cambios afectan al motor en vivo.
          </p>
        </div>

        {cfg ? (
          <ConfigPanel
            cfg={cfg}
            busy={busy}
            patch={patch}
            notifyEnv={snap?.state.notifyEnv ?? { telegram: false, discord: false }}
          />
        ) : (
          <div className="dotgrid rounded-xl border border-industrial bg-soft p-10 text-center text-sm text-muted">
            Cargando configuración…
          </div>
        )}

        <BacktestPanel />
        <WalkForward watchlist={cfg?.watchlist ?? []} />
      </main>
    </div>
  );
}
