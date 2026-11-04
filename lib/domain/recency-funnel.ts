import { getDb } from "@/lib/db/client";

/** Live company counts for the founder-recency gate. The vetted list is `investable`. */
export function loadRecencyFunnel() {
  const db = getDb();
  const count = (sql: string) => (db.prepare(sql).get() as { c: number }).c;
  return {
    investable: count(`SELECT COUNT(*) AS c FROM projects WHERE kind = 'company' AND is_investable_candidate = 1`),
    excludedOlderAlumni: count(
      `SELECT COUNT(*) AS c FROM projects WHERE kind = 'company' AND excluded_reason = 'founders not current/recent (<2023)'`,
    ),
    unverifiedRecency: count(
      `SELECT COUNT(*) AS c FROM projects WHERE kind = 'company' AND excluded_reason = 'unverified recency'`,
    ),
    companiesTotal: count(`SELECT COUNT(*) AS c FROM projects WHERE kind = 'company'`),
  };
}
