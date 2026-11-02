/**
 * Read ONE visible FacetRail's rendered pills; every facet group must sum to 2599.
 * Usage: BASE=http://127.0.0.1:3460 node scripts/check-facet-dom.mjs
 */
import { chromium } from "playwright";

const BASE = process.env.BASE || "http://127.0.0.1:3460";
const TOTAL = 2599;
/** Directory sampleSurfaceCounts.foundersListed / campusesOnMap — must match strip + fold. */
const EXPECTED_FOUNDERS_LISTED = 2946;
const EXPECTED_FOUNDERS_INDEXED = 3115;
const EXPECTED_CAMPUSES_ON_MAP = 74;
/** Chronograph honesty: window + earlierValid + undatedMonth = dated (verified from loadDirectory). */
const EXPECTED_CHRONO_WINDOW = 223;
const EXPECTED_CHRONO_EARLIER = 12; // pre-window with real month
const EXPECTED_CHRONO_MONTH_UNKNOWN = 34; // e.g. 2026-00-00 — year only, not "earlier"
const EXPECTED_CHRONO_DATED = 269; // 223 + 12 + 34 (source_date only)
const EXPECTED_CHRONO_PEAK = 109;
const EXPECTED_CHRONO_PEAK_MONTH = "2026-04";
/** Programs[] membership — every on-page YC universe figure must match (labelled in YC). */
const EXPECTED_YC_MEMBERSHIP = 564;
/** Campus plates sitewide: founder names on record (not signals / not companies). */
const EXPECTED_CAMPUS_FOUNDERS_TOP = [
  { founders: 760, nameRe: /penn|pennsylvania/i },
  { founders: 300, nameRe: /stanford/i },
  { founders: 245, nameRe: /berkeley/i },
  { founders: 238, nameRe: /mit|massachusetts institute/i },
  { founders: 173, nameRe: /harvard/i },
  { founders: 156, nameRe: /columbia/i },
  { founders: 101, nameRe: /carnegie|cmu/i },
  { founders: 86, nameRe: /waterloo/i },
  { founders: 84, nameRe: /cornell/i },
  { founders: 77, nameRe: /georgia|gatech/i },
];
const EXPECTED_CAMPUS_FOUNDERS_VISIBLE = 10;

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

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_PATH || undefined,
  args: process.env.CHROME_PATH ? ["--no-sandbox", "--disable-dev-shm-usage"] : [],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(`${BASE}/`, { waitUntil: "networkidle", timeout: 90000 });
await page.waitForSelector('[data-directory-ready="1"]', { timeout: 60000 });
await page.waitForSelector("[data-founder-search]", { timeout: 20000 });
await page.waitForSelector("[data-founder-card]", { timeout: 20000 });
await page.waitForSelector('[data-globe-state="ready"]', { timeout: 45000 });
await page.waitForTimeout(400);

