/**
 * Visible card density vs e100551 floor, plus fold overlay density vs 913f16a.
 * Fails if halfVisible or fully drops below the baked e100551 baseline
 * on companies / companies-more / company-sim at 375 and 1440.
 * Also fails if fold@375/@1440 peak / ranks / founder cards
 * drop below the baked 913f16a fold floor (r45 overlay).
 * At 375 the sheet starts as a compact map peek; density expands to deck mode first.
 *
 * BASE = candidate (default :3460)
 * CTRL_BASE = optional live e100551 for side-by-side reporting (does not
 *             replace the baked floor — live scroll can jitter).
 */
import { chromium } from "playwright";
import fs from "fs";

const BASE = (process.env.BASE || "http://127.0.0.1:3460").replace(/\/$/, "");
const CTRL_BASE = process.env.CTRL_BASE ? process.env.CTRL_BASE.replace(/\/$/, "") : "";
const OUT = process.env.OUT || "reviews/density.json";

const VIEWPORTS = [
  { name: "375", width: 375, height: 812 },
  { name: "1440", width: 1440, height: 900 },
];

/** Captured from e100551 with shoot-aligned positioning (stable run). */
const BAKED_E100551 = {
  "companies@375": { halfVisible: 2, fully: 2 },
  "companies-more@375": { halfVisible: 3, fully: 3 },
  "company-sim@375": { halfVisible: 3, fully: 3 },
  "companies@1440": { halfVisible: 3, fully: 2 },
  "companies-more@1440": { halfVisible: 2, fully: 2 },
  "company-sim@1440": { halfVisible: 4, fully: 4 },
};

/** Fold density at scrollY=0 from 913f16a (peak+ranks+bars in fold). Card floors
 *  match 913f16a desk rail when founders hydrate; r45 overlay must not go below. */
const BAKED_FOLD_913F16A = {
  "fold@375": { peak: 1, ranks: 1, bars: 1, founderCards: 1 },
  "fold@1440": { peak: 1, ranks: 1, bars: 1, founderCards: 2 },
};

const ROUTES = [
  {
    id: "companies",
    path: "/companies",
    selector: "[data-card-signals]",
    minH: 24,
    async position(page, vp) {
      await page.waitForSelector("[data-directory-ready='1']", { timeout: 60000 }).catch(() => {});
      await page.waitForSelector("[data-card-signals]", { timeout: 60000 });
      await page.waitForTimeout(800);
      await page.locator("#browse").scrollIntoViewIfNeeded().catch(() => {});
      if (vp === "375") {
        const hero = page.locator("[data-browse-mobile-hero]").first();
        if (await hero.count()) {
          await hero.evaluate((el) => el.scrollIntoView({ block: "start" }));
          await page.waitForTimeout(200);
          await page.evaluate(() => window.scrollBy(0, -40));
        }
      } else {
        const folio = page.locator("[data-sector-folio-desk], [data-browse-ledger]").first();
        if (await folio.count()) {
          await folio.evaluate((el) => el.scrollIntoView({ block: "start" }));
          await page.waitForTimeout(200);
          await page.evaluate(() => window.scrollBy(0, -120));
        }
      }
      await pinFirstCard(page, "[data-card-signals]", vp === "375" ? 360 : 420);
      await page.waitForTimeout(200);
    },
  },
  {
    id: "companies-more",
    path: "/companies?more=2",
    selector: "[data-card-signals]",
    minH: 24,
    async position(page, vp) {
      await page.waitForSelector("[data-directory-ready='1']", { timeout: 60000 }).catch(() => {});
      await page.waitForSelector("[data-card-signals]", { timeout: 60000 });
      await page.waitForTimeout(800);
      await page.locator("#browse").scrollIntoViewIfNeeded().catch(() => {});
      const chapter = page
        .locator("[data-chapter-window], [data-page-window], [data-mobile-continued-mast], [data-chapter-peak]")
        .first();
      if (await chapter.count()) {
        await chapter.evaluate((el) => el.scrollIntoView({ block: "start" }));
        await page.waitForTimeout(200);
        await page.evaluate((dy) => window.scrollBy(0, dy), vp === "375" ? -40 : -48);
      }
      await pinFirstCard(page, "[data-card-signals]", vp === "375" ? 200 : 400);
      await page.waitForTimeout(200);
    },
  },
  {
    id: "company-sim",
    path: "/startup/proj_9GUOmdEYxbuH",
    selectorFor: (vp) =>
      vp === "375" ? "[data-dossier-signal-timeline] > li" : "[data-dossier-wire] a[href*='/startup/']",
    minH: 16,
    async position(page, vp) {
      await page.waitForTimeout(1000);
      if (vp === "375") {
        await page.waitForSelector("[data-dossier-signal-timeline] > li", { timeout: 30000 });
        const hero = page.locator("[data-company-mobile-hero]").first();
        if (await hero.count()) {
          await hero.evaluate((el) => el.scrollIntoView({ block: "start" }));
          await page.waitForTimeout(250);
          await page.evaluate(() => {
            const name = document.querySelector("[data-company-name-lead]");
            if (!name) return;
            const top = name.getBoundingClientRect().top;
            if (top < 56) window.scrollBy(0, top - 64);
          });
        }
      } else {
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForSelector("[data-dossier-wire] a[href*='/startup/']", { timeout: 30000 });
      }
      await page.waitForTimeout(250);
    },
  },
];

