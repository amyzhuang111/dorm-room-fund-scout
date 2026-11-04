/**
 * Fail if the desk open-lane hero (or /methodology) definition text drifts from
 * lib/domain/open-lane.ts, or if open-lane membership includes companies outside
 * the investable desk, or if the hero figure disagrees with the computed set.
 * Usage:
 *   BASE=http://127.0.0.1:3460 node scripts/check-open-lane-def.mjs
 */
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const BASE = (process.env.BASE || "http://127.0.0.1:3460").replace(/\/$/, "");
const OUT = process.env.OUT || "reviews/open-lane-def.json";
const SNAP = JSON.parse(fs.readFileSync("data/corpus-snapshot.json", "utf8"));
const EXPECT_INVESTABLE = Number(SNAP.investableCompanies);

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

function norm(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

const expectedRaw = execFileSync(
  process.execPath,
  [
    "node_modules/tsx/dist/cli.mjs",
    "-e",
    'import { openLaneDefinitionText, openLaneStrongDefinition, openLaneTopFundDefinition, openLaneDeskDefinition } from "./lib/domain/open-lane.ts"; console.log(JSON.stringify({ full: openLaneDefinitionText(), strong: openLaneStrongDefinition(), top: openLaneTopFundDefinition(), desk: openLaneDeskDefinition() }));',
  ],
  { encoding: "utf8", cwd: process.cwd() },
).trim();
const expected = JSON.parse(expectedRaw.split("\n").filter(Boolean).at(-1));

// Prefer the live BASE corpus (same JSON the home figure hydrates from). Fall back to public/data.
async function loadLiveJson(rel) {
  try {
    const res = await fetch(`${BASE}${rel}`, { headers: EXTRA.extraHTTPHeaders || {} });
    if (!res.ok) throw new Error(String(res.status));
    return await res.json();
  } catch {
    return null;
  }
}
const liveFounders = await loadLiveJson("/data/founders.json");
const liveDir = await loadLiveJson("/data/sample-directory.json");
const tmpDir = fs.mkdtempSync(path.join("/tmp", "open-lane-"));
const foundersPath = liveFounders
  ? path.join(tmpDir, "founders.json")
  : "public/data/founders.json";
const dirPath = liveDir
  ? path.join(tmpDir, "sample-directory.json")
  : "public/data/sample-directory.json";
if (liveFounders) fs.writeFileSync(foundersPath, JSON.stringify(liveFounders));
if (liveDir) fs.writeFileSync(dirPath, JSON.stringify(liveDir));
const corpusRaw = execFileSync(
  process.execPath,
  [
    "node_modules/tsx/dist/cli.mjs",
    "-e",
    `
import fs from "node:fs";
import { buildOpenLaneShell, founderIsOpenLane } from "./lib/domain/open-lane.ts";
const founders = JSON.parse(fs.readFileSync(process.env.FOUNDERS_PATH,"utf8"));
const dir = JSON.parse(fs.readFileSync(process.env.DIR_PATH,"utf8"));
const cards = Array.isArray(dir) ? dir : (dir.cards || []);
const investable = new Set(cards.map((c) => c.id).filter(Boolean));
const shell = buildOpenLaneShell(founders, investable);
const open = founders.filter((f) => founderIsOpenLane(f, investable));
const outside = open.filter((f) => !f.companyId || !investable.has(f.companyId));
console.log(JSON.stringify({
  source: process.env.CORPUS_SOURCE,
  investableCompanies: investable.size,
  openLaneCount: shell.count,
  strong: shell.strong,
  openLaneFounders: open.length,
  outsideCorpus: outside.length,
  outsideIds: outside.slice(0, 10).map((f) => ({ name: f.name, companyId: f.companyId, company: f.company })),
}));
`,
  ],
  {
    encoding: "utf8",
    cwd: process.cwd(),
    env: {
      ...process.env,
      FOUNDERS_PATH: foundersPath,
      DIR_PATH: dirPath,
      CORPUS_SOURCE: liveFounders && liveDir ? "live-base" : "public-data",
    },
  },
).trim();
const corpus = JSON.parse(corpusRaw.split("\n").filter(Boolean).at(-1));
pass(`corpus: open-lane computed from ${corpus.source} (investable=${corpus.investableCompanies}, open=${corpus.openLaneCount})`);

const report = {
  ok: true,
  base: BASE,
  expected,
  corpus,
  home: null,
  methodology: null,
};

const browser = await chromium.launch({ headless: true });

{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, ...EXTRA });
  await page.goto(`${BASE}/`, { waitUntil: "networkidle", timeout: 120000 });
  await page.waitForSelector("[data-fold-open-lane-def]", { timeout: 60000 });
  await page.waitForSelector("[data-fold-open-lane-figure]", { timeout: 60000 });
  // Wait until directory + founders hydrate so the figure is the investable recount.
  await page.waitForFunction(() => {
    const fig = document.querySelector("[data-fold-open-lane-figure]");
    const n = Number(String(fig?.textContent || "").replace(/,/g, "").trim());
    return Number.isFinite(n) && n > 0;
  }, { timeout: 60000 }).catch(() => {});
  const home = await page.evaluate(() => {
    const root = document.querySelector("[data-fold-open-lane-def]");
    const strong = document.querySelector("[data-fold-open-lane-def-strong]");
    const top = document.querySelector("[data-fold-open-lane-def-top-fund]");
    const desk = document.querySelector("[data-fold-open-lane-def-desk]");
    const figure = document.querySelector("[data-fold-open-lane-figure]");
    const attr = root?.getAttribute("data-fold-open-lane-def-full") || "";
    return {
      text: (root?.textContent || "").replace(/\s+/g, " ").trim(),
      strong: (strong?.textContent || "").replace(/\s+/g, " ").trim(),
      top: (top?.textContent || "").replace(/\s+/g, " ").trim(),
      desk: (desk?.textContent || "").replace(/\s+/g, " ").trim(),
      attr,
      figure: Number(String(figure?.textContent || "").replace(/,/g, "").trim()),
      visible: !!(root && root.getBoundingClientRect().height > 4),
    };
  });
  report.home = home;
  if (!home.visible) fail("home: open-lane definition not visible @1440");
  else pass("home: open-lane definition visible");
  if (norm(home.strong) !== norm(expected.strong)) fail(`home strong def mismatch: ${JSON.stringify(home.strong)}`);
  else pass("home: strong definition matches open-lane.ts");
  if (norm(home.top) !== norm(expected.top)) fail(`home top-fund def mismatch: ${JSON.stringify(home.top)}`);
  else pass("home: top-fund definition matches open-lane.ts");
  if (norm(home.desk) !== norm(expected.desk)) fail(`home desk def mismatch: ${JSON.stringify(home.desk)}`);
  else pass("home: desk definition matches open-lane.ts");
  if (norm(home.text) !== norm(expected.full)) fail(`home full def mismatch: ${JSON.stringify(home.text)}`);
  else pass("home: full definition matches open-lane.ts");
  if (norm(home.attr) !== norm(expected.full)) fail(`home data-fold-open-lane-def-full attr mismatch`);
  else pass("home: data-fold-open-lane-def-full matches");
  if (corpus.outsideCorpus !== 0) fail(`computed open-lane has ${corpus.outsideCorpus} founders outside investable corpus`);
  else pass(`corpus: every open-lane founder company is investable (n=${corpus.openLaneCount})`);
  if (corpus.investableCompanies !== EXPECT_INVESTABLE) fail(`investable corpus size ${corpus.investableCompanies} != ${EXPECT_INVESTABLE}`);
  else pass(`corpus: investable desk is ${EXPECT_INVESTABLE.toLocaleString("en-US")}`);
  if (home.figure !== corpus.openLaneCount) {
    fail(`home figure ${home.figure} != computed open-lane ${corpus.openLaneCount}`);
  } else {
    pass(`home: figure ${home.figure} equals computed open-lane set`);
  }
  await page.close();
}

