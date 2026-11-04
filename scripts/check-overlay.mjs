/**
 * Hard gate: floating fold/map overlays must not cover real page text or controls
 * at 1440 and 375 on every primary route.
 *
 * Counts:
 *   overlay-on-text     — overlay intersects visible text outside the overlay itself
 *   overlay-on-control  — overlay intersects interactive controls outside itself
 *
 * Fold content inside a collapsible panel is allowed; covering stats/search/Map
 * labels or Program filters is not.
 *
 * Also fails if home map unobstructed area @375 is under 80% (Amy map-clearance rule).
 *
 * Usage: BASE=http://127.0.0.1:3460 node scripts/check-overlay.mjs
 */
import { chromium } from "playwright";
import fs from "fs";

const BASE = (process.env.BASE || "http://127.0.0.1:3460").replace(/\/$/, "");
const OUT = process.env.OUT || "reviews/overlay.json";

const ROUTES = [
  "/",
  "/companies",
  "/companies?more=2",
  "/companies?feed=leaderboard",
  "/founders",
  "/campuses",
  "/data",
  "/signals",
  "/startup/proj_9GUOmdEYxbuH",
];

const VIEWPORTS = [
  { name: "375", width: 375, height: 812 },
  { name: "1440", width: 1440, height: 900 },
];

const OVERLAY_SEL = [
  "[data-fold-map-overlays] > aside",
  "[data-fold-map-legend]",
  "[data-fold-map-sheet]",
  "[data-fold-overlay-peak]",
  "[data-fold-overlay-founders]",
].join(", ");

function fail(msg) {
  console.error("FAIL", msg);
  process.exitCode = 1;
}

const browser = await chromium.launch({ headless: true });
const report = { ok: true, base: BASE, pages: [], totals: { overlayOnText: 0, overlayOnControl: 0 }, homeMapUnobstructedPct375: null };