async function pinFirstCard(page, selector, targetTop) {
  await page.evaluate(
    ({ sel, target }) => {
      const el = document.querySelector(sel);
      if (!el) return;
      const top = el.getBoundingClientRect().top;
      // If the first card is too low (below ~70% vh) or above sticky chrome, pin it.
      if (top > window.innerHeight * 0.72 || top < 80) {
        window.scrollBy(0, top - target);
      }
    },
    { sel: selector, target: targetTop },
  );
}

async function countVisible(page, selector, minH) {
  return page.evaluate(
    ({ sel, minH: mh }) => {
      const vh = window.innerHeight;
      const cards = [...document.querySelectorAll(sel)];
      const rows = cards.map((el, i) => {
        const r = el.getBoundingClientRect();
        const top = r.top;
        const bottom = r.bottom;
        const h = r.height;
        const intersecting = bottom > 0 && top < vh && h > mh;
        const visibleH = Math.max(0, Math.min(bottom, vh) - Math.max(top, 0));
        const fully = top >= 0 && bottom <= vh && h > mh;
        const halfVisible = intersecting && visibleH >= h * 0.5;
        return {
          i,
          top: Math.round(top),
          h: Math.round(h),
          fully,
          intersecting,
          halfVisible,
          visibleH: Math.round(visibleH),
        };
      });
      return {
        nDom: cards.length,
        fully: rows.filter((r) => r.fully).length,
        intersecting: rows.filter((r) => r.intersecting).length,
        halfVisible: rows.filter((r) => r.halfVisible).length,
        firstTop: rows.find((r) => r.intersecting)?.top ?? null,
        rows: rows.filter((r) => r.intersecting).slice(0, 8),
      };
    },
    { sel: selector, minH },
  );
}


