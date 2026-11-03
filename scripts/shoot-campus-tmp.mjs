import { chromium } from "playwright";
import fs from "fs";
import { execSync } from "child_process";
import { homedir } from "os";
import path from "path";

const BASE = process.env.BASE || "http://127.0.0.1:3460";
const OUT = process.env.OUT || "/workspace/reviews/shots/campus-scout/wip";
fs.mkdirSync(OUT, { recursive: true });

/** Resolve the commit that BASE actually serves — never trust a stale GIT_HEAD env alone. */
function readVercelToken() {
  try {
    const auth = JSON.parse(fs.readFileSync(path.join(homedir(), ".local/share/com.vercel.cli/auth.json"), "utf8"));
    return auth.token || auth.accessToken || null;
  } catch {
    return process.env.VERCEL_TOKEN || null;
  }
}

async function resolveGitHead(base) {
  const localHead = (() => {
    try {
      return execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
    } catch {
      return null;
    }
  })();

  // Explicit deployed sha wins (CI / ops override for the URL under test).
  if (process.env.DEPLOYED_GIT_HEAD?.trim()) return process.env.DEPLOYED_GIT_HEAD.trim();

  let host = null;
  try {
    host = new URL(base).host;
  } catch {
    host = null;
  }

  if (host && /vercel\.app$/i.test(host)) {
    try {
      // Deployment id from Link: ...?dpl=dpl_xxx or from hostname via inspect
      const res = await fetch(base.replace(/\/$/, "") + "/", { method: "HEAD", redirect: "follow" });
      const link = res.headers.get("link") || "";
      const m = link.match(/dpl_([A-Za-z0-9]+)/) || link.match(/(dpl_[A-Za-z0-9]+)/);
      let dpl = m ? (m[1].startsWith("dpl_") ? m[1] : `dpl_${m[1]}`) : null;
      if (!dpl) {
        // hostname is the deployment alias — resolve via vercel inspect JSON
        try {
          const raw = execSync(`npx vercel inspect ${host} --json`, { encoding: "utf8", timeout: 60000 });
          const j = JSON.parse(raw);
          dpl = j.id || null;
        } catch {
          dpl = null;
        }
      }
      const token = readVercelToken();
      if (dpl && token) {
        const api = await fetch(`https://api.vercel.com/v13/deployments/${dpl}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (api.ok) {
          const body = await api.json();
          const sha = body?.meta?.gitCommitSha || body?.meta?.githubCommitSha || null;
          if (sha) return sha;
        }
      }
    } catch (err) {
      console.warn("resolveGitHead vercel failed:", err?.message || err);
    }
  }

  // Local / fallback: worktree HEAD that built this server.
  if (localHead) return localHead;

  // Last resort: GIT_HEAD only if it matches local (prevents sandbox stale r51 sha).
  const envHead = process.env.GIT_HEAD?.trim() || null;
  if (envHead && localHead && (envHead === localHead || localHead.startsWith(envHead) || envHead.startsWith(localHead.slice(0, 7)))) {
    return localHead;
  }
  return envHead;
}

async function shot(page, name) {
  const path = `${OUT}/${name}.png`;
  await page.screenshot({ path, fullPage: false });
  console.log("wrote", path);
}

async function waitDirectory(page) {
  await page.waitForSelector('[data-directory-ready="1"]', { timeout: 60000 }).catch(() => {});
}

/** Fold shots must wait for MapLibre idle → data-globe-state=ready (no LOADING GLOBE). */

async function waitFoundersReady(page) {
  await page.waitForSelector("[data-founder-results]", { timeout: 30000 }).catch(() => {});
  await page.waitForFunction(() => {
    const body = document.body?.innerText || "";
    if (/could not be loaded|failed to load/i.test(body)) return "error";
    if (document.querySelectorAll("[data-founder-card]").length > 0) return "ok";
    return false;
  }, { timeout: 60000 });
  const state = await page.evaluate(() => {
    const body = document.body?.innerText || "";
    const selects = [...document.querySelectorAll("[data-founder-filters] select")];
    return {
      failed: /could not be loaded|failed to load/i.test(body),
      cards: document.querySelectorAll("[data-founder-card]").length,
      filterOptions: selects.map((s) => s.options.length),
    };
  });
  if (state.failed || state.cards < 1 || state.filterOptions.some((n) => n <= 1)) {
    throw new Error(`founder fold not ready for shot: ${JSON.stringify(state)}`);
  }
}

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

const gitHead = await resolveGitHead(BASE);
fs.writeFileSync(
  `${OUT}/META.json`,
  JSON.stringify(
    {
      shotAt: new Date().toISOString(),
      base: BASE,
      out: OUT,
      gitHead,
      buildId: process.env.BUILD_ID || null,
      routes: {
        home: "/",
        companies: "/companies",
        signals: "/companies?feed=leaderboard",
      },
      mobileDpr: 2,
      framing: "control companies offsets; mobile DPR2; dossier scrollY=0 with site nav",
    },
    null,
    2,
  ),
);
console.log("META gitHead", gitHead);

const browser = await chromium.launch({ headless: true });

{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${BASE}/`, { waitUntil: "networkidle", timeout: 90000 });
  await waitDirectory(page);
  await page.waitForSelector("[data-founder-search]", { timeout: 20000 });
  await waitFoundersReady(page);
  await waitGlobeIdle(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(200);
  await shot(page, "fold-1440");

  // Founder filters + selected campus — URL campus keeps chip/ranks directed.
  await page.goto(`${BASE}/?campus=univ_penn&sample=1`, { waitUntil: "networkidle", timeout: 90000 });
  await waitDirectory(page);
  await waitFoundersReady(page);
  await waitGlobeIdle(page);
  const program = page.locator('[data-founder-filters] select').first();
  if (await program.count()) {
    await program.selectOption({ index: 1 }).catch(() => {});
    await page.waitForTimeout(400);
  }
  await page.waitForSelector("[data-fold-filter-chips], [data-fold-selected-campus-chip], [data-fold-current-view]", { timeout: 15000 }).catch(() => {});
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  await shot(page, "fold-filters-1440");

  // Explore → Companies (ranked list moved off home).
  await page.goto(`${BASE}/companies`, { waitUntil: "networkidle", timeout: 90000 });
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

  await page.goto(`${BASE}/companies?more=2`, { waitUntil: "networkidle", timeout: 90000 });
  await waitDirectory(page);
  await page.waitForTimeout(1200);
  await page.locator("#browse").scrollIntoViewIfNeeded().catch(() => {});
  const chapter = page.locator("[data-chapter-window], [data-page-window], [data-mobile-continued-mast]").first();
  if (await chapter.count()) {
    await chapter.evaluate((el) => el.scrollIntoView({ block: "start" }));
    await page.waitForTimeout(300);
    await page.evaluate(() => window.scrollBy(0, -48));
  }
  await shot(page, "companies-more-1440");

  await page.goto(`${BASE}/companies?more=6`, { waitUntil: "networkidle", timeout: 90000 });
  await waitDirectory(page);
  await page.waitForTimeout(1200);
  const end = page.locator("[data-ledger-end]").first();
  const loadNext = page.locator("[data-load-next]").first();
  if (await end.count()) {
    await end.evaluate((el) => el.scrollIntoView({ block: "end" }));
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      const endEl = document.querySelector("[data-ledger-end]");
      const btn = document.querySelector("[data-load-next]");
      if (!endEl) return;
      // Pin Load next near the bottom of the viewport.
      const anchor = btn || endEl;
      const bottom = anchor.getBoundingClientRect().bottom;
      const room = window.innerHeight - 16;
      if (bottom > room) window.scrollBy(0, bottom - room);
      // Ensure the topmost visible ledger card is fully in frame (not truncated).
      const cards = [...document.querySelectorAll("#browse ol > li")];
      for (const card of cards) {
        const r = card.getBoundingClientRect();
        if (r.bottom > 72 && r.top < window.innerHeight) {
          if (r.top < 72) window.scrollBy(0, r.top - 80);
          break;
        }
      }
    });
    await page.waitForTimeout(400);
  } else if (await loadNext.count()) {
    await loadNext.scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
  }
  await shot(page, "companies-more-end-1440");

  await page.goto(`${BASE}/companies`, { waitUntil: "networkidle", timeout: 90000 });
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

  await page.goto(`${BASE}/companies?feed=leaderboard`, { waitUntil: "networkidle", timeout: 90000 });
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

  await page.goto(`${BASE}/startup/proj_9GUOmdEYxbuH`, { waitUntil: "networkidle", timeout: 90000 });
  await page.waitForTimeout(2000);
  await shot(page, "company-sim-1440");
  const fullRecord = page.locator("[data-company-full-record]").first();
  if (await fullRecord.count()) {
    await fullRecord.evaluate((el) => el.scrollIntoView({ block: "start" }));
    await page.waitForTimeout(400);
    await shot(page, "company-full-record-1440");
  }
  await page.goto(`${BASE}/data`, { waitUntil: "networkidle", timeout: 90000 });
  await page.waitForSelector("[data-corpus-explorer]", { timeout: 30000 });
  await page.waitForTimeout(800);
  await shot(page, "data-explorer-1440");
  await page.goto(`${BASE}/campuses`, { waitUntil: "networkidle", timeout: 90000 });
  await page.waitForSelector("[data-campuses-index]", { timeout: 30000 });
  await page.waitForTimeout(800);
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, "campuses-1440");
  await page.goto(`${BASE}/signals`, { waitUntil: "networkidle", timeout: 90000 });
  await page.waitForTimeout(800);
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, "signals-1440");
  await page.close();
}