const founderHome = await page.evaluate(() => {
  const search = document.querySelectorAll("[data-founder-search] input");
  const text = document.body.innerText || "";
  const globe = document.querySelector("[data-dispatch-map-stage]");
  const whyNodes = [...document.querySelectorAll("[data-why-worth]")].slice(0, 8).map((el) => ({
    text: (el.textContent || "").replace(/\s+/g, " ").trim(),
    blank: el.getAttribute("data-why-blank") === "1",
  }));
  const foldIndexed = document.querySelector('[data-fold-counts] [data-count="founders-indexed"]')?.textContent?.replace(/,/g, "");
  const stripIndexed = document.querySelector('[data-sample-strip-counts] [data-count="founders-indexed"]')?.textContent?.replace(/,/g, "");
  const countryLegend = /United States.*Canada.*United Kingdom/s.test(globe?.textContent || "");
  return {
    searchInputs: search.length,
    results: Boolean(document.querySelector("[data-founder-results]")),
    cards: document.querySelectorAll("[data-founder-card]").length,
    why: whyNodes[0]?.text || "",
    whyNodes,
    browse: Boolean(document.querySelector("#browse")),
    demoWord: /\bdemo\b/i.test(text),
    globeState: globe?.getAttribute("data-globe-state") || null,
    loadingGlobeCopy: /loading globe/i.test(globe?.textContent || ""),
    earUnkStub: /\bEar\b/.test(text) || /\bUnk\b/.test(text),
    jargon: /\b(chronograph|constellation|folio|wireframe|LCP|TTFB)\b/i.test(text),
    filters: Boolean(document.querySelector("[data-founder-filters]")),
    chronograph: Boolean(document.querySelector("[data-scout-chronograph]")),
    foundersIndexedFold: foldIndexed ? Number(foldIndexed) : null,
    foundersIndexedStrip: stripIndexed ? Number(stripIndexed) : null,
    countNote: Boolean(document.querySelector("[data-founder-count-note]")),
    countryLegend,
    samplePillAbsent: document.querySelector("[data-sample-pill]") == null,
  };
});
await page.locator("[data-campus-founders-top] button").first().click();
await page.waitForURL(/[?&]campus=/, { timeout: 10000 });
await page.waitForTimeout(300);
const campusFilter = await page.evaluate(() => {
  const text = (document.querySelector("[data-founder-results]")?.textContent || "").replace(/\s+/g, " ");
  return { url: location.search, text: text.slice(0, 180), clear: /Clear campus/.test(text) };
});

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
/** Top campuses — must be founders-ranked (Penn 757 / Stanford 300 / MIT 238). */
const campusFoundersTop = await page.evaluate(() => {
  const root =
    document.querySelector("[data-campus-founders-top]") ||
    document.querySelector('[data-desk-constellation][data-campus-metric="founders"] ol');
  if (!root) return null;
  const rows = [...root.querySelectorAll("li")].slice(0, 10).map((li) => {
    const text = (li.textContent || "").replace(/\s+/g, " ").trim();
    const nums = [...text.matchAll(/(\d[\d,]*)/g)].map((m) => Number(m[1].replace(/,/g, "")));
    const founders = nums.length ? nums[nums.length - 1] : null;
    return { text, founders };
  });
  const metric = document.querySelector("[data-campus-metric]")?.getAttribute("data-campus-metric") || null;
  return { metric, rows };
});

const campusAllLink = await page.evaluate(() => {
  const el = document.querySelector("[data-campus-founders-all]");
  return el ? (el.textContent || "").replace(/\s+/g, " ").trim() : null;
});
const campusAllOk = campusAllLink != null && /all campuses/i.test(campusAllLink);


// Mobile: founder search/filters/cards must sit above the map.
const mobile = await browser.newPage({ viewport: { width: 375, height: 812 } });
await mobile.goto(`${BASE}/`, { waitUntil: "networkidle", timeout: 90000 });
await mobile.waitForSelector('[data-directory-ready="1"]', { timeout: 60000 });
await mobile.waitForSelector("[data-founder-filters]", { timeout: 20000 });
await mobile.waitForSelector('[data-globe-state="ready"]', { timeout: 45000 });
const mobileOrder = await mobile.evaluate(() => {
  const filters = document.querySelector("[data-founder-filters]");
  const card = document.querySelector("[data-founder-card]");
  const map = document.querySelector("[data-dispatch-map-stage]");
  const ft = filters?.getBoundingClientRect().top ?? 9999;
  const ct = card?.getBoundingClientRect().top ?? 9999;
  const mt = map?.getBoundingClientRect().top ?? 0;
  return { filtersAboveMap: ft < mt, cardAboveMap: ct < mt, ft, ct, mt };
});
await mobile.close();


