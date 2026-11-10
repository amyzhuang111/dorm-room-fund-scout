/**
 * Download the live export and parse the workbook.
 * Usage: BASE=http://127.0.0.1:3466 node scripts/check-corpus-export.mjs
 */
const BASE = (process.env.BASE || "http://127.0.0.1:3466").replace(/\/$/, "");

const imported = await import("exceljs");
const ExcelJS = imported.default ?? imported;

function fail(message) {
  console.error("FAIL", message);
  process.exitCode = 1;
}

async function load(path) {
  const res = await fetch(`${BASE}${path}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  const type = res.headers.get("content-type") || "";
  const disposition = res.headers.get("content-disposition") || "";
  console.log(JSON.stringify({ path, status: res.status, type, disposition, bytes: bytes.length, zip: bytes.subarray(0, 2).toString("hex") }));
  if (res.status !== 200) fail(`${path} status ${res.status}`);
  if (!type.includes("spreadsheetml.sheet")) fail(`${path} content-type ${type}`);
  if (!disposition.includes("campus-scout-corpus.xlsx")) fail(`${path} disposition ${disposition}`);
  if (bytes.subarray(0, 2).toString("hex") !== "504b") fail(`${path} is not a zip workbook`);
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(bytes);
  const sheet = book.getWorksheet("Corpus");
  if (!sheet) fail(`${path} missing Corpus sheet`);
  const people = book.getWorksheet("Relationships");
  if (!people) fail(`${path} missing Relationships sheet`);
  else if (path === "/data/export") {
    const wanted = {
      person_LRoS0rCtKx51: /unknown/,
      "per_bym-5BA7UqH5": /unknown/,
      person__2ZFFoTJx5xE: /unknown/,
    };
    const seen = {};
    for (let i = 2; i <= people.rowCount; i += 1) {
      const id = String(people.getRow(i).getCell(1).value ?? "");
      if (!wanted[id] || seen[id]) continue;
      const present = String(people.getRow(i).getCell(8).value ?? "");
      const reason = String(people.getRow(i).getCell(9).value ?? "");
      seen[id] = `${present} ${reason}`;
      if (!wanted[id].test(present) || !/unknown/i.test(reason)) fail(`${id} relationship scope ${seen[id].slice(0, 180)}`);
    }
    for (const id of Object.keys(wanted)) if (!seen[id]) fail(`missing relationship row ${id}`);
    console.log(JSON.stringify({ relationshipRows: people.rowCount - 1, scoped: seen }));
  }
  return sheet;
}

const all = await load("/data/export");
const filtered = await load("/data/export?campus=univ_harvard");
const header = [...all.getRow(1).values].slice(1).map(String);
console.log(JSON.stringify({ headers: header, allRows: all.rowCount - 1, harvardRows: filtered.rowCount - 1, frozen: all.views[0]?.state }));
if (header.length !== 21) fail(`header count ${header.length}`);
if (!header.includes("founded_year") || !header.includes("latest_signal_at") || !header.includes("source_urls")) fail("missing columns");
if (all.rowCount < 1000) fail(`unfiltered rows ${all.rowCount - 1}`);
if (filtered.rowCount >= all.rowCount) fail("campus filter did not reduce the workbook");
if (all.views[0]?.state !== "frozen") fail("header is not frozen");

let yearOnly = 0;
let yearMonth = 0;
let fullDate = 0;
let blankDate = 0;
let accelerator = 0;
let guarded = 0;
for (let i = 2; i <= all.rowCount; i += 1) {
  const row = all.getRow(i);
  const founded = row.getCell(6).value;
  const latest = row.getCell(10).value;
  const funding = row.getCell(17).value;
  const name = row.getCell(2).value;
  if (founded instanceof Date || latest instanceof Date) fail(`row ${i} stored a Date`);
  const latestText = latest == null ? "" : String(latest?.text ?? latest);
  if (!latestText) blankDate += 1;
  else if (/^\d{4}$/.test(latestText)) yearOnly += 1;
  else if (/^\d{4}-\d{2}$/.test(latestText)) yearMonth += 1;
  else if (/^\d{4}-\d{2}-\d{2}$/.test(latestText)) fullDate += 1;
  if (funding === "Accelerator" || funding === "Seed") accelerator += 1;
  const nameText = String(name?.text ?? name ?? "");
  if (/^[=+\-@\t\r]/.test(nameText) && !nameText.startsWith("'")) guarded += 1;
  const foundedText = founded == null ? "" : String(founded);
  if (foundedText && !/^\d{4}$/.test(foundedText)) fail(`founded year ${foundedText}`);
}
console.log(JSON.stringify({ yearOnly, yearMonth, fullDate, blankDate, accelerator, unguardedFormula: guarded }));
if (!yearOnly || !yearMonth || !fullDate) fail("mixed date precision was collapsed");
if (guarded) fail("formula-leading cell was not guarded");
if (!process.exitCode) console.log("PASS corpus export");
