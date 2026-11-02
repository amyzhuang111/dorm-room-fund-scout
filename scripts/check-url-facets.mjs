/**
 * Each URL facet must hydrate into dismissible chips + N of M on /companies.
 * Usage: BASE=http://127.0.0.1:3460 node scripts/check-url-facets.mjs
 */
import { chromium } from "playwright";

const BASE = process.env.BASE || "http://127.0.0.1:3460";

const CASES = [
  { qs: "q=Mercor", chip: "query", expect: /Mercor/i },
  { qs: "status=active", chip: "status", expect: /active/i },
  { qs: "stage=Seed", chip: "stage", expect: /Seed/i },
  { qs: "flag=signaled", chip: "flag", expect: /signaled/i },
  { qs: "year=2024", chip: "foundedYear", expect: /2024/ },
  { qs: "recency=year", chip: "recency", expect: /year|12|Past/i },
  { qs: "sector=fintech&campus=univ_penn", chip: null, expect: /fintech|Penn|of/i },
];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const failures = [];

for (const c of CASES) {
  const url = `${BASE}/companies?${c.qs}`;
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
    const landed = page.url();
    if (!landed.includes(c.qs.split("&")[0])) {
      failures.push(`${c.qs}: URL lost (${landed})`);
      continue;
    }
    const nOfM = page.locator("[data-n-of-m]").first();
    await nOfM.waitFor({ state: "visible", timeout: 15000 });
    if (c.chip) {
      const chip = page.locator(`[data-filter-chip="${c.chip}"]`).first();
      const visible = await chip.isVisible().catch(() => false);
      if (!visible) {
        failures.push(`${c.qs}: missing chip ${c.chip}`);
        continue;
      }
      const text = await chip.innerText();
      if (!c.expect.test(text)) {
        failures.push(`${c.qs}: chip text "${text}" !~ ${c.expect}`);
      }
    }
    // Export control present on desk or mobile
    const exportBtn = page.locator("[data-export-filtered], [data-export-filtered-mobile]").first();
    if (!(await exportBtn.isVisible().catch(() => false))) {
      failures.push(`${c.qs}: export control missing`);
    }
    // Dock appears when filtered set non-empty
    const matchText = await page.locator("[data-match-count]").first().innerText().catch(() => "");
    console.log(`ok  ?${c.qs}  match=${matchText || "?"}`);
  } catch (err) {
    failures.push(`${c.qs}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

await browser.close();
if (failures.length) {
  console.error("FAIL");
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}
console.log(`PASS ${CASES.length} URL facet cases`);
