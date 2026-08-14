/**
 * Modelo de datos COMPARTIDO entre servidor y cliente.
 *
 * Estos ocho tipos estaban declarados dos veces: en lib/store.ts y, copiados a
 * mano, en components/types.ts. El cliente no podía importar de store.ts porque
 * ese fichero SÍ trae código de ejecución (el estado en memoria, DEFAULT_CONFIG,
 * log()...), así que la copia parecía inevitable. Lo que era evitable es que
 * los TIPOS vivieran ahí dentro.
 *
 * El precio de la copia se ha pagado varias veces en esta rotación: cada campo
 * nuevo —maxPerDesk, paused, longOnly, el nivel "veto" del registro— había que
 * añadirlo en los dos sitios, y olvidarlo no rompe la compilación: simplemente
 * una de las dos mitades de la aplicación deja de ver el campo.
 *
 * Aquí no hay nada ejecutable, solo tipos y constantes, así que lo importan las
 * dos partes sin arrastrar servidor al navegador.
 */

import type { Signal, StrategyConfig } from "./strategy";
export type { Signal };

/**
 * Rangos válidos de cada ajuste numérico del motor, en un solo sitio.
 *
 * Existen porque la ruta PATCH fundía `body.risk` y `body.strategy` en la
 * configuración con un spread crudo, sin mirar tipos ni valores. Cualquiera con
 * la URL —y este panel hoy no pide contraseña— podía dejar la cuenta así:
 *
 *   {"risk":{"atrStopMult":0}}        el stop se calcula 0 y openPosition omite
 *                                     la clave: órdenes SIN STOP
 *   {"risk":{"riskPercent":"hola"}}   una cadena en el cálculo del tamaño
 *   {"risk":{"maxDailyLossPct":-5}}   invierte el kill-switch: se dispara solo
 *
 * Los mismos rangos alimentan los campos del panel, así que el aviso que ves al
 * teclear y la regla que aplica el servidor no pueden separarse con el tiempo.
 * Son límites de sensatez, no de criterio: nadie decide aquí cuánto arriesgar,
 * solo que un multiplicador no sea cero ni un porcentaje sea negativo.
 */
export const LIMITES: {
  risk: Record<string, [number, number]>;
  strategy: Record<string, [number, number]>;
} = {
  risk: {
    riskPercent: [0.01, 100],
    marginPct: [0.01, 100],
    atrPeriod: [2, 200],
    atrStopMult: [0.1, 20],
    atrTpMult: [0.1, 50],
    maxDailyLossPct: [0, 100],
    maxTradesPerDay: [0, 500],
    cooldownMin: [0, 1440],
    breakevenAtr: [0, 20],
    trailAtr: [0, 20],
    trailDistAtr: [0.1, 20],
    scaleOutAtr: [0, 20],
    scaleOutPct: [0, 100],
  },
  strategy: {
    fast: [1, 400],
    slow: [2, 400],
    rsiPeriod: [2, 200],
    rsiBuyBelow: [1, 99],
    rsiSellAbove: [1, 99],
    minConfidence: [0, 1],
    adxPeriod: [2, 200],
    adxThreshold: [0, 100],
  },
};

/** Claves booleanas admitidas en cada sub-objeto de la configuración. */
export const BOOLEANOS = {
  risk: ["useAtrStops", "activeManage"],
  strategy: ["useRegimeFilter"],
} as const;

/**
 * Filtra un sub-objeto recibido por la API: solo pasan las claves conocidas,
 * con el tipo correcto y recortadas a su rango. Lo demás se descarta en
 * silencio — un ajuste desconocido en la configuración de un bot que mueve
 * dinero no es una extensión, es basura persistida.
 */
export function saneaConfig(
  parte: "risk" | "strategy",
  body: unknown
): Record<string, number | boolean> {
  const out: Record<string, number | boolean> = {};
  if (!body || typeof body !== "object") return out;
  const src = body as Record<string, unknown>;
  for (const [k, [min, max]] of Object.entries(LIMITES[parte])) {
    const v = src[k];
    if (typeof v !== "number" || !Number.isFinite(v)) continue;
    out[k] = Math.min(max, Math.max(min, v));
  }
  for (const k of BOOLEANOS[parte]) {
    if (typeof src[k] === "boolean") out[k] = src[k] as boolean;
  }
  // sizingMode es el único texto con valores cerrados
  if (parte === "risk" && typeof src.sizingMode === "string") {
    if (["fixed", "percent", "margin"].includes(src.sizingMode)) {
      (out as Record<string, unknown>).sizingMode = src.sizingMode;
    }
  }
  return out;
}

