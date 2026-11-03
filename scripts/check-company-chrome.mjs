/**
 * Fail if a mobile company page lacks site nav in the viewport, or uses a non-white shell.
 * Usage: BASE=http://127.0.0.1:3460 node scripts/check-company-chrome.mjs
 */
import { chromium } from "playwright";
import fs from "fs";

const BASE = process.env.BASE || "http://127.0.0.1:3460";
const EXTRA = process.env.VERCEL_BYPASS
  ? {
      extraHTTPHeaders: {
        "x-vercel-protection-bypass": process.env.VERCEL_BYPASS,
        "x-vercel-set-bypass-cookie": "true",
      },
    }
  : {};

function fail(msg) {
  console.error("FAIL", msg);
  process.exitCode = 1;
}

function pass(msg) {
  console.log("OK", msg);
}

function isWhite(rgb) {
  if (!rgb) return false;
  const m = String(rgb).match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (!m) return false;
  const r = Number(m[1]), g = Number(m[2]), b = Number(m[3]);
  // Allow near-white (antialias); reject cream (#FFF7F0 ≈ 255,247,240)
  return r >= 250 && g >= 250 && b >= 250;
}

const browser = await chromium.launch({ headless: true });
const ids = ["proj_9GUOmdEYxbuH"]; // Sim — scoring fixture
const report = { ok: true, pages: [] };

for (const id of ids) {
  const page = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, ...EXTRA });
  const url = `${BASE}/startup/${id}`;
  await page.goto(url, { waitUntil: "networkidle", timeout: 120000 });
  await page.waitForSelector("[data-site-nav]", { timeout: 30000 });
  await page.waitForSelector("[data-company-shell='white'], [data-company-mobile-hero]", { timeout: 30000 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);

  const atTop = await page.evaluate(() => {
    const nav = document.querySelector("[data-site-nav]");
    const header = document.querySelector("header[data-site-chrome], header");
    const shell = document.querySelector("[data-company-shell='white']");
    const product = document.querySelector("[data-company-product-chrome]");
    const tabs = document.querySelector("[data-mobile-desk-tabs]");
    const nr = nav?.getBoundingClientRect();
    const bodyBg = getComputedStyle(document.body).backgroundColor;
    const shellBg = shell ? getComputedStyle(shell).backgroundColor : null;
    const headerBg = header ? getComputedStyle(header).backgroundColor : null;
    const sample = document.documentElement.dataset.sample || null;
    return {
      hasNav: !!nav,
      navTop: nr?.top ?? null,
      navBottom: nr?.bottom ?? null,
      navHeight: nr?.height ?? null,
      hasDeskTabs: !!tabs,
      hasProductChrome: !!product,
      hasWhiteShellAttr: !!shell,
      bodyBg,
      shellBg,
      headerBg,
      sample,
      wordmark: !!document.querySelector(".wordmark"),
    };
  });

  const entry = { id, url, atTop, afterScroll: null };
  console.log("atTop", JSON.stringify(atTop));

  if (!atTop.hasNav) fail(`${id}: missing [data-site-nav]`);
  else if (atTop.navTop == null || atTop.navTop < -1 || (atTop.navBottom ?? 0) < 40)
    fail(`${id}: site nav not in viewport at scrollY=0 (top=${atTop.navTop} bottom=${atTop.navBottom})`);
  else if (!atTop.hasDeskTabs) fail(`${id}: missing mobile desk tabs`);
  else if (!atTop.wordmark) fail(`${id}: missing Campus Scout wordmark`);
  else pass(`${id}: site nav in viewport @scrollY=0`);

  if (atTop.sample !== "halflight") fail(`${id}: expected data-sample=halflight, got ${atTop.sample}`);
  if (!isWhite(atTop.bodyBg)) fail(`${id}: body background not white (${atTop.bodyBg})`);
  else pass(`${id}: body white ${atTop.bodyBg}`);
  if (!atTop.hasWhiteShellAttr) fail(`${id}: missing data-company-shell=white`);
  else if (!isWhite(atTop.shellBg)) fail(`${id}: company shell not white (${atTop.shellBg})`);
  else pass(`${id}: company shell white ${atTop.shellBg}`);
  if (!isWhite(atTop.headerBg)) fail(`${id}: site chrome header not white (${atTop.headerBg})`);
  else pass(`${id}: header white ${atTop.headerBg}`);
  if (!atTop.hasProductChrome) fail(`${id}: missing data-company-product-chrome`);
  else pass(`${id}: product chrome present`);

  // After scrolling the dossier hero, sticky nav must remain visible
  const hero = page.locator("[data-company-mobile-hero]").first();
  if (await hero.count()) {
    await hero.evaluate((el) => el.scrollIntoView({ block: "start" }));
    await page.waitForTimeout(350);
  }
  const after = await page.evaluate(() => {
    const nav = document.querySelector("[data-site-nav]");
    const nr = nav?.getBoundingClientRect();
    const header = document.querySelector("header");
    return {
      scrollY: window.scrollY,
      navTop: nr?.top ?? null,
      navBottom: nr?.bottom ?? null,
      headerPos: header ? getComputedStyle(header).position : null,
      stickyOk: !!(nr && nr.top >= -1 && nr.bottom > 40),
    };
  });
  entry.afterScroll = after;
  console.log("afterScroll", JSON.stringify(after));
  if (!after.stickyOk) fail(`${id}: site nav lost after hero scroll (sticky broken)`);
  else pass(`${id}: sticky nav survives hero scroll`);

  report.pages.push(entry);
  await page.close();
}

await browser.close();
report.ok = process.exitCode !== 1;
fs.mkdirSync("reviews", { recursive: true });
fs.writeFileSync("reviews/company-chrome.json", JSON.stringify(report, null, 2));
if (report.ok) console.log("PASS check-company-chrome", { pages: report.pages.length });
else console.error("FAIL check-company-chrome");
