"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Snapshot, JournalEntry, OpenPos, DeskCategory } from "./types";
import { pnlFmt, fmt, DeskGlyph, deskSession, usePoll, positionRisk, deskMap, AppFooter, Skeleton, AvisoSinConexion, useOnline, aCuenta } from "./ui";
import AppHeader from "./AppHeader";
import SignalMatrix from "./SignalMatrix";
import PositionsTable from "./PositionsTable";
import SentimentBoard from "./SentimentBoard";
import CotPanel from "./CotPanel";
import JournalEntryCard from "./JournalEntryCard";

/**
 * Cuánto se espera antes de dejar de afirmar que el Gestor está pensando. Sus
 * ciclos tardan ~1 min; pasados tres, lo honesto es decir que no se sabe.
 */
const ESPERA_MAX_SEG = 180;

const DESKS: Record<DeskCategory, { label: string; blurb: string }> = {
  forex: { label: "Forex", blurb: "Divisas · 24/5" },
  crypto: { label: "Crypto", blurb: "Cripto · 24/7" },
  stocks: { label: "Stocks", blurb: "Acciones US · sesión de Nueva York" },
  commodities: { label: "Commodities", blurb: "Materias primas · 23/5" },
};

function Kpi({ label, value, sub, tone }: { label: string; value: string | null; sub?: string; tone?: "long" | "short" }) {
  const c = tone === "long" ? "text-long" : tone === "short" ? "text-short" : "text-white";
  return (
    <div className="min-w-0 flex-1 px-4 py-2.5">
      <p className="tag whitespace-nowrap">{label}</p>
      {/* value=null mientras carga: un "0/4" o un "sin posiciones" antes de
          tener datos no es un hueco, es una afirmación falsa. */}
      {value == null ? (
        <Skeleton className="mt-1 h-5 w-16" />
      ) : (
        <p className={`mt-0.5 font-mono text-lg font-medium tabular-nums ${c}`}>{value}</p>
      )}
      {value != null && sub && <p className="mt-0.5 truncate font-mono text-[10px] text-muted">{sub}</p>}
    </div>
  );
}

