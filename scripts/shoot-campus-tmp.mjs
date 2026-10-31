import { chromium } from "playwright";
import fs from "fs";

const BASE = process.env.BASE || "http://127.0.0.1:3460";
const OUT = process.env.OUT || "/workspace/reviews/shots/campus-scout/wip";
fs.mkdirSync(OUT, { recursive: true });

async function shot(page, name) {
  const path = `${OUT}/${name}.png`;
  await page.screenshot({ path, fullPage: false });
  console.log("wrote", path);
}

async function waitDirectory(page) {
  await page.waitForSelector('[data-directory-ready="1"]', { timeout: 60000 }).catch(() => {});
}

/** Fold shots must wait for MapLibre idle → data-globe-state=ready (no LOADING GLOBE). */
async function waitGlobeIdle(page) {
  await page.waitForSelector('[data-globe-state="ready"]', { timeout: 45000 });
  // One extra paint after ready so cream fill + dots settle.
  await page.waitForTimeout(400);
  const state = await page.evaluate(() => {
    const stage = document.querySelector("[data-dispatch-map-stage]");
    const text = (stage?.textContent || "").replace(/\s+/g, " ");
    return {
      attr: stage?.getAttribute("data-globe-state") || null,
      loadingCopy: /loading globe/i.test(text),
    };
  });
  if (state.attr !== "ready" || state.loadingCopy) {
    throw new Error(`globe not idle for shot: ${JSON.stringify(state)}`);
  }
}

async function openBrowseFilters(page) {
  const browse = page.locator("#browse");
  await browse.scrollIntoViewIfNeeded().catch(() => {});
  const filters = browse.getByRole("button", { name: /^Filters$/ }).first();
  if ((await filters.count()) && (await filters.isVisible().catch(() => false))) {
    await filters.click();
    await page.waitForTimeout(700);
    return;
  }
  const openBtn = browse.getByRole("button", { name: /filters/i }).first();
  if ((await openBtn.count()) && (await openBtn.isVisible().catch(() => false))) {
    await openBtn.click();
    await page.waitForTimeout(700);
    return;
  }
  const dock = page.locator("[data-mobile-filter-dock] button").first();
  if ((await dock.count()) && (await dock.isVisible().catch(() => false))) {
    await dock.click();
    await page.waitForTimeout(700);
  }
}

fs.writeFileSync(
  `${OUT}/META.json`,
  JSON.stringify(
    {
      shotAt: new Date().toISOString(),
      base: BASE,
      out: OUT,
      gitHead: process.env.GIT_HEAD || null,
      buildId: process.env.BUILD_ID || null,
      routes: {
        home: "/?sample=1",
        companies: "/companies?sample=1",
        signals: "/companies?sample=1&feed=leaderboard",
      },
    },
    null,
    2,
  ),
);

const browser = await chromium.launch({ headless: true });

