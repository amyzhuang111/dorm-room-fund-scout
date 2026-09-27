// Second-pass LinkedIn check for former DRF student partners.
// Applies data/imports/drf_linkedin_pass2.json onto data/imports/drf_alumni.json,
// then reloads the alumni table. Re-running writes the same rows.
//
//   npx tsx scripts/ingest/import-drf-linkedin-pass2.ts
//
// Patches are keyed by alumni id. A null linkedin_url clears a wrong match.
// Free public pages only; each confirmed profile keeps the page that corroborated it.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ALUMNI_PATH = path.join(process.cwd(), "data", "imports", "drf_alumni.json");
const PATCH_PATH = path.join(process.cwd(), "data", "imports", "drf_linkedin_pass2.json");

const PATCH_KEYS = [
  "linkedin_url",
  "linkedin_confidence",
  "linkedin_source_url",
  "current_firm",
  "current_role",
  "firm_confidence",
  "firm_source_url",
  "firm_type",
  "location",
  "verification_note",
  "proof_urls",
] as const;

function same(left: unknown, right: unknown): boolean {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

function main() {
  const alumni = JSON.parse(fs.readFileSync(ALUMNI_PATH, "utf8")) as Record<string, unknown>[];
  const patches = JSON.parse(fs.readFileSync(PATCH_PATH, "utf8")) as Record<string, unknown>[];
  if (!Array.isArray(alumni) || !Array.isArray(patches)) throw new Error("alumni and patch files must be lists");
  const byId = new Map(alumni.map((row) => [String(row.id), row]));
  const seen = new Set<string>();
  let applied = 0;
  let missing = 0;
  let cleared = 0;
  let confirmed = 0;

  for (const patch of patches) {
    const id = typeof patch.id === "string" ? patch.id : "";
    if (!id || seen.has(id)) throw new Error(`Bad or duplicate patch id: ${id || "(missing)"}`);
    seen.add(id);
    const row = byId.get(id);
    if (!row) {
      missing += 1;
      console.warn(`${id}: not in drf_alumni.json; skipped`);
      continue;
    }
    const beforeFirm = typeof row.current_firm === "string" ? row.current_firm : "";
    let changed = false;
    for (const key of PATCH_KEYS) {
      if (!Object.prototype.hasOwnProperty.call(patch, key)) continue;
      const value = patch[key];
      if (key === "proof_urls") {
        const urls = Array.isArray(value) ? value.filter((url) => typeof url === "string" && url.startsWith("https://")) : [];
        if (!same(row.proof_urls ?? [], urls)) {
          row.proof_urls = urls;
          changed = true;
        }
        continue;
      }
      if (value == null || value === "") {
        if (row[key] != null) {
          delete row[key];
          changed = true;
        }
        continue;
      }
      if (!same(row[key], value)) {
        row[key] = value;
        changed = true;
      }
    }
    if (changed) applied += 1;
    if (patch.linkedin_url == null && Object.prototype.hasOwnProperty.call(patch, "linkedin_url")) cleared += 1;
    if (patch.linkedin_confidence === "confirmed") confirmed += 1;
    if (!beforeFirm && typeof row.current_firm === "string" && row.current_firm) {
      console.log(`${id}: firm filled ${row.current_firm}`);
    }
  }

  const next = JSON.stringify(alumni, null, 2) + "\n";
  const prev = fs.readFileSync(ALUMNI_PATH, "utf8");
  if (next !== prev) fs.writeFileSync(ALUMNI_PATH, next);
  console.log(`pass2 patches: ${patches.length}; json rows changed: ${applied}; confirmed in file: ${confirmed}; cleared: ${cleared}; ids missing from alumni file: ${missing}`);

  const tsx = path.join(process.cwd(), "node_modules", ".bin", "tsx");
  const child = spawnSync(tsx, ["scripts/ingest/import-drf-alumni.ts"], { stdio: "inherit", cwd: process.cwd() });
  if (child.status !== 0) process.exit(child.status ?? 1);
}

main();
