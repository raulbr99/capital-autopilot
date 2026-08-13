"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Snapshot, OpenPos, TradeRecord, Instrument } from "./types";
import { fmt, price, pnlFmt, pnlClass, SectionHead, StatCard, DeskGlyph, Skeleton, deskSession, usePoll, useOnline, positionRisk, deskOfEpic, AppFooter, variacion, AvisoSinConexion, aCuenta } from "./ui";
import EquityChart from "./EquityChart";
import PositionsTable from "./PositionsTable";
import RiskPanel from "./RiskPanel";
import LogFeed from "./LogFeed";
import ExpectancyPanel from "./ExpectancyPanel";
import CommandPalette, { abrirPaleta, type Command } from "./CommandPalette";
import AppHeader from "./AppHeader";
import Link from "next/link";

const TICK_MS = 6000;
/**
 * El histórico (registro + curva de equity) NO cambia al ritmo de los precios:
 * appendEquity deduplica por debajo de 120 s y el registro solo crece cuando
 * corre el motor (~58 min). Aun así el panel se traía el payload COMPLETO cada
 * 6 s. Medido con un minuto de panel abierto: 11 llamadas a /api/bot/tick y
 * 370 kB, más 105 kB de /api/bot/trades — 476 kB por minuto de estar mirando.
 * Ahora el sondeo rápido pide ?slim=1 (sin registro, curva ni operaciones) y
 * uno lento trae esas tres cosas. Los modos ligeros existen desde la pasada 60
 * y el panel era el único que no los usaba.
 */
const HISTORIAL_MS = 60000;
const TRADES_MS = 60000;

