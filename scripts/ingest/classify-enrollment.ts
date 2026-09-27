// Every person gets Current student, Recent grad (2023–2026), or Alumni.
// A stated class year stays verified. Anything else is inferred and stores
// the reason on enrollment_evidence plus enrollment_basis = inferred.
//
// Run: npx tsx scripts/ingest/classify-enrollment.ts

import { getDb } from "../../lib/db/client";
import { recomputeAllEnrollment } from "../../lib/domain/enrollment-store";

function counts(db: ReturnType<typeof getDb>) {
  const rows = db.prepare(`SELECT COALESCE(enrollment_status, 'unknown') AS status, COALESCE(enrollment_basis, 'unset') AS basis, COUNT(*) AS n FROM people GROUP BY 1, 2 ORDER BY 1, 2`).all() as { status: string; basis: string; n: number }[];
  return rows;
}

function main() {
  const db = getDb();
  console.log("Before");
  for (const row of counts(db)) console.log(`  ${row.status} ${row.basis} ${row.n}`);
  const recomputed = recomputeAllEnrollment(db);
  db.pragma("wal_checkpoint(TRUNCATE)");
  console.log("Recompute buckets", recomputed);
  console.log("After");
  let verified = 0;
  let inferred = 0;
  const buckets = { current_student: 0, recent_grad: 0, older_alumni: 0, unknown: 0 };
  for (const row of counts(db)) {
    console.log(`  ${row.status} ${row.basis} ${row.n}`);
    if (row.basis === "verified") verified += row.n;
    if (row.basis === "inferred") inferred += row.n;
    if (row.status in buckets) buckets[row.status as keyof typeof buckets] += row.n;
  }
  const unknown = (db.prepare(`SELECT COUNT(*) AS n FROM people WHERE enrollment_status IS NULL OR enrollment_status = 'unknown'`).get() as { n: number }).n;
  if (unknown !== 0) throw new Error(`${unknown} people still have no enrollment bucket.`);
  console.log(JSON.stringify({ buckets, verified, inferred, unknown }, null, 2));
}

main();