for (const vp of VIEWPORTS) {
  const page = await browser.newPage({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.width <= 400 ? 2 : 1,
  });
  for (const route of ROUTES) {
    await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded", timeout: 90000 });
    if (route === "/") {
      await page.waitForSelector("[data-directory-ready='1'], [data-fold-peak-figure], [data-founder-search]", { timeout: 60000 }).catch(() => {});
      await page.waitForTimeout(1600);
    } else {
      await page.waitForTimeout(900);
    }
    await page.evaluate(() => window.scrollTo(0, 0));

    const found = await page.evaluate((overlaySel) => {
      const vh = window.innerHeight;
      const vw = window.innerWidth;

      function visible(el) {
        if (!el || el.nodeType !== 1) return false;
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        if (r.width < 2 || r.height < 2) return false;
        if (r.bottom <= 0 || r.top >= vh || r.right <= 0 || r.left >= vw) return false;
        if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity || "1") < 0.05) return false;
        if (el.closest("[hidden], [aria-hidden='true'], .sr-only")) return false;
        return true;
      }

      function rectOf(el) {
        const r = el.getBoundingClientRect();
        return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, w: r.width, h: r.height };
      }

      function intersects(a, b, pad = 1) {
        return !(a.right <= b.left + pad || a.left >= b.right - pad || a.bottom <= b.top + pad || a.top >= b.bottom - pad);
      }

      function area(a, b) {
        const x1 = Math.max(a.left, b.left);
        const y1 = Math.max(a.top, b.top);
        const x2 = Math.min(a.right, b.right);
        const y2 = Math.min(a.bottom, b.bottom);
        return Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
      }

      // Overlays that actually paint above the map/page chrome.
      const overlays = [...document.querySelectorAll(overlaySel)].filter((el) => {
        if (!visible(el)) return false;
        // Collapsed legend chip alone is fine; still measure if it covers controls.
        return true;
      });

      // Protected text: stats line, Map label, search, page headings — outside overlays.
      const textCandidates = [];
      const textRoots = [
        ...document.querySelectorAll(
          "[data-fold-counts], [data-fold-desk-map] > h2, [data-fold-mast], [data-founder-search], [data-sample-strip-counts], h1, [data-corpus-explorer] h1, [data-company-name-lead]",
        ),
      ];
      for (const root of textRoots) {
        if (!visible(root)) continue;
        if (root.closest(overlaySel)) continue;
        // Collect leaf-ish text nodes via element rects with text
        const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        let n;
        while ((n = walk.nextNode())) {
          const t = (n.textContent || "").replace(/\s+/g, " ").trim();
          if (t.length < 2) continue;
          const parent = n.parentElement;
          if (!parent || !visible(parent)) continue;
          if (parent.closest(overlaySel)) continue;
          if (parent.closest("script, style, noscript")) continue;
          textCandidates.push({ el: parent, text: t.slice(0, 60), rect: rectOf(parent) });
        }
        // Also the root itself if it has direct visual size
        textCandidates.push({ el: root, text: (root.textContent || "").trim().slice(0, 60), rect: rectOf(root) });
      }

      // Controls: inputs, selects, buttons, links that are page chrome (not inside overlay).
      const controlCandidates = [...document.querySelectorAll("input, select, button, textarea, a[href], [role='button'], [data-founder-filter-select]")]
        .filter((el) => visible(el))
        .filter((el) => !el.closest(overlaySel))
        .filter((el) => !el.closest("[data-fold-map-overlays], [data-fold-map-sheet], [data-fold-map-legend]"))
        .map((el) => ({
          el,
          text: (el.getAttribute("aria-label") || el.textContent || el.getAttribute("name") || el.tagName).trim().slice(0, 50),
          rect: rectOf(el),
        }));

      const onText = [];
      const onControl = [];

      for (const ov of overlays) {
        const orect = rectOf(ov);
        // Ignore near-zero collapsed chips under 40×20 unless they hit a control.
        for (const t of textCandidates) {
          if (!intersects(orect, t.rect, 2)) continue;
          const hit = area(orect, t.rect);
          if (hit < 24) continue;
          // Sheet at rest may sit over empty map; only flag if text is NOT inside sheet/overlay.
          if (t.el.closest("[data-fold-map-sheet], [data-fold-map-overlays], [data-fold-map-legend]")) continue;
          onText.push({
            overlay: ov.getAttribute("data-fold-overlay-peak") != null ? "peak" : ov.getAttribute("data-fold-overlay-founders") != null ? "founders" : ov.getAttribute("data-fold-map-legend") != null ? "legend" : ov.getAttribute("data-fold-map-sheet") != null ? "sheet" : ov.tagName,
            text: t.text,
            hit: Math.round(hit),
          });
        }
        for (const c of controlCandidates) {
          if (!intersects(orect, c.rect, 2)) continue;
          const hit = area(orect, c.rect);
          if (hit < 16) continue;
          onControl.push({
            overlay: ov.getAttribute("data-fold-overlay-peak") != null ? "peak" : ov.getAttribute("data-fold-overlay-founders") != null ? "founders" : ov.getAttribute("data-fold-map-legend") != null ? "legend" : ov.getAttribute("data-fold-map-sheet") != null ? "sheet" : ov.tagName,
            control: c.text,
            hit: Math.round(hit),
          });
        }
      }

      // Dedupe by text/control string
      const dedupe = (arr, key) => {
        const seen = new Set();
        return arr.filter((x) => {
          const k = `${x.overlay}|${x[key]}`;
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        });
      };

      return {
        overlayCount: overlays.length,
        onText: dedupe(onText, "text"),
        onControl: dedupe(onControl, "control"),
      };
    }, OVERLAY_SEL);

    const entry = {
      route,
      viewport: vp.name,
      overlayCount: found.overlayCount,
      overlayOnText: found.onText.length,
      overlayOnControl: found.onControl.length,
      onText: found.onText.slice(0, 12),
      onControl: found.onControl.slice(0, 12),
      homeMapUnobstructedPct: null,
    };

    if (route === "/" && vp.name === "375") {
      const free = await page.evaluate(() => {
        const vh = window.innerHeight, vw = window.innerWidth;
        const stage =
          document.querySelector("[data-dispatch-map-stage], [data-fold-bigmap-stage], .maplibregl-map") ||
          document.querySelector("canvas.maplibregl-canvas")?.parentElement;
        if (!stage) return null;
        const mb = stage.getBoundingClientRect();
        const mapArea =
          Math.max(0, Math.min(mb.bottom, vh) - Math.max(mb.top, 0)) *
          Math.max(0, Math.min(mb.right, vw) - Math.max(mb.left, 0));
        const overlaySel =
          "[data-fold-map-overlays] > aside, [data-fold-overlay-peak], [data-fold-overlay-founders], [data-fold-map-sheet], [data-fold-map-legend], [role='dialog']";
        let blocked = 0;
        for (const el of document.querySelectorAll(overlaySel)) {
          const r = el.getBoundingClientRect();
          const cs = getComputedStyle(el);
          if (r.width < 2 || r.height < 2) continue;
          if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity || "1") < 0.05) continue;
          const x1 = Math.max(r.left, mb.left, 0);
          const y1 = Math.max(r.top, mb.top, 0);
          const x2 = Math.min(r.right, mb.right, vw);
          const y2 = Math.min(r.bottom, mb.bottom, vh);
          if (x2 > x1 && y2 > y1) blocked += (x2 - x1) * (y2 - y1);
        }
        blocked = Math.min(blocked, mapArea);
        return mapArea > 0 ? +(((mapArea - blocked) / mapArea) * 100).toFixed(1) : null;
      });
      entry.homeMapUnobstructedPct = free;
      report.homeMapUnobstructedPct375 = free;
      if (free == null || free < 80) {
        report.ok = false;
        fail(`/@375 home-map unobstructed=${free}% (need ≥80)`);
      } else {
        console.log(`OK /@375 home-map unobstructed=${free}%`);
      }
    }

    report.pages.push(entry);
    report.totals.overlayOnText += entry.overlayOnText;
    report.totals.overlayOnControl += entry.overlayOnControl;

    const label = `${route}@${vp.name}`;
    if (entry.overlayOnText || entry.overlayOnControl) {
      report.ok = false;
      fail(
        `${label}: overlay-on-text=${entry.overlayOnText} overlay-on-control=${entry.overlayOnControl} text=${JSON.stringify(entry.onText).slice(0, 280)} ctrl=${JSON.stringify(entry.onControl).slice(0, 280)}`,
      );
    } else {
      console.log(`OK ${label} overlays=${entry.overlayCount} overlay-on-text=0 overlay-on-control=0`);
    }
  }
  await page.close();
}


