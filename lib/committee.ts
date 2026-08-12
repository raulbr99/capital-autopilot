/**
 * Comité de inversión IA: antes de abrir una operación, varios modelos (vía
 * OpenRouter) la votan APROBAR/RECHAZAR. Si la mayoría rechaza, no se abre.
 * Fail-open: si no hay key o nadie responde, aprueba (no bloquea el bot).
 */

import { recorta } from "./store";

const DEFAULT_MODELS = "openai/gpt-4.1-nano,google/gemini-2.5-flash-lite,deepseek/deepseek-chat";

export type Vote = { model: string; approve: boolean; reason: string };
export type Verdict = { approved: boolean; votes: Vote[]; summary: string };

export type TradeProposal = {
  epic: string;
  direction: "BUY" | "SELL";
  thesis: string;
  riskPct: number;
  desk?: string;
  price?: number;
  indicators?: { rsi?: number; adx?: number; smaFast?: number; smaSlow?: number };
};

function models(): string[] {
  return (process.env.COMMITTEE_MODELS || DEFAULT_MODELS)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function committeeVote(t: TradeProposal, minApprovals = 1): Promise<Verdict> {
  const key = process.env.OPENROUTER_API_KEY;
  const ms = models();
  if (!key || ms.length === 0) return { approved: true, votes: [], summary: "comité off" };

  const ind = t.indicators
    ? `RSI ${t.indicators.rsi?.toFixed(0)}, ADX ${t.indicators.adx?.toFixed(0)}, SMA ${t.indicators.smaFast?.toFixed(4)}/${t.indicators.smaSlow?.toFixed(4)}`
    : "";
  const prompt = `Eres un analista en un comité de inversión de un bot que opera dinero real. Evalúa esta operación y vota.

Operación: ${t.direction} ${t.epic}${t.price ? ` @ ${t.price}` : ""} (mesa ${t.desk || "?"}).
Tesis del gestor: ${t.thesis}
${ind ? `Indicadores: ${ind}` : ""}

REGLA DE TENDENCIA (usa las SMA de arriba): si smaFast > smaSlow la tendencia es ALCISTA; si smaFast < smaSlow, BAJISTA. NUNCA apruebes un SELL contra una tendencia alcista clara salvo tesis de reversión MUY concreta (nivel clave roto, catalizador fuerte, RSI>75). Histórico REAL de este bot: los SHORT aciertan 11% y los LONG 60% — sé MUCHO más exigente y escéptico con los SELL (sobre todo contra-tendencia); permisivo con los BUY a favor de la tendencia.
El tamaño y el riesgo los controla el bot — NO penalices el % de riesgo, juzga la TESIS y la DIRECCIÓN. Ante la duda en una operación CONTRA-TENDENCIA (sobre todo un SELL), RECHAZA; ante la duda en una operación A FAVOR de la tendencia, aprueba.
Responde SOLO con JSON: {"approve": true|false, "reason": "una frase corta"}`;

  const votes = (await Promise.all(ms.map((m) => askModel(key, m, prompt)))).filter(Boolean) as Vote[];
  if (votes.length === 0) return { approved: true, votes: [], summary: "sin respuestas (fail-open)" };
  const yes = votes.filter((v) => v.approve).length;
  // Veta solo si NO llega al mínimo de aprobaciones (por defecto 1 = veto solo si rechazo unánime).
  const approved = yes >= minApprovals;
  return { approved, votes, summary: `${yes}/${votes.length} a favor` };
}

async function askModel(key: string, model: string, prompt: string): Promise<Vote | null> {
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        max_tokens: 200,
        temperature: 0.4,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const txt: string = data.choices?.[0]?.message?.content || "";
    const m = txt.match(/\{[\s\S]*\}/);
    if (!m) return null;
    const j = JSON.parse(m[0]);
    return { model, approve: !!j.approve, reason: recorta(String(j.reason || ""), 140) };
  } catch {
    return null;
  }
}
