import puppeteer from "puppeteer-core";
const OUT = "/private/tmp/claude-501/-Users-raulbr99-Documents-GitHub/bb2bb4a0-ff8b-4701-b76c-3f012af86926/scratchpad";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await p.goto("https://capital-autopilot.vercel.app/stocks", { waitUntil: "domcontentloaded", timeout: 90000 }).catch(()=>{});
await new Promise(r => setTimeout(r, 9000));
for (const [y, n] of [[0,"s1"],[820,"s2"],[1640,"s3"]]) {
  await p.evaluate((yy) => window.scrollTo(0, yy), y);
  await new Promise(r => setTimeout(r, 700));
  await p.screenshot({ path: `${OUT}/${n}.png` });
}
console.log("alto", await p.evaluate(() => document.body.scrollHeight));
await b.close();
