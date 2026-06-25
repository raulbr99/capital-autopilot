import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

/**
 * Cola del Gestor en la nube. La routine Claude (cada hora) hace POST aquí con
 * su decisión {thesis, confidence, actions}; el motor la drena cada 15 min y la
 * ejecuta con los guardarraíles. Protegido con el mismo Bearer del cron.
 */
export async function POST(req: Request) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!process.env.CRON_SECRET || token !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  if (!body || !Array.isArray(body.actions)) {
    return NextResponse.json({ error: "falta actions[]" }, { status: 400 });
  }
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ error: "sin BD" }, { status: 500 });
  try {
    const c = createClient(url, key, {
      auth: { persistSession: false },
      global: { fetch: (i: any, init: any) => fetch(i, { ...init, cache: "no-store" }) },
    });
    const { error } = await c.from("ap_pm_queue").insert({
      thesis: String(body.thesis || "").slice(0, 2000),
      confidence: typeof body.confidence === "number" ? body.confidence : 0.5,
      actions: body.actions,
      status: "pending",
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, queued: body.actions.length });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
