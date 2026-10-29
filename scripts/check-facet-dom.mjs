/**
 * Read ONE visible FacetRail's rendered pills; every facet group must sum to 2513.
 * Usage: BASE=http://127.0.0.1:3460 node scripts/check-facet-dom.mjs
 */
import { chromium } from "playwright";

const BASE = process.env.BASE || "http://127.0.0.1:3460";
const TOTAL = 2513;

function parseMidDotCount(label) {
  const m = String(label).match(/·\s*([\d,]+)\s*$/);
  return m ? Number(m[1].replace(/,/g, "")) : null;
}

async function openFilters(page) {
  const hide = page.getByRole("button", { name: "Hide filters" });
  if ((await hide.count()) > 0 && (await hide.first().isVisible().catch(() => false))) return;
  const filters = page.getByRole("button", { name: /^Filters$/ });
  if ((await filters.count()) > 0 && (await filters.first().isVisible().catch(() => false))) {
    await filters.first().click();
    await page.waitForTimeout(500);
    return;
  }
  const all = page.getByText("All filters", { exact: true });
  if ((await all.count()) > 0) {
    await all.first().click();
    await page.waitForTimeout(500);
  }
}

async function pickRail(page) {
  return page.evaluate(() => {
    const rails = [...document.querySelectorAll('[data-facet-rail="scout"]')];
    const visible = rails.find((el) => {
      const r = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return style.display !== "none" && style.visibility !== "hidden" && r.width > 40 && r.height > 40;
    });
    if (!visible) return null;
    // mark chosen rail
    rails.forEach((el) => el.removeAttribute("data-facet-rail-active"));
    visible.setAttribute("data-facet-rail-active", "1");
    return true;
  });
}

async function collect(page, facet) {
  return page.evaluate((facetId) => {
    const root = document.querySelector('[data-facet-rail-active="1"]');
    if (!root) return [];
    return [...root.querySelectorAll(`[data-facet="${facetId}"]`)].map((el) => ({
      label: (el.textContent || "").replace(/\s+/g, " ").trim(),
      countAttr: el.getAttribute("data-facet-count"),
    }));
  }, facet);
}

function sumRows(rows) {
  let sum = 0;
  const parts = [];
  for (const row of rows) {
    if (/^All\b/i.test(row.label)) continue;
    const n = Number(row.countAttr) || parseMidDotCount(row.label);
    if (n == null) continue;
    sum += n;
    parts.push({ label: row.label, count: n });
  }
  return { sum, parts };
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(`${BASE}/?sample=1`, { waitUntil: "networkidle", timeout: 90000 });
await page.waitForTimeout(1500);
await openFilters(page);
await page.waitForTimeout(400);
const picked = await pickRail(page);
if (!picked) {
  console.error("FAIL no visible FacetRail");
  process.exit(1);
}

await page.waitForSelector('[data-facet-rail-active="1"] [data-facet="sector-more"]', { timeout: 10000 });

const year = sumRows(await collect(page, "year"));
const status = sumRows(await collect(page, "status"));
const sector = sumRows(await collect(page, "sector"));
const sectorMore = sumRows(await collect(page, "sector-more"));
const hq = sumRows(await collect(page, "hq"));
const hqMore = sumRows(await collect(page, "hq-more"));
const flags = await collect(page, "flag");
const moreLabelsBefore = await page.evaluate(() => {
  const root = document.querySelector('[data-facet-rail-active="1"]');
  if (!root) return [];
  return [...root.querySelectorAll('[data-facet="sector-more"], [data-facet="hq-more"]')].map((el) =>
    (el.textContent || "").replace(/\s+/g, " ").trim(),
  );
});

const sectorCovered = sector.sum + sectorMore.sum;
const hqCovered = hq.sum + hqMore.sum;

for (const facetMore of ["sector-more", "hq-more"]) {
  const loc = page.locator(`[data-facet-rail-active="1"] [data-facet="${facetMore}"]`).first();
  if ((await loc.count()) > 0) {
    await loc.evaluate((el) => el.scrollIntoView({ block: "center" }));
    await loc.click({ force: true });
    await page.waitForTimeout(250);
  }
}

const sectorExpanded = sumRows(await collect(page, "sector"));
const hqExpanded = sumRows(await collect(page, "hq"));

const flagCounts = flags
  .filter((f) => !/^All\b/i.test(f.label))
  .map((f) => ({ label: f.label, count: Number(f.countAttr) || parseMidDotCount(f.label) || 0 }));

const newC = flagCounts.find((f) => /founded in 2026/i.test(f.label))?.count;
const actC = flagCounts.find((f) => /active this month/i.test(f.label))?.count;


const strip = await page.evaluate(() => {
  const root = document.querySelector("[data-sample-strip-counts]");
  if (!root) return null;
  const founders = root.querySelector('[data-count="founders-listed"]')?.textContent?.replace(/,/g, "");
  const campuses = root.querySelector('[data-count="campuses-on-map"]')?.textContent?.replace(/,/g, "");
  return { founders: Number(founders), campuses: Number(campuses) };
});
const fold = await page.evaluate(() => {
  const root = document.querySelector("[data-fold-counts]");
  if (!root) return null;
  const founders = root.querySelector('[data-count="founders-listed"]')?.textContent?.replace(/,/g, "");
  const campuses = root.querySelector('[data-count="campuses-on-map"]')?.textContent?.replace(/,/g, "");
  return { founders: Number(founders), campuses: Number(campuses) };
});
const report = {
  strip,
  fold,
  moreLabels: moreLabelsBefore,
  yearSum: year.sum,
  statusSum: status.sum,
  sectorCollapsed: sector.sum,
  sectorMore: sectorMore.sum,
  sectorCovered,
  sectorExpanded: sectorExpanded.sum,
  hqCollapsed: hq.sum,
  hqMore: hqMore.sum,
  hqCovered,
  hqExpanded: hqExpanded.sum,
  namedSectorVisible: sector.parts.filter((p) => !/not on record/i.test(p.label)).reduce((s, p) => s + p.count, 0),
  flags: flagCounts,
  ok: {
    year: year.sum === TOTAL,
    status: status.sum === TOTAL,
    sectorCollapsedPlusMore: sectorCovered === TOTAL,
    sectorExpanded: sectorExpanded.sum === TOTAL,
    hqCollapsedPlusMore: hqCovered === TOTAL,
    hqExpanded: hqExpanded.sum === TOTAL,
    flagsDiffer: newC != null && actC != null && newC !== actC,
    newIsFoundedYear: newC === 147,
    foundedLabel: flagCounts.some((f) => /founded in 2026/i.test(f.label)),
    activeIsTight: actC != null && actC < 50,
    countsAgree:
      strip != null &&
      fold != null &&
      strip.founders === fold.founders &&
      strip.campuses === fold.campuses &&
      strip.founders > 0 &&
      strip.campuses > 0,
    moreObvious: moreLabelsBefore.some((l) => /more sectors/i.test(l)) && moreLabelsBefore.some((l) => /more cities/i.test(l)),
  },
};

console.log(JSON.stringify(report, null, 2));
const fails = Object.entries(report.ok).filter(([, v]) => !v);
await browser.close();
if (fails.length) {
  console.error("FAIL", fails.map(([k]) => k).join(", "));
  process.exit(1);
}
console.log("PASS facet DOM sums ==", TOTAL);
