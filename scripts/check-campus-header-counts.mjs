/**
 * Fail when any campus header founderCount drifts from its founder list total.
 * Covers all campuses returned by listUniversities() (170).
 *
 * Usage:
 *   node scripts/check-campus-header-counts.mjs
 */
import path from "node:path";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scriptPath = path.join(root, "scripts", "_check-campus-header-counts-run.ts");
const script = `import { listUniversities, listFoundersForPage } from "../lib/domain/queries";

const unis = listUniversities();
const errors: { id: string; name: string; header: number; list: number }[] = [];
let checked = 0;
for (const u of unis) {
  checked += 1;
  const listed = listFoundersForPage({ universityId: u.id }).length;
  if (u.founderCount !== listed) {
    errors.push({ id: u.id, name: u.name, header: u.founderCount, list: listed });
  }
}
const withFounders = unis.filter((u) => u.founderCount > 0).length;
const report = { ok: errors.length === 0, checked, withFounders, mismatches: errors };
console.log(JSON.stringify(report, null, 2));
if (errors.length) process.exit(1);
`;
fs.writeFileSync(scriptPath, script);
const res = spawnSync("npx", ["tsx", scriptPath], { cwd: root, encoding: "utf8", env: process.env });
process.stdout.write(res.stdout || "");
process.stderr.write(res.stderr || "");
fs.unlinkSync(scriptPath);
const outPath = path.join(root, "reviews", "campus-header-counts.json");
fs.mkdirSync(path.dirname(outPath), { recursive: true });
try {
  const lines = (res.stdout || "").trim().split("\n");
  const jsonLine = [...lines].reverse().find((l) => l.startsWith("{"));
  const parsed = JSON.parse(jsonLine || "{}");
  fs.writeFileSync(outPath, JSON.stringify(parsed, null, 2) + "\n");
} catch {
  /* ignore */
}
process.exit(res.status ?? 1);
