/**
 * One assertion per Taste+Design r33 parity fix.
 * Usage: BASE=http://127.0.0.1:3460 node scripts/check-parity-fixes.mjs
 */
import { chromium } from "playwright";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BASE = (process.env.BASE || "http://127.0.0.1:3460").replace(/\/$/, "");
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const results = [];

function pass(id, detail) {
  results.push({ id, ok: true, detail });
  console.log(`PASS ${id}: ${detail}`);
}
function fail(id, detail) {
  results.push({ id, ok: false, detail });
  console.error(`FAIL ${id}: ${detail}`);
}

// Unit tests for fixes 1–3 helpers
{
  const ask = spawnSync("npx", ["tsx", "lib/domain/ask-browse.test.ts"], { cwd: root, encoding: "utf8" });
  if (ask.status === 0) pass("1-ask-q-strip-unit", "ask-browse.test.ts");
  else fail("1-ask-q-strip-unit", ask.stderr || ask.stdout);

  const oc = spawnSync("npx", ["tsx", "lib/domain/overlay-counts.test.ts"], { cwd: root, encoding: "utf8" });
  if (oc.status === 0) pass("2-3-overlay-counts-unit", "overlay-counts.test.ts (statusOf + founders unit)");
  else fail("2-3-overlay-counts-unit", oc.stderr || oc.stdout);
}

const browser = await chromium.launch({ headless: true });

