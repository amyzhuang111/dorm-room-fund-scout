/**
 * Fail if the networks canvas looks empty: fewer than ~8% of map-area
 * pixels differ from the warm off-white background after fade-in.
 */
import { chromium } from "playwright";
import fs from "fs";

const BASE = process.env.BASE || "http://127.0.0.1:3488";
const OUT = process.env.OUT || "reviews/visibility.json";
const MIN_PCT = Number(process.env.MIN_NONBG_PCT || 8);

const browser = await chromium.launch({ headless: true, channel: "chrome" });
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
});

await page.goto(`${BASE}/networks`, { waitUntil: "networkidle", timeout: 120000 });
await page.waitForSelector("[data-networks-graph] canvas", { timeout: 90000 });
await page.waitForFunction(
  () => document.querySelector("[data-networks-graph]")?.getAttribute("data-networks-fade") === "1",
  { timeout: 30000 },
).catch(() => {});
// Extra settle for paint after fade flag
await page.waitForTimeout(400);

const result = await page.evaluate(() => {
  const wrap = document.querySelector("[data-networks-graph]");
  const canvas = wrap?.querySelector("canvas");
  if (!canvas) return { ok: false, error: "no canvas" };
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return { ok: false, error: "no ctx" };
  const { width: w, height: h } = canvas;
  // Sample a grid rather than every pixel
  const step = 4;
  let total = 0;
  let non = 0;
  // Background #fbfaf7
  const bg = [251, 250, 247];
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const d = ctx.getImageData(x, y, 1, 1).data;
      total += 1;
      const dist = Math.abs(d[0] - bg[0]) + Math.abs(d[1] - bg[1]) + Math.abs(d[2] - bg[2]);
      if (dist > 18 || d[3] < 250) non += 1;
    }
  }
  const pct = total ? (100 * non) / total : 0;
  return {
    ok: true,
    width: w,
    height: h,
    samples: total,
    nonBackground: non,
    pct: Math.round(pct * 100) / 100,
    fade: wrap?.getAttribute("data-networks-fade") ?? null,
  };
});

const report = {
  ok: result.ok && result.pct >= MIN_PCT,
  base: BASE,
  minPct: MIN_PCT,
  ...result,
};
fs.mkdirSync("reviews", { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
await browser.close();
if (!report.ok) process.exit(1);
