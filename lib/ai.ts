/**
 * Capa de IA: "segunda opinión" sobre cada señal técnica antes de operar.
 * El motor técnico (SMA+RSI+ADX) PROPONE; un LLM vía OpenRouter FILTRA.
 *
 * Fail-open: si la IA no está configurada o falla, devuelve null y el motor
 * sigue con su decisión técnica (nunca bloquea por un error de la IA).
 *
 * Auth: OPENROUTER_API_KEY (sk-or-v1-...). Modelo barato por defecto (Haiku).
 *
 * ⚠️ De momento razona SOLO con el contexto técnico (precio + indicadores).
 * NO tiene calendario económico ni noticias en vivo (siguiente iteración).
 */

import { bot } from "./store";
import { relevantEvents, describeEvents } from "./calendar";

// Modelo potente con buena relación calidad/precio. Cambiable con AI_MODEL.
const MODEL = process.env.AI_MODEL || "google/gemini-2.5-flash";
const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

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
  return Boolean(process.env.OPENROUTER_API_KEY);
}

/** Llamada cruda a OpenRouter (lanza si falla). La usan reviewSignal y el test. */
export async function askAi(ctx: SignalContext): Promise<AiVerdict> {
  if (!process.env.OPENROUTER_API_KEY) throw new Error("Falta OPENROUTER_API_KEY");

  // Contexto macro: eventos económicos de alto impacto próximos para este activo
  let eventsText = "Sin eventos de alto impacto próximos.";
  try {
    eventsText = describeEvents(await relevantEvents(ctx.epic));
  } catch {
    /* sin calendario -> seguimos solo con técnico */
  }

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://capital-autopilot.vercel.app",
      "X-Title": "Capital Autopilot",
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.2,
      max_tokens: 220,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: prompt(ctx, eventsText) }],
    }),
  });

  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text: string = data.choices?.[0]?.message?.content ?? "";
  return parseVerdict(text);
}

export async function reviewSignal(ctx: SignalContext): Promise<AiVerdict | null> {
  if (!bot().config.aiFilter || !aiConfigured()) return null;
  try {
    return await askAi(ctx);
  } catch {
    return null; // fail-open
  }
}

function parseVerdict(text: string): AiVerdict {
  // extrae el primer bloque JSON aunque venga con texto alrededor
  const match = text.match(/\{[\s\S]*\}/);
  const obj = JSON.parse(match ? match[0] : text);
  let conf = Number(obj.confidence);
  if (!Number.isFinite(conf)) conf = 0.5;
  if (conf > 1) conf = conf / 100; // por si devuelve 0..100
  return {
    approve: Boolean(obj.approve),
    confidence: Math.max(0, Math.min(1, conf)),
    reason: String(obj.reason || "").slice(0, 200),
  };
}

function prompt(c: SignalContext, events: string): string {
  const i = c.indicators;
  const trend = i.smaFast > i.smaSlow ? "alcista" : "bajista";
  return [
    "Eres un analista de trading prudente y escéptico. FILTRA señales técnicas de",
    "baja calidad de un bot de tendencia (cruce de medias + RSI). Aprueba solo setups",
    "de tendencia razonables; veta los que parezcan lateral/whipsaw, sobreextendidos",
    "o contradictorios, o con riesgo de noticia inminente.",
    "",
    `Activo: ${c.epic} (${c.resolution})`,
    `Dirección propuesta: ${c.direction} a precio ${c.price}`,
    `Motivo del bot: ${c.reason}`,
    `Indicadores: SMA rápida ${i.smaFast.toFixed(4)} vs lenta ${i.smaSlow.toFixed(4)} (tendencia ${trend}),`,
    `  RSI ${i.rsi.toFixed(0)}, ADX ${i.adx.toFixed(0)} (>25 = tendencia fuerte), ATR ${i.atr.toFixed(4)}.`,
    `Últimos cierres: ${c.recentCloses.slice(-12).map((n) => n.toFixed(4)).join(", ")}`,
    "",
    `Calendario económico (alto impacto): ${events}`,
    "",
    "Reglas:",
    "- Si hay un evento de ALTO IMPACTO inminente (próximos ~45 min) para la divisa del",
    "  activo, VETA: la volatilidad de la noticia suele saltar el stop. Si acaba de pasar",
    "  (últimos minutos), sé muy cauto.",
    "- Si ADX es bajo (<20), tiende a vetar (mercado lateral).",
    "- Si el RSI contradice fuerte la dirección (ej. comprar con RSI>75), sé cauto.",
    "",
    'Responde SOLO con JSON: {"approve": true|false, "confidence": 0..1, "reason": "breve, en español"}',
  ].join("\n");
}
