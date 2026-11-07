// Logical row fingerprint of a Campus Scout database.
// Ignores SQLite page layout. corpus_migrations.applied_at and snapshot generatedAt
// are build clocks when those files are passed separately.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const dbPath = process.argv[2];
const snapshotPath = process.argv[3];
if (!dbPath) {
  console.error("usage: node scripts/audit/logical-corpus-fingerprint.mjs <db> [snapshot.json]");
  process.exit(1);
}
const db = new DatabaseSync(dbPath, { readOnly: true });
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map((row) => row.name);
const tableHashes = {};
for (const table of tables) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all().map((column) => column.name);
  const keys = db.prepare(`PRAGMA table_info(${table})`).all().filter((column) => column.pk).map((column) => column.name);
  const order = (keys.length ? keys : columns).map((name) => `"${name}"`).join(", ");
  const rows = db.prepare(`SELECT ${columns.map((name) => `"${name}"`).join(", ")} FROM "${table}" ORDER BY ${order}`).all();
  tableHashes[table] = createHash("sha256").update(JSON.stringify(rows)).digest("hex");
}
let snapshot = null;
if (snapshotPath) {
  const parsed = JSON.parse(readFileSync(snapshotPath, "utf8"));
  const clock = parsed.generatedAt ?? null;
  delete parsed.generatedAt;
  snapshot = { clock, logical: createHash("sha256").update(JSON.stringify(parsed)).digest("hex") };
}
const logical = createHash("sha256").update(JSON.stringify(tableHashes)).digest("hex");
console.log(JSON.stringify({ dbPath, logical, tables: tableHashes, snapshot }));