async function measureFold(browser, base) {
  const out = {};
  for (const vp of VIEWPORTS) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
    await page.goto(`${base}/`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForSelector("[data-fold-peak-share], [data-fold-peak-figure], [data-founder-search]", { timeout: 30000 }).catch(() => {});
    // Wait for founder cards when the index hydrates (overlay peek / rail).
    await page.waitForSelector("[data-founder-card]", { timeout: 45000 }).catch(() => {});
    await page.waitForTimeout(800);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(200);
    // r53b: rest state is a compact peek for map clearance; expand to deck for fold density.
    if (vp.name === "375") {
      const expand = page.locator("[data-fold-sheet-expand]").first();
      if (await expand.count()) {
        await expand.click({ force: true }).catch(() => {});
        await page.waitForTimeout(500);
        // If spring/sticky chrome blocked the tap, snap the sheet to deck height.
        const mode = await page.evaluate(() => document.querySelector("[data-fold-map-sheet]")?.getAttribute("data-fold-sheet-mode"));
        if (mode === "peek") {
          await page.evaluate(() => {
            const btn = document.querySelector("[data-fold-sheet-expand]");
            btn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
          });
          await page.waitForTimeout(300);
        }
      } else {
        await page.evaluate(() => {
          const sheet = document.querySelector("[data-fold-map-sheet]");
          if (sheet) sheet.style.height = "300px";
          sheet?.setAttribute("data-fold-sheet-mode", "deck");
        });
        await page.waitForTimeout(400);
      }
      await page.waitForSelector('[data-fold-sheet-mode="deck"], [data-fold-sheet-mode="expanded"], [data-founder-deck]', { timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(300);
    }
    const m = await page.evaluate(() => {
      const vh = window.innerHeight;
      const vis = (el) => {
        if (!el) return false;
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return (
          r.height > 8 &&
          r.width > 8 &&
          r.top < vh - 4 &&
          r.bottom > 8 &&
          cs.visibility !== "hidden" &&
          cs.display !== "none" &&
          Number(cs.opacity || "1") > 0.05
        );
      };
      const peak = [...document.querySelectorAll("[data-fold-peak-share], [data-fold-peak-figure]")].some(vis) ? 1 : 0;
      const ranks = [...document.querySelectorAll("[data-fold-peak-campus-rank], [data-fold-peak-campus-rank-mobile], [data-fold-top-campuses-desk]")].some(vis) ? 1 : 0;
      const bars = [...document.querySelectorAll("[data-fold-peak-month-bars]")].some(vis) ? 1 : 0;
      const founderCards = [...document.querySelectorAll("[data-founder-card]")].filter(vis).length;
      return { peak, ranks, bars, founderCards };
    });
    const key = `fold@${vp.name}`;
    out[key] = m;
    console.log(`${base} ${key} peak=${m.peak} ranks=${m.ranks} bars=${m.bars} founderCards=${m.founderCards}`);
    await page.close();
  }
  return out;
}

async function measureBuild(browser, base) {
  const out = {};
  for (const vp of VIEWPORTS) {
    for (const route of ROUTES) {
      const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
      await page.goto(`${base}${route.path}`, { waitUntil: "networkidle", timeout: 90000 });
      await route.position(page, vp.name);
      const selector = route.selectorFor ? route.selectorFor(vp.name) : route.selector;
      const m = await countVisible(page, selector, route.minH ?? 24);
      const key = `${route.id}@${vp.name}`;
      out[key] = { ...m, selector, path: route.path };
      console.log(
        `${base} ${key} half=${m.halfVisible} fully=${m.fully} intersecting=${m.intersecting} firstTop=${m.firstTop}`,
      );
      await page.close();
    }
  }
  return out;
}

const browser = await chromium.launch({ headless: true });
const baseline = { ...BAKED_E100551 };
const baselineSource = "baked-e100551";

let controlLive = null;
if (CTRL_BASE) {
  console.log(`Measuring control (report only) ${CTRL_BASE} …`);
  controlLive = await measureBuild(browser, CTRL_BASE);
}

console.log(`Measuring candidate ${BASE} …`);
const candidate = await measureBuild(browser, BASE);
console.log(`Measuring fold density ${BASE} …`);
const foldCandidate = await measureFold(browser, BASE);
await browser.close();

const comparisons = [];
let ok = true;
for (const key of Object.keys(baseline)) {
  const floor = baseline[key];
  const cand = candidate[key];
  const ctrl = controlLive?.[key] || null;
  if (!cand) {
    ok = false;
    comparisons.push({ key, ok: false, detail: "missing candidate measurement" });
    console.log(`FAIL ${key}: missing candidate`);
    continue;
  }
  const halfOk = cand.halfVisible >= floor.halfVisible;
  const fullyOk = cand.fully >= floor.fully;
  const pass = halfOk && fullyOk;
  if (!pass) ok = false;
  const ctrlBit = ctrl ? ` | ctrlLive half=${ctrl.halfVisible} fully=${ctrl.fully}` : "";
  const detail = `cand half=${cand.halfVisible} fully=${cand.fully} | floor half=${floor.halfVisible} fully=${floor.fully}${ctrlBit}`;
  comparisons.push({ key, ok: pass, halfOk, fullyOk, candidate: cand, floor, controlLive: ctrl, detail });
  console.log(`${pass ? "PASS" : "FAIL"} ${key}: ${detail}`);
}

const foldBaseline = { ...BAKED_FOLD_913F16A };
const foldComparisons = [];
for (const key of Object.keys(foldBaseline)) {
  const floor = foldBaseline[key];
  const cand = foldCandidate[key];
  if (!cand) {
    ok = false;
    foldComparisons.push({ key, ok: false, detail: "missing fold measurement" });
    console.log(`FAIL ${key}: missing fold measurement`);
    continue;
  }
  const peakOk = cand.peak >= floor.peak;
  const ranksOk = cand.ranks >= floor.ranks;
  const barsOk = cand.bars >= floor.bars;
  const cardsOk = cand.founderCards >= floor.founderCards;
  const pass = peakOk && ranksOk && barsOk && cardsOk;
  if (!pass) ok = false;
  const detail = `cand peak=${cand.peak} ranks=${cand.ranks} bars=${cand.bars} cards=${cand.founderCards} | floor peak=${floor.peak} ranks=${floor.ranks} bars=${floor.bars} cards=${floor.founderCards}`;
  foldComparisons.push({ key, ok: pass, peakOk, ranksOk, barsOk, cardsOk, candidate: cand, floor, detail });
  console.log(`${pass ? "PASS" : "FAIL"} ${key}: ${detail}`);
}

const report = {
  ok,
  base: BASE,
  baselineSource,
  baseline,
  foldBaseline,
  foldBaselineSource: "baked-913f16a",
  controlLive,
  controlBase: CTRL_BASE || null,
  candidate,
  foldCandidate,
  comparisons,
  foldComparisons,
};
fs.mkdirSync(OUT.includes("/") ? OUT.replace(/\/[^/]+$/, "") : ".", { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ok, wrote: OUT, failed: [...comparisons, ...foldComparisons].filter((c) => !c.ok).map((c) => c.key) }, null, 2));
process.exit(ok ? 0 : 1);
