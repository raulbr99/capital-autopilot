"use client";

import { useEffect, useRef, useState } from "react";
import { RESOLUCIONES, TZ } from "@/lib/model";

export const fmt = (n: number, d = 2) => {
  const v = Number.isFinite(n) ? n : 0;
  // Cero negativo. toLocaleString escribe el signo ANTES de redondear, así que
  // un flotante de −0,001 € salía como "−0.00": un importe que es cero pero
  // se lee como pérdida. Pasaba en el P&L flotante de la cabecera de cuenta y
  // en la fila de totales de las posiciones, los dos sitios donde se mira si
  // hoy se está ganando o perdiendo. Si al redondear da 0, no lleva signo.
  const redondeado = Number(v.toFixed(d));
  return (redondeado === 0 ? 0 : v).toLocaleString("en-US", {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });
};

export const pf = (n: number) =>
  n === Infinity ? "∞" : Number.isFinite(n) ? n.toFixed(2) : "—";

/**
 * Concordancia de número. La app tenía el plural clavado en el texto en una
 * docena de sitios, así que en cuanto un contador valía 1 salían cosas como
 * "1 señales", "1 entradas" o "Resultados en 1 días". Cada una es minúscula;
 * juntas son la diferencia entre un producto cuidado y uno hecho a medias.
 */
export const pl = (n: number, singular: string, plural: string) =>
  n === 1 ? singular : plural;

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
/**
 * Reloj de la cabecera, en la hora de la CUENTA y diciendo cuál es.
 *
 * Iba con la hora del navegador y sin etiqueta ninguna. En esta pantalla
 * conviven tres relojes distintos: el bot cuenta su día en la zona de la cuenta
 * —Europe/Madrid: de ahí salen el cupo diario, el freno, los separadores del
 * registro y el agrupado del diario—, las sesiones de mesa se calculan en
 * America/New_York, y este marcaba la del dispositivo. Mirado desde fuera de
 * España, el número grande de la cabecera contradecía en silencio a todo lo
 * demás: "hoy" empezaba a una hora distinta de la que marca el reloj que
 * preside la pantalla.
 *
 * Ninguna plataforma seria enseña una hora sin decir de dónde es.
 */