// Desk 1440: founder cards must clear the fold (beside or under a short globe).
const desk = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await desk.goto(`${BASE}/`, { waitUntil: "networkidle", timeout: 90000 });
await desk.waitForSelector('[data-directory-ready="1"]', { timeout: 60000 });
await desk.waitForSelector("[data-founder-card]", { timeout: 20000 });
await desk.waitForSelector('[data-globe-state="ready"]', { timeout: 45000 });
const deskFold = await desk.evaluate(() => {
  const card = document.querySelector("[data-founder-card]");
  const map = document.querySelector("[data-dispatch-map-stage]");
  const note = document.querySelector("[data-founder-count-note]");
  const text = document.body.innerText || "";
  const noteText = (note?.textContent || "").replace(/\s+/g, " ").trim();
  const cr = card?.getBoundingClientRect();
  const mr = map?.getBoundingClientRect();
  const dashRe = /[\u2014\u2013]/;
  return {
    cardTop: cr?.top ?? 9999,
    cardBottom: cr?.bottom ?? 9999,
    mapTop: mr?.top ?? 9999,
    mapBottom: mr?.bottom ?? 9999,
    cardAboveFold: (cr?.top ?? 9999) < 900 && (cr?.bottom ?? 9999) > 0,
    emDashInUi: dashRe.test(text),
    emDashInFounderNote: dashRe.test(noteText),
    founderNote: noteText,
  };
});
await desk.close();

await page.goto(`${BASE}/companies`, { waitUntil: "networkidle", timeout: 90000 });
await page.waitForSelector('[data-directory-ready="1"]', { timeout: 60000 });
await page.waitForTimeout(400);
const chrono = await readChrono(page);
const companiesLabels = await page.evaluate(() => {
  const text = document.body.innerText || "";
  const landed = document.querySelector("[data-signals-landed]");
  const months = landed ? [...landed.querySelectorAll("[data-signal-month]")].map((el) => el.getAttribute("data-signal-month")) : [];
  return {
    emDashInUi: /[\u2014\u2013]/.test(text),
    earUnkStub: /\bEar\b/.test(text) || /\bUnk\b/.test(text),
    jargon: /\b(chronograph|constellation|folio|wireframe|LCP|TTFB)\b/i.test(text),
    chronoPresent: Boolean(document.querySelector("[data-scout-chronograph]")),
    signalsLanded: Boolean(landed),
    signalMonths: months,
    signalsAside: (landed?.querySelector("[data-signals-landed-aside]")?.textContent || "").replace(/\s+/g, " ").trim(),
    emDashInSignalsAside: /[\u2014\u2013]/.test((landed?.querySelector("[data-signals-landed-aside]")?.textContent || "")),
    peak: landed?.getAttribute("data-chrono-peak") || null,
    peakMonth: landed?.getAttribute("data-chrono-peak-month") || null,
    window: Number(landed?.getAttribute("data-chrono-window") || 0),
    earlier: Number(landed?.getAttribute("data-chrono-earlier") || 0),
    monthUnknown: Number(landed?.getAttribute("data-chrono-month-unknown") || 0),
    dated: Number(landed?.getAttribute("data-chrono-dated") || 0),
  };
});
// Continued mast (mobile): page signaled count must match cards with signals>0 (not dated/source_date).
const moreMobile = await browser.newPage({ viewport: { width: 375, height: 812 } });
await moreMobile.goto(`${BASE}/companies?more=2`, { waitUntil: "networkidle", timeout: 90000 });
await moreMobile.waitForSelector('[data-directory-ready="1"]', { timeout: 60000 });
await moreMobile.waitForSelector("[data-mobile-continued-mast]", { timeout: 20000 });
const pageSignalMast = await moreMobile.evaluate(() => {
  const mast = document.querySelector("[data-mobile-continued-mast]");
  const shownRaw = (document.querySelector("[data-page-signaled-count]")?.textContent || "").replace(/,/g, "").trim();
  const shown = Number(shownRaw);
  const rows = [...document.querySelectorAll("[data-ledger-stage] a[data-card-signals]")];
  const withSignal = rows.filter((el) => Number(el.getAttribute("data-card-signals") || 0) > 0).length;
  const withDated = rows.filter((el) => el.getAttribute("data-card-dated") === "1").length;
  const text = (mast?.textContent || "").replace(/\s+/g, " ");
  return {
    shown,
    withSignal,
    withDated,
    rowCount: rows.length,
    hasSignalCopy: /have a signal/.test(text),
    hasDatedCopy: /dated signal/.test(text),
  };
});
await moreMobile.close();

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
  campusFoundersTop.rows.length === EXPECTED_CAMPUS_FOUNDERS_VISIBLE &&
  EXPECTED_CAMPUS_FOUNDERS_TOP.every((exp, i) => {
    const row = campusFoundersTop.rows[i];
    return row && row.founders === exp.founders && exp.nameRe.test(row.text);
  });
