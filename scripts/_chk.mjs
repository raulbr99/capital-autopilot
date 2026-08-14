import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
for (const path of ["/", "/commodities"]) {
  await p.goto("https://capital-autopilot.vercel.app" + path, { waitUntil: "domcontentloaded", timeout: 90000 }).catch(()=>{});
  await new Promise(r => setTimeout(r, 8000));
  console.log(path, await p.evaluate(() => {
    const h = document.querySelector("header > div");
    const izq = h.children[0], der = h.children[1];
    const w = (e) => e ? Math.round(e.getBoundingClientRect().width) : null;
    return JSON.stringify({
      izq: w(izq), der: w(der),
      derHijos: [...der.children].map(c => `${(c.textContent||"·").replace(/\s+/g," ").trim().slice(0,12)}=${w(c)}`),
      nav: w(izq.children[1]),
    });
  }));
}
await b.close();
