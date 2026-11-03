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
  const { width: w, height: h } = canvas;
  let ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    // WebGL canvas: sample via drawImage into a 2d probe (needs preserveDrawingBuffer)
    const probe = document.createElement("canvas");
    probe.width = w;
    probe.height = h;
    ctx = probe.getContext("2d", { willReadFrequently: true });
    if (!ctx) return { ok: false, error: "no ctx" };
    try {
      ctx.drawImage(canvas, 0, 0);
    } catch (e) {
      return { ok: false, error: "drawImage failed: " + String(e) };
    }
  }
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
  let colored = 0;
  const pct = total ? (100 * non) / total : 0;
  // Second pass already sampled; reuse loop vars by recounting chroma in the same grid
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const d = ctx.getImageData(x, y, 1, 1).data;
      const mx = Math.max(d[0], d[1], d[2]);
      const mn = Math.min(d[0], d[1], d[2]);
      // Chromatic vs near-gray: saturation-ish delta, and not near bg
      const dist = Math.abs(d[0] - bg[0]) + Math.abs(d[1] - bg[1]) + Math.abs(d[2] - bg[2]);
      if (dist > 18 && mx - mn >= 12) colored += 1;
    }
  }
  const coloredPct = total ? (100 * colored) / total : 0;
  return {
    ok: true,
    width: w,
    height: h,
    samples: total,
    nonBackground: non,
    pct: Math.round(pct * 100) / 100,
    colored: colored,
    coloredPct: Math.round(coloredPct * 100) / 100,
    fade: wrap?.getAttribute("data-networks-fade") ?? null,
  };
});

const MIN_COLORED_PCT = Number(process.env.MIN_COLORED_PCT || 5);
const report = {
  ...result,
  ok: !!(result.ok && result.pct >= MIN_PCT && (result.coloredPct ?? 0) >= MIN_COLORED_PCT),
  base: BASE,
  minPct: MIN_PCT,
  minColoredPct: MIN_COLORED_PCT,
};
fs.mkdirSync("reviews", { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
await browser.close();
if (!report.ok) process.exit(1);
