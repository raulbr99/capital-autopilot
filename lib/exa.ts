/**
 * Exa AI — búsqueda neuronal de noticias financieras (la "dirección"/contexto).
 * Requiere EXA_API_KEY. https://docs.exa.ai/
 */

const EXA_BASE = "https://api.exa.ai";

export type ExaNews = {
  title: string;
  url: string;
  source: string;
  publishedDate: string | null;
  summary?: string;
};

export function exaConfigured(): boolean {
  return !!process.env.EXA_API_KEY;
}

function hostOf(u: string): string {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export async function exaNews(query: string, numResults = 6): Promise<ExaNews[]> {
  const apiKey = process.env.EXA_API_KEY;
  if (!apiKey) return [];
  const since = new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString(); // últimos 3 días
  const res = await fetch(`${EXA_BASE}/search`, {
    method: "POST",
    headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      query,
      numResults,
      type: "auto",
      category: "news",
      useAutoprompt: true,
      startPublishedDate: since,
      contents: { summary: { query } },
    }),
    signal: AbortSignal.timeout(15000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Exa ${res.status}`);
  const data = await res.json();
  return ((data.results ?? []) as any[]).map((r) => ({
    title: r.title ?? "(sin título)",
    url: r.url,
    source: hostOf(r.url),
    publishedDate: r.publishedDate ?? null,
    summary: r.summary,
  }));
}
