/**
 * Click every Open Lane hero control and assert the destination count equals
 * the number shown on the home panel.
 *
 * Usage:
 *   BASE=http://127.0.0.1:3460 node scripts/check-open-lane-clicks.mjs
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const BASE = (process.env.BASE || "http://127.0.0.1:3460").replace(/\/$/, "");
const OUT = process.env.OUT || "reviews/open-lane-clicks.json";

const EXTRA = process.env.VERCEL_BYPASS
  ? {
      extraHTTPHeaders: {
        "x-vercel-protection-bypass": process.env.VERCEL_BYPASS,
        "x-vercel-set-bypass-cookie": "true",
      },
    }
  : {};

function fail(msg, report) {
  console.error("FAIL", msg);
  report.ok = false;
  report.failures.push(msg);
  process.exitCode = 1;
}

function pass(msg, report) {
  console.log("OK", msg);
  report.passes.push(msg);
}

function parseCount(text) {
  const m = String(text || "").replace(/,/g, "").match(/-?\d+/);
  return m ? Number(m[0]) : null;
}

const report = {
  ok: true,
  base: BASE,
  passes: [],
  failures: [],
  clicks: [],
};

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  ...EXTRA,
});

await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 120000 });
await page.waitForSelector("[data-fold-open-lane-figure]", { timeout: 90000 });
await page.waitForSelector("[data-fold-open-lane-link='all']", { timeout: 30000 });

const hero = await page.evaluate(() => {
  const all = document.querySelector("[data-fold-open-lane-link='all']");
  const figure = document.querySelector("[data-fold-open-lane-figure]");
  const campuses = [...document.querySelectorAll("[data-fold-open-lane-campus]")].map((el) => ({
    id: el.getAttribute("data-fold-open-lane-campus"),
    name: el.getAttribute("data-fold-open-lane-campus-name"),
    expected: Number(el.getAttribute("data-fold-open-lane-expected")),
    href: el.getAttribute("href"),
    tag: el.tagName,
  }));
  const stats = [...document.querySelectorAll("[data-fold-open-lane-stat]")].map((el) => ({
    kind: el.getAttribute("data-fold-open-lane-stat"),
    href: el.getAttribute("href"),
    tag: el.tagName,
  }));
  const style = all ? getComputedStyle(all) : null;
  return {
    allHref: all?.getAttribute("href") || null,
    allExpected: Number(all?.getAttribute("data-fold-open-lane-expected")),
    figure: parseCountLocal(figure?.textContent),
    pointer: style?.cursor || null,
    campuses,
    stats,
  };
  function parseCountLocal(text) {
    const m = String(text || "").replace(/,/g, "").match(/-?\d+/);
    return m ? Number(m[0]) : null;
  }
});

report.hero = hero;

if (!hero.allHref || !hero.allHref.includes("lane=open")) {
  fail(`headline href missing lane=open: ${hero.allHref}`, report);
} else {
  pass(`headline href ${hero.allHref}`, report);
}
if (hero.figure == null || hero.allExpected !== hero.figure) {
  fail(`headline expected attr ${hero.allExpected} != figure ${hero.figure}`, report);
} else {
  pass(`headline figure ${hero.figure}`, report);
}
if (hero.pointer !== "pointer") {
  fail(`headline cursor is ${hero.pointer}, want pointer`, report);
} else {
  pass("headline cursor pointer", report);
}
if (!hero.campuses.length) fail("no campus rows to click", report);
else pass(`campus rows ${hero.campuses.length}`, report);

async function clickAndAssertCount(selector, expected, label) {
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForSelector(selector, { timeout: 60000 });
  const href = await page.getAttribute(selector, "href");
  await Promise.all([
    page.waitForURL((url) => String(url).includes("/founders"), { timeout: 60000 }),
    page.click(selector),
  ]);
  await page.waitForSelector("[data-open-lane-loaded='1']", { timeout: 90000 });
  const dest = await page.evaluate(() => {
    const root = document.querySelector("[data-open-lane-founders]");
    return {
      countAttr: root?.getAttribute("data-open-lane-count"),
      figure: document.querySelector("[data-open-lane-figure]")?.textContent || "",
      cards: document.querySelectorAll("[data-open-lane-card]").length,
      url: location.pathname + location.search,
    };
  });
  const count = Number(dest.countAttr);
  const figure = parseCount(dest.figure);
  const entry = { label, href, expected, count, figure, cards: dest.cards, url: dest.url };
  report.clicks.push(entry);
  if (count !== expected) {
    fail(`${label}: destination count ${count} != displayed ${expected} (${dest.url})`, report);
  } else if (figure !== expected) {
    fail(`${label}: destination figure ${figure} != displayed ${expected}`, report);
  } else if (dest.cards !== expected) {
    fail(`${label}: card list ${dest.cards} != displayed ${expected}`, report);
  } else {
    pass(`${label}: clicked → ${dest.url} count=${count}`, report);
  }
}

await clickAndAssertCount("[data-fold-open-lane-link='all']", hero.allExpected, "headline");

for (const campus of hero.campuses) {
  if (!campus.href || !campus.href.includes("lane=open") || !campus.href.includes("campus=")) {
    fail(`campus ${campus.name} href missing facets: ${campus.href}`, report);
    continue;
  }
  await clickAndAssertCount(
    `[data-fold-open-lane-campus="${campus.id}"]`,
    campus.expected,
    `campus ${campus.name}`,
  );
}

// Optional stats: just assert they are real links to the right destinations.
for (const stat of hero.stats) {
  if (stat.tag !== "A") {
    fail(`stat ${stat.kind} is <${stat.tag}>, want <A>`, report);
    continue;
  }
  if (stat.kind === "companies") {
    if (stat.href !== "/companies") fail(`stat companies href ${stat.href}`, report);
    else pass("stat companies → /companies", report);
  } else {
    if (stat.href !== "/founders") fail(`stat ${stat.kind} href ${stat.href}`, report);
    else pass(`stat ${stat.kind} → /founders`, report);
  }
}

// Keyboard: Tab to headline link and activate with Enter.
await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 120000 });
await page.waitForSelector("[data-fold-open-lane-link='all']", { timeout: 60000 });
await page.focus("[data-fold-open-lane-link='all']");
await Promise.all([
  page.waitForURL((url) => String(url).includes("/founders?lane=open"), { timeout: 60000 }),
  page.keyboard.press("Enter"),
]);
await page.waitForSelector("[data-open-lane-loaded='1']", { timeout: 90000 });
pass("keyboard Enter on headline reaches open lane", report);

// Desk open-lane is lg-only; measure tap targets at 1440 where the panel mounts.
await page.setViewportSize({ width: 1440, height: 900 });
await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 120000 });
await page.waitForSelector("[data-fold-open-lane-link='all']", { timeout: 60000 });
const sizes = await page.evaluate(() => {
  const els = [...document.querySelectorAll("[data-fold-open-lane-campus], [data-fold-open-lane-link]")];
  return els.map((el) => {
    const r = el.getBoundingClientRect();
    const before = getComputedStyle(el, "::before");
    return {
      sel: el.getAttribute("data-fold-open-lane-campus") || el.getAttribute("data-fold-open-lane-link"),
      height: r.height,
      width: r.width,
      beforeH: before?.height || null,
      beforeW: before?.width || null,
    };
  });
});
report.hitSizes = sizes;
if (!sizes.length) fail("no open-lane tap targets found @1440", report);
for (const s of sizes) {
  const h = Math.max(s.height, parseFloat(s.beforeH) || 0);
  const w = Math.max(s.width, parseFloat(s.beforeW) || 0);
  if (h < 44 || w < 44) {
    fail(`tap target ${s.sel} h=${h} w=${w} under 44`, report);
  } else {
    pass(`tap target ${s.sel} >= 44 (h=${Math.round(h)} w=${Math.round(w)})`, report);
  }
}

await browser.close();
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(report.ok ? "PASS check-open-lane-clicks" : "FAIL check-open-lane-clicks", {
  passes: report.passes.length,
  failures: report.failures.length,
  out: OUT,
});
