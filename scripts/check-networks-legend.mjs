/**
 * Legend must cover every node color in use on the networks graph.
 * Usage: BASE=http://127.0.0.1:3471 node scripts/check-networks-legend.mjs
 */
import { chromium } from "playwright";
import fs from "fs";

const BASE = process.env.BASE || "http://127.0.0.1:3471";
const OUT = process.env.OUT || "";

function fail(msg) {
  console.error("FAIL", msg);
  process.exitCode = 1;
}

function norm(hex) {
  const h = (hex || "").trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(h)) return h;
  if (/^#[0-9a-f]{3}$/.test(h)) return `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}`;
  const m = h.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (m) {
    const [r, g, b] = m.slice(1, 4).map((n) => Number(n).toString(16).padStart(2, "0"));
    return `#${r}${g}${b}`;
  }
  return h;
}

const graph = await fetch(`${BASE}/data/founder-networks-graph.json`).then((r) => r.json());
const campusIds = new Set();
for (const n of graph.nodes || []) {
  if (n.type === "founder" && n.campusId) campusIds.add(n.campusId);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(`${BASE}/networks`, { waitUntil: "networkidle", timeout: 120000 });
await page.waitForTimeout(1500);

const found = await page.evaluate(() => {
  const frame = document.querySelector("[data-networks-legend-frame]");
  if (!frame) return { missing: true };
  const swatches = [...frame.querySelectorAll("[data-legend-swatch]")].map((el) => ({
    color: el.getAttribute("data-legend-swatch"),
    campus: el.getAttribute("data-legend-campus"),
    kind: el.getAttribute("data-legend-kind"),
  }));
  return { missing: false, swatches, text: frame.innerText.slice(0, 400) };
});

const report = { ok: true, campusIds: [...campusIds].sort(), found };
if (found.missing) {
  report.ok = false;
  fail("missing [data-networks-legend-frame]");
} else {
  const legendCampuses = new Set(found.swatches.filter((s) => s.campus).map((s) => s.campus));
  const missingCampuses = [...campusIds].filter((id) => !legendCampuses.has(id));
  if (missingCampuses.length) {
    report.ok = false;
    report.missingCampuses = missingCampuses;
    fail(`legend missing campus colors for: ${missingCampuses.join(", ")}`);
  }
  const kinds = new Set(found.swatches.map((s) => s.kind).filter(Boolean));
  if (!kinds.has("company")) {
    report.ok = false;
    fail("legend missing company swatch");
  }
  if (!kinds.has("hub")) {
    report.ok = false;
    fail("legend missing hub swatch");
  }
  if (legendCampuses.size < campusIds.size) {
    report.ok = false;
    fail(`legend campus count ${legendCampuses.size} < graph ${campusIds.size}`);
  }
}

if (OUT) fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ok: report.ok, campuses: campusIds.size, swatches: found.swatches?.length }, null, 2));
await browser.close();
if (process.exitCode) {
  console.error("check-networks-legend FAILED");
  process.exit(process.exitCode);
}
console.log("OK legend covers every node color in use");
