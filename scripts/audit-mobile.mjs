/**
 * Auditor de móvil real. Chrome headless en macOS clampa la ventana a ~480 px,
 * así que una captura con --window-size=390 muestra una maquetación de 480
 * recortada: parece un desbordamiento y no lo es. Aquí se emula el dispositivo
 * de verdad (viewport + deviceScaleFactor + touch), que es la única forma de
 * medir anchos por debajo de ese mínimo.
 *
 *   node scripts/audit-mobile.mjs [url-base]
 */

import puppeteer from "puppeteer-core";
import { mkdirSync } from "node:fs";

const BASE = process.argv[2] || "https://capital-autopilot.vercel.app";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const OUT = "audit";
const PAGES = ["/", "/forex", "/stocks", "/analytics", "/journal", "/lab"];
const DEVICES = [
  { name: "iphone-se", width: 375, height: 667 },
  { name: "iphone-14", width: 390, height: 844 },
];

mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new" });
let problemas = 0;

for (const dev of DEVICES) {
  console.log(`\n=== ${dev.name} (${dev.width}px) ===`);
  for (const path of PAGES) {
    const page = await browser.newPage();
    await page.setViewport({
      width: dev.width,
      height: dev.height,
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });
    try {
      await page.goto(BASE + path, { waitUntil: "networkidle2", timeout: 45000 });
      await new Promise((r) => setTimeout(r, 2500)); // que entren los datos del cliente

      const report = await page.evaluate(() => {
        const doc = document.documentElement;
        // Elementos que sobresalen del viewport (los que de verdad desbordan)
        const vw = doc.clientWidth;
        const offenders = [];
        for (const el of document.querySelectorAll("body *")) {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          if (r.right > vw + 1) {
            const st = getComputedStyle(el);
            // Ignora lo que desborda a propósito dentro de un contenedor con scroll
            let p = el.parentElement,
              clipped = false;
            while (p && p !== document.body) {
              const ps = getComputedStyle(p);
              if (/(auto|scroll|hidden|clip)/.test(ps.overflowX)) {
                clipped = true;
                break;
              }
              p = p.parentElement;
            }
            if (!clipped && st.position !== "fixed") {
              offenders.push({
                tag: el.tagName.toLowerCase(),
                cls: (el.className || "").toString().slice(0, 70),
                right: Math.round(r.right),
              });
            }
          }
        }
        /**
         * Scroll horizontal INTERNO.
         *
         * El bucle de arriba descarta a propósito lo que desborda dentro de un
         * contenedor con overflow, para no dar falsos positivos. El coste de esa
         * decisión: durante 100 pasadas no vio que la tabla del historial medía
         * 799 px dentro de una caja de 348 en un móvil — la página no se
         * desplazaba, así que "todo correcto", mientras en pantalla solo cabían
         * dos de las seis columnas y el P&L quedaba fuera.
         *
         * A veces es legítimo (un gráfico ancho que se arrastra), así que no
         * cuenta como fallo: se informa aparte, con cuánto se esconde, para
         * decidir caso por caso.
         */
        const internos = [];
        for (const el of document.querySelectorAll("body *")) {
          const st = getComputedStyle(el);
          if (!/(auto|scroll)/.test(st.overflowX)) continue;
          const oculto = el.scrollWidth - el.clientWidth;
          if (oculto > 8 && el.clientWidth > 0) {
            internos.push({
              tag: el.tagName.toLowerCase(),
              cls: (el.className || "").toString().slice(0, 46),
              visible: el.clientWidth,
              total: el.scrollWidth,
              pct: Math.round((oculto / el.scrollWidth) * 100),
            });
          }
        }

        // Objetivos táctiles pequeños (WCAG sugiere ~44 px)
        /**
         * Un enlace DENTRO de una frase no cuenta.
         *
         * WCAG lo exceptúa expresamente (2.5.8, "inline"): agrandar un enlace
         * incrustado en un párrafo rompería la línea de texto, así que el
         * criterio no aplica. Sin esta excepción el informe arrastraba para
         * siempre un "panel 31×15" que no hay que arreglar, y una lista de
         * avisos que no se pueden atender acaba ignorándose entera — incluidos
         * los que sí importan.
         */
        const enFrase = (el) => {
          if (el.tagName !== "A") return false;
          if (!/^inline/.test(getComputedStyle(el).display)) return false;
          const padre = el.parentElement;
          if (!padre) return false;
          const textoAlrededor = (padre.textContent || "").replace(el.textContent || "", "").trim();
          return textoAlrededor.length > 0;
        };
        const small = [...document.querySelectorAll("button, a, select, input")]
          .filter((el) => !enFrase(el))
          .map((el) => ({ el, r: el.getBoundingClientRect() }))
          .filter(({ r }) => r.width > 0 && r.height > 0 && (r.height < 32 || r.width < 32))
          .map(({ el, r }) => ({
            tag: el.tagName.toLowerCase(),
            text: (el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 24),
            size: `${Math.round(r.width)}×${Math.round(r.height)}`,
          }));
        return {
          scrollW: doc.scrollWidth,
          clientW: doc.clientWidth,
          offenders: offenders.slice(0, 6),
          internos: internos.sort((a, b) => b.pct - a.pct).slice(0, 5),
          small: small.slice(0, 8),
          smallTotal: small.length,
        };
      });

      const overflow = report.scrollW > report.clientW + 1;
      const flag = overflow || report.offenders.length ? "⚠️ " : "✅ ";
      console.log(
        `${flag}${path.padEnd(11)} scroll ${report.scrollW}/${report.clientW}` +
          ` · desbordan ${report.offenders.length}` +
          ` · táctiles pequeños ${report.smallTotal}`
      );
      if (report.offenders.length) {
        problemas++;
        for (const o of report.offenders) console.log(`      ↳ <${o.tag}> hasta ${o.right}px · ${o.cls}`);
      }
      if (report.internos.length) {
        for (const i of report.internos)
          console.log(
            `      ↔ <${i.tag}> ${i.visible}px visibles de ${i.total} (${i.pct}% oculto) · ${i.cls}`
          );
      }
      if (report.small.length) {
        for (const s of report.small.slice(0, 4)) console.log(`      · táctil ${s.size} "${s.text}"`);
      }

      await page.screenshot({ path: `${OUT}/${dev.name}${path.replace(/\//g, "_") || "_home"}.png` });
    } catch (e) {
      console.log(`❌ ${path}: ${e.message.slice(0, 80)}`);
    }
    await page.close();
  }
}

await browser.close();
console.log(`\n${problemas === 0 ? "Sin desbordamientos." : `${problemas} páginas con desbordamiento.`}`);
console.log(`Capturas en ${OUT}/`);