export function Clock({ className }: { className?: string }) {
  const [now, setNow] = useState("--:--:--");
  useEffect(() => {
    const tick = () =>
      setNow(new Date().toLocaleTimeString("es-ES", { timeZone: TZ, hour12: false }));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  const ciudad = (TZ.split("/").pop() || TZ).replace(/_/g, " ");
  return (
    <p className={className} title={`Hora de la cuenta · ${TZ}`}>
      {now}
      <span className="ml-1.5 text-[10px] font-normal text-muted">{ciudad}</span>
    </p>
  );
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

/**
 * Campo numérico de la configuración. Por aquí pasan TODOS los ajustes del
 * motor sobre una cuenta con dinero real, y no tenía ningún límite.
 *
 * El caso feo no es teórico: escribir 0 en "Stop = ×ATR" hace que el motor
 * calcule stopDist = ATR × 0 = 0, y openPosition monta el cuerpo con
 * `...(params.stopDistance ? { stopDistance } : {})` — cero es falso en
 * JavaScript, así que la orden sale SIN STOP. Una tecla, ningún aviso, y la
 * siguiente posición se abre a riesgo ilimitado. Un −2 en "Riesgo por
 * operación" o un periodo de ATR de 1 entran igual de fáciles.
 *
 * Ahora cada campo declara su rango, el navegador lo respeta en las flechas y
 * el valor se recorta al confirmarlo — un rango que solo vive en el atributo
 * `min` no protege de escribir a mano.
 *
 * Y si el campo se deja vacío o con algo que no es un número, se restaura el
 * valor vigente en vez de quedarse en blanco: antes el hueco se quedaba ahí,
 * enseñando "sin valor" sobre un ajuste que sí tiene uno.
 */
export function NumField({
  label,
  value,
  step,
  onCommit,
  busy,
  hint,
  suffix,
  min,
  max,
}: {
  label: string;
  value: number;
  step: number;
  onCommit: (v: number) => void;
  busy?: boolean;
  hint?: string;
  suffix?: string;
  min?: number;
  max?: number;
}) {
  const [v, setV] = useState(String(value));
  useEffect(() => setV(String(value)), [value]);
  const acotar = (n: number) => {
    let x = n;
    if (min != null && x < min) x = min;
    if (max != null && x > max) x = max;
    return x;
  };
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
          min={min}
          max={max}
          onBlur={() => {
            const n = parseFloat(v);
            if (!Number.isFinite(n)) return setV(String(value));
            const c = acotar(n);
            if (c !== n) setV(String(c));
            if (c !== value) onCommit(c);
          }}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          className="w-full rounded-lg border border-cement bg-base px-2.5 py-2 font-mono text-sm text-white transition-colors focus:border-accent disabled:opacity-40"
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
  lastOk,
  offline,
}: {
  configured: boolean;
  enabled: boolean;
  /** Momento de la última lectura BUENA. Ver el reloj propio de abajo. */
  lastOk?: number | null;
  offline?: boolean;
}) {
  /**
   * Reloj propio.
   *
   * Antes recibía `staleMs` ya calculado por quien lo pinta, con un
   * `Date.now() - lastOk` evaluado DURANTE EL RENDER. Y ahí está el fallo: si el
   * broker deja de responder, no hay cambio de estado, luego no hay render,
   * luego ese valor nunca se recalcula. El indicador solo podía detectar que los
   * datos estaban viejos... cuando llegaban datos nuevos.
   *
   * Comprobado bloqueando /api/bot/tick con 502: tras 75 s la cabecera seguía
   * diciendo "live" y el equity se mostraba como si fuera de hace un segundo.
   * Justo el caso para el que existe este indicador.
   *
   * Con su propio intervalo, la antigüedad avanza aunque no llegue nada.
   */
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), 10_000);
    return () => clearInterval(id);
  }, []);
  const staleMs = lastOk == null ? null : ahora - lastOk;
  const stale = offline || (staleMs != null && staleMs > STALE_MS);
  const mins = stale && staleMs != null ? Math.floor(staleMs / 60_000) : 0;
  const color = stale ? "bg-short" : !configured ? "bg-short" : enabled ? "bg-long" : "bg-accent";
  const label = offline
    ? "sin conexión"
    : stale
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
      title={
        offline
          ? "Este dispositivo no tiene red: las cifras son las últimas conocidas"
          : stale
          ? "El broker no responde: las cifras en pantalla son las últimas conocidas"
          : undefined
      }
    >
      <span className={`h-2 w-2 rounded-full ${color} ${enabled && !stale ? "animate-pulseDot" : ""}`} />
      {/*
        En pantallas estrechas solo el punto. Con el equity ya en la cabecera
        móvil, la navegación se quedaba en 60 px de 531 a 375 px —ni cabe la
        pestaña activa—, y "live" es la etiqueta que menos aporta de las tres
        cosas que compiten ahí: el color del punto ya lo dice, y el tooltip y el
        aria-label siguen dando el texto completo. Cuando el estado es MALO
        (broker caído o sin red) la etiqueta se mantiene: eso sí hay que leerlo.
      */}
      {/* Un solo elemento: antes había uno visible y otro sr-only, así que en
          escritorio el lector de pantalla leía la etiqueta dos veces —y el
          innerText la mostraba duplicada ("live | live"). sr-only + not-sr-only
          hace lo mismo con un único nodo. */}
      <span
        className={`text-[11px] font-medium ${
          stale ? "text-short" : "text-dim sr-only sm:not-sr-only"
        }`}
      >
        {label}
      </span>
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

  /**
   * Hora local de Nueva York, no un desfase fijo en UTC.
   *
   * Antes la sesión de bolsa estaba escrita como "13:30–20:00 UTC (horario de
   * verano)". De noviembre a marzo Nueva York está en EST y su sesión cae en
   * 14:30–21:00 UTC, así que durante cuatro meses al año el panel habría dicho
   * "Bolsa de NY cerrada" durante la PRIMERA HORA de negociación y "abierta"
   * una hora después del cierre. Hoy, en agosto, acierta por casualidad.
   *
   * Con la zona horaria real el cambio de hora lo resuelve el navegador, y de
   * paso vale igual para el arranque y cierre semanal de forex, que también se
   * definen sobre Nueva York (domingo y viernes a las 17:00 locales).
   */
  const ny = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const parte = (t: string) => ny.find((p) => p.type === t)?.value ?? "";
  const dias: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const day = dias[parte("weekday")] ?? 0;
  const h = Number(parte("hour")) + Number(parte("minute")) / 60;

  if (cat === "stocks") {
    // Sesión regular: 9:30–16:00 hora de Nueva York, de lunes a viernes.
    const open = day >= 1 && day <= 5 && h >= 9.5 && h < 16;
    return { open, label: open ? "Sesión de Nueva York abierta" : "Bolsa de NY cerrada" };
  }
  // Forex y materias primas: del domingo 17:00 al viernes 17:00 hora de NY.
  const open =
    (day >= 1 && day <= 4) || (day === 0 && h >= 17) || (day === 5 && h < 17);
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

/**
 * ¿Hay conexión? Instalada como PWA se abre en el metro, en un ascensor o con
 * el avión activado: el caparazón carga desde caché y, sin avisar, la pantalla
 * enseña un estado que no puede verificar. Mejor decirlo.
 */
