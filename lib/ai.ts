/**
 * Capa de IA: "segunda opinión" sobre cada señal técnica antes de operar.
 *
 * El motor técnico (SMA+RSI+ADX) PROPONE; Claude (vía Vercel AI Gateway) FILTRA:
 * recibe el contexto del setup y aprueba o veta, con razonamiento.
 *
 * Diseño "fail-open": si la IA no está configurada o falla, devuelve null y el
 * motor sigue con su decisión técnica (nunca bloquea por un error de la IA).
 *
 * Auth del Gateway: en Vercel funciona con el OIDC del proyecto automáticamente;
 * en local necesita AI_GATEWAY_API_KEY.
 *
 * ⚠️ De momento razona SOLO con el contexto técnico que le pasamos (precio +
 * indicadores). NO tiene calendario económico ni noticias en vivo todavía
 * (siguiente iteración: enchufar un feed de eventos macro).
 */

import { bot } from "./store";

const MODEL = "anthropic/claude-haiku-4-5";

export type AiVerdict = { approve: boolean; confidence: number; reason: string };

export type SignalContext = {
  epic: string;
  resolution: string;
  direction: "BUY" | "SELL";
  price: number;
  reason: string;
  indicators: { smaFast: number; smaSlow: number; rsi: number; adx: number; atr: number };
  recentCloses: number[];
};

export function aiConfigured(): boolean {
  return Boolean(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL);
}

/** Llamada cruda a la IA (lanza si falla). La usan reviewSignal y el endpoint de test. */
export async function askAi(ctx: SignalContext): Promise<AiVerdict> {
  const { generateObject } = await import("ai");
  const { z } = await import("zod");

  const schema = z.object({
    approve: z.boolean().describe("true = dejar operar; false = vetar la operación"),
    confidence: z.number().min(0).max(1).describe("0..1 de seguridad en el veredicto"),
    reason: z.string().max(160).describe("motivo breve, en español"),
  });

  const { object } = await generateObject({
    model: MODEL,
    schema,
    maxRetries: 1,
    prompt: prompt(ctx),
  });
  return object as AiVerdict;
}

export async function reviewSignal(ctx: SignalContext): Promise<AiVerdict | null> {
  if (!bot().config.aiFilter || !aiConfigured()) return null;
  try {
    return await askAi(ctx);
  } catch {
    return null; // fail-open: si la IA falla, el motor sigue con su decisión técnica
  }
}

function prompt(c: SignalContext): string {
  const i = c.indicators;
  const trend = i.smaFast > i.smaSlow ? "alcista" : "bajista";
  return [
    "Eres un analista de trading prudente y escéptico. Tu trabajo es FILTRAR señales",
    "técnicas de baja calidad de un bot de tendencia (cruce de medias + RSI).",
    "Aprueba solo setups de tendencia con calidad razonable; veta los que parezcan",
    "lateral/whipsaw, sobreextendidos o contradictorios.",
    "",
    `Activo: ${c.epic} (${c.resolution})`,
    `Dirección propuesta: ${c.direction} a precio ${c.price}`,
    `Motivo del bot: ${c.reason}`,
    `Indicadores: SMA rápida ${i.smaFast.toFixed(4)} vs lenta ${i.smaSlow.toFixed(4)} (tendencia ${trend}),`,
    `  RSI ${i.rsi.toFixed(0)}, ADX ${i.adx.toFixed(0)} (>25 = tendencia fuerte), ATR ${i.atr.toFixed(4)}.`,
    `Últimos cierres: ${c.recentCloses.slice(-12).map((n) => n.toFixed(4)).join(", ")}`,
    "",
    "Reglas: si ADX es bajo (<20) tiende a vetar (lateral). Si el RSI contradice fuerte",
    "la dirección (ej. comprar con RSI>75), sé cauto. Devuelve approve/confidence/reason.",
  ].join("\n");
}