const report = {
  strip,
  fold,
  founderHome,
  mobileOrder,
  campusFilter,
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
  companiesLabels,
  pageSignalMast,
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
    founderSearch: founderHome.searchInputs === 1 && founderHome.results && founderHome.cards > 0,
    founderWhyAddsNewInfo:
      founderHome.whyNodes.length > 0 &&
      founderHome.whyNodes.every((node) => {
        if (node.blank || !node.text || node.text === "Why worth a look blank") return true;
        const body = node.text.replace(/^Why worth a look\s*/i, "").trim();
        // Must not dump campus / company / class year / sector already on the card.
        return body.length > 0 && !/\bclass of\b/i.test(body) && !/\b(Fintech|Enterprise SaaS)\b/i.test(body);
      }) &&
      founderHome.whyNodes.some((node) => !node.blank && /Why worth a look/i.test(node.text)),
    founderCampusFilter: campusFilter.clear && /campus=/.test(campusFilter.url) && / at /.test(campusFilter.text),
    mapHasNoCompanyBrowse: founderHome.browse === false,
    noDemoWord: founderHome.demoWord === false,
    foundersIndexedReconciled:
      founderHome.foundersIndexedFold === EXPECTED_FOUNDERS_INDEXED &&
      founderHome.foundersIndexedStrip === EXPECTED_FOUNDERS_INDEXED &&
      founderHome.countNote === true,
    noCountryLegend: founderHome.countryLegend === false,
    samplePillAbsent: founderHome.samplePillAbsent === true,
    pageSignaledMatchesCards:
      pageSignalMast.hasSignalCopy === true &&
      pageSignalMast.hasDatedCopy === false &&
      pageSignalMast.shown === pageSignalMast.withSignal &&
      pageSignalMast.rowCount > 0,
    mobileFoundersAboveMap: mobileOrder.filtersAboveMap && mobileOrder.cardAboveMap,
    deskFoundersAboveFold1440: deskFold.cardAboveFold === true,
    noEmDashInUi:
      deskFold.emDashInUi === false &&
      deskFold.emDashInFounderNote === false &&
      companiesLabels.emDashInUi === false &&
      companiesLabels.emDashInSignalsAside === false,
    statusBuckets:
      statusActive === 2583 && statusAcquired === 8 && statusClosed === 8 && statusActive + statusAcquired + statusClosed === TOTAL,
    moreObvious: moreLabelsBefore.some((l) => /more sectors/i.test(l)) && moreLabelsBefore.some((l) => /more cities/i.test(l)),
    campusAllCampusesExpand: campusAllOk,
    campusFoundersTopTen: campusFoundersTopOk,
    ycMembershipEverywhere: ycMembershipOk,
    ycNoPrimary561Leak: ycPrimaryLeak.length === 0,
    globeReadyNoSkeleton: founderHome.globeState === "ready" && founderHome.loadingGlobeCopy === false,
    founderFiltersPresent: founderHome.filters === true,
    earUnkRemoved:
      founderHome.earUnkStub === false &&
      companiesLabels.earUnkStub === false &&
      (chrono == null || chrono.truncatedStub === false),
    plainLabelsNoJargon: founderHome.jargon === false && companiesLabels.jargon === false,
    chronographGoneFromHome: founderHome.chronograph === false,
    // Chronograph left the product surface; if remounted, honesty counts must hold.
    chronographHonestyIfPresent:
      chrono == null ||
      (chrono.peak === EXPECTED_CHRONO_PEAK &&
        chrono.peakMonth === EXPECTED_CHRONO_PEAK_MONTH &&
        chrono.inWindow === EXPECTED_CHRONO_WINDOW &&
        chrono.earlier === EXPECTED_CHRONO_EARLIER &&
        chrono.monthUnknown === EXPECTED_CHRONO_MONTH_UNKNOWN &&
        chrono.dated === EXPECTED_CHRONO_DATED &&
        chrono.inWindow + chrono.earlier + chrono.monthUnknown === chrono.dated &&
        chrono.earlierBar === false &&
        chrono.unknownBar === false),
    signalsLandedPlain:
      companiesLabels.signalsLanded === true &&
      companiesLabels.signalMonths.length > 0 &&
      companiesLabels.signalMonths.every((id) => /^\d{4}-\d{2}$/.test(id) && !id.endsWith("-00")) &&
      !/\bEar\b|\bUnk\b/.test(companiesLabels.signalsAside || "") &&
      Number(companiesLabels.peak) === EXPECTED_CHRONO_PEAK &&
      companiesLabels.peakMonth === EXPECTED_CHRONO_PEAK_MONTH &&
      companiesLabels.window === EXPECTED_CHRONO_WINDOW &&
      companiesLabels.earlier === EXPECTED_CHRONO_EARLIER &&
      companiesLabels.monthUnknown === EXPECTED_CHRONO_MONTH_UNKNOWN &&
      companiesLabels.dated === EXPECTED_CHRONO_DATED &&
      companiesLabels.window + companiesLabels.earlier + companiesLabels.monthUnknown === companiesLabels.dated,
  },
};