export function useOnline() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const set = () => setOnline(navigator.onLine);
    set();
    window.addEventListener("online", set);
    window.addEventListener("offline", set);
    return () => {
      window.removeEventListener("online", set);
      window.removeEventListener("offline", set);
    };
  }, []);
  return online;
}

/**
 * Riesgo real de una posición hasta su stop.
 *
 * El matiz que se escapaba: cuando la gestión activa mueve el stop POR DELANTE
 * de la entrada, la posición ya no arriesga nada — tiene beneficio asegurado.
 * Contar esa distancia como "riesgo" infla el total y, peor, da una R absurda
 * (llegó a marcar +21R). Vive aquí porque se calculaba en tres sitios y solo
 * uno de ellos contemplaba el caso.
 */
/**
 * Convertir a la divisa de la CUENTA un importe que sale de precios.
 *
 * Todo lo que se calcula multiplicando precios por tamaño —el riesgo hasta el
 * stop, la exposición nocional— queda en la divisa en la que COTIZA el
 * instrumento, no en la de la cuenta. Y aquí la cuenta es en euros mientras las
 * seis posiciones abiertas cotizan en dólares, así que el panel venía
 * dividiendo dólares entre euros para anunciar "5,2 % del capital si saltan
 * todos". Con el euro-dólar por encima de la paridad, eso infla la cifra
 * alrededor de un 8 % — y en la exposición, que es diez veces mayor, el error
 * se cuenta en puntos porcentuales de apalancamiento.
 *
 * El cambio sale del propio universo: EURUSD es uno de los veinte instrumentos
 * que el bot evalúa cada ciclo, así que su precio ya viaja en el snapshot. Si no
 * está, o si el instrumento cotiza en una divisa que no es ninguna de las dos
 * (los cruces contra el yen, por ejemplo), se devuelve null y quien pinte decide
 * qué decir — pero no se afirma una equivalencia que no se tiene.
 */
export function aCuenta(
  importe: number,
  divisaPos: string | undefined,
  divisaCuenta: string | undefined,
  eurusd: number | null | undefined
): number | null {
  if (!Number.isFinite(importe)) return null;
  const a = (divisaPos || "").toUpperCase();
  const b = (divisaCuenta || "").toUpperCase();
  if (!a || !b || a === b) return importe;
  if (!eurusd || eurusd <= 0) return null;
  if (a === "USD" && b === "EUR") return importe / eurusd;
  if (a === "EUR" && b === "USD") return importe * eurusd;
  return null;
}

export function positionRisk(p: {
  direction: "BUY" | "SELL";
  entry: number;
  size: number;
  stopLevel?: number | null;
}) {
  if (p.stopLevel == null) return { risk: null as number | null, locked: false, lockedGain: 0 };
  const locked = p.direction === "BUY" ? p.stopLevel > p.entry : p.stopLevel < p.entry;
  const dist = Math.abs(p.entry - p.stopLevel) * p.size;
  return { risk: locked ? 0 : dist, locked, lockedGain: locked ? dist : 0 };
}

/**
 * Mesa a la que pertenece un activo, según el universo configurado.
 *
 * Estaba resuelto de cuatro formas distintas (dos en el mismo fichero), y de
 * eso depende qué se ve en cada mesa, el cupo por mesa y el filtrado de la
 * analítica. Las posiciones de activos ya retirados caen en "otros": siguen
 * abiertas y no deben desaparecer de los recuentos.
 */
export function deskOfEpic(
  instruments: { epic: string; category?: string }[] | undefined,
  epic: string
): string {
  return instruments?.find((i) => i.epic === epic)?.category || "otros";
}

/** Versión memoizable: devuelve un Map listo para consultar en bucles. */
export function deskMap(instruments: { epic: string; category?: string }[] | undefined) {
  const m = new Map<string, string>();
  for (const i of instruments ?? []) m.set(i.epic, i.category || "otros");
  return m;
}

/**
 * Pie único de la aplicación.
 *
 * Estaba escrito a mano en el panel y en Analítica —con textos distintos, uno
 * con "órdenes reales" y el otro sin— y NO EXISTÍA en las cuatro mesas, el
 * Diario ni el Lab. O sea que el aviso de que esto opera una cuenta real
 * faltaba precisamente en las pantallas donde se cierran posiciones y se lanza
 * al Gestor, que es donde más falta hace. Mismo argumento que llevó a unificar
 * la cabecera: si un aviso solo aparece en algunas pantallas, no es un aviso.
 *
 * En Analítica además no se apilaba en móvil, así que los dos textos se
 * peleaban por el ancho a 375 px.
 */
export function AppFooter() {
  return (
    <footer className="mt-10 flex flex-col items-center justify-between gap-2 border-t border-industrial py-6 text-[11px] text-muted sm:flex-row">
      <p>Capital Autopilot</p>
      <p className="text-center sm:text-right">
        Cuenta real · órdenes reales · no es consejo financiero
      </p>
    </footer>
  );
}