{
  const page = await browser.newPage({
    viewport: { width: 375, height: 812 },
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
  });
  await page.goto(`${BASE}/`, { waitUntil: "networkidle", timeout: 90000 });
  await waitDirectory(page);
  await waitFoundersReady(page);
  // r54: rest is peek (segments + chips); Expand opens the deck
  await page.waitForSelector("[data-fold-campus-segments], [data-founder-peek-strip], [data-founder-deck]", { timeout: 20000 });
  await page.waitForSelector("[data-founder-card], [data-founder-peek-chip]", { state: "visible", timeout: 20000 });
  await waitGlobeIdle(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, "fold-375");

  await page.goto(`${BASE}/?campus=univ_penn&sample=1`, { waitUntil: "networkidle", timeout: 90000 });
  await waitDirectory(page);
  await waitFoundersReady(page);
  await waitGlobeIdle(page);
  // Expand peek → deck so Penn selection + filtered founders read clearly
  const expandBtn = page.locator("[data-fold-sheet-expand]").first();
  if (await expandBtn.count()) {
    await expandBtn.click().catch(() => {});
    await page.waitForTimeout(350);
  }
  // Drag handle up into expanded so program filters appear with Penn kept
  const handle = page.locator("[data-fold-sheet-handle]").first();
  if (await handle.count()) {
    const box = await handle.boundingBox();
    if (box) {
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x, Math.max(40, y - 420), { steps: 12 });
      await page.mouse.up();
      await page.waitForTimeout(400);
    }
  }
  const programM = page.locator("[data-founder-filters] select").first();
  if (await programM.count()) {
    await programM.selectOption({ index: 1 }).catch(() => {});
    await page.waitForTimeout(400);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  await shot(page, "fold-filters-375");

  await page.goto(`${BASE}/companies`, { waitUntil: "networkidle", timeout: 90000 });
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
    await page.waitForTimeout(200);
    await page.evaluate(() => {
      const el = document.querySelector("[data-chapter-peak], [data-chapter-window]");
      if (!el) return;
      const top = el.getBoundingClientRect().top;
      if (top < 56) window.scrollBy(0, top - 64);
    });
    await page.waitForTimeout(250);
  }
  await page.mouse.move(0, 0);
  await page.evaluate(() => {
    const a = document.activeElement;
    if (a && a instanceof HTMLElement) a.blur();
  });
  await page.waitForTimeout(150);
  await shot(page, "companies-more-375");

  // Pass-close end: deep page so range is real; keep last cards + close plate in frame
  await page.goto(`${BASE}/companies?more=6`, { waitUntil: "networkidle", timeout: 90000 });
  await waitDirectory(page);
  await page.waitForTimeout(1000);
  const endM = page.locator("[data-ledger-end-mobile]").first();
  if (await endM.count()) {
    await endM.evaluate((el) => el.scrollIntoView({ block: "end" }));
    await page.waitForTimeout(200);
    await page.evaluate(() => {
      const end = document.querySelector("[data-ledger-end-mobile]");
      const btn = end && end.querySelector("[data-load-next]");
      if (!end) return;
      // Keep the close plate (Load next) fully visible near the bottom.
      const anchor = btn || end;
      const bottom = anchor.getBoundingClientRect().bottom;
      const room = window.innerHeight - 12;
      if (bottom > room) window.scrollBy(0, bottom - room);
      // Pull up just enough so one full card sits above the plate (not truncated).
      const endTop = end.getBoundingClientRect().top;
      const cards = [...document.querySelectorAll("#browse ol > li")];
      for (let i = cards.length - 1; i >= 0; i--) {
        const r = cards[i].getBoundingClientRect();
        if (r.bottom <= endTop - 4) {
          if (r.top < 56) window.scrollBy(0, r.top - 64);
          break;
        }
      }
      // Re-pin Load next if the card nudge pushed it off-screen.
      const b2 = (btn || end).getBoundingClientRect().bottom;
      if (b2 > window.innerHeight - 8) window.scrollBy(0, b2 - (window.innerHeight - 12));
    });
    await page.waitForTimeout(400);
  }
  await shot(page, "companies-more-end-375");

  await page.goto(`${BASE}/companies`, { waitUntil: "networkidle", timeout: 90000 });
  await waitDirectory(page);
  await page.waitForTimeout(1000);
  await page.locator("#browse").scrollIntoViewIfNeeded().catch(() => {});
  // Peak sparkline is the hero; filters stay collapsed underneath (do not open).
  const peakM = page.locator("[data-signals-landed-mobile], [data-signals-landed-compact], [data-signals-landed]").first();
  if (await peakM.count()) {
    await peakM.evaluate((el) => el.scrollIntoView({ block: "start" })).catch(() => {});
    await page.waitForTimeout(250);
    await page.evaluate(() => window.scrollBy(0, -56));
  } else {
    const contentsM = page.locator("[data-mobile-contents-hero]").first();
    if (await contentsM.count()) {
      await contentsM.evaluate((el) => el.scrollIntoView({ block: "start" })).catch(() => {});
      await page.waitForTimeout(250);
    }
  }
  await shot(page, "companies-filters-375");

  await page.goto(`${BASE}/companies?feed=leaderboard`, { waitUntil: "networkidle", timeout: 90000 });
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

  await page.goto(`${BASE}/startup/proj_9GUOmdEYxbuH`, { waitUntil: "networkidle", timeout: 90000 });
  await page.waitForTimeout(1200);
  // Dossier fold at scrollY=0 so site nav + white shell stay in frame (stable control framing).
  await page.waitForSelector("[data-site-nav]", { timeout: 20000 });
  await page.waitForSelector("[data-company-shell='white'], [data-company-mobile-hero]", { timeout: 20000 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(350);
  await page.waitForFunction(() => {
    const nav = document.querySelector("[data-site-nav]");
    if (!nav) return false;
    const r = nav.getBoundingClientRect();
    return r.top >= -1 && r.bottom > 40;
  }, { timeout: 5000 });
  await shot(page, "company-sim-375");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(250);
  await shot(page, "company-full-record-375");
  await page.goto(`${BASE}/data`, { waitUntil: "networkidle", timeout: 90000 });
  await page.waitForSelector("[data-corpus-explorer]", { timeout: 30000 });
  await page.waitForTimeout(600);
  await shot(page, "data-explorer-375");
  await page.goto(`${BASE}/campuses`, { waitUntil: "networkidle", timeout: 90000 });
  await page.waitForSelector("[data-campuses-index]", { timeout: 30000 });
  await page.waitForTimeout(600);
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, "campuses-375");
  await page.goto(`${BASE}/signals`, { waitUntil: "networkidle", timeout: 90000 });
  await page.waitForTimeout(800);
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, "signals-375");
  await page.close();
}

await browser.close();
console.log("done");
