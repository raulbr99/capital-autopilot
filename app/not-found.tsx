import Link from "next/link";

const DESTINOS = [
  { href: "/", label: "Panel de mando" },
  { href: "/forex", label: "Mesa Forex" },
  { href: "/crypto", label: "Mesa Crypto" },
  { href: "/stocks", label: "Mesa Stocks" },
  { href: "/commodities", label: "Mesa Commodities" },
  { href: "/analytics", label: "Analítica" },
  { href: "/journal", label: "Diario del Gestor IA" },
  { href: "/lab", label: "Lab" },
];

export default function NotFound() {
  return (
    <div className="grid min-h-screen place-items-center px-5">
      <div className="w-full max-w-md rounded-xl border border-industrial bg-soft p-6">
        <p className="tag">Error 404</p>
        <h1 className="mt-3 font-display text-2xl font-semibold tracking-tight text-white">
          Esta página no existe
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-dim">
          La dirección no corresponde a ninguna sección del panel. Estas son todas:
        </p>

        <nav className="mt-4 grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-industrial bg-industrial sm:grid-cols-2">
          {DESTINOS.map((d) => (
            <Link
              key={d.href}
              href={d.href}
              className="bg-soft px-3 py-2.5 text-[13px] text-dim transition-colors hover:bg-raised hover:text-accent"
            >
              {d.label}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
