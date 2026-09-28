// Drop extra affiliation rows that repeat the same person, campus, role, and status.
// Claims stay. Re-running deletes nothing once only one row remains.
//
//   npx tsx scripts/audit/dedupe-same-role-affiliations.ts

import { getDb } from "../../lib/db/client";

function main() {
  const db = getDb();
  const groups = db
    .prepare(
      `SELECT person_id, university_id, lower(trim(ifnull(role, ''))) AS role_key, ifnull(status, '') AS status_key,
              COUNT(*) AS n
       FROM affiliations
       GROUP BY person_id, university_id, role_key, status_key
       HAVING n > 1`
    )
    .all() as { person_id: string; university_id: string; role_key: string; status_key: string; n: number }[];
  const remove = db.prepare(`DELETE FROM affiliations WHERE id = ?`);
  let dropped = 0;
  const tx = db.transaction(() => {
    for (const group of groups) {
      const rows = db
        .prepare(
          `SELECT id FROM affiliations
           WHERE person_id = ? AND university_id = ? AND lower(trim(ifnull(role, ''))) = ? AND ifnull(status, '') = ?
           ORDER BY CASE WHEN claim_id IS NULL THEN 1 ELSE 0 END, id`
        )
        .all(group.person_id, group.university_id, group.role_key, group.status_key) as { id: string }[];
      for (const extra of rows.slice(1)) {
        remove.run(extra.id);
        dropped += 1;
      }
    }
  });
  tx();
  db.pragma("wal_checkpoint(TRUNCATE)");
  console.log(`duplicate same-role affiliations removed: ${dropped}`);
}

main();