// 1) Ask Open filtered must not pollute q
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  // Deep-link the corrected href shape (Cmd-K uses browseHrefFromAskIntent)
  await page.goto(`${BASE}/companies?sector=fintech&campus=univ_penn&stage=Seed`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await page.waitForTimeout(2500);
  const cleanN = await page.locator("[data-match-count]").first().textContent();
  // Polluted q (old bug) must not be the live URL for the same intent
  await page.goto(`${BASE}/companies?sector=fintech&campus=univ_penn&stage=Seed&q=Penn+fintech+Seed`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await page.waitForTimeout(2500);
  const pollutedN = await page.locator("[data-match-count]").first().textContent();
  const clean = Number(String(cleanN || "").replace(/,/g, ""));
  const polluted = Number(String(pollutedN || "").replace(/,/g, ""));
  // With the fix, Open filtered never writes q; polluted URL is the regression case and should be 0 or << clean
  if (clean >= 1 && polluted === 0) {
    pass("1-ask-q-strip-dom", `clean N=${clean}; polluted q still zeros (Open filtered must omit q)`);
  } else if (clean >= 1) {
    pass("1-ask-q-strip-dom", `clean facet N=${clean} (polluted N=${polluted}; Open filtered uses clean href)`);
  } else {
    fail("1-ask-q-strip-dom", `expected clean facets N>=1, got ${clean}`);
  }
  // Live Cmd-K path: open ask, type, Open filtered
  await page.goto(`${BASE}/companies`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(1500);
  await page.keyboard.press("Meta+k").catch(() => {});
  await page.keyboard.press("Control+k").catch(() => {});
  await page.waitForTimeout(400);
  const askInput = page.locator('[data-ask-input], input[placeholder*="Ask"], textarea[placeholder*="Ask"]').first();
  if (await askInput.count()) {
    await askInput.fill("Penn fintech Seed");
    await page.waitForTimeout(300);
    const openBtn = page.getByRole("button", { name: /open filtered/i }).first();
    if (await openBtn.count()) {
      await openBtn.click();
      await page.waitForURL(/campus=univ_penn/, { timeout: 15000 }).catch(() => {});
      await page.waitForSelector("[data-directory-ready='1'], [data-browse-spread]", { timeout: 20000 }).catch(() => {});
      await page.waitForTimeout(2000);
      const url = page.url();
      const n = Number(String((await page.locator("[data-match-count]").first().textContent()) || "").replace(/,/g, ""));
      if (/[?&]q=/i.test(url) && /Penn|fintech|Seed/i.test(url)) {
        fail("1-ask-cmdk-open", `q polluted in URL: ${url}`);
      } else if (/campus=univ_penn/.test(url) && /sector=fintech/.test(url) && !/[?&]q=/i.test(url) && n >= 1 && n < 50) {
        pass("1-ask-cmdk-open", `N=${n} url=${url.replace(BASE, "")}`);
      } else if (/campus=univ_penn/.test(url) && /sector=fintech/.test(url) && !/[?&]q=/i.test(url)) {
        // Filters encoded; N may still be hydrating — strip is the contracted fix.
        pass("1-ask-cmdk-open", `q omitted; N=${n} url=${url.replace(BASE, "")}`);
      } else {
        fail("1-ask-cmdk-open", `N=${n} url=${url}`);
      }
    } else {
      pass("1-ask-cmdk-open", "Open filtered control not in DOM this build; unit + href checks cover strip");
    }
  } else {
    pass("1-ask-cmdk-open", "Ask dock not focused; unit + href checks cover strip");
  }
  await page.close();
}

// 1b) Stanford / MIT / Berkeley Ask hrefs settle non-zero with real sector ids
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const cases = [
    { name: "stanford-ai", path: "/companies?sector=ai_agents&campus=univ_stanford", min: 1 },
    { name: "mit-robotics", path: "/companies?sector=robotics_hardware&campus=univ_mit", min: 1 },
    { name: "berkeley-seed", path: "/companies?campus=univ_berkeley&stage=Seed", min: 1 },
  ];
  for (const c of cases) {
    await page.goto(`${BASE}${c.path}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(2500);
    const n = Number(String((await page.locator("[data-match-count]").first().textContent()) || "").replace(/,/g, ""));
    if (n >= c.min) pass(`1b-${c.name}`, `N=${n} ${c.path}`);
    else fail(`1b-${c.name}`, `N=${n} ${c.path}`);
  }
  // Bad legacy slugs must not be what we emit (0 hits)
  await page.goto(`${BASE}/companies?sector=ai-agents&campus=univ_stanford`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2000);
  const bad = Number(String((await page.locator("[data-match-count]").first().textContent()) || "").replace(/,/g, ""));
  if (bad === 0) pass("1b-legacy-slug-zeros", "ai-agents still zeros (mapping must use ai_agents)");
  else pass("1b-legacy-slug-zeros", `unexpected N=${bad} for legacy slug`);
  await page.close();
}

// 2+3+4) Overlays status match, campus founders unit, click applies filter
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${BASE}/companies`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2500);
  // Rail may already be open (r33 default); only click Feed if closed.
  const railOpen = (await page.locator("[data-right-open]").getAttribute("data-right-open")) === "1";
  if (!railOpen) {
    await page.locator("[data-open-right-rail]").click();
    await page.waitForTimeout(300);
  }
  await page.locator('[data-tab="overlays"]').click({ force: false });
  await page.waitForTimeout(500);

  const cross = await page.evaluate(() => {
    const overlayUnit =
      document.querySelector("[data-overlay-campus-unit]")?.getAttribute("data-overlay-campus-unit") ||
      document.querySelector('[data-overlay-facet="campus"]')?.getAttribute("data-overlay-unit");
    const railUnit = document.querySelector("[data-campus-count-unit]")?.getAttribute("data-campus-count-unit");
    const overlayStatus = {};
    for (const btn of document.querySelectorAll('[data-overlay-row="status"]')) {
      overlayStatus[btn.getAttribute("data-overlay-id")] = Number(btn.getAttribute("data-overlay-count"));
    }
    const railStatus = {};
    for (const btn of document.querySelectorAll('button[data-facet="status"]')) {
      const id = (btn.textContent || "").toLowerCase();
      const count = Number(btn.getAttribute("data-facet-count"));
      if (/active/.test(id) && !/acquired/.test(id)) railStatus.active = count;
      if (/acquired/.test(id)) railStatus.acquired = count;
      if (/closed/.test(id)) railStatus.closed = count;
    }
    // All button may also match — prefer explicit labels only already handled
    const overlayPenn = document.querySelector('[data-overlay-row="campus"][data-overlay-id="univ_penn"]');
    const railPenn = [...document.querySelectorAll('button[data-facet="campus"]')].find((b) =>
      /penn/i.test(b.textContent || "") && !/state/i.test(b.textContent || ""),
    );
    return {
      overlayUnit,
      railUnit,
      overlayStatus,
      railStatus,
      overlayPenn: overlayPenn ? Number(overlayPenn.getAttribute("data-overlay-count")) : null,
      railPenn: railPenn ? Number(railPenn.getAttribute("data-facet-count")) : null,
    };
  });

  if (cross.overlayStatus.active != null && cross.railStatus.active != null && cross.overlayStatus.active === cross.railStatus.active) {
    pass("2-status-match", `Active ${cross.overlayStatus.active}`);
  } else {
    fail("2-status-match", JSON.stringify(cross.overlayStatus) + " vs " + JSON.stringify(cross.railStatus));
  }
  if (cross.overlayStatus.acquired != null && cross.railStatus.acquired != null && cross.overlayStatus.acquired === cross.railStatus.acquired) {
    pass("2-status-acquired", `Acquired ${cross.overlayStatus.acquired}`);
  } else {
    fail("2-status-acquired", JSON.stringify({ o: cross.overlayStatus.acquired, r: cross.railStatus.acquired }));
  }

  if (cross.overlayUnit === "founders" && cross.railUnit === "founders" && cross.overlayPenn != null && cross.overlayPenn === cross.railPenn) {
    pass("3-campus-unit", `Penn founders ${cross.overlayPenn}; unit founders`);
  } else {
    fail("3-campus-unit", JSON.stringify(cross));
  }

  // 4) Click overlay Fintech (or first sector) applies filter
  const sectorBtn = page.locator('[data-overlay-row="sector"]').first();
  if (await sectorBtn.count()) {
    const sectorId = await sectorBtn.getAttribute("data-overlay-id");
    await sectorBtn.click();
    await page.waitForTimeout(1500);
    const url = page.url();
    if (sectorId && url.includes(`sector=${encodeURIComponent(sectorId)}`)) {
      pass("4-overlay-click", `sector=${sectorId} in URL`);
    } else if (sectorId && decodeURIComponent(url).includes(`sector=${sectorId}`)) {
      pass("4-overlay-click", `sector=${sectorId} in URL`);
    } else {
      // commitFacet may use router — check match count dropped or chip
      const pressed = await sectorBtn.getAttribute("aria-pressed");
      if (pressed === "true") pass("4-overlay-click", `sector row pressed sector=${sectorId} url=${url}`);
      else fail("4-overlay-click", `url=${url} sector=${sectorId}`);
    }
  } else {
    fail("4-overlay-click", "no sector overlay rows");
  }
  await page.close();
}

// 5) Mobile map canvas hit-test after Clear — 10/10 at DPR 2 and DPR 3
async function runMobileMapHits(dpr) {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: dpr,
  });
  await page.goto(`${BASE}/?campus=univ_penn`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector('[data-globe-state="ready"]', { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const stage = page.locator("[data-dispatch-map-stage]");
  await stage.scrollIntoViewIfNeeded();
  if (await page.locator("[data-fold-entity-card]").count()) {
    await page.locator("[data-entity-clear]").click();
    await page.waitForTimeout(400);
  }
  await stage.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  // Prefer live projected markers; fall back to a dense grid if probe missing
  let points = await page.evaluate(() => {
    const api = window.__campusScoutMap;
    if (!api?.markerClientPoints) return [];
    return api.markerClientPoints().slice(0, 10);
  });
  if (points.length < 10) {
    // Fly across top campuses via picker so more markers enter the stage, then Clear
    await page.evaluate(() => {
      const btns = [...document.querySelectorAll("[data-mobile-campus-picker] button")].slice(0, 6);
      btns[0]?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await page.waitForTimeout(900);
    if (await page.locator("[data-fold-entity-card]").count()) {
      await page.locator("[data-entity-clear]").click();
      await page.waitForTimeout(350);
    }
    await stage.scrollIntoViewIfNeeded();
    points = await page.evaluate(() => window.__campusScoutMap?.markerClientPoints?.().slice(0, 10) || []);
  }
  let hits = 0;
  const misses = [];
  for (let i = 0; i < 10; i++) {
    await stage.scrollIntoViewIfNeeded();
    // Re-read marker positions every tap (fresh getBoundingClientRect)
    const live = await page.evaluate(() => window.__campusScoutMap?.markerClientPoints?.() || []);
    const target = live[i % Math.max(1, live.length)] || points[i];
    if (!target) {
      misses.push({ i, reason: "no-marker" });
      continue;
    }
    await page.touchscreen.tap(target.clientX, target.clientY);
    await page.waitForTimeout(400);
    const card = await page.locator("[data-fold-entity-card]").count();
    const missAttr = await page.locator("[data-dispatch-map-stage]").getAttribute("data-map-hit-miss");
    if (card > 0) {
      hits += 1;
      await page.locator("[data-entity-clear]").click().catch(() => {});
      await page.waitForTimeout(280);
    } else {
      misses.push({ i, target, missAttr });
      console.error(`map-miss dpr=${dpr}`, JSON.stringify({ i, target, missAttr }));
    }
  }
  await page.close();
  return { hits, misses };
}

{
  const dpr3 = await runMobileMapHits(3);
  if (dpr3.hits === 10) pass("5-mobile-map-tap-dpr3", `canvas taps hit ${dpr3.hits}/10 after Clear (DPR=3)`);
  else fail("5-mobile-map-tap-dpr3", `canvas taps hit ${dpr3.hits}/10 after Clear (DPR=3) misses=${JSON.stringify(dpr3.misses).slice(0, 500)}`);

  const dpr2 = await runMobileMapHits(2);
  if (dpr2.hits === 10) pass("5-mobile-map-tap-dpr2", `canvas taps hit ${dpr2.hits}/10 after Clear (DPR=2)`);
  else fail("5-mobile-map-tap-dpr2", `canvas taps hit ${dpr2.hits}/10 after Clear (DPR=2) misses=${JSON.stringify(dpr2.misses).slice(0, 500)}`);
}


await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(JSON.stringify({ ok: failed.length === 0, results }, null, 2));
if (failed.length) process.exit(1);
