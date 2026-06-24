/**
 * Calendario económico (Forex Factory, feed JSON gratuito de faireconomy.media).
 * Da a la capa IA contexto macro: eventos de alto impacto próximos por divisa,
 * para que vete operaciones justo antes de una noticia gorda (la volatilidad
 * de la noticia puede saltar el stop).
 */

const FEED = "https://nfs.faireconomy.media/ff_calendar_thisweek.json";
const FIAT = new Set(["USD", "EUR", "GBP", "JPY", "AUD", "NZD", "CAD", "CHF", "CNY"]);

export type EcoEvent = {
  title: string;
  currency: string;
  impact: "High" | "Medium" | "Low" | "Holiday";
  time: number; // ms epoch
  forecast?: string;
  previous?: string;
};

export type UpcomingEvent = EcoEvent & { minutesUntil: number };

let cache: { data: EcoEvent[]; t: number } | null = null;
const TTL = 30 * 60 * 1000; // 30 min

export async function getEconomicEvents(): Promise<EcoEvent[]> {
  if (cache && Date.now() - cache.t < TTL) return cache.data;
  try {
    const res = await fetch(FEED, { cache: "no-store" });
    if (!res.ok) throw new Error(`feed ${res.status}`);
    const raw = await res.json();
    const data: EcoEvent[] = (Array.isArray(raw) ? raw : [])
      .map((e: any) => ({
        title: String(e.title ?? ""),
        currency: String(e.country ?? "").toUpperCase(),
        impact: (e.impact ?? "Low") as EcoEvent["impact"],
        time: Date.parse(e.date),
        forecast: e.forecast || undefined,
        previous: e.previous || undefined,
      }))
      .filter((e: EcoEvent) => Number.isFinite(e.time) && e.title);
    cache = { data, t: Date.now() };
    return data;
  } catch {
    return cache?.data ?? [];
  }
}

/** Divisas relevantes para un epic (para filtrar qué eventos le afectan). */
export function currenciesFor(epic: string): string[] {
  const E = epic.toUpperCase();
  if (E === "GOLD" || E.startsWith("XAU")) return ["USD"]; // oro reacciona a USD/Fed
  if (E.length === 6) {
    const out = [E.slice(0, 3), E.slice(3)].filter((c) => FIAT.has(c));
    if (out.length) return out;
  }
  if (E.includes("USD")) return ["USD"];
  return [];
}

/**
 * Eventos de alto impacto relevantes para un activo en una ventana temporal.
 * Por defecto: de hace 15 min a dentro de 120 min.
 */
export async function relevantEvents(
  epic: string,
  opts: { aheadMin?: number; behindMin?: number; minImpact?: "High" | "Medium" } = {}
): Promise<UpcomingEvent[]> {
  const aheadMin = opts.aheadMin ?? 120;
  const behindMin = opts.behindMin ?? 15;
  const minImpact = opts.minImpact ?? "High";
  const allow = minImpact === "High" ? ["High"] : ["High", "Medium"];
  const curr = new Set(currenciesFor(epic));
  if (curr.size === 0) return [];

  const now = Date.now();
  const events = await getEconomicEvents();
  return events
    .filter((e) => curr.has(e.currency) && allow.includes(e.impact))
    .map((e) => ({ ...e, minutesUntil: Math.round((e.time - now) / 60000) }))
    .filter((e) => e.minutesUntil <= aheadMin && e.minutesUntil >= -behindMin)
    .sort((a, b) => a.minutesUntil - b.minutesUntil);
}

/** Resumen corto para meter en el prompt de la IA. */
export function describeEvents(events: UpcomingEvent[]): string {
  if (!events.length) return "Sin eventos de alto impacto próximos.";
  return events
    .slice(0, 4)
    .map((e) => {
      const when =
        e.minutesUntil < 0
          ? `hace ${-e.minutesUntil} min`
          : `en ${e.minutesUntil} min`;
      return `${e.currency} ${e.title} (${e.impact}, ${when}${e.forecast ? `, prev ${e.forecast}` : ""})`;
    })
    .join("; ");
}
