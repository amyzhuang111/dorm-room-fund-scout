/**
 * Read ONE visible FacetRail's rendered pills; every facet group must sum to 2513.
 * Usage: BASE=http://127.0.0.1:3460 node scripts/check-facet-dom.mjs
 */
import { chromium } from "playwright";

const BASE = process.env.BASE || "http://127.0.0.1:3460";
const TOTAL = 2513;
/** Directory sampleSurfaceCounts.foundersListed / campusesOnMap — must match strip + fold. */
const EXPECTED_FOUNDERS_LISTED = 2766;
const EXPECTED_CAMPUSES_ON_MAP = 74;
/** Chronograph honesty: window + earlierValid + undatedMonth = dated (verified from loadDirectory). */
const EXPECTED_CHRONO_WINDOW = 588;
const EXPECTED_CHRONO_EARLIER = 13; // pre-window with real month
const EXPECTED_CHRONO_MONTH_UNKNOWN = 34; // e.g. 2026-00-00 — year only, not "earlier"
const EXPECTED_CHRONO_DATED = 635; // 588 + 13 + 34
const EXPECTED_CHRONO_PEAK = 369;
const EXPECTED_CHRONO_PEAK_MONTH = "2026-09";
/** Programs[] membership — every on-page YC universe figure must match (labelled in YC). */
const EXPECTED_YC_MEMBERSHIP = 564;
/** Campus plates sitewide: founder names on record (not signals / not companies). */
const EXPECTED_CAMPUS_FOUNDERS_TOP = [
  { founders: 757, nameRe: /penn|pennsylvania/i },
  { founders: 300, nameRe: /stanford/i },
  { founders: 238, nameRe: /mit|massachusetts institute/i },
];

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

async function readChrono(page) {
  return page.evaluate(() => {
    const root =
      document.querySelector("[data-fold-chronograph] [data-scout-chronograph]") ||
      document.querySelector('[data-scout-chronograph="hero"]') ||
      document.querySelector("[data-scout-chronograph]");
    if (!root) return null;
    return {
      peak: Number(root.getAttribute("data-chrono-peak") || 0),
      peakMonth: root.getAttribute("data-chrono-peak-month") || "",
      dated: Number(root.getAttribute("data-chrono-dated") || 0),
      earlier: Number(root.getAttribute("data-chrono-earlier") || 0),
      monthUnknown: Number(root.getAttribute("data-chrono-month-unknown") || 0),
      inWindow: Number(root.getAttribute("data-chrono-window") || 0),
      lead: root.getAttribute("data-chrono-lead") || "",
      caption: (root.querySelector("[data-chrono-caption]")?.textContent || "").replace(/\s+/g, " ").trim(),
      earlierBar: Boolean(root.querySelector('[data-chrono-bar="earlier"]')),
      unknownBar: Boolean(root.querySelector('[data-chrono-bar="month-unknown"]')),
      truncatedStub: /\bEar\b/.test(root.textContent || "") || /\bUnk\b/.test(root.textContent || ""),
      earlierCaption: /\d[\d,]* earlier\b/.test((root.querySelector("[data-chrono-caption]")?.textContent || "").replace(/\s+/g, " ")),
      undatedCaption: /\d[\d,]* undated\b/.test((root.querySelector("[data-chrono-caption]")?.textContent || "").replace(/\s+/g, " ")),
    };
  });
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(`${BASE}/?sample=1`, { waitUntil: "networkidle", timeout: 90000 });
await page.waitForSelector('[data-directory-ready="1"]', { timeout: 60000 });
await page.waitForTimeout(800);
// Chronograph lives on the closed fold; filters-open invite replaces it — read honesty first.
const chrono = await readChrono(page);
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

const statusRows = sumRows(await collect(page, "status"));
const statusActive = statusRows.parts.find((p) => /^Active\b/i.test(p.label))?.count ?? null;
const statusAcquired = statusRows.parts.find((p) => /^Acquired\b/i.test(p.label))?.count ?? null;
const statusClosed = statusRows.parts.find((p) => /^Closed\b/i.test(p.label))?.count ?? null;


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
/** Desk constellation / campus plates — must be founders-ranked (Penn 757 / Stanford 300 / MIT 238). */
const campusFoundersTop = await page.evaluate(() => {
  const root =
    document.querySelector("[data-campus-founders-top]") ||
    document.querySelector('[data-desk-constellation][data-campus-metric="founders"] ol');
  if (!root) return null;
  const rows = [...root.querySelectorAll("li")].slice(0, 3).map((li) => {
    const text = (li.textContent || "").replace(/\s+/g, " ").trim();
    const nums = [...text.matchAll(/(\d[\d,]*)/g)].map((m) => Number(m[1].replace(/,/g, "")));
    // Prefer the founders figure (last substantial numeral beside unit).
    const founders = nums.length ? nums[nums.length - 1] : null;
    return { text, founders };
  });
  const metric = document.querySelector("[data-campus-metric]")?.getAttribute("data-campus-metric") || null;
  return { metric, rows };
});

const ycMembershipNodes = await page.evaluate(() => {
  return [...document.querySelectorAll("[data-yc-membership-count]")].map((el) => ({
    count: Number(String(el.getAttribute("data-yc-membership-count") || "").replace(/,/g, "")),
    text: (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 40),
  }));
});
const ycMembershipOk =
  ycMembershipNodes.length > 0 &&
  ycMembershipNodes.every((n) => n.count === EXPECTED_YC_MEMBERSHIP);
const ycPrimaryLeak = await page.evaluate(() => {
  // Fail if a visible Y Combinator row still shows the primary-only 561 universe total.
  const hits = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walker.nextNode())) {
    const t = (n.textContent || "").trim();
    if (t !== "561") continue;
    let el = n.parentElement;
    let ctx = "";
    for (let i = 0; i < 4 && el; i++) {
      ctx += " " + (el.textContent || "");
      el = el.parentElement;
    }
    if (/y\s*combinator/i.test(ctx)) hits.push(ctx.replace(/\s+/g, " ").trim().slice(0, 120));
  }
  return hits;
});