export default function Dashboard() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [trades, setTrades] = useState<TradeRecord[]>([]);
  const [cierreErr, setCierreErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<"long" | "short" | null>(null);
  const prevClosed = useRef(0);
  const prevOpened = useRef(0);
  const [lastOk, setLastOk] = useState<number | null>(null);
  const online = useOnline();
  const router = useRouter();

  const tick = useCallback(async (active: boolean) => {
    try {
      const res = await fetch(`/api/bot/tick${active ? "" : "?slim=1"}`, {
        method: active ? "POST" : "GET",
      });
      const data: Snapshot = await res.json();
      // Solo cuenta como lectura buena si el broker respondió de verdad; si no,
      // se conservan los datos previos pero marcados como no frescos.
      if (!(data as any).error) {
        setSnap(data);
        setLastOk(Date.now());
      }
    } catch {
      /* la red falló: lastOk se queda atrás y la cabecera lo delata */
    }
  }, []);

  /** Registro y curva: se piden aparte y despacio. */
  const [historial, setHistorial] = useState<{ logs: Snapshot["state"]["logs"]; equity: Snapshot["state"]["equity"] }>({
    logs: [],
    equity: [],
  });
  const loadHistorial = useCallback(async () => {
    try {
      const r = await fetch("/api/bot/tick");
      const d: Snapshot = await r.json();
      if (!(d as any).error && d.state) {
        setHistorial({ logs: d.state.logs ?? [], equity: d.state.equity ?? [] });
      }
    } catch {
      /* */
    }
  }, []);

  const loadTrades = useCallback(async () => {
    try {
      const r = await fetch("/api/bot/trades");
      const d = await r.json();
      setTrades(Array.isArray(d.trades) ? d.trades : []);
    } catch {
      /* */
    }
  }, []);

  // Calienta la sesión de Capital una vez al montar
  useEffect(() => {
    fetch("/api/capital/session").catch(() => {});
  }, []);

  // Sondeo solo-lectura, en pausa con la pestaña oculta: cada tick consulta a
  // Capital de verdad, así que sondear con el móvil guardado es gasto puro.
  usePoll(() => tick(false), TICK_MS, [tick]);
  usePoll(loadTrades, TRADES_MS, [loadTrades]);
  usePoll(loadHistorial, HISTORIAL_MS, [loadHistorial]);

  // alertas: flash + beep cuando cambian aperturas/cierres
  useEffect(() => {
    if (!snap) return;
    const o = snap.state.stats.tradesOpened;
    const c = snap.state.stats.tradesClosed;
    if (prevOpened.current && o > prevOpened.current) {
      setFlash("long");
      beep(660);
      loadTrades();
      setTimeout(() => setFlash(null), 600);
    } else if (prevClosed.current && c > prevClosed.current) {
      setFlash("short");
      beep(440);
      loadTrades();
      setTimeout(() => setFlash(null), 600);
    }
    prevOpened.current = o;
    prevClosed.current = c;
  }, [snap, loadTrades]);

  /**
   * Mismo desperdicio que tenía el Lab: tras el PATCH se pedía un tick COMPLETO
   * solo para releer la configuración que el propio PATCH ya devuelve.
   *
   * Aquí el tick no es una lectura barata: /api/bot/tick ejecuta el motor —150
   * velas de cada uno de los veinte instrumentos contra Capital— y, con el bot
   * encendido, la gestión activa de las posiciones abiertas. Así que cambiar el
   * riesgo por operación, activar los stops por ATR o parar el piloto disparaba
   * una evaluación entera del universo y podía mover un stop en vivo, además de
   * dejar los mandos deshabilitados (`busy`) mientras tanto.
   *
   * Los datos de mercado no dependen de este cambio: los refresca el sondeo
   * normal, que ya corre solo. Lo único que cambia es la configuración, y esa
   * viene en la respuesta.
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
          /*
            Salvo tres ajustes: el interruptor del piloto y los dos límites que
            deciden si el motor está ARMADO (operaciones al día y freno diario).
            `armed` no vive en la configuración, lo calcula el motor, así que sin
            releerlo la línea "armadas / en seco" se quedaría hasta 6 s diciendo
            lo anterior — justo debajo del botón que acabas de pulsar. El resto
            de mandos (stops por ATR, trailing, comité, tamaño, riesgo por
            operación) no tocan ese estado y no necesitan el viaje.
          */
          if (
            body?.enabled !== undefined ||
            body?.risk?.maxTradesPerDay !== undefined ||
            body?.risk?.maxDailyLossPct !== undefined
          ) {
            await tick(false);
          }
        } else {
          await tick(false);
        }
      } catch {
        // Si falla, releer es lo único que devuelve la verdad a la pantalla.
        await tick(false);
      } finally {
        setBusy(false);
      }
    },
    [tick]
  );

  /**
   * Aquí sí se refrescaba, pero tampoco se miraba la respuesta: si Capital
   * rechaza el cierre —mercado cerrado, posición ya inexistente, sesión
   * caducada— la ruta devuelve 500 con el motivo y el panel se limitaba a
   * recargar. La posición reaparecía en la tabla y no había forma de saber si
   * el cierre falló o si es que el refresco llegó demasiado pronto.
   */
  const closePos = async (p: OpenPos) => {
    setBusy(true);
    setCierreErr(null);
    try {
      const r = await fetch(`/api/capital/positions?dealId=${p.dealId}`, { method: "DELETE" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) setCierreErr(d.error || `No se pudo cerrar ${p.epic}.`);
      await tick(false);
      await loadTrades();
    } catch (e) {
      setCierreErr(e instanceof Error ? e.message : "Error de red al cerrar.");
    } finally {
      setBusy(false);
    }
  };

  const cfg = snap?.state.config;
  const acc = snap?.account;
  const positions = snap?.openPositions ?? [];
  const evals = snap?.evals ?? [];
  const floatPnl = positions.reduce((s, p) => s + (p.upl || 0), 0);
  const equity = historial.equity;
  const lastEquity = equity.length ? equity[equity.length - 1].equity : 0;
  const configured = snap?.configured ?? true;
  const enabled = cfg?.enabled ?? false;
  // Sin snapshot no sabemos NADA: pintar 0 y "En espera" afirma que el motor
  // está parado y la cuenta vacía, que es justo lo contrario de informar.
  const loading = !snap;

  /**
   * Riesgo agregado. Las posiciones cuyo stop ya está por delante de la entrada
   * NO arriesgan nada: sumarlas inflaba la cifra.
   *
   * Y llevaba el mismo error de divisa que corregí ayer en la tabla y en las
   * mesas, que aquí se me pasó: positionRisk multiplica precios por tamaño, o
   * sea que devuelve DÓLARES —la divisa en la que cotizan los veinte activos—,
   * y esto lo rotulaba con la divisa de la cuenta y lo dividía entre un equity
   * en euros. Con EURUSD en 1,15 son un 15 % de más, y no en un sitio
   * cualquiera: esta es, según el comentario de abajo, "LA cifra de seguridad
   * del panel", y su umbral de alarma está en el 10 % del capital. Un riesgo
   * real del 9 % se pintaba en rojo como 10,4 %.
   */
  const eurusd = (snap?.evals ?? []).find((e) => e.epic === "EURUSD")?.price ?? null;
  let riesgoAprox = false;
  const openRisk = positions.reduce((s, p) => {
    const bruto = positionRisk(p).risk ?? 0;
    const enCuenta = aCuenta(bruto, p.currency, snap?.account?.currency, eurusd);
    if (enCuenta == null) {
      riesgoAprox = true;
      return s + bruto;
    }
    return s + enCuenta;
  }, 0);
  const dayPnlPct = snap?.dailyPnlPct ?? 0;
  /**
   * El resultado del día EN DINERO.
   *
   * El panel solo lo daba en porcentaje. Con una cuenta de 228 €, un "+0,21 %"
   * son 47 céntimos: el porcentaje es comparable entre cuentas pero no se
   * siente, y el importe es el que dice si merece la pena mirar. Un broker
   * enseña los dos, y aquí el euro del día no aparecía en ninguna pantalla —
   * el "PNL FLOTANTE" de la tira es otra cosa: lo que llevan las posiciones
   * abiertas, no lo que ha hecho la jornada.
   *
   * Se despeja del ancla: equity_actual − equity_actual/(1+pct/100).
   */
  const dayPnlEur =
    lastEquity && Math.abs(dayPnlPct) > 0 ? lastEquity - lastEquity / (1 + dayPnlPct / 100) : 0;
  const killPct = cfg?.risk.maxDailyLossPct ?? 0;
  /** ¿Se han agotado las operaciones del día? A partir de aquí no abre más. */
  const cupoAgotado =
    !!cfg && (snap?.tradesToday ?? 0) >= cfg.risk.maxTradesPerDay && cfg.risk.maxTradesPerDay > 0;
  const lossUsed = dayPnlPct < 0 ? Math.min(-dayPnlPct / killPct, 1) : 0; // 0..1 del presupuesto de pérdida diaria

  // Límite por mesa (sin límite global): rojo si alguna mesa excede su cupo
  const deskFull = (() => {
    if (!cfg) return false;
    const byDesk: Record<string, number> = {};
    for (const p of positions) {
      const d = deskOfEpic(cfg.instruments, p.epic);
      byDesk[d] = (byDesk[d] || 0) + 1;
    }
    return Object.values(byDesk).some((n) => n > cfg.maxPerDesk);
  })();

  /**
   * Latido del motor. Distinto de "conectado": el navegador refresca los datos
   * por su cuenta, así que la pantalla sigue viva aunque el cron lleve semanas
   * sin correr — que es exactamente lo que pasó en julio y nadie vio.
   *
   * Estaba calibrado para "el cron real va cada ~58 min", y ya no es cierto: el
   * latido lo marca .github/workflows/autopilot.yml con "*\/15 * * * *", cada
   * quince minutos. Con los umbrales viejos, 90 minutos de silencio —SEIS ciclos
   * perdidos— se pintaban en verde como motor vivo, y tres horas, doce ciclos,
   * apenas en ámbar. El único indicador que existe para detectar un motor muerto
   * estaba midiendo con la vara de otra cadencia.
   *
   * Los nuevos umbrales dejan margen a la deriva real de GitHub Actions, que no
   * es puntual: midiendo hoy contra producción se ve un hueco de 46 min entre
   * dos ciclos. Por eso el verde llega hasta una hora en vez de apretar a los 30.
   * Y en cuanto se pasa, el texto dice cuántos ciclos faltan, que es lo que se
   * puede interpretar — "hace 46 min" no significa nada si no sabes cada cuánto
   * debería correr.
   */
  const latido = (() => {
    const CICLO_MIN = 15; // .github/workflows/autopilot.yml
    const ts = snap?.state?.lastCronTick ?? 0;
    if (!ts)
      return { texto: "sin latido", tone: "text-muted", dot: "bg-muted", vivo: false, title: "El cron no ha registrado ningún ciclo todavía." };
    const min = Math.max(0, Math.round((Date.now() - ts) / 60_000));
    const base = min < 1 ? "ahora mismo" : min < 60 ? `hace ${min} min` : `hace ${Math.round(min / 60)} h`;
    const perdidos = Math.floor(min / CICLO_MIN) - 1;
    const title =
      `Último ciclo del cron: ${new Date(ts).toLocaleString("es-ES")}` +
      ` · debería correr cada ${CICLO_MIN} min`;
    if (min <= 60) return { texto: base, tone: "text-long", dot: "bg-long", vivo: true, title };
    const faltan = perdidos > 0 ? ` · ${perdidos} ${perdidos === 1 ? "ciclo" : "ciclos"} sin correr` : "";
    if (min <= 150)
      return { texto: `${base}${faltan}`, tone: "text-accent", dot: "bg-accent", vivo: false, title };
    return { texto: `${base}${faltan} · parado`, tone: "text-short", dot: "bg-short", vivo: false, title };
  })();

  // El resultado del día en el título: así se vigila desde una pestaña de fondo
  // o desde la lista de apps, sin volver a la pantalla.
  useEffect(() => {
    if (!snap) return;
    const signo = dayPnlPct >= 0 ? "+" : "";
    document.title = `${signo}${dayPnlPct.toFixed(2)}% · ${fmt(lastEquity)}${
      acc?.currency ? ` ${acc.currency}` : ""
    } — Capital Autopilot`;
  }, [snap, dayPnlPct, lastEquity]);

  const markers = trades
    .filter((t) => t.status === "closed" && t.closedTs)
    .map((t) => ({ ts: t.closedTs!, dir: t.direction, pnl: t.pnl }));

  const commands: Command[] = [
    // Motor
    {
      id: "toggle",
      label: enabled ? "Detener el piloto" : "Activar el piloto",
      hint: "Motor",
      confirmar: enabled ? "¿Detener el piloto?" : "¿Activar el piloto?",
      run: () => patch({ enabled: !enabled }),
    },
    {
      id: "atr",
      label: `Stops por volatilidad (ATR): ${cfg?.risk.useAtrStops ? "desactivar" : "activar"}`,
      hint: "Motor",
      confirmar: `¿${cfg?.risk.useAtrStops ? "Desactivar" : "Activar"} los stops por ATR?`,
      run: () => patch({ risk: { useAtrStops: !cfg?.risk.useAtrStops } }),
    },
    // Mesas
    ...DESK_META.map((d) => ({
      id: `desk-${d.key}`,
      label: `Mesa ${d.label}`,
      hint: "Mesas",
      run: () => router.push(`/${d.key}`),
    })),
    // Páginas
    { id: "perf", label: "Analítica del rendimiento", hint: "Ir a", run: () => router.push("/analytics") },
    { id: "journal", label: "Diario del Gestor IA", hint: "Ir a", run: () => router.push("/journal") },
    { id: "lab", label: "Lab · estrategia, backtest y ajustes", hint: "Ir a", run: () => router.push("/lab") },
    // Vista
    {
      id: "theme",
      label: "Cambiar entre tema claro y oscuro",
      hint: "Vista",
      run: () => {
        const el = document.documentElement;
        const next = el.getAttribute("data-theme") === "light" ? "dark" : "light";
        el.setAttribute("data-theme", next);
        try {
          localStorage.setItem("theme", next);
        } catch {
          /* modo privado */
        }
      },
    },
  ];

  return (
    <div className="min-h-screen grid-bg">
      {flash && (
        <div
          className={`pointer-events-none fixed inset-0 z-40 ${
            flash === "long" ? "bg-long/10" : "bg-short/10"
          }`}
        />
      )}
      <CommandPalette commands={commands} />

      <Ticker evals={evals} obsoleta={!online} />

      <AppHeader
        active="/"
        live={{
          equity: lastEquity || null,
          dayPnlPct,
          currency: acc?.currency ?? "",
          configured,
          enabled,
          lastOk,
          offline: !online,
        }}
        right={
          <>
            {snap?.killedToday && (
              <span className="rounded border border-short bg-short/10 px-2 py-1 font-mono text-[10px] text-short">
                🛑 KILL
              </span>
            )}
            {/*
              Iba oculto por debajo de md, así que en un teléfono la paleta no
              tenía forma de abrirse: ni botón ni atajo. Es donde más falta hace
              —parar el motor desde la calle— y donde el único acceso posible es
              tocar. Ahora sale siempre: lupa en móvil, ⌘K donde ese atajo existe.
            */}
            <button
              onClick={abrirPaleta}
              aria-label="Abrir paleta de comandos"
              className="flex min-h-[34px] min-w-[34px] items-center justify-center rounded-md border border-industrial px-2 py-1 font-mono text-[10px] text-muted transition-colors hover:border-cement hover:text-dim"
            >
              <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 md:hidden" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
                <circle cx="7" cy="7" r="4.5" />
                <path d="M10.5 10.5 14 14" strokeLinecap="round" />
              </svg>
              <span className="hidden md:inline">⌘K</span>
            </button>
          </>
        }
      />

      <main className="mx-auto max-w-[1400px] overflow-x-clip px-5 py-6 md:px-8">
        {/* La página no tenía ningún encabezado: con lector de pantalla se
            aterrizaba sin orientación ninguna. Visualmente lo aporta la marca. */}
        <h1 className="sr-only">Panel de mando · Capital Autopilot</h1>

        <AvisoSinConexion />
        {!configured && <ConfigWarning />}

        {/* HERO */}
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-[380px_1fr]">
          <div className={`relative min-w-0 overflow-hidden rounded-xl border bg-soft p-5 transition-shadow sm:p-6 ${enabled ? "border-accent/40 ring-accent" : "border-industrial"}`}>
            <h2 className="tag">Motor</h2>
            <div className="mt-4 flex items-center gap-2.5" aria-live="polite">
              {loading ? (
                <Skeleton className="h-8 w-40" />
              ) : (
                <>
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${
                      !configured ? "bg-short" : enabled ? "animate-pulseDot bg-long" : "bg-muted"
                    }`}
                  />
                  <span
                    className={`font-display text-3xl font-semibold tracking-tight ${
                      !configured ? "text-short" : enabled ? "text-white" : "text-dim"
                    }`}
                  >
                    {!configured ? "Sin conexión" : enabled ? "Activo" : "En espera"}
                  </span>
                </>
              )}
            </div>
            {/*
              El texto estaba en presente pasara lo que pasara: "Opera en tu
              cuenta real…" también con el piloto detenido. Y detener el piloto
              hace DOS cosas que nadie explicaba: no abre nada nuevo, sí — pero
              además deja de gestionar las posiciones vivas, porque
              manageOpenPositions solo corre si cfg.enabled. O sea que los stops
              dejan de moverse y las abiertas se quedan con el que tuvieran.
              Con seis posiciones encima, eso hay que decirlo antes de pulsar.
            */}
            <p className="mt-2 max-w-[280px] text-xs leading-relaxed text-muted">
              {!configured ? (
                /* Sin credenciales no puede operar: decir "opera en tu cuenta
                   real" ahí es sencillamente falso. */
                <>Sin conexión con Capital.com: no hay precios ni cuenta, y no se puede operar.</>
              ) : enabled ? (
                <>Opera en tu cuenta real de Capital.com con las señales validadas. Las órdenes son reales.</>
              ) : positions.length > 0 ? (
                <>
                  No abre nada nuevo{" "}
                  <span className="text-dim">
                    y deja de mover los stops de las {positions.length} posiciones abiertas
                  </span>
                  : se quedan con el que tengan ahora. Cerrarlas sigue siendo manual.
                </>
              ) : (
                <>Detenido: no abrirá posiciones hasta que lo actives.</>
              )}
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              <span
                className="flex items-center gap-1.5 rounded-lg border border-industrial px-3 py-2 text-xs font-medium text-dim"
                title={latido.title}
              >
                Motor
                <span
                  className={`h-2 w-2 rounded-full ${latido.dot} ${latido.vivo ? "animate-pulseDot" : ""}`}
                />
                <span className={latido.tone}>{latido.texto}</span>
              </span>
              {/*
                Este chip leía solo AUTOPILOT_ARMED, así que decía "armadas" en
                verde con el piloto DETENIDO — cuando en ese estado no se manda
                ni una orden. Las dos condiciones tienen que cumplirse: la
                variable de entorno y el interruptor del panel.
              */}
              <span className="flex items-center gap-1.5 rounded-lg border border-industrial px-3 py-2 text-xs font-medium text-dim">
                Órdenes
                <span className={snap?.armed && enabled ? "text-long" : "text-muted"}>
                  {!enabled ? "en pausa" : snap?.armed ? "armadas" : "en seco"}
                </span>
              </span>
            </div>

            <button
              onClick={() => patch({ enabled: !enabled })}
              disabled={busy || !configured || loading}
              className={`mt-4 w-full rounded-lg px-6 py-3.5 text-sm font-semibold transition-opacity disabled:opacity-40 ${
                enabled ? "bg-short text-onaccent hover:opacity-90" : "bg-accent text-onaccent hover:opacity-90"
              }`}
            >
              {loading ? "Cargando…" : enabled ? "Detener piloto" : "Activar piloto"}
            </button>

            {/* lo que importa HOY (no contadores de por vida) */}
            <div
              className="mt-5 grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-industrial bg-industrial text-center"
              aria-live="polite"
            >
              <MiniStat
                label="PNL HOY"
                value={loading ? null : `${dayPnlPct >= 0 ? "+" : ""}${dayPnlPct.toFixed(2)}%`}
                sub={
                  loading || !lastEquity || Math.abs(dayPnlEur) < 0.005
                    ? undefined
                    : `${pnlFmt(dayPnlEur)} ${acc?.currency ?? ""}`
                }
                tone={Math.abs(dayPnlPct) < 0.005 ? undefined : dayPnlPct > 0 ? "long" : "short"}
              />
              {/* "TRADES HOY" cabía; "OPERACIONES HOY" no —se truncaba en "OPERACIONES H…"—.
                  La app ya usa "op/ops" como forma compacta en celdas densas
                  (backtest, lecciones, por instrumento): misma regla aquí. */}
              {/*
                El cupo diario era el ÚNICO límite sin estado visual: "4/4" se
                pintaba igual que "1/4", y al alcanzarlo el bot deja de abrir
                durante el resto de la jornada. El resto de topes sí lo dicen —
                la mesa llena sale en rojo, el cooldown y el freno diario tienen
                su línea— así que este se leía como si nada hubiera cambiado
                justo cuando el motor se ha quedado quieto por diseño.
              */}
              <MiniStat
                label="OPS. HOY"
                value={loading ? null : `${snap?.tradesToday ?? 0}/${cfg?.risk.maxTradesPerDay ?? "—"}`}
                tone={cupoAgotado ? "short" : undefined}
              />
              <MiniStat
                label="POSICIONES"
                value={loading ? null : `${positions.length}`}
                tone={deskFull ? "short" : undefined}
              />
            </div>

            {/* guardarrailes en vivo */}
            <div className="mt-3 space-y-2 rounded-lg border border-industrial bg-base p-3.5 text-xs">
              {/*
                El riesgo abierto es LA cifra de seguridad del panel: lo que se
                pierde si saltan todos los stops a la vez. Iba en euros sueltos,
                sin escala, igual que la exposición hasta ayer. Con 9,83 € sobre
                228 no se sabe si eso es prudente o temerario sin hacer la
                división a mano — y el resto del panel ya lleva su "% del
                capital" desde hace pasadas.
                El color entra a partir del 10 %: por encima de ahí, una racha
                de stops se lleva por delante más de lo que la expectativa
                recupera en semanas.
              */}
              <Row
                label="Riesgo abierto"
                value={
                  openRisk > 0
                    ? `≈${fmt(openRisk)} ${acc?.currency ?? ""}${
                        lastEquity && !riesgoAprox
                          ? ` · ${((openRisk / lastEquity) * 100).toFixed(1)}% del capital`
                          : riesgoAprox
                            ? " · aprox."
                            : ""
                      }`
                    : "—"
                }
                tone={lastEquity && !riesgoAprox && openRisk / lastEquity > 0.1 ? "short" : undefined}
              />
              <Row label="Cooldown" value={cooldownLabel(snap?.cooldownUntil ?? 0)} />
              {cupoAgotado && (
                <Row
                  label="Cupo diario"
                  value={`agotado (${cfg?.risk.maxTradesPerDay}) — no abre más hoy`}
                  tone="short"
                />
              )}
              {killPct > 0 ? (
                <div className="pt-1.5">
                  <div className="mb-1 flex items-center justify-between text-[10px] text-muted">
                    <span>Margen al freno diario (−{killPct}%)</span>
                    <span className={lossUsed > 0.7 ? "text-short" : "text-dim"}>{(lossUsed * 100).toFixed(0)}% usado</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-industrial">
                    <div
                      className={`h-full rounded-full transition-all ${lossUsed > 0.7 ? "bg-short" : lossUsed > 0.4 ? "bg-accent" : "bg-long"}`}
                      style={{ width: `${Math.max(2, lossUsed * 100)}%` }}
                    />
                  </div>
                </div>
              ) : (
                <Row label="Freno diario" value="desactivado" />
              )}
            </div>
          </div>

          <div className="min-w-0 overflow-hidden rounded-xl border border-industrial bg-soft p-4 sm:p-5">
            <div className="mb-3 flex items-end justify-between">
              <div>
                <p className="tag">Equity</p>
                {loading ? (
                  <Skeleton className="mt-1.5 h-9 w-40" />
                ) : (
                  <p className="mt-1.5 font-mono text-3xl font-medium tracking-tight tabular-nums text-white">
                    {fmt(lastEquity)} <span className="text-sm font-normal text-muted">{acc?.currency}</span>
                  </p>
                )}
              </div>
            </div>
            <EquityChart data={equity} markers={markers} />
          </div>
        </section>

        {/* STATS */}
        <section className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-industrial bg-industrial md:grid-cols-4">
          <StatCard label="Efectivo" value={loading ? null : acc ? fmt(acc.deposit) : "—"} unit={acc?.currency} />
          <StatCard label="Disponible" value={loading ? null : acc ? fmt(acc.available) : "—"} unit={acc?.currency} />
          <StatCard label="PnL flotante" value={loading ? null : pnlFmt(floatPnl)} unit={acc?.currency} tone={Math.abs(floatPnl) < 0.005 ? undefined : floatPnl > 0 ? "long" : "short"} />
          <StatCard
            label="Posiciones"
            value={loading ? null : `${positions.length}`}
            unit={deskFull ? "mesa sobre el límite" : cfg ? `máx ${cfg.maxPerDesk}/mesa` : undefined}
            tone={deskFull ? "short" : undefined}
          />
        </section>

        {/* ACTIVIDAD + RIESGO — triage: lo accionable justo después del dinero */}
        <section className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_380px]">
          <div className="min-w-0 space-y-4">
            {cierreErr && (
              <p
                role="alert"
                className="mb-2 flex items-start gap-2 rounded-lg border border-short/40 bg-short/10 px-3 py-2 text-[12px] leading-relaxed text-short"
              >
                <span aria-hidden>⚠️</span>
                <span>
                  {cierreErr} La posición sigue abierta.{" "}
                  <button onClick={() => setCierreErr(null)} className="underline underline-offset-2">
                    Entendido
                  </button>
                </span>
              </p>
            )}
            <PositionsTable
              positions={positions}
              onClose={closePos}
              busy={busy}
              divisa={acc?.currency ?? ""}
              equity={lastEquity}
              marcos={Object.fromEntries((cfg?.instruments ?? []).map((i) => [i.epic, i.resolution]))}
              eurusd={eurusd}
            />
            <LogFeed logs={historial.logs} />
          </div>

          <div className="min-w-0 space-y-4">
            {cfg && <RiskPanel cfg={cfg} busy={busy} patch={patch} equity={lastEquity} currency={acc?.currency} />}
            {/*
              Esta tarjeta era un enlace al Lab y nada más, ocupando un hueco
              principal del panel para repetir algo que ya está en la barra de
              navegación y en la paleta de comandos. Ahora dice CON QUÉ está
              operando el bot ahora mismo — los parámetros que deciden cada
              entrada y el tamaño de cada posición— y sigue llevando al Lab,
              que es donde se cambian. Un panel de operativa debería poder
              responder "¿qué reglas está aplicando?" sin cambiar de pantalla.
            */}
            <Link
              href="/lab"
              className="group block rounded-xl border border-industrial bg-soft p-5 transition-colors hover:border-cement"
            >
              <div className="flex items-baseline justify-between gap-2">
                <p className="tag">Estrategia en vigor</p>
                <p className="text-xs font-medium text-accent transition-opacity group-hover:opacity-80">
                  Ajustar →
                </p>
              </div>
              {cfg ? (
                <>
                  <p className="mt-2 font-mono text-[13px] leading-relaxed text-dim">
                    SMA <span className="text-white">{cfg.strategy.fast}/{cfg.strategy.slow}</span> · RSI{" "}
                    <span className="text-white">{cfg.strategy.rsiPeriod}</span> · conf ≥
                    <span className="text-white">{cfg.strategy.minConfidence}</span>
                    {cfg.strategy.useRegimeFilter && (
                      <>
                        {" "}
                        · ADX ≥<span className="text-white">{cfg.strategy.adxThreshold}</span>
                      </>
                    )}
                  </p>
                  <p className="mt-1.5 font-mono text-[11px] text-muted">
                    {cfg.instruments.length} instrumentos · {cfg.risk.riskPercent}% por operación ·{" "}
                    {cfg.risk.useAtrStops
                      ? `stop ${cfg.risk.atrStopMult}×ATR / objetivo ${cfg.risk.atrTpMult}×ATR`
                      : `stop ${cfg.stopDistance} / objetivo ${cfg.profitDistance} pts`}
                  </p>
                </>
              ) : (
                <>
                  <Skeleton className="mt-2 h-4 w-56" />
                  <Skeleton className="mt-2 h-3 w-64" />
                </>
              )}
            </Link>
          </div>
        </section>

        {/* LAS 4 MESAS */}
        <DesksOverview
          evals={evals}
          positions={positions}
          instruments={cfg?.instruments ?? []}
          maxPerDesk={cfg?.maxPerDesk ?? 4}
        />

        {/* EXPECTATIVA REAL (análisis, no triage) */}
        <ExpectancyPanel
          className="mt-4"
          divisa={acc?.currency ?? ""}
          cerradas={trades.filter((t) => t.status === "closed").length}
        />

        <AppFooter />
      </main>
    </div>
  );
}

/* ---- helpers UI ---- */

let _audioCtx: AudioContext | null = null;
function beep(freq: number) {
  try {
    const Ctx = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
    if (!_audioCtx) _audioCtx = new Ctx();
    const ctx = _audioCtx;
    if (ctx.state === "suspended") void ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = freq;
    osc.type = "square";
    gain.gain.value = 0.04;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
  } catch {
    /* sin audio */
  }
}

function cooldownLabel(until: number) {
  const ms = until - Date.now();
  if (ms <= 0) return "—";
  const m = Math.ceil(ms / 60000);
  return `${m} min`;
}

function Row({ label, value, tone }: { label: string; value: string; tone?: "long" | "short" }) {
  const c = tone === "long" ? "text-long" : tone === "short" ? "text-short" : "text-dim";
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted">{label}</span>
      <span className={c}>{value}</span>
    </div>
  );
}

const DESK_META = [
  { key: "forex", label: "Forex" },
  { key: "crypto", label: "Crypto" },
  { key: "stocks", label: "Stocks" },
  { key: "commodities", label: "Commodities" },
] as const;

function DesksOverview({
  evals,
  positions,
  instruments,
  maxPerDesk,
}: {
  evals: Snapshot["evals"];
  positions: OpenPos[];
  instruments: Instrument[];
  maxPerDesk: number;
}) {
  const catOf = (epic: string) => deskOfEpic(instruments, epic);
  /**
   * Activos de solo-compra: sus SELL no los ejecuta el motor.
   *
   * En la pasada 163 saqué las señales bloqueadas del recuento y del orden de
   * la rejilla de señales, y estas cuatro tarjetas —el resumen por mesa del
   * panel, que es lo primero que se mira— se quedaron contándolas. Diez de los
   * veinte instrumentos del universo son de solo-compra (las dos criptos y los
   * ocho valores), así que la mitad del universo puede producir un "1▼" que
   * anuncia una oportunidad que el motor tiene prohibido tomar. Lo medí en
   * vivo entonces: BTCUSD encabezaba cripto con un SHORT al 71 % que jamás se
   * iba a abrir.
   */
  const soloLargos = new Set(instruments.filter((i) => i.longOnly).map((i) => i.epic));
  // posiciones de activos que ya no están en el universo (quedaron abiertas al podarlo)
  const legacy = positions.filter((p) => catOf(p.epic) === "otros");
  return (
    <section className="mt-4">
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {DESK_META.map((d) => {
        const ev = evals.filter((e) => catOf(e.epic) === d.key);
        const pos = positions.filter((p) => catOf(p.epic) === d.key);
        const pnl = pos.reduce((s, p) => s + (p.upl || 0), 0);
        const longs = ev.filter((e) => e.signal?.type === "BUY").length;
        const shorts = ev.filter((e) => e.signal?.type === "SELL" && !soloLargos.has(e.epic)).length;
        const bloqueadas = ev.filter((e) => e.signal?.type === "SELL" && soloLargos.has(e.epic)).length;
        const ses = deskSession(d.key);
        const full = pos.length >= maxPerDesk;
        return (
          <Link
            key={d.key}
            href={`/${d.key}`}
            className="group min-w-0 rounded-xl border border-industrial bg-soft p-4 transition-colors hover:border-cement"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-1.5 font-display text-sm font-semibold text-white">
                <DeskGlyph cat={d.key} className="h-4 w-4 shrink-0 text-accent" />
                <span className="truncate">{d.label}</span>
              </span>
              {/* Abierto o cerrado ahora mismo: sin esto, una mesa en calma y
                  una mesa fuera de horario se ven exactamente igual. */}
              <span
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${ses.open ? "bg-long" : "bg-industrial"}`}
                title={ses.label}
                aria-label={ses.label}
              />
            </div>
            <div className="mt-3 flex items-end justify-between">
              <div>
                <p className="tag">Posiciones</p>
                <p className={`mt-0.5 font-mono text-lg font-medium tabular-nums ${full ? "text-short" : "text-white"}`}>
                  {pos.length}
                  <span className="text-xs font-normal text-muted">/{maxPerDesk}</span>
                </p>
              </div>
              <div className="text-right">
                <p className="tag">P&amp;L</p>
                {/* Sin posiciones no hay P&L: un "0.00" afirma que la mesa está
                    plana, cuando lo que pasa es que no tiene nada abierto. El
                    resto del panel ya usa "—" para lo que no existe. */}
                <p className={`mt-0.5 font-mono text-lg font-medium tabular-nums ${pos.length ? pnlClass(pnl) : "text-muted"}`}>
                  {pos.length ? pnlFmt(pnl) : "—"}
                </p>
              </div>
            </div>
            {/* altura fija: si la línea aparece y desaparece, las tarjetas bailan */}
            {/* La señal bloqueada no se cuenta, pero tampoco se esconde: existe
                y explica por qué la rejilla de señales enseña un activo más. */}
            <p
              className="mt-2 h-4 font-mono text-[10px] text-muted"
              title={
                bloqueadas > 0
                  ? `${bloqueadas} ${bloqueadas === 1 ? "señal corta descartada" : "señales cortas descartadas"}: activos de solo-compra`
                  : undefined
              }
            >
              {longs > 0 || shorts > 0 ? (
                <>
                  {longs > 0 && <span className="text-long">{longs}▲ </span>}
                  {shorts > 0 && <span className="text-short">{shorts}▼ </span>}
                  {/* Decía "1▲ señales" en las mesas con una sola. */}
                  {longs + shorts === 1 ? "señal" : "señales"} · {ev.length}{" "}
                  {ev.length === 1 ? "activo" : "activos"}
                </>
              ) : (
                <>
                  {ev.length} {ev.length === 1 ? "activo" : "activos"} · sin señal
                </>
              )}
            </p>
          </Link>
        );
      })}
    </div>
    {legacy.length > 0 && (
      <p className="mt-2 font-mono text-[11px] text-muted">
        + {legacy.length} posición{legacy.length > 1 ? "es" : ""} de activos fuera del universo actual (
        {legacy.map((p) => p.epic).join(", ")}) — se gestionan hasta su cierre, no se reabren.
      </p>
    )}
    </section>
  );
}

