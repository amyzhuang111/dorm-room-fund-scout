// Joohyun Cha '26 and Joohyun (CJ) Cha are one person.
// Brown Venture Prize 2026 lists Joohyun Cha '26 (Computer Science) on Dawn
// Industries, joohyun_cha@brown.edu. Y Combinator lists Joohyun (CJ) Cha as
// founder/CEO of Dawn Industries, studied CS at Brown, joohyun_cha@dawnxr.com.
// Both rows store LinkedIn /in/joohyun-cha.
//
//   npx tsx scripts/audit/merge-joohyun-cha.ts
//
// Re-running is a no-op once a single person remains on that LinkedIn slug.

import { getDb } from "../../lib/db/client";
import { mergeRecordedPair } from "../../lib/domain/dedupe";

const SLUG = "joohyun-cha";
const PREFERRED_NAME = "Joohyun (CJ) Cha";
const CLASS_LABEL = "'26";
const GRAD_YEAR = 2026;
const REASON =
  "Brown Venture Prize 2026 lists Joohyun Cha '26 (Computer Science) on Dawn Industries. Y Combinator lists Joohyun (CJ) Cha as founder of the same company and says he studied CS at Brown. Both rows use LinkedIn /in/joohyun-cha.";

interface PersonRow {
  id: string;
  name: string;
  aliases_json: string;
  enrollment_status: string | null;
  enrollment_label: string | null;
  enrollment_evidence: string | null;
  enrollment_source_url: string | null;
  enrollment_source_id: string | null;
  enrollment_grad_year: number | null;
  enrollment_basis: string | null;
}

function linkedinSlug(raw: string): string | null {
  const match = raw.match(/linkedin\.com\/in\/([A-Za-z0-9_%-]+)/i);
  if (!match) return null;
  let slug = match[1];
  try {
    slug = decodeURIComponent(slug);
  } catch {
    /* keep the raw slug */
  }
  slug = slug.toLowerCase().replace(/[-_]+$/g, "");
  return slug.length >= 2 ? slug : null;
}

function aliasesOf(json: string | null): string[] {
  try {
    const parsed = JSON.parse(json || "[]") as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function hasSlug(row: PersonRow): boolean {
  return aliasesOf(row.aliases_json).some((alias) => linkedinSlug(alias) === SLUG);
}

function retargetLooseRows(db: ReturnType<typeof getDb>, fromId: string, toId: string) {
  db.prepare(`UPDATE accuracy_audit SET entity_id = ? WHERE entity_type = 'person' AND entity_id = ?`).run(toId, fromId);
  const mentions = db.prepare(`SELECT id, article_id, project_id FROM news_mentions WHERE person_id = ?`).all(fromId) as {
    id: string;
    article_id: string;
    project_id: string;
  }[];
  for (const mention of mentions) {
    const clash = db
      .prepare(`SELECT id FROM news_mentions WHERE article_id = ? AND project_id = ? AND person_id = ? AND id != ?`)
      .get(mention.article_id, mention.project_id, toId, mention.id) as { id: string } | undefined;
    if (clash) db.prepare(`DELETE FROM news_mentions WHERE id = ?`).run(mention.id);
    else db.prepare(`UPDATE news_mentions SET person_id = ? WHERE id = ?`).run(toId, mention.id);
  }
}

function ensureIdentity(db: ReturnType<typeof getDb>, id: string): boolean {
  const row = db.prepare(`SELECT * FROM people WHERE id = ?`).get(id) as PersonRow | undefined;
  if (!row) return false;
  const brown = db
    .prepare(
      `SELECT excerpt, source_url, source_id FROM claims
       WHERE entity_type = 'person' AND entity_id = ? AND excerpt LIKE '%Joohyun Cha ''26%'
       ORDER BY rowid LIMIT 1`,
    )
    .get(id) as { excerpt: string; source_url: string; source_id: string | null } | undefined;

  const aliases = aliasesOf(row.aliases_json);
  let name = row.name;
  if (name !== PREFERRED_NAME) {
    if (!aliases.some((alias) => alias.toLowerCase() === name.toLowerCase())) aliases.push(name);
    name = PREFERRED_NAME;
  }
  const aliasJson = JSON.stringify(aliases.filter((alias) => alias !== PREFERRED_NAME));

  const status = row.enrollment_grad_year === GRAD_YEAR || brown ? row.enrollment_status || "recent_grad" : row.enrollment_status;
  const label = row.enrollment_grad_year === GRAD_YEAR || brown ? CLASS_LABEL : row.enrollment_label;
  const gradYear = row.enrollment_grad_year === GRAD_YEAR || brown ? GRAD_YEAR : row.enrollment_grad_year;
  const basis = gradYear === GRAD_YEAR ? "verified" : row.enrollment_basis;
  const evidence = brown?.excerpt ?? row.enrollment_evidence;
  const sourceUrl = brown?.source_url ?? row.enrollment_source_url;
  const sourceId = brown?.source_id ?? row.enrollment_source_id;

  const same =
    row.name === name &&
    row.aliases_json === aliasJson &&
    row.enrollment_status === status &&
    row.enrollment_label === label &&
    row.enrollment_grad_year === gradYear &&
    row.enrollment_basis === basis &&
    row.enrollment_evidence === evidence &&
    row.enrollment_source_url === sourceUrl &&
    (row.enrollment_source_id ?? null) === (sourceId ?? null);
  if (same) return false;

  db.prepare(
    `UPDATE people SET name = ?, aliases_json = ?, enrollment_status = ?, enrollment_label = ?, enrollment_evidence = ?,
      enrollment_source_url = ?, enrollment_source_id = ?, enrollment_grad_year = ?, enrollment_basis = ? WHERE id = ?`,
  ).run(name, aliasJson, status, label, evidence, sourceUrl, sourceId, gradYear, basis, id);
  return true;
}

function main() {
  const db = getDb();
  const people = (db.prepare(`SELECT id, name, aliases_json, enrollment_status, enrollment_label, enrollment_evidence, enrollment_source_url, enrollment_source_id, enrollment_grad_year, enrollment_basis FROM people`).all() as PersonRow[]).filter(hasSlug);
  if (people.length === 0) {
    console.log(JSON.stringify({ merged: 0, normalized: false, reason: "no Joohyun Cha LinkedIn row" }));
    return;
  }
  if (people.length > 2) {
    throw new Error(`Refusing to merge ${people.length} people on LinkedIn /in/${SLUG}.`);
  }

  const survivor = people.find((row) => row.name === PREFERRED_NAME) ?? [...people].sort((a, b) => b.name.length - a.name.length || a.id.localeCompare(b.id))[0];
  const drops = people.filter((row) => row.id !== survivor.id);
  let merged = 0;
  const run = db.transaction(() => {
    for (const drop of drops) {
      retargetLooseRows(db, drop.id, survivor.id);
      const ok = mergeRecordedPair(
        db,
        "person",
        survivor.id,
        drop.id,
        REASON,
      );
      if (ok) merged += 1;
    }
  });
  run();
  const normalized = ensureIdentity(db, survivor.id);
  db.pragma("wal_checkpoint(TRUNCATE)");

  const left = (db.prepare(`SELECT id, name, aliases_json FROM people`).all() as PersonRow[]).filter(hasSlug);
  console.log(JSON.stringify({ merged, normalized, survivors: left.map((row) => ({ id: row.id, name: row.name })) }, null, 2));
  if (left.length !== 1 || left[0].name !== PREFERRED_NAME) {
    throw new Error("Joohyun Cha merge did not leave one record named Joohyun (CJ) Cha.");
  }
}

main();