/** Velas que cubren ~24 h en cada marco; WEEK no cabe en un día y vale null. */
const VELAS_POR_DIA: Record<string, number | null> = Object.fromEntries(
  RESOLUCIONES.map((r) => [r.k, r.velasDia])
);

/**
 * Variación de precio comparable entre activos.
 *
 * La cinta y las tarjetas de señal calculaban el cambio contra `spark[0]`, o
 * sea contra la PRIMERA de las últimas 30 velas — a la resolución de cada
 * activo. Con NZDUSD en DAY eso son 30 días y con EURUSD en HOUR_4 son 5, así
 * que la cinta ponía "+1.79%" y "−0.10%" uno al lado del otro como si midieran
 * lo mismo. Una cinta de cotizaciones existe precisamente para comparar de un
 * vistazo; con ventanas distintas por símbolo, compararlos engaña.
 *
 * Ahora se mide sobre las velas que cubren ~24 h. Si no hay suficientes (un
 * marco corto no llega a un día con 30 velas), devuelve la ventana entera y lo
 * dice en `dia: false` para que quien lo pinte pueda avisar en vez de mentir.
 */
export function variacion(
  spark: number[] | undefined,
  precio: number,
  resolucion: string
): { pct: number; dia: boolean } | null {
  const sp = spark || [];
  if (sp.length < 2 || !precio) return null;
  const n = VELAS_POR_DIA[resolucion];
  const dia = n != null && sp.length > n;
  const base = dia ? sp[sp.length - 1 - n] : sp[0];
  if (!base) return null;
  return { pct: ((precio - base) / base) * 100, dia };
}

/**
 * Aviso de "sin red", compartido.
 *
 * Vivía escrito a mano dentro del panel principal. En las mesas, Analítica, el
 * Diario y el Lab, quedarse sin conexión solo cambiaba el punto de la cabecera
 * — sin decir que las cifras son las últimas conocidas, ni lo más importante:
 * que el bot sigue operando en el servidor y que tus stops no dependen de este
 * teléfono. Es el mismo argumento que llevó a unificar el pie: un aviso que
 * solo sale en una pantalla no es un aviso.
 */
/** A partir de aquí los datos en pantalla dejan de considerarse actuales. */
export const STALE_MS = 60_000;

/**
 * Aviso de datos no actuales.
 *
 * Salía solo con `navigator.onLine === false`, que es una señal optimista: vale
 * para el modo avión, pero devuelve true con una wifi conectada que no llega a
 * ninguna parte, con un portal cautivo o cuando el que no responde es el
 * servidor. Justo los casos en los que uno sigue mirando cifras viejas creyendo
 * que son de ahora.
 *
 * El dato bueno ya existía: el distintivo de la cabecera se pone rojo cuando la
 * última lectura buena pasa de un minuto, y lo calcula con su propio reloj
 * precisamente porque si el broker deja de responder no hay nada que provoque
 * un render. Pero ese distintivo es un punto de color en una esquina; el aviso
 * que EXPLICA lo que está pasando —y que el bot sigue operando en el servidor—
 * se quedaba callado.
 *
 * Ahora sale también por antigüedad, con el mismo umbral y su propio reloj.
 */
export function AvisoSinConexion({
  lastOk,
  cadaMs,
}: {
  lastOk?: number | null;
  /**
   * Cada cuánto sondea la página que lo pinta. El umbral no puede ser fijo: con
   * el minuto de la cabecera, una pantalla que se refresca cada minuto —el
   * Diario— daría el aviso justo antes de cada sondeo bueno, y una alarma que
   * salta en el funcionamiento normal se aprende a ignorar. Se exige perder
   * dos ciclos y medio, con el minuto como suelo.
   */
  cadaMs?: number;
}) {
  const online = useOnline();
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), 10_000);
    return () => clearInterval(id);
  }, []);
  const umbral = Math.max(STALE_MS, (cadaMs ?? 0) * 2.5);
  const viejo = lastOk != null && ahora - lastOk > umbral;
  if (online && !viejo) return null;
  const mins = lastOk == null ? 0 : Math.floor((ahora - lastOk) / 60_000);
  return (
    <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-short/30 bg-short/5 px-4 py-3">
      <span aria-hidden>📡</span>
      <p className="text-[12.5px] leading-relaxed text-dim">
        <span className="font-medium text-short">
          {online ? "El broker no responde." : "Sin conexión."}
        </span>{" "}
        Estás viendo la última información conocida
        {online && mins >= 1 ? ` (de hace ${mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)} h`})` : ""}, no
        la actual.{" "}
        <span className="text-white">El bot sigue operando en el servidor</span>: sus decisiones y tus
        stops no dependen de este dispositivo.
      </p>
    </div>
  );
}
