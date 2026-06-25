"use client";

import Link from "next/link";

const ITEMS = [
  { href: "/", label: "Panel" },
  { href: "/forex", label: "Forex" },
  { href: "/crypto", label: "Crypto" },
  { href: "/stocks", label: "Stocks" },
  { href: "/commodities", label: "Commodities" },
  { href: "/analytics", label: "Analítica" },
  { href: "/journal", label: "Diario" },
];

export default function Nav({ active }: { active: string }) {
  return (
    <nav className="flex items-center gap-0.5 overflow-x-auto rounded-lg border border-industrial p-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {ITEMS.map((it) => {
        const on = it.href === active;
        return on ? (
          <span
            key={it.href}
            className="whitespace-nowrap rounded-md bg-raised px-2.5 py-1.5 text-[12.5px] font-medium text-white"
          >
            {it.label}
          </span>
        ) : (
          <Link
            key={it.href}
            href={it.href}
            className="whitespace-nowrap rounded-md px-2.5 py-1.5 text-[12.5px] font-medium text-muted transition-colors hover:text-dim"
          >
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
