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

/** Un navegador por prueba: ver la nota en audit-mobile.mjs. Cuando el headless
 *  se cae a mitad de tanda, el resto de pruebas debe seguir corriendo y el
 *  fallo no puede escribirse como un defecto de la aplicación. */
/**
 * Un navegador REUTILIZADO que se relanza si muere. Aislar cada prueba en su
 * propio Chrome arregló los falsos positivos pero disparó el tiempo de la tanda
 * (quince arranques). Reutilizar uno y comprobar que sigue vivo da las dos
 * cosas: velocidad y resistencia.
 */
let browser = null;
async function navegador() {
  if (browser && browser.connected) return browser;
  browser = await puppeteer.launch({ executablePath: CHROME, headless: "new" });
  return browser;
}
async function tirarNavegador() {
  try {
    await browser?.close();
  } catch {
    /* ya estaba muerto */
  }
  browser = null;
}

let fallos = 0;
let arnes = 0;

/** Abre una página capturando TODA excepción o error de consola. */
async function abrir(path) {
  /* Lanzar nueve navegadores seguidos falla de vez en cuando con "Failed to
     launch the browser process". Es del arnés, no de la web: se reintenta. */
  let nav;
  for (let i = 0; ; i++) {
    try {
      nav = await navegador();
      break;
    } catch (e) {
      if (i >= 2) throw Object.assign(e, { arnes: true });
      await tirarNavegador();
      await esperar(1500);
    }
  }
  const page = await nav.newPage();
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
    /* Fallo del ARNÉS (no se pudo abrir el navegador) frente a fallo de la web.
       Contarlos juntos fue lo que dejó pasar la caída de las mesas: un ❌ del
       arnés se lee igual que un ❌ de la aplicación y se acaba ignorando. */
    if (e.arnes || /launch the browser|Session closed|Protocol error/.test(e.message || "")) {
      arnes++;
      console.log(`⚠️  ${nombre.padEnd(34)} arnés: ${String(e.message).slice(0, 50)}`);
    } else {
      fallos++;
      console.log(`❌ ${nombre.padEnd(34)} no carga: ${e.message.slice(0, 60)}`);
    }
    return;
  }
  let detalle = "";
  try {
    detalle = (await accion(page)) || "";
  } catch (e) {
    errores.push(`acción: ${e.message.slice(0, 110)}`);
  }
  await esperar(600);
  /*
    Además de la consola: comprobar que NO estamos mirando la pantalla de
    error. Una excepción durante el render la captura la frontera de error, y
    si algún día deja de escribir en consola, esta prueba seguiría en verde
    sobre una página muerta. Se comprueba el resultado, no solo el síntoma.
  */
  try {
    const roto = await page.evaluate(() =>
      (document.body.innerText || "").includes("no se ha podido dibujar")
    );
    if (roto) errores.push("la página se cayó a la pantalla de error");
  } catch {
    /* si la página ya no responde, lo dirá el catch de arriba */
  }
  const ok = errores.length === 0;
  if (!ok) fallos++;
  process.stdout.write(`${ok ? "✅" : "❌"} ${nombre.padEnd(34)} ${detalle}\n`);
  for (const e of errores) console.log(`      ↳ ${e}`);
  await page.close().catch(() => {});
}

console.log("=== Interacciones ===");

await prueba("gráfico de posición (modal)", "/", async (p) => {
  // Esperar al ELEMENTO, no a un tiempo fijo: con la función fría los datos
  // pueden tardar, y dar por bueno un "no hay posiciones" que en realidad es
  // "aún no han llegado" convierte la prueba en un adorno.
  const btn = await p
    .waitForSelector('button[title="Ver gráfico"]', { timeout: 20000 })
    .catch(() => null);
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


/**
 * Interacciones que solo se ejecutan CON DATOS.
 *
 * La caída de /stocks y /commodities vivió semanas porque el código que
 * reventaba solo corre cuando la mesa tiene posiciones abiertas: con la mesa
 * vacía, la página renderiza perfecta. Las pruebas de arriba abrían el gráfico
 * desde el panel, que es la ruta que sí se ejercitaba.
 *
 * Estas recorren las rutas dependientes de datos en las mesas y en Analítica,
 * que son las que tienen ramas que no se tocan si el histórico está vacío.
 */
await prueba("gráfico desde una mesa", "/stocks", async (p) => {
  const btn = await p.waitForSelector('button[title="Ver gráfico"]', { timeout: 20000 }).catch(() => null);
  if (!btn) return "sin posiciones en esta mesa — no comprobable";
  await btn.click();
  await esperar(5000);
  const r = await p.evaluate(() => ({
    modal: !!document.querySelector('[role="dialog"]'),
    lienzos: document.querySelectorAll("canvas").length,
  }));
  if (!r.modal) throw new Error("el modal no se monta desde la mesa");
  if (!r.lienzos) throw new Error("el modal abre pero no dibuja");
  return `modal ok · ${r.lienzos} lienzos`;
});

await prueba("filtros de Analítica", "/analytics", async (p) => {
  await p.waitForSelector("select[aria-label='Filtrar por instrumento']", { timeout: 20000 });
  await esperar(2000);
  // mesa con histórico -> el desplegable de activos debe acotarse a ella
  const mesas = await p.$$("button");
  for (const b of mesas) {
    const t = (await p.evaluate((el) => el.textContent || "", b)).trim();
    if (t.startsWith("Stocks")) { await b.click(); break; }
  }
  await esperar(1500);
  const n = await p.$$eval("select[aria-label='Filtrar por instrumento'] option", (o) => o.length);
  if (n < 1) throw new Error("el desplegable de activos se queda sin opciones");
  return `activos tras filtrar por mesa: ${n - 1}`;
});

console.log("\n=== Carga limpia de cada página ===");
for (const path of ["/", "/forex", "/crypto", "/stocks", "/commodities", "/analytics", "/journal", "/lab"]) {
  await prueba(`sin errores en ${path}`, path, async () => "");
}

console.log(`\n${fallos === 0 ? "✅ Todo funciona." : `❌ ${fallos} pruebas con errores.`}`);
if (arnes) console.log(`⚠️  ${arnes} ${arnes === 1 ? "prueba" : "pruebas"} sin comprobar por fallos del navegador de pruebas.`);
process.exit(fallos === 0 ? 0 : 1);
await tirarNavegador();
