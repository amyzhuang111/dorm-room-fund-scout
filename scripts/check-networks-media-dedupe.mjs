/**
 * Between-stage media cards: at most one card per companyId, and every card's
 * company must pass the shared 2023-or-later filter (networks-company-recency.json).
 */
import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const BASE = process.env.BASE || "http://127.0.0.1:3488";
const OUT = process.env.OUT || "reviews/networks-media-dedupe.json";
const BETWEEN_SCALE = Number(process.env.BETWEEN_SCALE || 2.55);

const passPath = path.join(process.cwd(), "public/data/networks-company-recency.json");
const pass = JSON.parse(fs.readFileSync(passPath, "utf8"));
const passSet = new Set(pass.passIds || []);

const browser = await chromium.launch({
  headless: true,
  channel: "chrome",
  args: ["--use-gl=angle", "--use-angle=swiftshader-webgl"],
});
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
});

await page.goto(`${BASE}/networks`, { waitUntil: "networkidle", timeout: 120000 });
await page.waitForSelector("[data-networks-graph] canvas", { timeout: 90000 });
await page.waitForFunction(
  () => document.querySelector("[data-networks-graph]")?.getAttribute("data-networks-fade") === "1",
  { timeout: 30000 },
).catch(() => {});

await page.waitForFunction(
  () => Array.isArray(window.__NETWORKS_COMPANY_PASS__) && window.__NETWORKS_COMPANY_PASS__.length > 100,
  { timeout: 30000 },
).catch(() => {});

await page.evaluate((scale) => {
  window.__NETWORKS_PENDING_SCALE__ = scale;
  window.__NETWORKS_SET_SCALE__?.(scale);
}, BETWEEN_SCALE);

await page.waitForFunction(
  () => document.querySelector("[data-networks-graph]")?.getAttribute("data-networks-zoom") === "2",
  { timeout: 15000 },
).catch(() => {});
await page.waitForTimeout(800);

const result = await page.evaluate(() => {
  const cards = [...document.querySelectorAll("[data-networks-media-card]")].map((el) => ({
    key: el.getAttribute("data-networks-media-card"),
    companyId: el.getAttribute("data-networks-media-company") || "",
    title: el.getAttribute("data-networks-media-title") || (el.textContent || "").trim(),
  }));
  const ids = cards.map((c) => c.companyId).filter(Boolean);
  const titleCounts = {};
  for (const c of cards) {
    const t = (c.title || "").trim();
    if (!t) continue;
    titleCounts[t] = (titleCounts[t] || 0) + 1;
  }
  const dupIds = ids.filter((id, i) => ids.indexOf(id) !== i);
  const uniqueIds = [...new Set(ids)];
  return {
    n: cards.length,
    cards,
    uniqueCompanyIds: uniqueIds.length,
    duplicateCompanyIds: [...new Set(dupIds)],
    duplicateTitles: Object.entries(titleCounts).filter(([, n]) => n > 1).map(([t, n]) => ({ title: t, n })),
    passOnWindow: (window.__NETWORKS_COMPANY_PASS__ || []).length,
  };
});

const failingPass = result.cards
  .filter((c) => c.companyId && !passSet.has(c.companyId))
  .map((c) => ({ companyId: c.companyId, title: c.title }));

const knownBad = ["proj_zEIv7ZJdw5m3"]; // Taya
const knownBadHit = result.cards.filter((c) => knownBad.includes(c.companyId));

const ok =
  result.duplicateCompanyIds.length === 0 &&
  failingPass.length === 0 &&
  knownBadHit.length === 0 &&
  result.n > 0;

const report = {
  ok,
  base: BASE,
  betweenScale: BETWEEN_SCALE,
  passCompanies: passSet.size,
  ...result,
  failingPass,
  knownBadHit,
  rule: pass.rule,
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
await browser.close();

if (!ok) {
  console.error("check-networks-media-dedupe FAILED", report);
  process.exit(1);
}
console.log(
  "PASS check-networks-media-dedupe",
  `cards=${result.n} uniqueCompanies=${result.uniqueCompanyIds} passSet=${passSet.size}`,
);
