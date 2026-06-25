"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import Nav from "./Nav";
import ThemeToggle from "./ThemeToggle";
import { Clock } from "./ui";

/** Cabecera única para las páginas internas (mesas, analítica, diario, lab). */
export default function AppHeader({ active, right }: { active: string; right?: ReactNode }) {
  return (
    <header className="sticky top-0 z-30 flex h-[64px] items-center justify-between gap-3 border-b border-industrial bg-ink/85 px-5 backdrop-blur md:px-8">
      <div className="flex min-w-0 items-center gap-4">
        <Link href="/" className="hidden shrink-0 items-center gap-3 sm:flex">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-onaccent">
            <span className="font-display text-base font-bold leading-none">A</span>
          </div>
        </Link>
        <Nav active={active} />
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {right}
        <ThemeToggle />
        <Clock className="hidden font-mono text-sm text-white lg:block" />
      </div>
    </header>
  );
}
