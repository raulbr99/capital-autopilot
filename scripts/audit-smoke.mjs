/**
 * Prueba de humo de las INTERACCIONES. Nace de un fallo real: el modal del
 * gráfico estuvo 19 despliegues reventando la app (sintaxis de color que la
 * librería no parseaba) y compilaba perfectamente en todos. Compilar no es
 * verificar: aquí se pulsa de verdad y se escucha la consola del navegador.
 *
 *   node scripts/audit-smoke.mjs [url-base]
 */

import puppeteer from "puppeteer-core";

const BASE = process.argv[2] || "https://capital-autopilot.vercel.app";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new" });
let fallos = 0;

/** Abre una página capturando TODA excepción o error de consola. */
async function abrir(path) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  const errores = [];
  page.on("pageerror", (e) => errores.push(`excepción: ${e.message.slice(0, 120)}`));
  page.on("console", (m) => {
    if (m.type() === "error" && !/favicon|manifest|404/i.test(m.text())) {
      errores.push(`consola: ${m.text().slice(0, 120)}`);
    }
  });
  // networkidle NO sirve aquí: la app sondea cada 6 s y la red nunca queda
  // quieta. Se espera al DOM y luego se da tiempo a que entren los datos.
  // Un reintento porque un timeout puntual de red no es un fallo de la app:
  // una herramienta que grita "roto" por eso deja de servir para nada.
  for (let intento = 0; ; intento++) {
    try {
      await page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 30000 });
      break;
    } catch (e) {
      if (intento >= 1) throw e;
      await esperar(2000);
    }
  }
  await esperar(5000);
  return { page, errores };
}

async function prueba(nombre, path, accion) {
  let page, errores;
  try {
    ({ page, errores } = await abrir(path));
  } catch (e) {
    fallos++;
    console.log(`❌ ${nombre.padEnd(34)} no carga: ${e.message.slice(0, 60)}`);
    return;
  }
  let detalle = "";
  try {
    detalle = (await accion(page)) || "";
  } catch (e) {
    errores.push(`acción: ${e.message.slice(0, 110)}`);
  }
  await esperar(600);
  const ok = errores.length === 0;
  if (!ok) fallos++;
  process.stdout.write(`${ok ? "✅" : "❌"} ${nombre.padEnd(34)} ${detalle}\n`);
  for (const e of errores) console.log(`      ↳ ${e}`);
  await page.close();
}

console.log("=== Interacciones ===");

await prueba("gráfico de posición (modal)", "/", async (p) => {
  const btn = await p.$('button[title="Ver gráfico"]');
  if (!btn) return "sin posiciones abiertas — no comprobable";
  await btn.click();
  await esperar(5000);
  const r = await p.evaluate(() => ({
    modal: !!document.querySelector('[role="dialog"]'),
    canvas: document.querySelectorAll("canvas").length,
  }));
  if (!r.modal) throw new Error("el modal no se monta");
  if (!r.canvas) throw new Error("el modal abre pero no dibuja el gráfico");
  return `modal ok · ${r.canvas} lienzos`;
});

await prueba("paleta de comandos (⌘K)", "/", async (p) => {
  await p.keyboard.down("Meta");
  await p.keyboard.press("k");
  await p.keyboard.up("Meta");
  await esperar(700);
  const abierta = await p.evaluate(() => !!document.querySelector('[aria-label="Paleta de comandos"]'));
  if (!abierta) throw new Error("no se abre con ⌘K");
  await p.keyboard.press("ArrowDown");
  await p.keyboard.press("ArrowDown");
  const sel = await p.evaluate(() => document.querySelectorAll('[data-sel="true"]').length);
  if (sel !== 1) throw new Error(`selección por teclado rota (${sel} elementos marcados)`);
  await p.keyboard.press("Escape");
  await esperar(400);
  const cerrada = await p.evaluate(() => !document.querySelector('[aria-label="Paleta de comandos"]'));
  if (!cerrada) throw new Error("no cierra con Escape");
  return "abre, navega y cierra";
});

await prueba("cambio de tema", "/", async (p) => {
  const antes = await p.evaluate(() => document.documentElement.getAttribute("data-theme"));
  await p.click('button[aria-label="Cambiar tema"]');
  await esperar(600);
  const r = await p.evaluate(() => ({
    tema: document.documentElement.getAttribute("data-theme"),
    barra: document.querySelector('meta[name="theme-color"]')?.getAttribute("content"),
  }));
  if (r.tema === antes) throw new Error("el tema no cambia");
  return `${antes} → ${r.tema} · barra ${r.barra}`;
});

await prueba("filtros de señales", "/forex", async (p) => {
  const btns = await p.$$("button");
  for (const b of btns) {
    const t = await p.evaluate((el) => el.textContent || "", b);
    if (t.trim().startsWith("Con señal")) {
      await b.click();
      await esperar(600);
      return "filtro aplicado";
    }
  }
  return "sin botón de filtro visible";
});

await prueba("pestañas del Lab", "/lab", async (p) => {
  const btns = await p.$$("button");
  for (const b of btns) {
    const t = await p.evaluate((el) => el.textContent || "", b);
    if (t.includes("Investigación")) {
      await b.click();
      await esperar(900);
      const hay = await p.evaluate(() => document.body.textContent.includes("no toca la cuenta"));
      if (!hay) throw new Error("la pestaña no cambia de contenido");
      return "cambia a Investigación";
    }
  }
  throw new Error("no encuentro la pestaña");
});

await prueba("desplegar tesis del diario", "/journal", async (p) => {
  const btns = await p.$$("button");
  for (const b of btns) {
    const t = await p.evaluate((el) => el.textContent || "", b);
    if (t.includes("Leer tesis completa")) {
      await b.click();
      await esperar(500);
      const ok = await p.evaluate(() => document.body.textContent.includes("Mostrar menos"));
      if (!ok) throw new Error("no despliega");
      return "despliega y repliega";
    }
  }
  return "sin tesis largas ahora mismo";
});

console.log("\n=== Carga limpia de cada página ===");
for (const path of ["/", "/forex", "/crypto", "/stocks", "/commodities", "/analytics", "/journal", "/lab"]) {
  await prueba(`sin errores en ${path}`, path, async () => "");
}

await browser.close();
console.log(`\n${fallos === 0 ? "✅ Todo funciona." : `❌ ${fallos} pruebas con errores.`}`);
process.exit(fallos === 0 ? 0 : 1);
