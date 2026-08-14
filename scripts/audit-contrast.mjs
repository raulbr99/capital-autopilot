/**
 * Mide el contraste real de todo el texto contra su fondo efectivo, en los dos
 * temas. Nada de estimar: se calcula la ratio WCAG con los colores que el
 * navegador acaba pintando (incluidos los que vienen de variables CSS).
 *
 *   node scripts/audit-contrast.mjs [url-base]
 */

import puppeteer from "puppeteer-core";

const BASE = process.argv[2] || "https://capital-autopilot.vercel.app";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
/** Una mesa por tipo de bloque de contexto: sentimiento, COT y funding. */
const PAGES = ["/", "/forex", "/crypto", "/stocks", "/analytics", "/journal", "/lab"];

/** Un navegador por página: ver la nota en audit-mobile.mjs. Una caída del
 *  Chrome headless no puede contarse como un fallo de contraste. */
let totalFails = 0;

for (const theme of ["dark", "light"]) {
  console.log(`\n=== tema ${theme} ===`);
  const seen = new Map();

  for (const path of PAGES) {
    const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new" });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.goto(`${BASE}${path}?theme=${theme}`, { waitUntil: "networkidle2", timeout: 45000 });
    await page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme);
    await new Promise((r) => setTimeout(r, 2500));

    /* Igual que en el auditor de móvil: no medir el contraste de la pantalla
       de error creyendo que es la página. */
    const roto = await page.evaluate(
      () => (document.body.innerText || "").includes("no se ha podido dibujar")
    );
    if (roto) {
      totalFails++;
      console.log(`❌ ${path}: la página se cayó a la pantalla de error`);
      await browser.close().catch(() => {});
      continue;
    }

    const fails = await page.evaluate(() => {
      const lum = ([r, g, b]) => {
        const f = (c) => {
          c /= 255;
          return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        };
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
      };
      const parse = (s) => (s.match(/[\d.]+/g) || []).slice(0, 4).map(Number);
      const ratio = (fg, bg) => {
        const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x);
        return (a + 0.05) / (b + 0.05);
      };
      // Fondo efectivo: sube por el árbol hasta encontrar uno opaco
      const bgOf = (el) => {
        let n = el;
        while (n && n !== document.documentElement) {
          const c = parse(getComputedStyle(n).backgroundColor);
          if (c.length >= 3 && (c[3] === undefined || c[3] > 0.85)) return c.slice(0, 3);
          n = n.parentElement;
        }
        return [11, 13, 17];
      };

      const out = [];
      for (const el of document.querySelectorAll("body *")) {
        if (el.children.length > 0) continue; // solo hojas: el texto real
        const txt = (el.textContent || "").trim();
        if (!txt) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        const st = getComputedStyle(el);
        if (st.visibility === "hidden" || st.opacity === "0") continue;
        const fg = parse(st.color).slice(0, 3);
        const cr = ratio(fg, bgOf(el));
        const size = parseFloat(st.fontSize);
        const bold = parseInt(st.fontWeight, 10) >= 700;
        const large = size >= 24 || (size >= 18.66 && bold);
        const min = large ? 3 : 4.5;
        if (cr < min) {
          out.push({
            text: txt.slice(0, 32),
            ratio: Math.round(cr * 100) / 100,
            min,
            px: Math.round(size),
            cls: (el.className || "").toString().slice(0, 52),
          });
        }
      }
      return out;
    });

    for (const f of fails) {
      const key = `${f.cls}|${f.px}`;
      if (!seen.has(key)) seen.set(key, { ...f, count: 0, page: path });
      seen.get(key).count++;
    }
    await browser.close().catch(() => {});
  }

  const list = [...seen.values()].sort((a, b) => a.ratio - b.ratio);
  totalFails += list.length;
  if (!list.length) console.log("✅ Sin fallos de contraste.");
  for (const f of list.slice(0, 12)) {
    console.log(
      `⚠️  ${String(f.ratio).padStart(5)} (mín ${f.min}) · ${f.px}px ×${f.count} · "${f.text}"\n       ${f.cls}`
    );
  }
}

console.log(`\n${totalFails === 0 ? "Contraste correcto en ambos temas." : `${totalFails} combinaciones por debajo del mínimo.`}`);
