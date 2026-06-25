/**
 * Gestor de Cartera IA: el LLM decide las operaciones (no solo filtra).
 * Recibe el contexto completo del mercado + cartera y devuelve acciones razonadas.
 * Vía OpenRouter con búsqueda web (ve noticias en vivo).
 *
 * IMPORTANTE: la IA PROPONE; el motor VALIDA y EJECUTA dentro de los guardarraíles
 * (kill-switch, máx posiciones, máx trades/día, riesgo máximo, cooldown). La IA
 * nunca puede saltarse esos límites.
 */

const MODEL = process.env.AI_MODEL || "google/gemini-2.5-flash";
const WEB_SEARCH = process.env.AI_WEB_SEARCH !== "false";
const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

export type PmAction = {
  action: "OPEN" | "CLOSE" | "HOLD";
  epic?: string;
  direction?: "BUY" | "SELL";
  riskPct?: number;
  reason: string;
};

export type PmDecision = {
  thesis: string;
  confidence: number;
  actions: PmAction[];
};

export type PmContext = {
  account: { equity: number; available: number; dailyPnlPct: number; currency: string };
  constraints: {
    maxOpenPositions: number;
    openNow: number;
    maxRiskPct: number;
    maxTradesPerDay: number;
    tradesToday: number;
    killSwitchPct: number;
  };
  positions: { epic: string; direction: string; size: number; entry: number; upl: number }[];
  instruments: {
    epic: string;
    resolution: string;
    price: number;
    signal: string;
    smaFast: number;
    smaSlow: number;
    rsi: number;
    adx: number;
    atr: number;
    hasPosition: boolean;
  }[];
  events: string;
};

export function pmConfigured(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY);
}

export async function askPortfolioManager(ctx: PmContext): Promise<PmDecision | null> {
  if (!pmConfigured()) return null;
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://capital-autopilot.vercel.app",
        "X-Title": "Capital Autopilot PM",
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.3,
        max_tokens: 2000,
        reasoning: { effort: "low" },
        response_format: { type: "json_object" },
        messages: [{ role: "user", content: prompt(ctx) }],
        ...(WEB_SEARCH ? { plugins: [{ id: "web", max_results: 4 }] } : {}),
      }),
    });
    if (!res.ok) throw new Error(`OpenRouter ${res.status}`);
    const data = await res.json();
    const text: string = data.choices?.[0]?.message?.content ?? "";
    return parse(text);
  } catch {
    return null; // fail-open: el motor no hace nada este ciclo
  }
}

function parse(text: string): PmDecision {
  const match = text.match(/\{[\s\S]*\}/);
  const o = JSON.parse(match ? match[0] : text);
  let conf = Number(o.confidence);
  if (!Number.isFinite(conf)) conf = 0.5;
  if (conf > 1) conf = conf / 100;
  const actions: PmAction[] = Array.isArray(o.actions)
    ? o.actions
        .filter((a: any) => a && ["OPEN", "CLOSE", "HOLD"].includes(a.action))
        .map((a: any) => ({
          action: a.action,
          epic: a.epic ? String(a.epic).toUpperCase() : undefined,
          direction: a.direction === "SELL" ? "SELL" : a.direction === "BUY" ? "BUY" : undefined,
          riskPct: Number.isFinite(Number(a.riskPct)) ? Number(a.riskPct) : undefined,
          reason: String(a.reason || "").slice(0, 240),
        }))
    : [];
  return {
    thesis: String(o.thesis || "").slice(0, 800),
    confidence: Math.max(0, Math.min(1, conf)),
    actions,
  };
}

function prompt(c: PmContext): string {
  const pos = c.positions.length
    ? c.positions
        .map((p) => `${p.epic} ${p.direction} size ${p.size} @${p.entry} (PnL ${p.upl >= 0 ? "+" : ""}${p.upl.toFixed(2)})`)
        .join("; ")
    : "ninguna";
  const inst = c.instruments
    .map(
      (i) =>
        `${i.epic}[${i.resolution}] @${i.price} señal:${i.signal} SMA${i.smaFast.toFixed(4)}/${i.smaSlow.toFixed(4)} RSI:${i.rsi.toFixed(0)} ADX:${i.adx.toFixed(0)} ATR:${i.atr.toFixed(4)}${i.hasPosition ? " [POSICIÓN ABIERTA]" : ""}`
    )
    .join("\n");

  return [
    "Eres un GESTOR DE CARTERA cuantitativo, prudente y disciplinado, operando una",
    `cuenta REAL pequeña (~${c.account.equity.toFixed(0)} ${c.account.currency}). Objetivo: hacer crecer`,
    "la cuenta con gestión de riesgo estricta. Decides operaciones reales; sé selectivo,",
    "NO sobre-operes, prioriza preservar capital. Usa las noticias web recientes y el",
    "calendario para evitar operar antes de eventos de alto impacto.",
    "",
    "ESTADO DE LA CUENTA:",
    `  equity ${c.account.equity.toFixed(2)} ${c.account.currency}, disponible ${c.account.available.toFixed(2)}, PnL hoy ${c.account.dailyPnlPct.toFixed(2)}%`,
    `  posiciones abiertas: ${pos}`,
    "",
    "RESTRICCIONES (no puedes excederlas; el sistema las hará cumplir):",
    `  máx posiciones: ${c.constraints.maxOpenPositions} (abiertas ahora: ${c.constraints.openNow})`,
    `  riesgo máx por operación: ${c.constraints.maxRiskPct}% del capital`,
    `  máx operaciones/día: ${c.constraints.maxTradesPerDay} (hoy: ${c.constraints.tradesToday})`,
    `  kill-switch: si pierdes ${c.constraints.killSwitchPct}% en el día, parada total`,
    "",
    "INSTRUMENTOS (ADX>25 = tendencia; señal del bot técnico como referencia):",
    inst,
    "",
    `CALENDARIO ECONÓMICO: ${c.events}`,
    "",
    "Decide acciones. Para ABRIR, indica epic, direction (BUY/SELL) y riskPct (≤ máx).",
    "Para CERRAR una posición abierta (toma de beneficios o corte de pérdidas), indica epic.",
    "Si lo mejor es no hacer nada, devuelve una sola acción HOLD.",
    "",
    'Responde SOLO con JSON: {"thesis":"tu visión de mercado breve","confidence":0..1,',
    '"actions":[{"action":"OPEN|CLOSE|HOLD","epic":"...","direction":"BUY|SELL","riskPct":1.5,"reason":"..."}]}',
  ].join("\n");
}
