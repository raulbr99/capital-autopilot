import puppeteer from "puppeteer-core";
const OUT = "/private/tmp/claude-501/-Users-raulbr99-Documents-GitHub/bb2bb4a0-ff8b-4701-b76c-3f012af86926/scratchpad";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
await p.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 2 });
await p.goto("https://capital-autopilot.vercel.app/", { waitUntil: "domcontentloaded", timeout: 90000 }).catch(()=>{});
await new Promise(r => setTimeout(r, 8000));
console.log(await p.evaluate(() => {
  const cards = [...document.querySelectorAll("div")].filter(d => (d.textContent||"").startsWith("REGISTRO EN VIVO"));
  const reg = cards[0];
  const risk = [...document.querySelectorAll("div")].find(d => (d.textContent||"").startsWith("GESTIÓN DE RIESGO"));
  return JSON.stringify({ registro: reg ? Math.round(reg.getBoundingClientRect().height) : null, riesgo: risk ? Math.round(risk.getBoundingClientRect().height) : null });
}));
await p.screenshot({ path: `${OUT}/panel2.png`, fullPage: true });
await b.close();
