"use client";

import { useEffect, useRef, useState } from "react";

export const fmt = (n: number, d = 2) =>
  (Number.isFinite(n) ? n : 0).toLocaleString("en-US", {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });

export const pf = (n: number) =>
  n === Infinity ? "∞" : Number.isFinite(n) ? n.toFixed(2) : "—";

// P&L: el cero es NEUTRO (ni verde ni "+"), solo color con signo real.
const EPS = 0.005;
export const pnlClass = (v: number) =>
  v > EPS ? "text-long" : v < -EPS ? "text-short" : "text-dim";
export const pnlFmt = (v: number, d = 2) => (v > EPS ? "+" : "") + fmt(v, d);

// Glifos monocromos por mesa (sin emoji multicolor).
export function DeskGlyph({ cat, className = "h-4 w-4" }: { cat: string; className?: string }) {
  const paths: Record<string, React.ReactNode> = {
    forex: <path d="M4 7.5h12l-3-3M16 12.5H4l3 3" />,
    crypto: <path d="M10 3l6 3.5v7L10 17l-6-3.5v-7z" />,
    stocks: (
      <>
        <path d="M3 14l4-4 3 2 6-7" />
        <path d="M16 5h1v3" />
      </>
    ),
    commodities: <path d="M10 3c3 4 5 6 5 9a5 5 0 0 1-10 0c0-3 2-5 5-9z" />,
  };
  return (
    <svg
      viewBox="0 0 20 20"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[cat] ?? null}
    </svg>
  );
}