const campusFoundersTopOk =
  campusFoundersTop != null &&
  campusFoundersTop.metric === "founders" &&
  campusFoundersTop.rows.length === 3 &&
  EXPECTED_CAMPUS_FOUNDERS_TOP.every((exp, i) => {
    const row = campusFoundersTop.rows[i];
    return row && row.founders === exp.founders && exp.nameRe.test(row.text);
  });
const report = {
  strip,
  fold,
  campusFoundersTop,
  ycMembershipNodes,
  ycPrimaryLeak,
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
  statusActive,
  statusAcquired,
  statusClosed,
  statusSumBuckets: (statusActive ?? 0) + (statusAcquired ?? 0) + (statusClosed ?? 0),
  flags: flagCounts,
  chrono,
  ok: {
    year: year.sum === TOTAL,
    status: status.sum === TOTAL,
    sectorCollapsedPlusMore: sectorCovered === TOTAL,
    sectorExpanded: sectorExpanded.sum === TOTAL,
    hqCollapsedPlusMore: hqCovered === TOTAL,
    hqExpanded: hqExpanded.sum === TOTAL,
    flagsDiffer: newC != null && actC != null && newC !== actC,
    newIsFoundedYear: newC === 213,
    foundedLabel: flagCounts.some((f) => /founded in 2026/i.test(f.label)),
    activeIsTight: actC != null && actC < 50,
    countsAgree:
      strip != null &&
      fold != null &&
      strip.founders === fold.founders &&
      strip.campuses === fold.campuses &&
      strip.founders === EXPECTED_FOUNDERS_LISTED &&
      fold.founders === EXPECTED_FOUNDERS_LISTED &&
      strip.campuses === EXPECTED_CAMPUSES_ON_MAP &&
      fold.campuses === EXPECTED_CAMPUSES_ON_MAP,
    statusBuckets:
      statusActive === 2497 && statusAcquired === 8 && statusClosed === 8 && statusActive + statusAcquired + statusClosed === TOTAL,
    moreObvious: moreLabelsBefore.some((l) => /more sectors/i.test(l)) && moreLabelsBefore.some((l) => /more cities/i.test(l)),
    chronographPeak369: chrono != null && chrono.peak === EXPECTED_CHRONO_PEAK && chrono.peakMonth === EXPECTED_CHRONO_PEAK_MONTH,
    chronographWindow588: chrono != null && chrono.inWindow === EXPECTED_CHRONO_WINDOW,
    chronographEarlier13: chrono != null && chrono.earlier === EXPECTED_CHRONO_EARLIER,
    chronographMonthUnknown34: chrono != null && chrono.monthUnknown === EXPECTED_CHRONO_MONTH_UNKNOWN,
    chronographDated635: chrono != null && chrono.dated === EXPECTED_CHRONO_DATED,
    chronographBarsSumDated:
      chrono != null && chrono.inWindow + chrono.earlier + chrono.monthUnknown === chrono.dated,
    chronographNoGap:
      chrono != null &&
      chrono.inWindow + chrono.earlier + chrono.monthUnknown === EXPECTED_CHRONO_DATED &&
      EXPECTED_CHRONO_WINDOW + EXPECTED_CHRONO_EARLIER + EXPECTED_CHRONO_MONTH_UNKNOWN === EXPECTED_CHRONO_DATED,
    chronographEarlierVisible: chrono != null && chrono.earlierCaption === true && chrono.earlierBar === false,
    chronographMonthUnknownVisible: chrono != null && chrono.undatedCaption === true && chrono.unknownBar === false,
    chronographLabelsUntruncated: chrono != null && chrono.truncatedStub === false,
    campusFoundersTopPennStanfordMit: campusFoundersTopOk,
    ycMembershipEverywhere: ycMembershipOk,
    ycNoPrimary561Leak: ycPrimaryLeak.length === 0,
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
