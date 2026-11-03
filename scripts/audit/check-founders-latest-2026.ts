// Checks that the /founders data path includes the latest imported verified
// founder companies and does not leave roster-only ventures invisible by
// default. No production DB writes or UI redesign.
import assert from "node:assert/strict";
import { getDb } from "../../lib/db/client";
import { loadFounderTable, loadProjectRows } from "../../lib/domain/founder-table";

const db = getDb();
const founders = loadFounderTable();
const table = loadProjectRows();
assert.ok(founders.length > 0, "Founders desk must load people from the canonical DB");
assert.ok(table.length > 0, "Founders desk must load project rows from the canonical DB");

const byId = new Map(table.map((item) => [item.id, item]));
for (const [companyName, personName, expectsRoster] of [
  ["Luminarch", "Naman Gupta", true],
  ["Zybit", "Jad Alsouss", true],
  ["ABC Design", "Danielle Angela Limcaoco", false],
] as const) {
  const company = db.prepare("SELECT id FROM projects WHERE kind='company' AND name=? LIMIT 1")
    .get(companyName) as { id: string } | undefined;
  assert.ok(company, `Imported company should exist in database: ${companyName}`);
  const pageRow = byId.get(company.id);
  assert.ok(pageRow, `/founders must include the company with verified founders: ${companyName}`);
  assert.ok(pageRow.people.some((person) => person.name === personName),
    `/founders should associate ${personName} with ${companyName}`);
  assert.ok(pageRow.detail || pageRow.full,
    `/founders must show evidence text instead of hiding the company: ${companyName}`);
  if (expectsRoster) {
    assert.match(pageRow.detail ?? "", /Listed in .*20(?:25|26|27)|Listed in .*eLab/i,
      `Roster-only startup should show program source: ${companyName}`);
  }
}

const founderIds = new Set(founders.map((person) => person.id));
assert.equal(founderIds.size, founders.length, "Founder rows should not double-count identities");
console.log(JSON.stringify({
  founderCount: founders.length,
  projectRows: table.length,
  importedFoundersChecked: 3,
  sourceNotesChecked: 2,
}, null, 2));
