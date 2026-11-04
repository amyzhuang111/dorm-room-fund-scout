// Build-time founders table payload for /founders.
// Writes public/data/founder-table.json ({ founderCount, rows }), the same shape
// /api/founder-table returns for the all-campuses view, so the page loads a
// static CDN file instead of paying a cold serverless build per visitor
// (measured ~6 s cold on Vercel). Campus-filtered pages still use the API.
import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { loadFounderTable, loadProjectRows } from "../lib/domain/founder-table";

const dir = path.join(process.cwd(), "public", "data");
fs.mkdirSync(dir, { recursive: true });

const started = performance.now();
const founders = loadFounderTable();
const rows = loadProjectRows();
const json = JSON.stringify({ founderCount: founders.length, rows });
fs.writeFileSync(path.join(dir, "founder-table.json"), json);
console.log(
  `founder-table.json ${(Buffer.byteLength(json) / 1024).toFixed(0)} KiB · ${founders.length} founders · ${rows.length} projects in ${(performance.now() - started).toFixed(0)} ms`,
);
