import { NextResponse } from "next/server";
import { bot } from "@/lib/store";
import { loadRuntime, saveRuntime } from "@/lib/db";

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

/**
 * Anti-spam / anti-doble-clic. El endpoint /fire de las routines no tiene
 * idempotencia, así que disparar dos veces gasta DOS ejecuciones de pago y puede
 * dejar dos decisiones para el mismo ciclo en la cola.
 *
 * Estaba en una variable del módulo, o sea en memoria. En serverless cada
 * instancia tiene la suya: dos peticiones seguidas que caen en instancias
 * distintas no se ven entre ellas y las dos disparan. El freno existía sobre el
 * papel y no frenaba.
 *
 * Ahora vive en el estado persistido (ap_state), que es el mismo sitio donde ya
 * viven el latido del cron, el ancla del día y las revisiones de la IA. No hace
 * falta tabla nueva: es un campo más del blob.
 */
const COOLDOWN = 45_000; // 45 s por mesa

/** Suelta la reserva de una mesa cuando el disparo no llegó a salir. */
async function liberar(desk: string) {
  const b = bot();
  const { [desk]: _, ...resto } = b.gestorFiredAt || {};
  b.gestorFiredAt = resto;
  await saveRuntime();
}

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
  await loadRuntime();
  const b = bot();
  const previo = b.gestorFiredAt?.[desk] ?? 0;
  if (previo && now - previo < COOLDOWN) {
    const wait = Math.ceil((COOLDOWN - (now - previo)) / 1000);
    return NextResponse.json({ error: `Recién lanzado — espera ${wait}s`, cooldown: true });
  }
  b.gestorFiredAt = { ...(b.gestorFiredAt || {}), [desk]: now };
  await saveRuntime();

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
      // El disparo no salió: se libera la marca para poder reintentar ya.
      // Reservarla ANTES es lo que impide el doble disparo; soltarla aquí es lo
      // que evita que un fallo del proveedor bloquee la mesa 45 s.
      await liberar(desk);
      return NextResponse.json({
        error: data?.error?.message || `fire ${res.status}`,
        status: res.status,
      });
    }
    return NextResponse.json({ ok: true, sessionUrl: data.claude_code_session_url });
  } catch (e: unknown) {
    await liberar(desk);
    return NextResponse.json({ error: e instanceof Error ? e.message : "fire failed" });
  }
}