// Extra states required by mobile-m1 gates:
// (1) Menu open @390: Open lane sheet must hide and not cover map mode tabs.
// (2) Current view @1440: results card must cover <28% of the map stage.
{
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  });
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForTimeout(2000);
  const menu = page.getByRole("button", { name: /^Menu$/i }).first();
  if (await menu.count()) {
    await menu.click();
    await page.waitForTimeout(400);
  }
  const menuState = await page.evaluate(() => {
    const open = document.documentElement.getAttribute("data-nav-menu-open") === "1";
    const sheet = document.querySelector("[data-fold-map-sheet]");
    const sheetHidden =
      !sheet ||
      sheet.getAttribute("data-fold-sheet-hidden-for-menu") === "1" ||
      getComputedStyle(sheet).display === "none" ||
      sheet.getBoundingClientRect().height < 8;
    const modes = [...document.querySelectorAll('[aria-label="Map locations"] button')];
    const modeHit = modes.filter((b) => {
      const r = b.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return false;
      if (!sheet || sheet.getAttribute("data-fold-sheet-hidden-for-menu") === "1") return false;
      const s = sheet.getBoundingClientRect();
      const x1 = Math.max(r.left, s.left), y1 = Math.max(r.top, s.top);
      const x2 = Math.min(r.right, s.right), y2 = Math.min(r.bottom, s.bottom);
      return x2 > x1 && y2 > y1;
    }).map((b) => (b.textContent || "").trim());
    return { open, sheetHidden, modeHit };
  });
  report.menuOpen390 = menuState;
  if (!menuState.open) {
    report.ok = false;
    fail("menu-open@390: Menu did not set data-nav-menu-open");
  } else if (!menuState.sheetHidden) {
    report.ok = false;
    fail("menu-open@390: Open lane sheet still visible over the menu");
  } else if (menuState.modeHit.length) {
    report.ok = false;
    fail(`menu-open@390: sheet still covers map modes ${JSON.stringify(menuState.modeHit)}`);
  } else {
    console.log("OK menu-open@390 sheet hidden, map modes clear");
  }
  await page.close();
}