export type RiskConfig = {
  sizingMode: "fixed" | "percent" | "margin"; // unidades fijas | % de equity arriesgado | % de equity como margen
  riskPercent: number; // % de equity arriesgado por trade (modo percent)
  marginPct: number; // % de equity reservado como MARGEN por trade (modo margin)
  useAtrStops: boolean; // SL/TP por ATR (volatilidad) en vez de puntos fijos
  atrPeriod: number;
  atrStopMult: number; // SL = atrStopMult * ATR
  atrTpMult: number; // TP = atrTpMult * ATR
  maxDailyLossPct: number; // kill-switch: si el equity cae este % en el dia -> desarma (0 = desactivado)
  maxTradesPerDay: number;
  cooldownMin: number; // minutos de pausa tras una operacion perdedora
  // --- Gestión activa de posiciones abiertas (trailing/breakeven/scaling) ---
  activeManage: boolean; // master toggle de la gestión activa
  breakevenAtr: number; // mover SL a entrada cuando el profit >= este x ATR
  trailAtr: number; // empezar a trailing cuando el profit >= este x ATR
  trailDistAtr: number; // el SL se mantiene a este x ATR por detrás del precio
  scaleOutAtr: number; // cerrar parte cuando el profit >= este x ATR (0 = off)
  scaleOutPct: number; // fracción a cerrar en el scaling out (0 = off)
};

export type Instrument = {
  epic: string;
  resolution: string;
  regimeFilter?: boolean; // override por activo del filtro ADX (undefined = usa el global)
  category?: DeskCategory; // mesa a la que pertenece (forex/crypto/stocks/commodities)
  longOnly?: boolean; // solo compras (bloquea SELL) — para mesas donde shortear pierde
  paused?: boolean; // circuit breaker: auto-pausado por mala racha (no abre nuevas; reactivación manual)
};

export type NotifyConfig = {
  telegram: boolean;
  discord: boolean;
  onTrade: boolean;
  onKill: boolean;
};

export type BotConfig = {
  enabled: boolean; // interruptor maestro (Activar/Detener) que respeta el cron
  aiFilter: boolean; // capa IA: revisa/veta cada senal antes de operar
  aiCooldownMin: number; // no re-evaluar el mismo activo con IA dentro de X min
  pmMode: boolean; // Gestor de Cartera IA inline (OpenRouter, cada tick) — DEPRECADO por coste
  cloudPm: boolean; // Gestor en la nube: una routine Claude decide cada hora y deja las acciones en cola; el motor las ejecuta
  committee: boolean; // comité IA: varios modelos (OpenRouter) votan antes de cada apertura
  committeeMinApprovals: number; // aprobaciones mínimas para no vetar (1 = veto solo si rechazo unánime)
  committeeMinApprovalsShort: number; // igual pero para SELL (más estricto: los shorts pierden)
  instruments: Instrument[]; // activos con su resolucion de senal
  watchlist: string[]; // espejo de instruments[].epic (compat)
  sizePerTrade: number; // unidades (modo fixed)
  maxPerDesk: number; // máx posiciones abiertas POR MESA (forex/crypto/stocks/commodities); sin límite global
  stopDistance: number; // puntos (si no usa ATR)
  profitDistance: number;
  strategy: StrategyConfig;
  risk: RiskConfig;
  notify: NotifyConfig;
};

export type LogEntry = {
  id: string;
  ts: number;
  level: "info" | "signal" | "trade" | "veto" | "error" | "kill";
  epic?: string;
  message: string;
};

export type TradeRecord = {
  id: string;
  ts: number; // apertura
  closedTs?: number;
  epic: string;
  direction: "BUY" | "SELL";
  size: number;
  entry: number;
  exit?: number;
  pnl?: number; // realizado al cerrar
  status: "open" | "closed";
  dealId?: string;
  dryRun: boolean;
  reason: string;
};

export type DeskCategory = "forex" | "crypto" | "stocks" | "commodities";

export type EquityPoint = { ts: number; equity: number };

/**
 * Marcos temporales, en un solo sitio.
 *
 * Estaban escritos a mano CINCO veces, y las cinco listas eran distintas:
 * Configuración ofrecía los ocho, el gráfico de posición siete, el backtest
 * seis, el walk-forward cinco y el mapa de "velas por día" de la cinta otros
 * siete. No eran subconjuntos deliberados: nadie decidió que no se pudiera
 * validar en semanal, simplemente cada lista se escribió un día distinto.
 *
 * Y una de las discrepancias rompía algo de verdad: /api/bot/candles rechazaba
 * MINUTE con "resolución no válida" mientras Configuración lo ofrecía como
 * marco operativo. Un activo puesto en MINUTE se opera con velas de un minuto
 * pero su gráfico no se puede abrir en un minuto.
 *
 *  · label      lo que ve una persona ("15m"), no la constante de la API
 *  · velasDia   velas que cubren ~24 h; null si el marco no cabe en un día
 *  · maxGrafico velas que pide el gráfico de posición en ese marco
 */