export default function DeskPage({ category }: { category: DeskCategory }) {
  const meta = DESKS[category];
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [journal, setJournal] = useState<JournalEntry[]>([]);
  // ¿Queda contenido por debajo del recorte del carril de decisiones? Se mide
  // también cuando el sondeo trae entradas nuevas, no solo al montar.
  const [hayMas, setHayMas] = useState(false);
  const cajaDecisiones = useRef<HTMLDivElement | null>(null);
  const medirScroll = useCallback(() => {
    const el = cajaDecisiones.current;
    if (el) setHayMas(el.scrollHeight - el.clientHeight - el.scrollTop > 4);
  }, []);
  const [busy, setBusy] = useState(false);
  const [cierreErr, setCierreErr] = useState<string | null>(null);
  /** Momento de la última lectura buena: lo consume el badge de la cabecera. */
  const [lastOk, setLastOk] = useState<number | null>(null);
  const online = useOnline();
  const [firing, setFiring] = useState(false);
  const [fireMsg, setFireMsg] = useState<{ ok: boolean; text: string; url?: string } | null>(null);
  // Momento del disparo: sirve para reconocer la decisión que llegue DESPUÉS
  const [firedAt, setFiredAt] = useState<number | null>(null);
  const [esperaSeg, setEsperaSeg] = useState(0);

  /**
   * Una sola lectura del motor por refresco.
   *
   * La cabecera se alimenta sola cuando la página no le pasa datos: sondea
   * /api/bot/tick?slim=2 cada 30 s. Y esta página ya sondea /api/bot/tick?slim=1
   * cada 12 s. O sea que una mesa abierta ejecutaba runEngine SIETE veces por
   * minuto —cinco por la página y dos por la cabecera— cuando le basta con
   * cinco; y cada una de esas ejecuciones evalúa los veinte instrumentos contra
   * Capital y, con el bot encendido, gestiona las posiciones abiertas.
   *
   * Peor que el coste: eran dos instantáneas distintas. El equity de la cabecera
   * podía venir de una lectura y las cifras de la mesa de otra, con hasta medio
   * minuto de diferencia entre ambas y sin nada que lo indicara. El panel
   * principal ya le inyecta sus datos a la cabecera desde hace tiempo; las mesas
   * se quedaron sin hacerlo.
   */
  const load = useCallback(async () => {
    try {
      const s = await fetch("/api/bot/tick?slim=1").then((r) => r.json());
      setSnap(s);
      if (!s?.error) setLastOk(Date.now());
    } catch {
      /* la mesa nunca rompe: el badge de conexión ya envejece solo */
    }
  }, [category]);

  usePoll(load, 12000, [load]);

  /**
   * El diario iba pegado al sondeo de 12 s y sin filtrar: se descargaban las
   * entradas de las CUATRO mesas para pintar una. Medido en /forex: 6 llamadas
   * y 709 kB por minuto, sobre un dato que el Gestor escribe una vez por hora.
   * Ahora pide solo su mesa (?desk=) y a un ritmo acorde a lo que cambia.
   */
  const loadJournal = useCallback(async () => {
    try {
      const j = await fetch(`/api/bot/journal?desk=${category}`).then((r) => r.json());
      setJournal((Array.isArray(j.entries) ? j.entries : []) as JournalEntry[]);
    } catch {
      /* */
    }
  }, [category]);

  usePoll(loadJournal, 60000, [loadJournal]);

  // Mientras se espera al Gestor, un contador — y en cuanto aparece una entrada
  // de diario POSTERIOR al disparo, se anuncia. Antes el botón decía "decidirá
  // en ~1 min" y te dejaba ahí: sin saber si llegó, falló, o qué decidió.
  useEffect(() => {
    if (!firedAt) return;
    const t = setInterval(() => setEsperaSeg(Math.floor((Date.now() - firedAt) / 1000)), 1000);
    return () => clearInterval(t);
  }, [firedAt]);

  const decisionNueva = useMemo(
    () => (firedAt ? journal.find((e) => new Date(e.ts).getTime() > firedAt) : undefined),
    [journal, firedAt]
  );

  useEffect(() => {
    if (!decisionNueva) return;
    const n = (decisionNueva.actions || []).filter(
      (a) => a.outcome === "opened" || a.outcome === "closed"
    ).length;
    setFireMsg({
      ok: true,
      text: n ? `Decisión recibida · ${n} operación${n > 1 ? "es" : ""}` : "Decisión recibida · sin operar",
    });
    setFiredAt(null);
  }, [decisionNueva]);

  useEffect(medirScroll, [journal.length, medirScroll]);

  const cargando = snap === null;
  const instruments = snap?.state.config.instruments ?? [];
  const epicCat = useMemo(() => deskMap(instruments), [instruments]);

  const evals = (snap?.evals ?? []).filter((e) => epicCat.get(e.epic) === category);
  const positions = (snap?.openPositions ?? []).filter((p) => epicCat.get(p.epic) === category);
  const deskPnl = positions.reduce((s, p) => s + (p.upl || 0), 0);
  // Exposición nocional y riesgo hasta el stop: las dos cifras que mira un operador
  /**
   * Cambio euro-dólar del propio universo: EURUSD se evalúa en cada ciclo, así
   * que su precio ya está en este snapshot. Sirve para llevar a la divisa de la
   * cuenta lo que sale de multiplicar precios por tamaño.
   */
  const eurusd = (snap?.evals ?? []).find((e) => e.epic === "EURUSD")?.price ?? null;
  const enCuenta = (importe: number, p: { currency?: string }) =>
    aCuenta(importe, p.currency, currency, eurusd);
  /** true si ALGUNA posición no se ha podido convertir: entonces no se afirma el %. */
  let sinConvertir = false;
  const suma = (f: (p: (typeof positions)[number]) => number) =>
    positions.reduce((acc, p) => {
      const v = enCuenta(f(p), p);
      if (v == null) {
        sinConvertir = true;
        return acc + f(p);
      }
      return acc + v;
    }, 0);
  const exposure = suma((p) => Math.abs(p.size * p.entry));
  const riskAtStop = suma((p) => positionRisk(p).risk ?? 0);
  const maxPerDesk = snap?.state.config.maxPerDesk ?? 4;
  const currency = snap?.account?.currency ?? "";
  const session = deskSession(category);
  const signals = evals.filter((e) => e.signal.type !== "FLAT").length;

  const runGestor = async () => {
    if (firing) return;
    setFiring(true);
    setFireMsg(null);
    try {
      const res = await fetch(`/api/bot/run-gestor?desk=${category}`, { method: "POST" });
      const d = await res.json();
      if (d.ok) {
        setFireMsg({ ok: true, text: "Gestor lanzado — pensando…", url: d.sessionUrl });
        setFiredAt(Date.now());
        setEsperaSeg(0);
      } else setFireMsg({ ok: false, text: d.error || "No se pudo lanzar" });
    } catch (e) {
      setFireMsg({ ok: false, text: e instanceof Error ? e.message : "Error de red" });
    } finally {
      setFiring(false);
    }
  };

  /**
   * Cerrar una posición desde una mesa no hacía NADA visible.
   *
   * Se lanzaba el DELETE y se acababa ahí: ni se refrescaba la tabla —así que
   * la fila seguía en pantalla, con su P&L vivo, hasta el siguiente sondeo (12 s
   * de espera)— ni se miraba la respuesta. Si Capital rechazaba el cierre
   * (mercado cerrado, posición ya inexistente, error de sesión) la ruta devuelve
   * 500 con su motivo, y aquí se descartaba en silencio: la posición seguía
   * abierta y la pantalla igual que si no hubieras pulsado. En el panel
   * principal sí se refrescaba; las mesas se quedaron sin ello.
   *
   * Para una acción irreversible sobre dinero real, no confirmar nada es lo peor
   * que puede hacer un botón: invita a volver a pulsarlo.
   */
  const closePos = async (p: OpenPos) => {
    if (!p.dealId || busy) return;
    setBusy(true);
    setCierreErr(null);
    try {
      const r = await fetch(`/api/capital/positions?dealId=${p.dealId}`, { method: "DELETE" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) setCierreErr(d.error || `No se pudo cerrar ${p.epic}.`);
      else await load();
    } catch (e) {
      setCierreErr(e instanceof Error ? e.message : "Error de red al cerrar.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen">
      <AppHeader
        active={`/${category}`}
        live={{
          equity: snap?.account?.balance ?? null,
          dayPnlPct: snap?.dailyPnlPct ?? 0,
          currency: snap?.account?.currency ?? "",
          configured: snap?.configured ?? true,
          enabled: snap?.enabled ?? false,
          lastOk,
          offline: !online,
        }}
      />

      <main className="mx-auto max-w-[1100px] px-5 py-6 md:px-8">
        <AvisoSinConexion />
        {/* Barra de mesa: identidad + estado de sesión + acción principal */}
        <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="flex items-center gap-2.5 font-display text-2xl font-semibold tracking-tight text-white">
              <DeskGlyph cat={category} className="h-6 w-6 text-accent" />
              Mesa {meta.label}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${
                  session.open ? "border-long/30 bg-long/10 text-long" : "border-industrial bg-raised text-muted"
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${session.open ? "animate-pulseDot bg-long" : "bg-muted"}`} />
                {session.label}
              </span>
              <span className="text-[11px] text-muted">{meta.blurb}</span>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <button
              onClick={runGestor}
              disabled={firing}
              className="inline-flex items-center gap-2 rounded-lg bg-accent px-3.5 py-2 text-[13px] font-semibold text-onaccent transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {firing ? "Lanzando…" : "▶ Ejecutar Gestor ahora"}
            </button>
            {/*
              Con el mercado cerrado el Gestor puede pensar, pero no ejecutar:
              el motor descarta sus aperturas con "mercado CLOSED" y cerrar
              tampoco es posible. Lanzarlo a las 3 de la mañana en la mesa de
              acciones gasta una ejecución de routine para producir, como mucho,
              una tesis. No se bloquea el botón —su análisis puede interesarte
              igualmente— pero sí se dice antes de pulsarlo, que es la
              diferencia entre elegir y descubrirlo después en el diario.
            */}
            {!session.open && !firing && firedAt == null && (
              <p className="max-w-[230px] text-right text-[11px] leading-snug text-muted">
                {meta.label === "Stocks" ? "Bolsa cerrada" : "Mercado cerrado"}: analizará, pero no podrá
                abrir ni cerrar hasta la apertura.
              </p>
            )}
            {/*
              El contador no tenía final: si la routine del Gestor no llega a
              escribir en el diario —falló, caducó el token, la cola se atascó—
              esto seguía diciendo "Pensando…" con el número subiendo para
              siempre. Un estado de espera que nunca se rinde no informa: afirma
              que algo sigue en marcha sin saberlo.
              Y el enlace a la sesión se ocultaba precisamente MIENTRAS esperas,
              que es cuando sirve para ir a ver qué está pasando.
            */}
            {firedAt != null && (
              <div className="text-right">
                {esperaSeg <= ESPERA_MAX_SEG ? (
                  <p className="flex items-center justify-end gap-1.5 text-xs text-accent">
                    <span className="h-1.5 w-1.5 animate-pulseDot rounded-full bg-accent" />
                    Pensando… {esperaSeg}s
                  </p>
                ) : (
                  <p className="text-xs text-short">
                    Sin respuesta tras {Math.round(esperaSeg / 60)} min — puede haber fallado.
                  </p>
                )}
                {fireMsg?.url && (
                  <a
                    href={fireMsg.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] text-muted underline hover:text-accent"
                  >
                    ver sesión del Gestor
                  </a>
                )}
                {esperaSeg > ESPERA_MAX_SEG && (
                  <button
                    onClick={() => {
                      setFiredAt(null);
                      setFireMsg(null);
                    }}
                    className="ml-2 text-[11px] text-muted underline hover:text-dim"
                  >
                    descartar
                  </button>
                )}
              </div>
            )}
            {fireMsg && firedAt == null && (
              <p className={`text-right text-xs ${fireMsg.ok ? "text-long" : "text-short"}`}>
                {fireMsg.text}
                {fireMsg.url && (
                  <>
                    {" · "}
                    <a href={fireMsg.url} target="_blank" rel="noreferrer" className="underline hover:text-accent">
                      ver sesión
                    </a>
                  </>
                )}
              </p>
            )}
          </div>
        </div>

        {/* Cifras de la mesa: cupo, exposición, riesgo a stop y resultado abierto */}
        <div className="mb-5 grid grid-cols-2 divide-x divide-industrial overflow-hidden rounded-xl border border-industrial bg-soft sm:grid-cols-4 sm:divide-y-0 [&>*:nth-child(-n+2)]:border-b [&>*:nth-child(-n+2)]:border-industrial sm:[&>*]:border-b-0">
          <Kpi
            label="Posiciones"
            value={cargando ? null : `${positions.length}/${maxPerDesk}`}
            sub={positions.length >= maxPerDesk ? "mesa llena" : `${maxPerDesk - positions.length} libres`}
            tone={positions.length > maxPerDesk ? "short" : undefined}
          />
          <Kpi
            label="Exposición"
            value={cargando ? null : exposure > 0 ? fmt(exposure, 0) : "—"}
            sub={
              exposure > 0
                ? snap?.account?.balance
                  ? `${currency} · ${(exposure / snap.account.balance).toFixed(1)}× capital${
                      sinConvertir ? " (aprox.)" : ""
                    }`
                  : currency
                : `${evals.length} ${evals.length === 1 ? "activo" : "activos"} · ${signals} con señal`
            }
          />
          <Kpi
            label="Riesgo a stop"
            value={cargando ? null : riskAtStop > 0 ? `≈${fmt(riskAtStop)}` : "—"}
            sub={
              riskAtStop > 0
                ? snap?.account?.balance && !sinConvertir
                  ? `${((riskAtStop / snap.account.balance) * 100).toFixed(1)}% del capital si saltan todos`
                  : `${currency} si saltan todos${sinConvertir ? " · aprox." : ""}`
                : "sin posiciones"
            }
          />
          {/*
            Sin posiciones no hay P&L. Las otras dos cifras de esta misma tira
            ya ponen "—" y "sin posiciones"; esta escribía "0.00 EUR", que
            afirma que la mesa está plana cuando lo que ocurre es que no tiene
            nada abierto. Corregido en la tira del panel y no aquí: la misma
            copia a medias de siempre.
          */}
          <Kpi
            label="P&L flotante"
            value={cargando ? null : positions.length ? pnlFmt(deskPnl) : "—"}
            sub={positions.length ? currency : "sin posiciones"}
            tone={
              !positions.length || Math.abs(deskPnl) < 0.005
                ? undefined
                : deskPnl > 0
                  ? "long"
                  : "short"
            }
          />
        </div>

        {category === "stocks" && <SentimentBoard className="mb-5" evals={evals} />}
        {(category === "forex" || category === "commodities") && (
          <CotPanel category={category} className="mb-5" />
        )}

        <div className={`grid gap-5 ${journal.length > 0 ? "lg:grid-cols-[1fr_340px]" : "grid-cols-1"}`}>
          <div className="min-w-0 space-y-5">
            <SignalMatrix evals={evals} cargando={cargando} instruments={instruments} />
            {cierreErr && (
              <p
                role="alert"
                className="flex items-start gap-2 rounded-lg border border-short/40 bg-short/10 px-3 py-2 text-[12px] leading-relaxed text-short"
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
              cargando={cargando}
              divisa={currency}
              equity={snap?.account?.balance ?? null}
              marcos={Object.fromEntries(instruments.map((i) => [i.epic, i.resolution]))}
              eurusd={eurusd}
            />
            {journal.length === 0 && (
              <div className="dotgrid rounded-xl border border-industrial bg-soft px-5 py-7 text-center">
                <p className="text-sm font-medium text-dim">El gestor IA de {meta.label} decide cada hora</p>
                <p className="mx-auto mt-1.5 max-w-md text-xs leading-relaxed text-muted">
                  Sus tesis de mercado y operaciones aparecerán aquí, y también en el{" "}
                  <a href="/journal" className="text-accent underline">Diario IA</a>.
                </p>
              </div>
            )}
          </div>

          {/*
            La tarjeta entera desaparecía cuando la mesa no tenía decisiones:
            en Crypto o Commodities veías un hueco donde en Forex hay un carril,
            sin nada que dijera si el Gestor no ha opinado todavía o si esta
            mesa sencillamente no tiene esa sección. Un elemento que se esfuma
            no informa; deja al usuario comparando pantallas para deducirlo.
            Ahora la tarjeta se queda con su explicación, como el resto de
            estados vacíos de la aplicación.
          */}
          {cargando ? null : journal.length === 0 ? (
            <div className="rounded-xl border border-industrial bg-soft">
              <div className="flex items-center justify-between border-b border-industrial px-5 py-3.5">
                <h2 className="tag">Gestor {meta.label} · decisiones</h2>
                <span className="font-mono text-[11px] text-muted">0</span>
              </div>
              <div className="px-5 py-8 text-center">
                <p className="text-sm font-medium text-dim">Sin decisiones en esta mesa</p>
                <p className="mx-auto mt-1.5 max-w-[260px] text-[12px] leading-relaxed text-muted">
                  El Gestor escribe aquí su tesis en cada ciclo. Puedes lanzarlo ahora con el botón de
                  arriba, o verlas todas en el{" "}
                  <a href="/journal" className="text-accent underline">Diario</a>.
                </p>
              </div>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-industrial bg-soft">
              <div className="flex items-center justify-between border-b border-industrial px-5 py-3.5">
                <h2 className="tag">Gestor {meta.label} · decisiones</h2>
                {/* Cuántas hay: el punto decorativo no decía nada y esta lista
                    está recortada, así que el total importa. */}
                <span className="font-mono text-[11px] tabular-nums text-muted">{journal.length}</span>
              </div>
              {/*
                La lista tiene tope de altura y hace scroll, pero nada lo decía:
                la última tarjeta quedaba cortada a media frase y en macOS la
                barra no aparece hasta que la usas, así que se leía como un
                fallo de maquetación. El degradado avisa de que sigue habiendo
                contenido y desaparece al llegar al final.
              */}
              <div className="relative">
                <div
                  ref={cajaDecisiones}
                  onScroll={medirScroll}
                  className="max-h-[600px] space-y-2 overflow-y-auto p-3"
                >
                  {journal.map((e) => (
                    <JournalEntryCard key={e.id} entry={e} compact />
                  ))}
                </div>
                {hayMas && (
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-soft to-transparent" />
                )}
              </div>
            </div>
          )}
        </div>
              <AppFooter />
      </main>
    </div>
  );
}
