/**
 * Production-mode check for the home map.
 * A pure-white band taller than 28 CSS px across the stage is the blank
 * rectangle from a globe that does not fill its frame. Attribution must
 * stay visible, name OpenFreeMap, OpenMapTiles, and OpenStreetMap, and
 * sit outside the map.
 *
 * Usage: BASE=http://127.0.0.1:3462 CHROME_PATH=/opt/google/chrome/chrome node scripts/check-map-white-band.mjs
 */
import { spawnSync } from "node:child_process";
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = (process.env.BASE || "http://127.0.0.1:3462").replace(/\/$/, "");
const CHROME = process.env.CHROME_PATH || undefined;
const OUT = process.env.OUT || "/tmp/map-white-band";
fs.mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { name: "320", width: 320, height: 844 },
  { name: "375", width: 375, height: 844 },
  { name: "390", width: 390, height: 844 },
  { name: "430", width: 430, height: 844 },
  { name: "1440", width: 1440, height: 900 },
];

function fail(message) {
  console.error("FAIL", message);
  process.exitCode = 1;
}

const browser = await chromium.launch({
  headless: true,
  executablePath: CHROME,
  args: CHROME ? ["--no-sandbox", "--disable-dev-shm-usage", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] : [],
});

const report = [];
for (const vp of VIEWPORTS) {
  const page = await browser.newPage({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 3,
    isMobile: vp.width < 1024,
    hasTouch: vp.width < 1024,
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error).slice(0, 180)));
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForSelector('[data-globe-state="ready"]', { timeout: 30000 });
  await page.waitForTimeout(2500);
  const shot = `${OUT}/home-${vp.name}-dpr3.png`;
  await page.screenshot({ path: shot });
  const measured = await page.evaluate(() => {
    const stage = document.querySelector("[data-dispatch-map-stage]");
    const credit = document.querySelector("[data-map-credit]");
    const stageBox = stage.getBoundingClientRect();
    const creditBox = credit ? credit.getBoundingClientRect() : null;
    const creditStyle = credit ? getComputedStyle(credit) : null;
    const overlap = creditBox
      ? !(creditBox.bottom <= stageBox.top + 1 || creditBox.top >= stageBox.bottom - 1 || creditBox.right <= stageBox.left || creditBox.left >= stageBox.right)
      : false;
    return {
      globe: stage.getAttribute("data-globe-state"),
      stageH: Math.round(stageBox.height),
      stageTop: Math.round(stageBox.top),
      stageLeft: Math.round(stageBox.left),
      stageW: Math.round(stageBox.width),
      creditText: (credit?.textContent || "").replace(/\s+/g, " ").trim(),
      creditDisplay: creditStyle?.display || "missing",
      creditH: creditBox ? Math.round(creditBox.height) : 0,
      overlap,
    };
  });
  const row = { viewport: vp.name, width: vp.width, height: vp.height, shot, ...measured, errors };
  report.push(row);
  console.log(JSON.stringify(row));
  if (measured.globe !== "ready") fail(`${vp.name}: globe ${measured.globe}`);
  if (vp.width < 1024 && measured.stageH > vp.width + 2) fail(`${vp.name}: stage ${measured.stageH}px taller than the screen width`);
  if (measured.overlap) fail(`${vp.name}: attribution overlaps the map`);
  if (measured.creditDisplay === "none" || measured.creditH < 8) fail(`${vp.name}: attribution not readable`);
  if (!/OpenFreeMap/.test(measured.creditText) || !/OpenMapTiles/.test(measured.creditText) || !/OpenStreetMap/.test(measured.creditText)) {
    fail(`${vp.name}: attribution text missing a required source`);
  }
  if (vp.width < 1024) {
    const labels = await page.evaluate(() => {
      return [...document.querySelectorAll('[aria-label="Map locations"] button')].map((button) => {
        const box = button.getBoundingClientRect();
        const range = document.createRange();
        range.selectNodeContents(button);
        const rects = [...range.getClientRects()];
        const cut = rects.some((rect) => rect.right > box.right + 0.5 || rect.left < box.left - 0.5 || rect.bottom > box.bottom + 0.5 || rect.top < box.top - 0.5);
        const style = getComputedStyle(button);
        return {
          text: (button.textContent || "").replace(/\s+/g, " ").trim(),
          cut,
          font: style.fontSize,
          h: Math.round(box.height),
          w: Math.round(box.width),
        };
      });
    });
    row.labels = labels;
    console.log(JSON.stringify({ viewport: vp.name, labels }));
    for (const label of labels) {
      if (label.cut) fail(`${vp.name}: control "${label.text}" is clipped`);
      if (label.h < 44) fail(`${vp.name}: control "${label.text}" tap height ${label.h}px`);
      const px = Number.parseFloat(label.font);
      if (px < 13) fail(`${vp.name}: control "${label.text}" font ${label.font} is too small`);
    }
    const expected = ["Startup HQs", "Reset", "Rotate", "Campuses"];
    if (labels.map((label) => label.text).join("|") !== expected.join("|")) {
      fail(`${vp.name}: map controls changed: ${labels.map((label) => label.text).join(", ")}`);
    }
  }
  if (errors.length) fail(`${vp.name}: ${errors.join(" | ")}`);
  await page.close();
}

fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
await browser.close();

const pixel = spawnSync("python3", ["-c", `
import json, sys
from PIL import Image
report = json.load(open(sys.argv[1]))
failed = False
for row in report:
    im = Image.open(row["shot"]).convert("RGB")
    scale = im.size[0] / row["width"]
    px = im.load()
    top = int(round(row["stageTop"] * scale))
    left = int(round(row["stageLeft"] * scale))
    width = int(round(row["stageW"] * scale))
    height = int(round(row["stageH"] * scale))
    run = 0
    for y in range(top, min(im.size[1], top + height)):
        samples = 0
        white = 0
        for x in range(left + int(8 * scale), left + width - int(8 * scale), max(1, int(2 * scale))):
            r, g, b = px[x, y]
            samples += 1
            if r == 255 and g == 255 and b == 255:
                white += 1
        if samples and white / samples > 0.85:
            run += 1
        else:
            break
    css = run / scale
    print(f"{row['viewport']}: white band {css:.1f}px css")
    if css > 28:
        print(f"FAIL {row['viewport']}: white band {css:.1f}px")
        failed = True
sys.exit(1 if failed else 0)
`, `${OUT}/report.json`], { encoding: "utf8" });
process.stdout.write(pixel.stdout || "");
process.stderr.write(pixel.stderr || "");
if (pixel.status !== 0) process.exitCode = pixel.status || 1;
if (!process.exitCode) console.log("PASS map white band");
