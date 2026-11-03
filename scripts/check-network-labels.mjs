/**
 * Every canvas network label must anchor inside its own hub cluster bbox.
 * Usage: BASE=http://127.0.0.1:PORT node scripts/check-network-labels.mjs
 */
import { chromium } from "playwright";

const BASE = process.env.BASE || "http://127.0.0.1:3471";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(`${BASE}/networks`, { waitUntil: "networkidle", timeout: 90000 });
await page.waitForSelector("[data-networks-graph] canvas", { timeout: 60000 });
await page.waitForTimeout(2800);

const result = await page.evaluate(() => {
  const labels = [...document.querySelectorAll("[data-canvas-label]")];
  const failures = [];
  const rows = [];
  for (const el of labels) {
    const id = el.getAttribute("data-canvas-label") || "";
    const ax = Number(el.getAttribute("data-label-anchor-x"));
    const ay = Number(el.getAttribute("data-label-anchor-y"));
    const hx = Number(el.getAttribute("data-hub-x"));
    const hy = Number(el.getAttribute("data-hub-y"));
    const hr = Number(el.getAttribute("data-hub-r"));
    const text = (el.textContent || "").trim();
    if (![ax, ay, hx, hy, hr].every((n) => Number.isFinite(n))) {
      failures.push({ id, text, reason: "missing hub/anchor attrs" });
      continue;
    }
    const dist = Math.hypot(ax - hx, ay - hy);
    const ok = dist <= hr * 1.05 + 2;
    rows.push({ id, text, dist: Math.round(dist), hubR: Math.round(hr), ok });
    if (!ok) failures.push({ id, text, reason: `anchor ${Math.round(dist)}px outside hubR ${Math.round(hr)}` });
  }
  // Also: no label midpoint should sit closer to a foreign hub than its own.
  const hubs = labels.map((el) => ({
    id: el.getAttribute("data-canvas-label") || "",
    hx: Number(el.getAttribute("data-hub-x")),
    hy: Number(el.getAttribute("data-hub-y")),
    hr: Number(el.getAttribute("data-hub-r")),
  }));
  for (const el of labels) {
    const id = el.getAttribute("data-canvas-label") || "";
    const wrap = el.closest("[data-networks-graph]");
    const wr = wrap.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const midX = r.left - wr.left + r.width / 2;
    const midY = r.top - wr.top + r.height / 2;
    const own = hubs.find((h) => h.id === id);
    if (!own) continue;
    const ownDist = Math.hypot(midX - own.hx, midY - own.hy);
    for (const hub of hubs) {
      if (hub.id === id) continue;
      const d = Math.hypot(midX - hub.hx, midY - hub.hy);
      if (d + 8 < ownDist && d < hub.hr * 0.95) {
        failures.push({
          id,
          text: (el.textContent || "").trim(),
          reason: `label closer to ${hub.id} (${Math.round(d)}) than own hub (${Math.round(ownDist)})`,
        });
      }
    }
  }
  return { count: labels.length, rows, failures };
});

await browser.close();
console.log(JSON.stringify({ count: result.count, failures: result.failures, sample: result.rows.slice(0, 8) }, null, 2));
if (result.failures.length) {
  console.error("FAIL check-network-labels", result.failures.length, "mis-anchored labels");
  process.exit(1);
}
if (result.count < 4) {
  console.error("FAIL too few labels", result.count);
  process.exit(1);
}
console.log("OK every label anchor sits within its hub cluster bbox");
