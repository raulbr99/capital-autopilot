import { NextResponse } from "next/server";
import { bot, log, DEFAULT_RESOLUTION } from "@/lib/store";
import { loadConfig, saveConfig, appendLog } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET -> config actual
export async function GET() {
  const cfg = await loadConfig();
  return NextResponse.json(cfg);
}

// PATCH -> actualizar configuracion (merge superficial + sub-objetos)
export async function PATCH(req: Request) {
  const cfg = await loadConfig();
  const body = await req.json().catch(() => ({}));

  if (typeof body.enabled === "boolean") {
    cfg.enabled = body.enabled;
    log("info", cfg.enabled ? "🟢 Piloto ACTIVADO (sesión)" : "🔴 Piloto PARADO (sesión)");
    void appendLog(bot().logs[0]);
  }
  if (typeof body.aiFilter === "boolean") {
    cfg.aiFilter = body.aiFilter;
    log("info", cfg.aiFilter ? "🤖 Capa IA ACTIVADA" : "🤖 Capa IA desactivada");
    void appendLog(bot().logs[0]);
  }
  if (typeof body.pmMode === "boolean") {
    cfg.pmMode = body.pmMode;
    log("info", cfg.pmMode ? "🧠 Gestor de Cartera IA ACTIVADO" : "🧠 Gestor IA desactivado (vuelve a modo técnico)");
    void appendLog(bot().logs[0]);
  }
  // instruments: lista de {epic, resolution}
  if (Array.isArray(body.instruments)) {
    cfg.instruments = body.instruments
      .filter((i: any) => i && i.epic)
      .map((i: any) => ({
        epic: String(i.epic).toUpperCase().trim(),
        resolution: i.resolution || DEFAULT_RESOLUTION,
        ...(typeof i.regimeFilter === "boolean" ? { regimeFilter: i.regimeFilter } : {}),
      }));
    cfg.watchlist = cfg.instruments.map((i) => i.epic);
  } else if (Array.isArray(body.watchlist)) {
    // compat: editar solo epics preservando resolución de los que ya estaban
    const prev = new Map(cfg.instruments.map((i) => [i.epic, i.resolution]));
    cfg.instruments = body.watchlist
      .map((s: string) => String(s).toUpperCase().trim())
      .filter(Boolean)
      .map((epic: string) => ({ epic, resolution: prev.get(epic) || DEFAULT_RESOLUTION }));
    cfg.watchlist = cfg.instruments.map((i) => i.epic);
  }
  for (const k of ["sizePerTrade", "maxOpenPositions", "stopDistance", "profitDistance"] as const) {
    if (typeof body[k] === "number" && body[k] > 0) {
      (cfg as any)[k] = k === "maxOpenPositions" ? Math.floor(body[k]) : body[k];
    }
  }
  if (body.strategy && typeof body.strategy === "object") {
    cfg.strategy = { ...cfg.strategy, ...body.strategy };
  }
  if (body.risk && typeof body.risk === "object") {
    cfg.risk = { ...cfg.risk, ...body.risk };
  }
  if (body.notify && typeof body.notify === "object") {
    cfg.notify = { ...cfg.notify, ...body.notify };
  }

  await saveConfig(cfg);
  return NextResponse.json(cfg);
}
