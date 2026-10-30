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

async function openFilters(page) {
  const btn = page.getByRole("button", { name: /^Filters$/ });
  if ((await btn.count()) && (await btn.first().isVisible().catch(() => false))) {
    await btn.first().click();
    await page.waitForTimeout(600);
  }
}

async function openBrowseFilters(page) {
  const browse = page.locator("#browse");
  await browse.scrollIntoViewIfNeeded().catch(() => {});
  // Fold-language Filters control (desk swaps Wire↔rail; mobile opens sheet).
  const filters = browse.getByRole("button", { name: /^Filters$/ }).first();
  if ((await filters.count()) && (await filters.isVisible().catch(() => false))) {
    await filters.click();
    await page.waitForTimeout(700);
    const sheet = page.getByRole("dialog", { name: /Scout filters/i });
    if (await sheet.count()) {
      const rail = sheet.locator('[data-facet-rail="scout"]');
      if (await rail.count()) {
        await rail.evaluate((el) => {
          const scroller = el.querySelector(".overflow-y-auto") || el;
          // Keep Status pin in view; nudge to show year rhythm under Flags.
          scroller.scrollTop = Math.min(70, scroller.scrollHeight);
        }).catch(() => {});
      }
      await page.waitForTimeout(400);
    }
    return;
  }
  // Dock kickers vary per page (Ledger / Map / Dossier / Scout filters).
  const openBtn = browse.getByRole("button", { name: /filters/i }).first();
  if ((await openBtn.count()) && (await openBtn.isVisible().catch(() => false))) {
    await openBtn.click();
    await page.waitForTimeout(700);
    const sheet = page.getByRole("dialog", { name: /Scout filters/i });
    if (await sheet.count()) {
      const rail = sheet.locator('[data-facet-rail="scout"]');
      if (await rail.count()) {
        await rail.evaluate((el) => {
          const scroller = el.querySelector(".overflow-y-auto") || el;
          scroller.scrollTop = Math.min(70, scroller.scrollHeight);
        }).catch(() => {});
      }
      await page.waitForTimeout(400);
    }
    return;
  }
  const dock = page.locator("[data-mobile-filter-dock] button").first();
  if ((await dock.count()) && (await dock.isVisible().catch(() => false))) {
    await dock.click();
    await page.waitForTimeout(700);
  }
}

const browser = await chromium.launch({ headless: true });

{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${BASE}/?sample=1`, { waitUntil: "networkidle", timeout: 90000 });
  await page.waitForTimeout(4500);
  await shot(page, "fold-1440");
  await openFilters(page);
  await page.waitForTimeout(800);
  await shot(page, "fold-filters-1440");

  await page.goto(`${BASE}/?sample=1#browse`, { waitUntil: "networkidle", timeout: 90000 });
  await page.waitForTimeout(2500);
  await page.locator("#browse").scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(500);
  await shot(page, "browse-1440");

  const more = page.getByRole("link", { name: /Show more/i }).first();
  if (await more.count()) {
    await more.click().catch(() => {});
    await page.waitForTimeout(1200);
    await page.locator("#browse").scrollIntoViewIfNeeded().catch(() => {});
  }
  await shot(page, "browse-more-1440");

  // Prove end mark in viewport (sticky header alone is not enough).
  const end = page.locator("[data-ledger-end]").first();
  if (await end.count()) {
    await end.scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    await page.evaluate(() => window.scrollBy(0, -40));
    await page.waitForTimeout(200);
  }
  await shot(page, "browse-more-end-1440");

  // Desk: persistent ledger index always on — frame hero + Contents TOC + wire.
  await page.goto(`${BASE}/?sample=1#browse`, { waitUntil: "networkidle", timeout: 90000 });
  await page.waitForTimeout(1500);
  await page.locator("#browse").scrollIntoViewIfNeeded().catch(() => {});
  const heroF = page.locator("[data-browse-hero]").first();
  if (await heroF.count()) {
    await heroF.evaluate((el) => el.scrollIntoView({ block: "start" }));
    await page.waitForTimeout(300);
    await page.evaluate(() => window.scrollBy(0, -56));
  }
  await page.waitForTimeout(400);
  await shot(page, "browse-filters-1440");

  await page.goto(`${BASE}/?sample=1&feed=leaderboard#browse`, { waitUntil: "networkidle", timeout: 90000 });
  await page.waitForTimeout(2500);
  await page.locator("#browse").scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(400);
  // Keep #1 campus hero in frame (data-browse-hero), with rank 01 of the list still visible below.
  const hero = page.locator("[data-browse-hero='leaderboard']").first();
  if (await hero.count()) {
    await hero.evaluate((el) => el.scrollIntoView({ block: "start" }));
    await page.waitForTimeout(300);
    await page.evaluate(() => window.scrollBy(0, -72));
  }
  await page.waitForTimeout(300);
  await shot(page, "leaderboard-1440");

  // Exact Sim dossier (Berkeley campus wire 138).
  await page.goto(`${BASE}/startup/proj_9GUOmdEYxbuH?sample=1`, { waitUntil: "networkidle", timeout: 90000 });
  await page.waitForTimeout(2500);
  await shot(page, "company-sim-1440");
  await page.close();
}

{
  const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
  await page.goto(`${BASE}/?sample=1`, { waitUntil: "networkidle", timeout: 90000 });
  await page.waitForTimeout(4500);
  await shot(page, "fold-375");

  await page.goto(`${BASE}/?sample=1#browse`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  await page.locator("#browse").scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(400);
  await shot(page, "browse-375");

  const more = page.getByRole("link", { name: /Show more/i }).first();
  if (await more.count()) {
    await more.click().catch(() => {});
    await page.waitForTimeout(1000);
    await page.locator("#browse").scrollIntoViewIfNeeded().catch(() => {});
  }
  await shot(page, "browse-more-375");

  const endM = page.locator("[data-ledger-end]").first();
  if (await endM.count()) {
    await endM.scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    await page.evaluate(() => window.scrollBy(0, -32));
    await page.waitForTimeout(200);
  }
  await shot(page, "browse-more-end-375");

  await page.goto(`${BASE}/?sample=1#browse`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  await page.locator("#browse").scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(300);
  await openBrowseFilters(page);
  await shot(page, "browse-filters-375");

  await page.goto(`${BASE}/?sample=1&feed=leaderboard#browse`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  await page.locator("#browse").scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(300);
  const heroM = page.locator("[data-browse-hero='leaderboard']").first();
  if (await heroM.count()) {
    await heroM.evaluate((el) => el.scrollIntoView({ block: "start" }));
    await page.waitForTimeout(300);
    await page.evaluate(() => window.scrollBy(0, -64));
  }
  await page.waitForTimeout(300);
  await shot(page, "leaderboard-375");

  // Exact Sim dossier (Berkeley campus wire 138).
  await page.goto(`${BASE}/startup/proj_9GUOmdEYxbuH?sample=1`, { waitUntil: "networkidle", timeout: 90000 });
  await page.waitForTimeout(2000);
  await shot(page, "company-sim-375");
  await page.close();
}

await browser.close();
console.log("done");
