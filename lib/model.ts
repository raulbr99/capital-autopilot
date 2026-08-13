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
