// Applies founder/startup scout tiers + quality dimensions to every
// DB-backed source, from the catalogue in lib/domain/source-quality.ts.
// Safe to re-run: never touches a source that has a manual tier override
// (tier_override_by set) — ingestion/seeding must never silently clobber a
// human's deliberate override.
//
// Run: npx tsx scripts/ingest/seed-source-tiers.ts

import { getDb } from "../../lib/db/client";
import { SOURCE_CATALOGUE } from "../../lib/domain/source-quality";

function main() {
  const db = getDb();
  const update = db.prepare(
    `UPDATE sources SET founder_scout_tier=?, startup_scout_tier=?, quality_dimensions_json=?, source_role=?, tier_rationale=?
     WHERE id=? AND tier_override_by IS NULL`
  );
  const findOverridden = db.prepare(`SELECT id FROM sources WHERE id=? AND tier_override_by IS NOT NULL`);

  let updated = 0;
  let skippedOverride = 0;
  for (const entry of SOURCE_CATALOGUE) {
    if (!entry.dbSourceId) continue;
    if (findOverridden.get(entry.dbSourceId)) {
      skippedOverride++;
      continue;
    }
    const res = update.run(
      entry.founderScoutTier,
      entry.startupScoutTier,
      JSON.stringify(entry.dimensions),
      entry.role,
      entry.tierRationale,
      entry.dbSourceId
    );
    if (res.changes > 0) updated++;
  }
  const liftThiel = db.prepare(
    `UPDATE people SET signal_tier='S+'
     WHERE signal_tier_basis LIKE 'Thiel Fellow%' AND signal_tier IS NOT NULL AND signal_tier != 'S+'`
  );
  const liftThielProjects = db.prepare(
    `UPDATE projects SET signal_tier='S+'
     WHERE signal_tier_basis LIKE 'Thiel Fellow%' AND signal_tier IS NOT NULL AND signal_tier != 'S+'`
  );
  const people = liftThiel.run().changes;
  const projects = liftThielProjects.run().changes;
  console.log(`Tier metadata applied to ${updated} source(s); ${skippedOverride} skipped (manually overridden). Thiel Fellowship lifted to S+ on ${people} people and ${projects} projects.`);
}

main();
