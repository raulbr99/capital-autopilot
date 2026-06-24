#!/usr/bin/env node
/**
 * Runner local del piloto automatico (alternativa a Vercel Cron).
 * Mantiene el proceso vivo y dispara /api/bot/cron cada INTERVAL_MIN minutos.
 *
 * Uso:
 *   1) Arranca la app:        npm run dev   (o npm run build && npm start)
 *   2) En otra terminal:      npm run autopilot
 *
 * Variables:
 *   BASE_URL       (def. http://localhost:3000)
 *   INTERVAL_MIN   (def. 15)
 *   CRON_SECRET    (si lo definiste en .env.local, se envia como Bearer)
 */

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const INTERVAL_MIN = Number(process.env.INTERVAL_MIN || 15);
const SECRET = process.env.CRON_SECRET;

const headers = SECRET ? { Authorization: `Bearer ${SECRET}` } : {};

async function tick() {
  const stamp = new Date().toLocaleTimeString("es-ES", { hour12: false });
  try {
    const res = await fetch(`${BASE_URL}/api/bot/cron`, { headers });
    const data = await res.json();
    if (data.ok) {
      console.log(
        `[${stamp}] tick ok · ${data.armed ? "ARMADO" : "desarmado"} · abiertas:${data.opened} · pos:${data.openPositions} · equity:${data.equity ?? "—"}`
      );
    } else {
      console.log(`[${stamp}] tick error:`, data.error || res.status);
    }
  } catch (err) {
    console.log(`[${stamp}] sin conexion con ${BASE_URL}:`, err.message);
  }
}

console.log(
  `⚡ Autopilot runner → ${BASE_URL} cada ${INTERVAL_MIN} min` +
    (SECRET ? " (con CRON_SECRET)" : "")
);
tick();
setInterval(tick, INTERVAL_MIN * 60 * 1000);