/**
 * Forma válida de un epic de Capital: letras, dígitos, guion bajo y punto.
 * Y un tope de instrumentos, porque el universo no es una lista cualquiera:
 * CADA instrumento cuesta una petición de 150 velas a Capital en CADA ciclo del
 * motor. La ruta aceptaba un array de cualquier longitud con cualquier texto
 * dentro, así que un PATCH con trescientas entradas —desde una API que hoy no
 * pide contraseña— dejaría cada tick por encima del límite de 60 s de la
 * función: el cron se cae y el bot deja de gestionar las posiciones vivas.
 */
/**
 * Muestra mínima para que un porcentaje se presente como una tasa.
 *
 * Estaba escrito CUATRO veces —Analítica, el Diario, el backtest y la ruta
 * /api/bot/lessons— y cada copia llevaba un comentario diciendo "igual que en
 * el otro sitio", que es la forma más clara de documentar que algo debería
 * vivir en uno solo. No es un detalle cosmético: este número decide si una
 * pantalla enseña "0 % de acierto" o "muestra corta, sin conclusión" sobre las
 * mismas operaciones. Si las copias se separan, el mismo histórico sería
 * concluyente en una pantalla y no en la de al lado — y la cuarta copia es la
 * que gobierna lo que se le CUENTA a los Gestores.
 */
export const MUESTRA_MIN = 5;

/**
 * Operaciones fuera de muestra mínimas para que un veredicto de walk-forward
 * sea evidencia y no ruido.
 *
 * Estaba escrito dos veces y con valores DISTINTOS: el motor concluía a partir
 * de 12 y el panel exigía 20 para enseñar el veredicto. Con 15 operaciones, el
 * motor devolvía "edge" y su nota —"Ventaja consistente fuera de muestra.
 * Candidata a validar más."— mientras el panel rotulaba la fila "Sin concluir".
 * La insignia y la frase de debajo, en la misma fila, decían cosas contrarias.
 */
export const MIN_OOS = 20;

/**
 * Bajo este importe, un P&L se considera CERO.
 *
 * Separa tres cosas que en un panel de trading no son la misma: ganar, perder y
 * salir en tablas. De él dependen el recuento de aciertos, el color de cada
 * cifra y el "+" de los importes positivos.
 *
 * Estaba escrito TRES veces con nombre propio —EPS en components/ui.tsx para el
 * color, EPS_PNL en lib/analytics.ts para contar aciertos y otro EPS_PNL en la
 * ruta /api/bot/lessons para lo que se le cuenta a los Gestores— más el literal
 * 0.005 suelto en cinco sitios de la interfaz. Hoy los tres valen lo mismo;
 * el día que uno cambie, una operación contada "a cero" por las métricas
 * seguiría pintándose en verde en la fila de al lado, y el modelo tendría un
 * recuento de aciertos distinto del que ve la persona.
 */
export const EPS_PNL = 0.005;

/**
 * Equity nocional del simulador. Vive aquí y no en lib/sim.ts porque el panel
 * del backtest necesita el mismo número para expresar la caída máxima en %, y
 * no puede importar el simulador entero desde el navegador.
 */
export const BASE_EQUITY = 1000;

/**
 * Días hasta resultados por debajo de los cuales un valor se considera "en
 * zona de earnings". Vive aquí y no en lib/earnings.ts porque el tablero de
 * sentimiento lo necesita en el navegador, y ese módulo arrastra dependencias
 * de servidor: importarlo desde un componente rompe el build con
 * "Reading from node:module is not handled". lib/model.ts existe justo para
 * esto — constantes puras que cruzan la frontera cliente/servidor.
 */
/**
 * Cadencia real del motor y umbrales de latido, compartidos.
 *
 * El cron lo dispara .github/workflows/autopilot.yml cada 15 min. Estos valores
 * estaban dentro del panel; los necesita también el aviso de las mesas, así que
 * viven aquí para que no acaben siendo dos calibraciones distintas del mismo
 * indicador — que ya pasó una vez, cuando el panel seguía calibrado a "~58 min"
 * mucho después de cambiar la cadencia.
 */
