import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const maxDuration = 30;

// Cada mesa → su rutina cloud + el env con su token sk-ant-oat01 (uno por rutina).
const ROUTINES: Record<string, { trigId: string; tokenEnv: string }> = {
  forex: { trigId: "trig_01XYNakWuiTNZ53Ad8X1hFwH", tokenEnv: "ROUTINE_TOKEN_FOREX" },
  crypto: { trigId: "trig_01D1tcEspMJmVXX5N5dNCF5c", tokenEnv: "ROUTINE_TOKEN_CRYPTO" },
  stocks: { trigId: "trig_01NfYq6W1cCV4KbPpUc51bkG", tokenEnv: "ROUTINE_TOKEN_STOCKS" },
  commodities: { trigId: "trig_019ku4q8P1JvKc4uT4GiGr96", tokenEnv: "ROUTINE_TOKEN_COMMODITIES" },
};

// Anti-spam / anti-doble-clic (no hay idempotency en el endpoint /fire).
const lastFire: Record<string, number> = {};
const COOLDOWN = 45_000; // 45 s por mesa

export async function POST(req: Request) {
  const { searchParams } = new URL(req.url);
  let desk = (searchParams.get("desk") || "").toLowerCase();
  if (!desk) {
    try {
      desk = ((await req.json())?.desk || "").toLowerCase();
    } catch {
      /* */
    }
  }
  const r = ROUTINES[desk];
  if (!r) return NextResponse.json({ error: "Mesa desconocida" }, { status: 400 });

  const token = process.env[r.tokenEnv];
  if (!token) {
    return NextResponse.json({
      error: `Falta el token de esta mesa. Genéralo en claude.ai/code/routines y añade ${r.tokenEnv} en Vercel.`,
      configured: false,
    });
  }

  const now = Date.now();
  if (lastFire[desk] && now - lastFire[desk] < COOLDOWN) {
    const wait = Math.ceil((COOLDOWN - (now - lastFire[desk])) / 1000);
    return NextResponse.json({ error: `Recién lanzado — espera ${wait}s`, cooldown: true });
  }

  try {
    const res = await fetch(
      `https://api.anthropic.com/v1/claude_code/routines/${r.trigId}/fire`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "anthropic-beta": "experimental-cc-routine-2026-04-01",
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: `Disparo MANUAL desde el dashboard (${new Date().toISOString()}). Evalúa la mesa ${desk} AHORA y deja tu decisión en la cola como siempre.`,
        }),
        signal: AbortSignal.timeout(20_000),
        cache: "no-store",
      }
    );
    const data = await res.json().catch(() => ({} as any));
    if (!res.ok) {
      return NextResponse.json({
        error: data?.error?.message || `fire ${res.status}`,
        status: res.status,
      });
    }
    lastFire[desk] = now;
    return NextResponse.json({ ok: true, sessionUrl: data.claude_code_session_url });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "fire failed" });
  }
}
