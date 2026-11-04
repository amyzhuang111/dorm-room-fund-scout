// Attach a campus when a person's own stored excerpt names that school.
// Does not fetch pages and does not invent people. A second school is added
// only when the person does not already have that affiliation.
//
//   npx tsx scripts/ingest/link-bio-schools.ts
//   npx tsx scripts/ingest/link-bio-schools.ts --apply

import { getDb, newId } from "../../lib/db/client";
import { schoolHitsInPersonExcerpt } from "../../lib/domain/unknown-sweep";

function roleFor(excerpt: string, phrase: string): string {
  const index = excerpt.toLowerCase().lastIndexOf(phrase.toLowerCase());
  const before = index >= 0 ? excerpt.slice(Math.max(0, index - 64), index) : "";
  const marks: { role: string; re: RegExp }[] = [
    { role: "phd", re: /\bph\.?d|\bdphil\b|doctorate\b/gi },
    { role: "mba", re: /\bmba\b/gi },
    { role: "masters", re: /\bmaster|\bm\.sc\b|\bm\.s\b|\bmsc\b|\bmph\b|\bmeng\b|\bmpa\b/gi },
    { role: "undergrad", re: /\bbachelor|\bundergrad|\bb\.s\b|\bbtech\b|\bbs\b|\bb\.a\b|\bbe\b/gi },
  ];
  let best = { role: `Bio names ${phrase}`, at: -1 };
  for (const mark of marks) {
    for (const hit of before.matchAll(mark.re)) {
      const at = hit.index ?? -1;
      const between = before.slice(at);
      if (/\b(university|college|institute|harvard|mit|stanford|wharton)\b/i.test(between.slice(hit[0].length))) continue;
      if (at >= best.at) best = { role: mark.role, at };
    }
  }
  return best.role;
}

function main() {
  const apply = process.argv.includes("--apply");
  const db = getDb();
  const claims = db
    .prepare(
      `SELECT c.id, c.entity_id as person_id, c.excerpt, c.claim_type, p.name
       FROM claims c
       JOIN people p ON p.id = c.entity_id
       WHERE c.entity_type = 'person' AND length(c.excerpt) > 20`
    )
    .all() as { id: string; person_id: string; excerpt: string; claim_type: string; name: string }[];
  const hasAff = db.prepare(`SELECT 1 FROM affiliations WHERE person_id = ? AND university_id = ?`);
  const insertAff = db.prepare(
    `INSERT INTO affiliations (id, person_id, university_id, role, status, claim_id) VALUES (?, ?, ?, ?, 'unverified', ?)`
  );
  const seen = new Set<string>();
  const planned: { personId: string; name: string; universityId: string; role: string; claimId: string; excerpt: string }[] = [];
  for (const claim of claims) {
    for (const hit of schoolHitsInPersonExcerpt(claim.excerpt, { personName: claim.name, claimType: claim.claim_type })) {
      const key = `${claim.person_id}:${hit.universityId}`;
      if (seen.has(key) || hasAff.get(claim.person_id, hit.universityId)) continue;
      seen.add(key);
      planned.push({
        personId: claim.person_id,
        name: claim.name,
        universityId: hit.universityId,
        role: roleFor(hit.excerpt, hit.phrase),
        claimId: claim.id,
        excerpt: hit.excerpt,
      });
    }
  }
  const bySchool = new Map<string, number>();
  for (const row of planned) bySchool.set(row.universityId, (bySchool.get(row.universityId) ?? 0) + 1);
  console.log(`${planned.length} affiliations ${apply ? "written" : "planned"}`);
  for (const [id, count] of [...bySchool.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${count} ${id}`);
  if (!apply) {
    for (const row of planned) console.log(`- ${row.name} -> ${row.universityId} (${row.role}) :: ${row.excerpt.slice(0, 180)}`);
    return;
  }
  const write = db.transaction(() => {
    for (const row of planned) insertAff.run(newId("aff"), row.personId, row.universityId, row.role, row.claimId);
  });
  write();
  db.pragma("wal_checkpoint(TRUNCATE)");
}

main();
