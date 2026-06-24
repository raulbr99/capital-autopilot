import { NextResponse } from "next/server";
import { bot, log } from "@/lib/store";
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
  if (typeof body.dryRun === "boolean") {
    cfg.dryRun = body.dryRun;
    log("info", cfg.dryRun ? "📝 Modo PAPER (dry-run)" : "💸 Modo LIVE — opera de verdad");
    void appendLog(bot().logs[0]);
  }
  if (Array.isArray(body.watchlist)) {
    cfg.watchlist = body.watchlist
      .map((s: string) => String(s).toUpperCase().trim())
      .filter(Boolean);
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