/** Reloj aislado: solo este componente se re-renderiza cada segundo, no la página. */
export function Clock({ className }: { className?: string }) {
  const [now, setNow] = useState("--:--:--");
  useEffect(() => {
    const tick = () => setNow(new Date().toLocaleTimeString("es-ES", { hour12: false }));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return <p className={className}>{now}</p>;
}

export function SectionHead({ label, right }: { label: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-industrial px-5 py-3.5">
      <h2 className="tag">{label}</h2>
      {right ?? <span className="h-1.5 w-1.5 rounded-full bg-accent/70" />}
    </div>
  );
}

export function StatCard({
  label,
  value,
  unit,
  tone,
}: {
  label: string;
  value: string | null;
  unit?: string;
  tone?: "long" | "short" | "accent";
}) {
  const c =
    tone === "long"
      ? "text-long"
      : tone === "short"
      ? "text-short"
      : tone === "accent"
      ? "text-accent"
      : "text-white";
  return (
    <div className="min-w-0 bg-soft p-4 sm:p-5">
      <p className="tag truncate">{label}</p>
      {value == null ? (
        <Skeleton className="mt-2 h-7 w-24" />
      ) : (
        <p className={`mt-2 truncate font-mono text-xl font-medium tracking-tight sm:text-2xl ${c}`}>
          {value} {unit && <span className="text-xs font-normal text-muted">{unit}</span>}
        </p>
      )}
    </div>
  );
}

export function NumField({
  label,
  value,
  step,
  onCommit,
  busy,
  hint,
  suffix,
}: {
  label: string;
  value: number;
  step: number;
  onCommit: (v: number) => void;
  busy?: boolean;
  hint?: string;
  suffix?: string;
}) {
  const [v, setV] = useState(String(value));
  useEffect(() => setV(String(value)), [value]);
  return (
    <label className="block">
      <span className="tag">{label}</span>
      <div className="relative mt-1.5">
        <input
          type="number"
          step={step}
          value={v}
          disabled={busy}
          onChange={(e) => setV(e.target.value)}
          onBlur={() => {
            const n = parseFloat(v);
            if (Number.isFinite(n) && n !== value) onCommit(n);
          }}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          className="w-full rounded-lg border border-cement bg-base px-2.5 py-2 font-mono text-sm text-white transition-colors focus:border-accent focus:outline-none disabled:opacity-40"
        />
        {suffix && (
          <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 font-mono text-[11px] text-muted">
            {suffix}
          </span>
        )}
      </div>
      {hint && <span className="mt-1 block text-[10px] leading-snug text-muted">{hint}</span>}
    </label>
  );
}

export function Toggle({
  on,
  onClick,
  busy,
  labelOn,
  labelOff,
}: {
  on: boolean;
  onClick: () => void;
  busy?: boolean;
  labelOn: string;
  labelOff: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors disabled:opacity-40 ${
        on ? "border-accent/40 bg-accent/10 text-accent" : "border-cement text-muted hover:text-dim"
      }`}
    >
      <span className={`relative h-3.5 w-6 rounded-full transition-colors ${on ? "bg-accent" : "bg-cement"}`}>
        <span
          className={`absolute top-0.5 h-2.5 w-2.5 rounded-full bg-white transition-all ${
            on ? "left-[13px]" : "left-0.5"
          }`}
        />
      </span>
      {on ? labelOn : labelOff}
    </button>
  );
}

export function Sparkline({
  data,
  up,
  w = 120,
  h = 32,
}: {
  data: number[];
  up?: boolean;
  w?: number;
  h?: number;
}) {
  if (!data || data.length < 2)
    return <div style={{ height: h }} className="w-full rounded bg-industrial/40" />;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const x = (i: number) => (i / (data.length - 1)) * w;
  const y = (val: number) => h - ((val - min) / range) * (h - 4) - 2;
  const line = data.map((d, i) => `${x(i).toFixed(1)},${y(d).toFixed(1)}`).join(" ");
  const isUp = up ?? data[data.length - 1] >= data[0];
  // Fluido: viewBox como sistema de coordenadas interno + width 100% para que
  // llene su contenedor (antes el ancho fijo desbordaba las tarjetas en móvil).
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      width="100%"
      height={h}
      preserveAspectRatio="none"
      className={`block w-full overflow-visible ${isUp ? "text-long" : "text-short"}`}
    >
      <polyline
        points={line}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/**
 * Estado de conexión con el broker. Ojo con `staleMs`: si el broker deja de
 * responder (pasó de verdad: Capital cayó por mantenimiento el 27-jun y devolvía
 * 401 en todo), la pantalla se queda con los últimos datos buenos. Sin decirlo,
 * un badge verde "live" sobre cifras congeladas es peor que no mostrar nada.
 */
export function ConnBadge({
  configured,
  enabled,
  staleMs,
}: {
  configured: boolean;
  enabled: boolean;
  staleMs?: number | null;
}) {
  const stale = staleMs != null && staleMs > 60_000;
  const mins = stale ? Math.floor(staleMs! / 60_000) : 0;
  const color = stale ? "bg-short" : !configured ? "bg-short" : enabled ? "bg-long" : "bg-accent";
  const label = stale
    ? `sin datos · ${mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)} h`}`
    : !configured
    ? "sin credenciales"
    : enabled
    ? "live"
    : "conectado";
  return (
    <div
      className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 ${
        stale ? "border-short/50 bg-short/10" : "border-industrial"
      }`}
      title={stale ? "El broker no responde: las cifras en pantalla son las últimas conocidas" : undefined}
    >
      <span className={`h-2 w-2 rounded-full ${color} ${enabled && !stale ? "animate-pulseDot" : ""}`} />
      <span className={`text-[11px] font-medium ${stale ? "text-short" : "text-dim"}`}>{label}</span>
    </div>
  );
}

/** Decimales según la magnitud del precio (forex necesita 5, índices/cripto 1). */
export function pdec(n: number) {
  const a = Math.abs(n);
  return a < 10 ? 5 : a < 100 ? 3 : a < 1000 ? 2 : 1;
}

/** Precio con los decimales propios del activo. Compartido por tabla y señales. */
export function price(n: number | null | undefined) {
  return n == null ? "—" : fmt(n, pdec(n));
}

/**
 * Hueco de carga. Existe para no mentir: mientras no hay datos, un "0" o un
 * "En espera" afirman algo falso sobre el estado real de la cuenta.
 */
export function Skeleton({ className = "" }: { className?: string }) {
  return <span className={`block animate-pulse rounded bg-industrial motion-reduce:animate-none ${className}`} aria-hidden />;
}

/**
 * Estado de sesión de una mesa según su horario habitual (UTC). Un panel de
 * broker siempre dice si el mercado está abierto AHORA; sin eso, un tablero
 * lleno de "FLAT" parece averiado cuando en realidad está cerrado.
 * Es una estimación por horario: el motor revalida con Capital antes de operar.
 */
export function deskSession(cat: string, now = new Date()): { open: boolean; label: string } {
  if (cat === "crypto") return { open: true, label: "Mercado abierto · 24/7" };
  const day = now.getUTCDay(); // 0 domingo
  const h = now.getUTCHours() + now.getUTCMinutes() / 60;

  if (cat === "stocks") {
    // Nueva York 13:30–20:00 UTC (horario de verano), L-V
    const open = day >= 1 && day <= 5 && h >= 13.5 && h < 20;
    return { open, label: open ? "Sesión de Nueva York abierta" : "Bolsa de NY cerrada" };
  }
  // Forex y materias primas: de domingo 22:00 UTC a viernes 21:00 UTC
  const open =
    (day > 1 && day < 5) ||
    (day === 1 && h >= 0) ||
    (day === 0 && h >= 22) ||
    (day === 5 && h < 21);
  return { open, label: open ? "Mercado abierto" : "Mercado cerrado · fin de semana" };
}

/**
 * Sondeo consciente de la visibilidad. Con la pestaña oculta —o el móvil en el
 * bolsillo, que en una PWA es lo normal— seguir preguntando cada 6 s gasta
 * batería y datos, y cada tick consulta a Capital de verdad. Aquí el reloj se
 * para al ocultarse y se dispara una lectura inmediata al volver, así que al
 * mirar la pantalla los datos están frescos igualmente.
 */
export function usePoll(fn: () => void, ms: number, deps: React.DependencyList = []) {
  const saved = useRef(fn);
  useEffect(() => {
    saved.current = fn;
  });

  useEffect(() => {
    let id: ReturnType<typeof setInterval> | null = null;
    const stop = () => {
      if (id) clearInterval(id);
      id = null;
    };
    const start = () => {
      stop();
      id = setInterval(() => saved.current(), ms);
    };
    const onVis = () => {
      if (document.hidden) stop();
      else {
        saved.current(); // al volver, refresco inmediato
        start();
      }
    };
    saved.current();
    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ms, ...deps]);
}

/**
 * Devuelve el foco al elemento que abrió el modal. Sin esto, al cerrar con
 * Escape el foco se queda en el body y quien navega con teclado vuelve al
 * principio de la página en vez de a donde estaba.
 */
export function useReturnFocus(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const prev = document.activeElement as HTMLElement | null;
    return () => prev?.focus?.();
  }, [active]);
}

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Encierra el tabulador dentro del modal. Sin esto, seguir pulsando Tab saca el
 * foco a la página de detrás —que sigue ahí, tapada— y quien navega con teclado
 * acaba operando a ciegas sobre controles que no ve.
 */
export function useFocusTrap(ref: React.RefObject<HTMLElement>, active: boolean) {
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !ref.current) return;
      const items = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (el) => el.offsetParent !== null
      );
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      const cur = document.activeElement;
      if (e.shiftKey && (cur === first || !ref.current.contains(cur))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && cur === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [ref, active]);
}

/**
 * Sincroniza <meta name="theme-color"> con el tema. Instalada como PWA, ese
 * color pinta la barra de estado del móvil: con el valor fijo en grafito, el
 * tema claro dejaba una franja oscura encima de una app clara.
 */
export function syncThemeColor(theme: "dark" | "light") {
  const color = theme === "light" ? "#F6F7F9" : "#0B0D11";
  let tag = document.querySelector('meta[name="theme-color"]');
  if (!tag) {
    tag = document.createElement("meta");
    tag.setAttribute("name", "theme-color");
    document.head.appendChild(tag);
  }
  tag.setAttribute("content", color);
}
