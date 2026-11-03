/**
 * Featured / detail deal card must not repeat the same investor (or network) name.
 * Usage: BASE=http://127.0.0.1:3471 node scripts/check-networks-featured.mjs
 */
import { chromium } from "playwright";
import fs from "fs";

const BASE = process.env.BASE || "http://127.0.0.1:3471";
const OUT = process.env.OUT || "";

function fail(msg) {
  console.error("FAIL", msg);
  process.exitCode = 1;
}

function dupes(names) {
  const seen = new Set();
  const d = [];
  for (const n of names) {
    const k = n.trim().toLowerCase();
    if (!k) continue;
    if (seen.has(k)) d.push(n);
    else seen.add(k);
  }
  return d;
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(`${BASE}/networks`, { waitUntil: "networkidle", timeout: 120000 });
await page.waitForSelector("[data-networks-featured], [data-networks-detail]", { timeout: 60000 });
await page.waitForTimeout(1200);

const report = await page.evaluate(() => {
  const card = document.querySelector("[data-networks-featured]") || document.querySelector("[data-networks-detail]");
  if (!card) return { missing: true };
  const invEl = card.querySelector("[data-networks-deal-investors]");
  const netEl = card.querySelector("[data-networks-deal-networks]");
  const invText = (invEl?.textContent || "").replace(/^Investors\s*\(\d+\):\s*/i, "").replace(/\s*·.*$/, "");
  const netText = (netEl?.textContent || "").replace(/^Networks\s*\(\d+\):\s*/i, "");
  const split = (s) =>
    s
      .split(",")
      .map((x) => x.trim())
      .filter((x) => x && !/^unknown$/i.test(x) && !/top fund/i.test(x) && !/no named/i.test(x));
  const investors = split(invText);
  const networks = split(netText);
  const cross = investors.filter((i) => networks.some((n) => n.toLowerCase() === i.toLowerCase()));
  return {
    missing: false,
    text: card.innerText.slice(0, 500),
    investors,
    networks,
    cross,
  };
});

report.ok = true;
report.investorDupes = [];
report.networkDupes = [];
if (report.missing) {
  report.ok = false;
  fail("missing featured/detail card");
} else {
  report.investorDupes = dupes(report.investors);
  report.networkDupes = dupes(report.networks);
  if (report.investorDupes.length) {
    report.ok = false;
    fail(`duplicate investor names: ${report.investorDupes.join(", ")}`);
  }
  if (report.networkDupes.length) {
    report.ok = false;
    fail(`duplicate network names: ${report.networkDupes.join(", ")}`);
  }
  if (report.cross?.length) {
    report.ok = false;
    fail(`investor names repeated under Networks: ${report.cross.join(", ")}`);
  }
}

if (OUT) fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(
  JSON.stringify(
    {
      ok: report.ok,
      investors: report.investors?.length,
      networks: report.networks?.length,
      cross: report.cross,
      investorDupes: report.investorDupes,
      networkDupes: report.networkDupes,
    },
    null,
    2,
  ),
);
await browser.close();
if (process.exitCode) {
  console.error("check-networks-featured FAILED");
  process.exit(process.exitCode);
}
console.log("OK featured card has no duplicate investor/network names");
