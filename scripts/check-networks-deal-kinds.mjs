/**
 * Programs/accelerators must not appear under Investors; funds (inv_*) must not
 * appear under Networks. Checks deals pack + featured DOM card.
 * Usage: BASE=http://127.0.0.1:PORT node scripts/check-networks-deal-kinds.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const BASE = process.env.BASE || "http://127.0.0.1:3471";
const ROOT = process.cwd();

const PROGRAM_RE =
  /vip-?x|venture\s*lab\s*vip|y combinator|\byc\b|a16z speedrun|speedrun|startup challenge|bridge award|venture prize|summer launchpad|thiel fellowship|\bneo\b|pear\s*xc|mayfield fellows|skydeck|\belab\b|delta v|venturecat|tsai city|startup lab|grasp lab|cardinal ventures|innovate x|cal launchpad|summer venture studio|^velocity$/i;

function fail(msg) {
  console.error("FAIL", msg);
  process.exitCode = 1;
}

const dealsPath = path.join(ROOT, "public/data/founder-networks-deals.json");
const pagePath = path.join(ROOT, "public/data/founder-networks-page.json");
const deals = JSON.parse(fs.readFileSync(dealsPath, "utf8"));
const page = JSON.parse(fs.readFileSync(pagePath, "utf8"));

let badInv = 0;
let badNet = 0;
const samples = [];
for (const [fid, deal] of Object.entries(deals.deals || {})) {
  for (const name of deal.investors || []) {
    if (PROGRAM_RE.test(name)) {
      badInv += 1;
      if (samples.length < 8) samples.push({ fid, where: "investors", name });
    }
  }
  for (const name of deal.networks || []) {
    if (/^inv_/i.test(name) || (/ventures|capital|partners|fund\b|vc\b/i.test(name) && !PROGRAM_RE.test(name))) {
      // Allow nothing that looks like a fund id/label on Networks.
      if (/^inv_/i.test(name) || (!PROGRAM_RE.test(name) && /ventures|capital|partners|\bfund\b|\bvc\b/i.test(name))) {
        badNet += 1;
        if (samples.length < 12) samples.push({ fid, where: "networks", name });
      }
    }
  }
}

// topNetworks investor hubs are fine as their own rail; membersByNetwork keys for inv_* are OK.
// Deal networks lists must not include inv_* labels.
if (badInv) fail(`${badInv} program/accelerator labels filed under Investors`);
if (badNet) fail(`${badNet} investor ids/labels filed under Networks`);

const featuredId = deals.featuredId;
const featured = featuredId ? deals.deals?.[featuredId] : null;
if (featured) {
  for (const name of featured.investors || []) {
    if (PROGRAM_RE.test(name)) fail(`featured investors contains program: ${name}`);
  }
  for (const name of featured.networks || []) {
    if (/^inv_/i.test(name)) fail(`featured networks contains investor id: ${name}`);
  }
}

const browser = await chromium.launch({ headless: true });
const pageBrowser = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await pageBrowser.goto(`${BASE}/networks`, { waitUntil: "networkidle", timeout: 120000 });
await pageBrowser.waitForSelector("[data-networks-featured], [data-networks-detail]", { timeout: 60000 });
await pageBrowser.waitForTimeout(800);
const dom = await pageBrowser.evaluate(() => {
  const card = document.querySelector("[data-networks-featured]") || document.querySelector("[data-networks-detail]");
  return {
    text: card?.innerText || "",
    inv: card?.querySelector("[data-networks-deal-investors]")?.textContent || "",
    net: card?.querySelector("[data-networks-deal-networks]")?.textContent || "",
  };
});
await browser.close();

if (PROGRAM_RE.test(dom.inv)) fail(`DOM investors list has program text: ${dom.inv.slice(0, 160)}`);
if (/inv_/i.test(dom.net)) fail(`DOM networks list has inv_ id: ${dom.net.slice(0, 160)}`);

console.log(
  JSON.stringify(
    {
      ok: !process.exitCode,
      badInv,
      badNet,
      samples,
      featuredId,
      featuredInvestors: featured?.investors?.length ?? 0,
      featuredNetworks: featured?.networks ?? [],
      pageNetworks: page.totals?.networks,
    },
    null,
    2,
  ),
);
if (process.exitCode) {
  console.error("check-networks-deal-kinds FAILED");
  process.exit(process.exitCode);
}
console.log("OK programs stay in Networks; funds stay in Investors");