{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, ...EXTRA });
  await page.goto(`${BASE}/methodology`, { waitUntil: "networkidle", timeout: 120000 });
  await page.waitForSelector("[data-methodology-open-lane-def]", { timeout: 30000 });
  const methodology = await page.evaluate(() => {
    const root = document.querySelector("[data-methodology-open-lane-def]");
    const strong = document.querySelector("[data-methodology-open-lane-def-strong]");
    const top = document.querySelector("[data-methodology-open-lane-def-top-fund]");
    const desk = document.querySelector("[data-methodology-open-lane-def-desk]");
    const full = document.querySelector("[data-methodology-open-lane-def-full]");
    return {
      text: (root?.textContent || "").replace(/\s+/g, " ").trim(),
      strong: (strong?.textContent || "").replace(/\s+/g, " ").trim(),
      top: (top?.textContent || "").replace(/\s+/g, " ").trim(),
      desk: (desk?.textContent || "").replace(/\s+/g, " ").trim(),
      full: (full?.textContent || "").replace(/\s+/g, " ").trim(),
    };
  });
  report.methodology = methodology;
  if (norm(methodology.strong) !== norm(expected.strong)) fail(`methodology strong def mismatch: ${JSON.stringify(methodology.strong)}`);
  else pass("methodology: strong definition matches open-lane.ts");
  if (norm(methodology.top) !== norm(expected.top)) fail(`methodology top-fund def mismatch: ${JSON.stringify(methodology.top)}`);
  else pass("methodology: top-fund definition matches open-lane.ts");
  if (norm(methodology.desk) !== norm(expected.desk)) fail(`methodology desk def mismatch: ${JSON.stringify(methodology.desk)}`);
  else pass("methodology: desk definition matches open-lane.ts");
  if (norm(methodology.text) !== norm(expected.full)) fail(`methodology visible def mismatch: ${JSON.stringify(methodology.text)}`);
  else pass("methodology: visible definition matches open-lane.ts");
  if (norm(methodology.full) !== norm(expected.full)) fail(`methodology full def mismatch`);
  else pass("methodology: full definition matches open-lane.ts");
  await page.close();
}

await browser.close();

report.ok = process.exitCode !== 1;
fs.mkdirSync(path.dirname(OUT) === "." ? "reviews" : path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(report.ok ? "PASS check-open-lane-def" : "FAIL check-open-lane-def", {
  wrote: OUT,
  openLaneCount: corpus.openLaneCount,
  investableCompanies: corpus.investableCompanies,
});
if (!report.ok) process.exit(1);