export const CICLO_MIN = 15;
/** Hasta aquí, normal (deja margen a la deriva de GitHub Actions). */
export const LATIDO_OK_MIN = 60;
/** A partir de aquí, el motor se considera parado. */
export const LATIDO_MAL_MIN = 150;

export const IMMINENT_DAYS = 7;

export const EPIC_RE = /^[A-Z0-9_.]{1,20}$/;
export const MAX_INSTRUMENTOS = 60;

export const RESOLUCIONES = [
  { k: "MINUTE", label: "1m", velasDia: 1440, maxGrafico: 200 },
  { k: "MINUTE_5", label: "5m", velasDia: 288, maxGrafico: 200 },
  { k: "MINUTE_15", label: "15m", velasDia: 96, maxGrafico: 200 },
  { k: "MINUTE_30", label: "30m", velasDia: 48, maxGrafico: 200 },
  { k: "HOUR", label: "1H", velasDia: 24, maxGrafico: 200 },
  { k: "HOUR_4", label: "4H", velasDia: 6, maxGrafico: 180 },
  { k: "DAY", label: "1D", velasDia: 1, maxGrafico: 200 },
  { k: "WEEK", label: "1S", velasDia: null, maxGrafico: 150 },
] as const;

export const RESOLUTIONS = RESOLUCIONES.map((r) => r.k);
export const DEFAULT_RESOLUTION = "HOUR_4";
/** Nombre legible de un marco; devuelve la constante si no lo conoce. */
export const marcoLabel = (k: string) =>
  RESOLUCIONES.find((r) => r.k === k)?.label || k;

/**
 * Posición abierta, tal y como la consumen el motor y la interfaz.
 *
 * Estaba declarada dos veces —en lib/engine.ts y en components/types.ts— con la
 * nota "si se toca una, hay que tocar la otra". Di por hecho que era inevitable
 * porque engine.ts importa Capital, Supabase y el motor entero, así que el
 * navegador no puede importarlo. Pero eso solo impide importar EL MÓDULO: nada
 * obligaba a que el tipo viviera dentro de él. Tercera vez en esta rotación que
 * una duplicación "forzosa" resulta no serlo al comprobarla.
 */
export type OpenPos = {
  key: string;
  epic: string;
  direction: "BUY" | "SELL";
  size: number;
  entry: number;
  upl: number;
  dealId?: string;
  stopLevel?: number | null;
  limitLevel?: number | null;
  currentPrice?: number | null;
  /** Divisa en la que cotiza el instrumento (USD en todo el universo actual). */
  currency?: string;
  /** Momento de apertura (ISO), para marcarlo en el gráfico. */
  openedAt?: string;
};

/**
 * Evaluación de un activo en un ciclo del motor.
 *
 * Estaba declarada dos veces (lib/engine.ts y components/types.ts), igual que
 * las otras diez. Se unifica aquí ahora que hay que añadirle un campo: sin esto
 * habría que acordarse de tocar los dos ficheros, que es exactamente el fallo
 * que se ha repetido toda la rotación.
 */
export type EpicEval = {
  epic: string;
  resolution: string;
  signal: Signal;
  hasPosition: boolean;
  price: number;
  atr: number;
  /** Últimos cierres para la mini-gráfica. */
  spark: number[];
  /**
   * El activo no se pudo evaluar en este ciclo (Capital devolvió error, p. ej.
   * un 429). Antes estos activos se caían de la lista sin más: el motor
   * capturaba la excepción y seguía, así que la rejilla enseñaba 19 tarjetas en
   * vez de 20 y el recuento bajaba solo. Un hueco silencioso se lee como "aquí
   * no hay nada que mirar", cuando lo cierto es "no lo sabemos".
   */
  sinDatos?: string;
};

/**
 * Zona horaria de la cuenta. Una sola definición para las dos mitades.
 *
 * Estaba en lib/store.ts leyendo ACCOUNT_TZ —y el motor la respetaba— mientras
 * el agrupado del P&L diario y la exportación a CSV llevaban "Europe/Madrid"
 * escrito a mano. Cambiar la variable habría movido el día del bot (su cupo
 * diario, su ancla de equity, su freno) sin mover las barras del gráfico ni las
 * marcas de tiempo del CSV: dos calendarios distintos en la misma aplicación.
 *
 * NEXT_PUBLIC_ACCOUNT_TZ existe porque Next solo inyecta en el navegador las
 * variables con ese prefijo. Con las dos puestas al mismo valor, servidor y
 * cliente comparten calendario; sin ninguna, ambos caen en Madrid como hasta
 * ahora.
 */
export const TZ =
  process.env.NEXT_PUBLIC_ACCOUNT_TZ || process.env.ACCOUNT_TZ || "Europe/Madrid";