console.log(JSON.stringify(report, null, 2));
const fails = Object.entries(report.ok).filter(([, v]) => !v);

// --- Full-record company profile + /data corpus explorer ---
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(`${BASE}/startup/proj_9GUOmdEYxbuH`, { waitUntil: "networkidle", timeout: 90000 });
  const full = await page.locator("[data-company-full-record]").count();
  if (!full) {
    console.error("FAIL company full record panel missing");
    process.exitCode = 1;
  } else {
    const na = await page.locator("[data-company-full-record]").first().innerText();
    if (!/Not available/i.test(na) && !/Full record/i.test(na)) {
      console.error("FAIL full record empty of expected copy");
      process.exitCode = 1;
    } else {
      console.log("OK company full record panel");
    }
  }
  const signalSource = await page.locator("[data-full-record-signals] a[href^=\"http\"]").count();
  console.log(`OK full-record signal source links: ${signalSource}`);
  await page.goto(`${BASE}/data`, { waitUntil: "networkidle", timeout: 90000 });
  const explorer = await page.locator("[data-corpus-explorer]").count();
  const csv = await page.locator("[data-corpus-csv]").count();
  const navData = await page.locator('a[href="/data"], a[href^="/data?"]').count();
  if (!explorer) {
    console.error("FAIL /data corpus explorer missing");
    process.exitCode = 1;
  } else {
    console.log("OK /data corpus explorer");
  }
  if (!csv) {
    console.error("FAIL /data CSV download missing");
    process.exitCode = 1;
  } else {
    console.log("OK /data CSV download");
  }
  if (!navData) {
    console.error("FAIL nav Data link missing on /data");
    process.exitCode = 1;
  } else {
    console.log("OK nav Data link present");
  }
  const html = await page.content();
  const kb = Buffer.byteLength(html, "utf8") / 1024;
  console.log(`/data HTML ${kb.toFixed(1)} KB`);
  if (kb > 210) {
    console.error("FAIL /data HTML over 210 KB");
    process.exitCode = 1;
  }
  await page.close();
}

await browser.close();
if (fails.length) {
  console.error("FAIL", fails.map(([k]) => k).join(", "));
  process.exit(1);
}
console.log("PASS facet DOM sums ==", TOTAL);