{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${BASE}/?sample=1`, { waitUntil: "networkidle", timeout: 90000 });
  await waitDirectory(page);
  await page.waitForSelector("[data-founder-search]", { timeout: 20000 });
  await waitGlobeIdle(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(200);
  await shot(page, "fold-1440");

  // Founder filters (program/sector/year/signal) — home, not browse facet rail.
  const program = page.locator('[data-founder-filters] select').first();
  if (await program.count()) {
    await program.selectOption({ index: 1 }).catch(() => {});
    await page.waitForTimeout(500);
  }
  await page.locator("[data-campus-founders-top] button").first().click().catch(() => {});
  await page.waitForTimeout(700);
  await waitGlobeIdle(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, "fold-filters-1440");

  // Explore → Companies (ranked list moved off home).
  await page.goto(`${BASE}/companies?sample=1`, { waitUntil: "networkidle", timeout: 90000 });
  await waitDirectory(page);
  await page.waitForTimeout(1500);
  await page.locator("#browse").scrollIntoViewIfNeeded().catch(() => {});
  const folio = page.locator("[data-sector-folio-desk]").first();
  if (await folio.count()) {
    await folio.evaluate((el) => el.scrollIntoView({ block: "start" }));
    await page.waitForTimeout(250);
    await page.evaluate(() => window.scrollBy(0, -120));
  }
  await page.waitForTimeout(400);
  await shot(page, "companies-1440");

  const more = page.getByRole("link", { name: /Show more/i }).first();
  if (await more.count()) {
    await more.click().catch(() => {});
    await page.waitForTimeout(1200);
    await page.locator("#browse").scrollIntoViewIfNeeded().catch(() => {});
  }
  const chapter = page.locator("[data-chapter-window]").first();
  if (await chapter.count()) {
    await chapter.evaluate((el) => el.scrollIntoView({ block: "start" }));
    await page.waitForTimeout(300);
    await page.evaluate(() => window.scrollBy(0, -48));
  }
  await shot(page, "companies-more-1440");

  const nextScout = page.locator("[data-next-to-scout]").first();
  const end = page.locator("[data-ledger-end]").first();
  if (await nextScout.count()) {
    await nextScout.scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    await page.evaluate(() => window.scrollBy(0, -48));
  } else if (await end.count()) {
    await end.scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
  }
  await shot(page, "companies-more-end-1440");

  await page.goto(`${BASE}/companies?sample=1`, { waitUntil: "networkidle", timeout: 90000 });
  await waitDirectory(page);
  await page.waitForTimeout(1200);
  await page.locator("#browse").scrollIntoViewIfNeeded().catch(() => {});
  const filtersHero = page.locator("[data-filters-index-hero]").first();
  if (await filtersHero.count()) {
    await filtersHero.evaluate((el) => el.scrollIntoView({ block: "start" }));
    await page.waitForTimeout(300);
    await page.evaluate(() => window.scrollBy(0, -56));
  } else {
    const contents = page.locator("[data-contents-hero]").first();
    if (await contents.count()) {
      await contents.evaluate((el) => el.scrollIntoView({ block: "start" }));
      await page.waitForTimeout(300);
      await page.evaluate(() => window.scrollBy(0, -64));
    }
  }
  await page.waitForTimeout(400);
  await shot(page, "companies-filters-1440");

  await page.goto(`${BASE}/companies?sample=1&feed=leaderboard`, { waitUntil: "networkidle", timeout: 90000 });
  await waitDirectory(page);
  await page.waitForTimeout(2000);
  await page.locator("#browse").scrollIntoViewIfNeeded().catch(() => {});
  const podium = page.locator("[data-signal-podium]").first();
  const stage = page.locator("[data-ledger-stage='leaderboard']").first();
  if (await podium.count() && (await podium.isVisible().catch(() => false))) {
    await podium.evaluate((el) => el.scrollIntoView({ block: "start" }));
    await page.waitForTimeout(300);
    await page.evaluate(() => window.scrollBy(0, -64));
  } else if (await stage.count()) {
    await stage.evaluate((el) => el.scrollIntoView({ block: "start" }));
    await page.waitForTimeout(300);
    await page.evaluate(() => window.scrollBy(0, -96));
  }
  await page.waitForTimeout(300);
  await shot(page, "companies-signals-1440");

  await page.goto(`${BASE}/startup/proj_9GUOmdEYxbuH?sample=1`, { waitUntil: "networkidle", timeout: 90000 });
  await page.waitForTimeout(2000);
  await shot(page, "company-sim-1440");
  await page.close();
}

{
  const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
  await page.goto(`${BASE}/?sample=1`, { waitUntil: "networkidle", timeout: 90000 });
  await waitDirectory(page);
  await page.waitForSelector("[data-founder-search]", { timeout: 20000 });
  await waitGlobeIdle(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, "fold-375");

  const programM = page.locator("[data-founder-filters] select").first();
  if (await programM.count()) {
    await programM.selectOption({ index: 1 }).catch(() => {});
    await page.waitForTimeout(400);
  }
  await page.locator("[data-campus-founders-top] button").first().click().catch(() => {});
  await page.waitForTimeout(600);
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, "fold-filters-375");

  await page.goto(`${BASE}/companies?sample=1`, { waitUntil: "networkidle", timeout: 90000 });
  await waitDirectory(page);
  await page.waitForTimeout(1500);
  await page.locator("#browse").scrollIntoViewIfNeeded().catch(() => {});
  const browseMobHero = page.locator("[data-browse-mobile-hero]").first();
  if (await browseMobHero.count()) {
    await browseMobHero.evaluate((el) => el.scrollIntoView({ block: "start" }));
    await page.waitForTimeout(300);
    await page.evaluate(() => window.scrollBy(0, -40));
  }
  await page.waitForTimeout(400);
  await shot(page, "companies-375");

  const more = page.getByRole("link", { name: /Show more/i }).first();
  if (await more.count()) {
    await more.click().catch(() => {});
    await page.waitForTimeout(1000);
  }
  const chapterM = page.locator("[data-chapter-window]").first();
  if (await chapterM.count()) {
    await chapterM.evaluate((el) => el.scrollIntoView({ block: "start" }));
    await page.waitForTimeout(300);
  }
  await shot(page, "companies-more-375");

  const endM = page.locator("[data-ledger-end-mobile]").first();
  if (await endM.count()) {
    await endM.evaluate((el) => el.scrollIntoView({ block: "start" }));
    await page.waitForTimeout(400);
  } else {
    const fallback = page.locator("[data-ledger-end]").last();
    if (await fallback.count()) {
      await fallback.evaluate((el) => el.scrollIntoView({ block: "start" }));
      await page.waitForTimeout(400);
    }
  }
  await shot(page, "companies-more-end-375");

  await page.goto(`${BASE}/companies?sample=1`, { waitUntil: "networkidle", timeout: 90000 });
  await waitDirectory(page);
  await page.waitForTimeout(1000);
  await page.locator("#browse").scrollIntoViewIfNeeded().catch(() => {});
  await openBrowseFilters(page);
  const contentsM = page.locator("[data-mobile-contents-hero]").first();
  if (await contentsM.count()) {
    await contentsM.evaluate((el) => el.scrollIntoView({ block: "start" })).catch(() => {});
    await page.waitForTimeout(250);
  }
  await shot(page, "companies-filters-375");

  await page.goto(`${BASE}/companies?sample=1&feed=leaderboard`, { waitUntil: "networkidle", timeout: 90000 });
  await waitDirectory(page);
  await page.waitForTimeout(1500);
  await page.locator("#browse").scrollIntoViewIfNeeded().catch(() => {});
  const podiumM = page.locator("[data-signal-podium]").first();
  if (await podiumM.count()) {
    await podiumM.evaluate((el) => el.scrollIntoView({ block: "start" }));
    await page.waitForTimeout(350);
    await page.evaluate(() => window.scrollBy(0, -56));
  }
  await shot(page, "companies-signals-375");

  await page.goto(`${BASE}/startup/proj_9GUOmdEYxbuH?sample=1`, { waitUntil: "networkidle", timeout: 90000 });
  await page.waitForTimeout(1200);
  // Pin the company name lead in frame (below sticky chrome via scroll-mt on hero).
  const dossierM = page.locator("[data-company-mobile-hero]").first();
  if (await dossierM.count()) {
    await dossierM.evaluate((el) => el.scrollIntoView({ block: "start", inline: "nearest" }));
    await page.waitForTimeout(400);
    // If sticky nav still clips the name, nudge down so data-company-name-lead is fully visible.
    await page.evaluate(() => {
      const name = document.querySelector("[data-company-name-lead]");
      if (!name) return;
      const top = name.getBoundingClientRect().top;
      if (top < 56) window.scrollBy(0, top - 64);
    });
    await page.waitForTimeout(200);
  }
  await shot(page, "company-sim-375");
  await page.close();
}

await browser.close();
console.log("done");
