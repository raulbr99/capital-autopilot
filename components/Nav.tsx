"use client";

import Link from "next/link";

const GROUPS: { href: string; label: string }[][] = [
  [{ href: "/", label: "Panel" }],
  [
    { href: "/forex", label: "Forex" },
    { href: "/crypto", label: "Crypto" },
    { href: "/stocks", label: "Stocks" },
    { href: "/commodities", label: "Commodities" },
  ],
  [
    { href: "/analytics", label: "Analítica" },
    { href: "/journal", label: "Diario" },
    { href: "/lab", label: "Lab" },
  ],
];

export default function Nav({ active }: { active: string }) {
  return (
    <div className="relative min-w-0">
      <nav className="flex items-center overflow-x-auto rounded-lg border border-industrial p-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {GROUPS.map((group, gi) => (
          <div key={gi} className="flex items-center gap-0.5">
            {gi > 0 && <span className="mx-1 h-4 w-px shrink-0 bg-industrial" aria-hidden />}
            {group.map((it) => {
              const on = it.href === active;
              return on ? (
                <span
                  key={it.href}
                  className="whitespace-nowrap rounded-md bg-raised px-2.5 py-2 text-[12.5px] font-medium text-white"
                >
                  {it.label}
                </span>
              ) : (
                <Link
                  key={it.href}
                  href={it.href}
                  className="whitespace-nowrap rounded-md px-2.5 py-2 text-[12.5px] font-medium text-muted transition-colors hover:text-dim"
                >
                  {it.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
      {/* Pista de scroll en móvil */}
      <span
        className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-ink to-transparent md:hidden"
        aria-hidden
      />
    </div>
  );
}
