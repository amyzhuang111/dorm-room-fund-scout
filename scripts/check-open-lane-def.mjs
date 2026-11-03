/**
 * Fail if the desk open-lane hero (or /methodology) definition text drifts from
 * lib/domain/open-lane.ts. Usage:
 *   BASE=http://127.0.0.1:3460 node scripts/check-open-lane-def.mjs
 */
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const BASE = (process.env.BASE || "http://127.0.0.1:3460").replace(/\/$/, "");
const OUT = process.env.OUT || "reviews/open-lane-def.json";
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
  "npx",
  [
    "--yes",
    "tsx",
    "-e",
    'import { openLaneDefinitionText, openLaneStrongDefinition, openLaneTopFundDefinition } from "./lib/domain/open-lane.ts"; console.log(JSON.stringify({ full: openLaneDefinitionText(), strong: openLaneStrongDefinition(), top: openLaneTopFundDefinition() }));',
  ],
  { encoding: "utf8", cwd: process.cwd() },
).trim();
const expected = JSON.parse(expectedRaw.split("\n").filter(Boolean).at(-1));

const report = {
  ok: true,
  base: BASE,
  expected,
  home: null,
  methodology: null,
};

const browser = await chromium.launch({ headless: true });

{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, ...EXTRA });
  await page.goto(`${BASE}/`, { waitUntil: "networkidle", timeout: 120000 });
  await page.waitForSelector("[data-fold-open-lane-def]", { timeout: 60000 });
  const home = await page.evaluate(() => {
    const root = document.querySelector("[data-fold-open-lane-def]");
    const strong = document.querySelector("[data-fold-open-lane-def-strong]");
    const top = document.querySelector("[data-fold-open-lane-def-top-fund]");
    const attr = root?.getAttribute("data-fold-open-lane-def-full") || "";
    return {
      text: (root?.textContent || "").replace(/\s+/g, " ").trim(),
      strong: (strong?.textContent || "").replace(/\s+/g, " ").trim(),
      top: (top?.textContent || "").replace(/\s+/g, " ").trim(),
      attr,
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
  if (norm(home.text) !== norm(expected.full)) fail(`home full def mismatch: ${JSON.stringify(home.text)}`);
  else pass("home: full definition matches open-lane.ts");
  if (norm(home.attr) !== norm(expected.full)) fail(`home data-fold-open-lane-def-full attr mismatch`);
  else pass("home: data-fold-open-lane-def-full matches");
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
    const full = document.querySelector("[data-methodology-open-lane-def-full]");
    return {
      text: (root?.textContent || "").replace(/\s+/g, " ").trim(),
      strong: (strong?.textContent || "").replace(/\s+/g, " ").trim(),
      top: (top?.textContent || "").replace(/\s+/g, " ").trim(),
      full: (full?.textContent || "").replace(/\s+/g, " ").trim(),
    };
  });
  report.methodology = methodology;
  if (norm(methodology.strong) !== norm(expected.strong)) fail(`methodology strong def mismatch: ${JSON.stringify(methodology.strong)}`);
  else pass("methodology: strong definition matches open-lane.ts");
  if (norm(methodology.top) !== norm(expected.top)) fail(`methodology top-fund def mismatch: ${JSON.stringify(methodology.top)}`);
  else pass("methodology: top-fund definition matches open-lane.ts");
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
console.log(report.ok ? "PASS check-open-lane-def" : "FAIL check-open-lane-def", { wrote: OUT });
if (!report.ok) process.exit(1);
