"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { Snapshot } from "./types";
import { Clock } from "./ui";
import Nav from "./Nav";
import ThemeToggle from "./ThemeToggle";
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
      <header className="sticky top-0 z-30 flex h-[64px] items-center justify-between gap-3 border-b border-industrial bg-ink/85 px-5 backdrop-blur md:px-8">
        <div className="flex min-w-0 items-center gap-4">
          <Link href="/" className="hidden shrink-0 items-center gap-3 sm:flex">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-onaccent">
              <span className="font-display text-base font-bold leading-none">A</span>
            </div>
          </Link>
          <Nav active="/lab" />
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <ThemeToggle />
          <Clock className="hidden font-mono text-sm text-white lg:block" />
        </div>
      </header>

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