/**
 * Cinta de cotizaciones. Muestra PRECIO y variación, como la de cualquier
 * broker — antes mostraba el tipo de señal y su confianza, que es información
 * interna del motor y no lo que se espera leer en una cinta.
 * Se pausa al pasar el ratón para poder leer un valor concreto.
 */
function Ticker({ evals, obsoleta }: { evals: Snapshot["evals"]; obsoleta?: boolean }) {
  if (evals.length === 0) return null;
  const row = [...evals, ...evals];
  /**
   * Sin red, la cinta seguía desfilando con las últimas cotizaciones y sus
   * flechas de subida y bajada, indistinguible de una cinta viva. En un panel
   * de operativa eso es lo peor que puede hacer: el resto de la pantalla avisa
   * de que los datos son antiguos y la cinta —que es lo que más se mira de
   * reojo— sigue afirmando lo contrario. Se detiene y se atenúa.
   */
  return (
    <div
      className={`cinta group overflow-hidden border-b border-industrial bg-base ${obsoleta ? "opacity-40 grayscale" : ""}`}
      aria-hidden
      title={obsoleta ? "Sin conexión: cotizaciones detenidas en la última lectura" : undefined}
    >
      <div
        className={`flex w-max whitespace-nowrap py-2 ${
          obsoleta ? "" : "animate-ticker group-hover:[animation-play-state:paused]"
        }`}
      >
        {row.map((e, i) => {
          // Misma ventana (~24 h) para todos los símbolos: una cinta existe
          // para comparar de un vistazo, y antes cada uno medía su propio plazo.
          const v = variacion(e.spark, e.price, e.resolution);
          const chg = v ? v.pct : null;
          const tone = chg == null ? "text-muted" : chg > 0.02 ? "text-long" : chg < -0.02 ? "text-short" : "text-muted";
          return (
            <span key={i} className="mx-5 inline-flex items-baseline gap-2 font-mono text-[11px] tabular-nums">
              <span className="text-dim">{e.epic}</span>
              <span className="text-white">{price(e.price)}</span>
              {chg != null && (
                <span className={tone}>
                  {chg > 0.02 ? "▲" : chg < -0.02 ? "▼" : "·"}
                  {chg > 0 ? "+" : ""}
                  {chg.toFixed(2)}%
                </span>
              )}
              {e.hasPosition && <span className="text-[9px] text-accent">●</span>}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function MiniStat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string | number | null;
  sub?: string;
  tone?: "long" | "short";
}) {
  const c = tone === "long" ? "text-long" : tone === "short" ? "text-short" : "text-white";
  return (
    <div className="min-w-0 bg-soft px-1 py-3.5">
      {value == null ? (
        <Skeleton className="mx-auto h-6 w-14" />
      ) : (
        <p className={`truncate font-mono text-lg font-medium tabular-nums sm:text-xl ${c}`}>{value}</p>
      )}
      {sub && <p className="truncate font-mono text-[10px] tabular-nums text-muted">{sub}</p>}
      <p className="tag mt-0.5 truncate">{label}</p>
    </div>
  );
}


/**
 * Sin credenciales de Capital no hay precios, ni cuenta, ni órdenes: es el
 * estado más roto en el que puede estar el panel y su aviso daba una
 * instrucción IMPOSIBLE de seguir donde se lee. Decía "copia .env.local.example
 * a .env.local", que solo sirve ejecutando el proyecto en tu máquina; esto
 * corre en Vercel, donde no hay ficheros que copiar. Quien llegara aquí desde
 * el panel desplegado se quedaba sin salida.
 *
 * Ahora da los comandos reales y completos —incluido el redespliegue, sin el
 * cual la variable no existe en el runtime en marcha, la misma lección de la
 * tarjeta de acceso en la pasada 101— y menciona el fichero local como lo que
 * es: la alternativa para desarrollo.
 */
const COMANDOS_CAPITAL = `vercel env add CAPITAL_API_KEY production
vercel env add CAPITAL_IDENTIFIER production
vercel env add CAPITAL_PASSWORD production
vercel deploy --prod`;

function ConfigWarning() {
  const [copiado, setCopiado] = useState(false);
  return (
    <div className="mb-5 rounded-xl border border-short/30 bg-short/5 p-4">
      <p className="text-sm font-semibold text-short">Credenciales no configuradas</p>
      <p className="mt-2 text-xs leading-relaxed text-dim">
        Sin ellas no hay precios, ni saldo, ni órdenes: el panel no puede operar. Defínelas en Vercel y
        vuelve a desplegar.
      </p>
      <div className="mt-3 overflow-hidden rounded-lg border border-industrial bg-base">
        <div className="flex items-center justify-between border-b border-industrial px-3 py-1.5">
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted">En producción</span>
          <button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(COMANDOS_CAPITAL);
                setCopiado(true);
                setTimeout(() => setCopiado(false), 1800);
              } catch {
                /* sin portapapeles: el texto sigue seleccionable */
              }
            }}
            className={`-my-1 min-h-[32px] rounded px-2.5 font-mono text-[10px] transition-colors ${
              copiado ? "text-long" : "text-muted hover:text-accent"
            }`}
          >
            {copiado ? "copiado ✓" : "copiar"}
          </button>
        </div>
        <pre className="overflow-x-auto px-3 py-2 font-mono text-[11px] leading-relaxed text-dim">
          {COMANDOS_CAPITAL}
        </pre>
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-muted">
        En local, copia{" "}
        <code className="rounded bg-industrial px-1 font-mono text-dim">.env.local.example</code> a{" "}
        <code className="rounded bg-industrial px-1 font-mono text-dim">.env.local</code> con esas mismas
        claves.
      </p>
    </div>
  );
}
