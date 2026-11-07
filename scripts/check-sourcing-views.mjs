/**
 * Data cards keep a label with each value. Founders rows are named people.
 * Usage: BASE=http://127.0.0.1:3466 node scripts/check-sourcing-views.mjs
 */
import { chromium } from "playwright";

const BASE = (process.env.BASE || "http://127.0.0.1:3466").replace(/\/$/, "");
const CHROME = process.env.CHROME_PATH || undefined;
const WIDTHS = [320, 375, 390, 430, 1440];

function fail(message) {
  console.error("FAIL", message);
  process.exitCode = 1;
}

const browser = await chromium.launch({
  headless: true,
  executablePath: CHROME,
  args: CHROME ? ["--no-sandbox", "--disable-dev-shm-usage"] : [],
});

for (const width of WIDTHS) {
  const page = await browser.newPage({ viewport: { width, height: width >= 1024 ? 900 : 844 }, deviceScaleFactor: 3 });
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error).slice(0, 160)));
  await page.goto(`${BASE}/data`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForSelector("[data-corpus-explorer]", { timeout: 30000 });
  const data = await page.evaluate(() => {
    const mobile = window.innerWidth < 640;
    const rows = [...document.querySelectorAll(mobile ? "[data-corpus-mobile-row]" : "[data-corpus-table] [data-corpus-row]")];
    const visibleRows = rows.filter((row) => row.getBoundingClientRect().height > 0);
    const unlabeled = [];
    if (mobile) {
      for (const row of visibleRows.slice(0, 8)) {
        for (const field of row.querySelectorAll("[data-corpus-field]")) {
          const label = field.querySelector("dt")?.textContent?.trim() || "";
          const value = field.querySelector("dd")?.textContent?.trim() || "";
          if (!label || !value) unlabeled.push(field.textContent || "");
        }
      }
    }
    const name = visibleRows[0]?.querySelector("a")?.textContent?.trim() || "";
    const firstTop = visibleRows[0]?.getBoundingClientRect().top ?? 9999;
    const search = document.querySelector('form[data-corpus-filters] input[name="q"]');
    const searchLabel = search?.closest("label")?.querySelector("span")?.textContent?.trim() || "";
    const placeholder = search?.getAttribute("placeholder") || "";
    let searchClipped = false;
    if (search) {
      const previous = search.value;
      search.value = placeholder;
      searchClipped = search.scrollWidth > search.clientWidth + 1;
      search.value = previous;
    }
    return {
      mobile,
      rows: visibleRows.length,
      unlabeled,
      name,
      firstTop: Math.round(firstTop),
      searchLabel,
      placeholder,
      searchClipped,
      exports: document.querySelectorAll("[data-corpus-csv], [data-corpus-csv-mobile]").length,
    };
  });
  console.log(JSON.stringify({ width, page: "data", ...data, errors }));
  if (!data.rows) fail(`${width}: data has no visible records`);
  if (data.unlabeled.length) fail(`${width}: unlabeled data fields`);
  if (data.exports !== 1) fail(`${width}: expected one export control, saw ${data.exports}`);
  if (!data.searchLabel || data.searchClipped) fail(`${width}: data search label or placeholder is clipped`);
  if (width <= 390 && data.mobile && data.firstTop > 760) fail(`${width}: first data record starts at ${data.firstTop}`);
  if (errors.length) fail(`${width} data: ${errors.join(" | ")}`);

  await page.goto(`${BASE}/founders`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForSelector("[data-founder-person]", { timeout: 60000 });
  const founders = await page.evaluate(() => {
    const people = [...document.querySelectorAll("[data-founder-person]")].filter((row) => row.getBoundingClientRect().height > 0);
    const first = people[0];
    const name = first?.querySelector("[data-founder-name]")?.textContent?.trim() || "";
    const table = document.querySelector("[data-founder-table]");
    const tableVisible = table ? table.getBoundingClientRect().height > 0 : false;
    const headers = tableVisible ? [...table.querySelectorAll("th")].map((th) => (th.textContent || "").trim()) : [];
    const fields = [...(first?.querySelectorAll("[data-founder-field]") || [])].map((field) => ({
      label: field.querySelector("dt")?.textContent?.trim() || "",
      value: field.querySelector("dd")?.textContent?.trim() || "",
    }));
    const search = document.querySelector('form input[name="q"]');
    const searchLabel = search?.closest("label")?.querySelector("span")?.textContent?.trim() || "";
    const placeholder = search?.getAttribute("placeholder") || "";
    let searchClipped = false;
    if (search) {
      const previous = search.value;
      search.value = placeholder;
      searchClipped = search.scrollWidth > search.clientWidth + 1;
      search.value = previous;
    }
    return {
      people: people.length,
      projects: document.querySelectorAll("[data-project-card]").length,
      name,
      fields,
      tableVisible,
      headers,
      searchLabel,
      placeholder,
      searchClipped,
    };
  });
  console.log(JSON.stringify({ width, page: "founders", ...founders }));
  if (!founders.people) fail(`${width}: no named founders`);
  if (founders.projects) fail(`${width}: project cards still render on Founders`);
  if (!founders.name || founders.name === "n/a") fail(`${width}: founder name missing`);
  if (founders.tableVisible) {
    for (const header of ["Name", "Campus", "Company", "Class year"]) {
      if (!founders.headers.includes(header)) fail(`${width}: founder table missing ${header}`);
    }
  } else if (founders.fields.some((field) => !field.label || !field.value)) {
    fail(`${width}: founder field missing a label or value`);
  }
  if (!founders.searchLabel || founders.searchClipped) fail(`${width}: founder search label or placeholder is clipped`);
  await page.close();
}

await pageHomeCheck();

async function pageHomeCheck() {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForSelector('[data-globe-state="ready"]', { timeout: 30000 });
  const home = await page.evaluate(() => {
    const stage = document.querySelector("[data-dispatch-map-stage]")?.getBoundingClientRect();
    const credit = document.querySelector("[data-map-credit]")?.getBoundingClientRect();
    const labels = [...document.querySelectorAll('[aria-label="Map locations"] button')].map((button) => (button.textContent || "").replace(/\s+/g, " ").trim());
    const overlap = stage && credit ? !(credit.bottom <= stage.top + 1 || credit.top >= stage.bottom - 1) : true;
    return { stageH: stage ? Math.round(stage.height) : 0, overlap, labels, credit: document.querySelector("[data-map-credit]")?.textContent || "" };
  });
  console.log(JSON.stringify({ page: "home", ...home }));
  if (home.stageH > 392) fail(`home stage ${home.stageH} is taller than a 390px frame`);
  if (home.overlap) fail("home attribution overlaps the map");
  if (!home.labels.includes("Startup HQs") || !home.labels.includes("Campuses")) fail("home map controls missing");
  if (!/OpenStreetMap/.test(home.credit)) fail("home attribution missing");
  await page.close();
}

await browser.close();
if (!process.exitCode) console.log("PASS sourcing views");