{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForSelector("[data-dispatch-map-stage]", { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(2000);
  // Current-view card only mounts in Startup HQs mode.
  const hqBtn = page.locator('[aria-label="Map locations"] button').filter({ hasText: /HQs/i }).first();
  if (await hqBtn.count()) {
    await hqBtn.click();
    await page.waitForTimeout(2500);
  }
  await page.waitForSelector("section[aria-label='Startups on the map'], [data-company-location-map]", { timeout: 60000 }).catch(() => {});
  // Ensure collapsed (default on desktop ≥1024)
  const hideBtn = page.locator('section[aria-label="Startups on the map"] button[aria-label="Collapse startups in view"]');
  if (await hideBtn.count()) {
    await hideBtn.click().catch(() => {});
    await page.waitForTimeout(200);
  }
  const coverage = await page.evaluate(() => {
    const stage = document.querySelector("[data-dispatch-map-stage]");
    const sheet = document.querySelector("section[aria-label='Startups on the map']");
    if (!stage || !sheet) return { pct: null, reason: !stage ? "no-stage" : "no-results" };
    const mb = stage.getBoundingClientRect();
    const rb = sheet.getBoundingClientRect();
    const mapArea = Math.max(1, mb.width * mb.height);
    const x1 = Math.max(rb.left, mb.left), y1 = Math.max(rb.top, mb.top);
    const x2 = Math.min(rb.right, mb.right), y2 = Math.min(rb.bottom, mb.bottom);
    const hit = x2 > x1 && y2 > y1 ? (x2 - x1) * (y2 - y1) : 0;
    return {
      pct: +(100 * hit / mapArea).toFixed(1),
      collapsed: sheet.getAttribute("data-results-collapsed"),
      sheetH: Math.round(rb.height),
      mapH: Math.round(mb.height),
    };
  });
  report.currentView1440 = coverage;
  if (coverage.pct == null) {
    report.ok = false;
    fail(`current-view@1440: could not measure (${coverage.reason || "unknown"})`);
  } else if (coverage.pct > 28) {
    report.ok = false;
    fail(`current-view@1440: results cover ${coverage.pct}% of map (need ≤28; collapsed default)`);
  } else {
    console.log(`OK current-view@1440 results cover ${coverage.pct}% of map (collapsed=${coverage.collapsed}, h=${coverage.sheetH}/${coverage.mapH})`);
  }
  await page.close();
}


// (3) Idle @390: stats pill must not cover World/Pause/Campuses map mode tabs.
// (4) Globe tap @390: Selected card must sit above the Open lane sheet (or sheet hidden).
{
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  });
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForTimeout(2500);
  const pill = await page.evaluate(() => {
    const counts = document.querySelector("[data-fold-counts]");
    const modes = [...document.querySelectorAll('[aria-label="Map locations"] button')];
    if (!counts) return { ok: false, reason: "no-counts" };
    const cr = counts.getBoundingClientRect();
    const hit = modes.filter((b) => {
      const r = b.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return false;
      const x1 = Math.max(cr.left, r.left), y1 = Math.max(cr.top, r.top);
      const x2 = Math.min(cr.right, r.right), y2 = Math.min(cr.bottom, r.bottom);
      return x2 > x1 + 2 && y2 > y1 + 2;
    }).map((b) => (b.textContent || "").trim());
    const cs = getComputedStyle(counts);
    const clipped = Number(cs.lineHeight) > 0 && cr.height + 0.5 < Number.parseFloat(cs.lineHeight);
    // Descenders: paragraph inside should not be overflow-hidden clipped
    const p = counts.querySelector("p");
    const pr = p ? p.getBoundingClientRect() : cr;
    const descendersCut = p ? pr.bottom > cr.bottom + 1 : false;
    return {
      ok: hit.length === 0 && !descendersCut,
      hit,
      descendersCut,
      countsH: Math.round(cr.height),
      countsBottom: Math.round(cr.bottom),
      modeTop: modes[0] ? Math.round(modes[0].getBoundingClientRect().top) : null,
    };
  });
  report.pillOverTabs390 = pill;
  if (!pill.ok) {
    report.ok = false;
    fail(`pill-over-tabs@390: counts cover modes ${JSON.stringify(pill.hit)} descendersCut=${pill.descendersCut}`);
  } else {
    console.log(`OK pill-over-tabs@390 counts clear of map modes (h=${pill.countsH})`);
  }

  // Select a campus (Open lane chip or map tap) so the Selected card mounts.
  const chip = page.locator("[data-fold-map-sheet] button, [data-fold-map-sheet] a, [data-fold-sheet-body] button").filter({ hasText: /Penn/i }).first();
  if (await chip.count()) {
    await chip.click({ force: true });
    await page.waitForTimeout(900);
  }
  if (!(await page.locator("[data-entity-selected], [data-fold-entity-card]").count())) {
    const box = await page.locator("[data-dispatch-map-stage]").boundingBox();
    if (box) {
      for (const [fx, fy] of [[0.72, 0.42], [0.30, 0.45], [0.55, 0.50]]) {
        await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
        await page.waitForTimeout(900);
        if (await page.locator("[data-entity-selected], [data-fold-entity-card]").count()) break;
      }
    }
  }
  await page.waitForTimeout(400);
  const sel = await page.evaluate(() => {
    const card = document.querySelector("[data-fold-entity-card]");
    const sheet = document.querySelector("[data-fold-map-sheet]");
    if (!card) return { ok: false, reason: "no-selected-card" };
    const cr = card.getBoundingClientRect();
    const sheetHidden =
      !sheet ||
      sheet.getAttribute("data-fold-sheet-hidden-for-selection") === "1" ||
      sheet.getAttribute("data-fold-sheet-hidden-for-menu") === "1" ||
      getComputedStyle(sheet).display === "none" ||
      sheet.getBoundingClientRect().height < 8;
    let overlap = 0;
    if (sheet && !sheetHidden) {
      const sr = sheet.getBoundingClientRect();
      const x1 = Math.max(cr.left, sr.left), y1 = Math.max(cr.top, sr.top);
      const x2 = Math.min(cr.right, sr.right), y2 = Math.min(cr.bottom, sr.bottom);
      if (x2 > x1 && y2 > y1) overlap = (x2 - x1) * (y2 - y1);
    }
    return {
      ok: sheetHidden || overlap < 24,
      sheetHidden,
      overlap: Math.round(overlap),
      cardBottom: Math.round(cr.bottom),
      sheetTop: sheet ? Math.round(sheet.getBoundingClientRect().top) : null,
      selected: card.getAttribute("data-entity-selected"),
    };
  });
  report.selectedCardUnderSheet390 = sel;
  if (!sel.ok) {
    report.ok = false;
    fail(`selected-card-under-sheet@390: ${JSON.stringify(sel)}`);
  } else {
    console.log(`OK selected-card-under-sheet@390 sheetHidden=${sel.sheetHidden} overlap=${sel.overlap}`);
  }
  await page.close();
}

await browser.close();
fs.mkdirSync("reviews", { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(`Wrote ${OUT}`);
if (!report.ok) {
  console.error("check-overlay FAILED", report.totals);
  process.exit(1);
}
console.log("PASS check-overlay", { ...report.totals, homeMapUnobstructedPct375: report.homeMapUnobstructedPct375 });
