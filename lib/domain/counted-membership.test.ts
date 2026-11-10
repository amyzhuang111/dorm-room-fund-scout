import assert from "node:assert/strict";
import { getDb } from "../db/client";
import { campusRecordHref, topCampusLeads } from "./campus-record";
import {
  COUNTED_HREFS,
  LEAD_COMPANY_RANKING,
  eligibilitySentences,
  programPeopleHref,
} from "./counted-hrefs";
import {
  describePeopleMembership,
  eligibleCompanyIds,
  eligibleCompanyRolePersonIds,
  loadEligibilityExamples,
  pinnedCampuses,
  programMemberships,
  programPersonIds,
  promotedFounderCampuses,
  resolvePeopleIds,
  sectorMemberships,
  sectorPersonIds,
  storedFounderCampuses,
} from "./counted-membership";
import { filterCorpus } from "./corpus-explorer";
import { loadCorpusTotals } from "./corpus-totals";
import { buildDirectoryFromDb } from "./directory";
import { buildFounderIndex } from "./founder-index-build";
import { loadFounderTable, loadProjectRows } from "./founder-table";
import { loadHeroStats } from "./hero-stats";
import { filterPeopleCorpus } from "./people-corpus";

const db = getDb();
const totals = loadCorpusTotals();

const companyIds = eligibleCompanyIds();
assert.equal(companyIds.length, totals.investableCompanies);
assert.equal(
  companyIds.length,
  (db.prepare(`SELECT COUNT(*) AS n FROM projects WHERE kind = 'company' AND is_investable_candidate = 1`).get() as { n: number }).n,
);
const companyRows = filterCorpus({ membership: "eligible-companies" });
assert.equal(companyRows.length, companyIds.length);
assert.deepEqual(companyRows.map((row) => row.id).sort(), [...companyIds].sort());
const directoryIds = buildDirectoryFromDb().cards.map((card) => card.id).sort();
assert.deepEqual(directoryIds, [...companyIds].sort());

const roleIds = eligibleCompanyRolePersonIds();
assert.equal(roleIds.length, totals.foundersListed);
assert.equal(
  roleIds.length,
  (
    db.prepare(
      `SELECT COUNT(DISTINCT r.person_id) AS n
         FROM person_project_roles r
         JOIN projects p ON p.id = r.project_id
        WHERE p.kind = 'company' AND p.is_investable_candidate = 1`,
    ).get() as { n: number }
  ).n,
);
const rolePeople = filterPeopleCorpus({ membership: "eligible-company-roles" });
assert.equal(rolePeople.length, roleIds.length);
assert.deepEqual(rolePeople.map((person) => person.id).sort(), [...roleIds].sort());
assert.equal(COUNTED_HREFS.eligibleCompanyPeople.includes("/founders"), false);
assert.notEqual(COUNTED_HREFS.eligibleCompanyPeople, COUNTED_HREFS.fullIndex);

const index = buildFounderIndex();
const table = loadFounderTable();
assert.equal(index.length, totals.foundersIndexed);
const indexIds = new Set(index.map((row) => row.id));
const tableIds = new Set(table.map((row) => row.id));
const sameIndex = indexIds.size === tableIds.size && [...indexIds].every((id) => tableIds.has(id));
console.log(
  JSON.stringify({
    eligibleCompanies: companyIds.length,
    rolePeople: roleIds.length,
    fullIndex: index.length,
    founderTable: table.length,
    sameIndexAndTable: sameIndex,
    projectGroups: loadProjectRows().length,
  }),
);
assert.equal(sameIndex, true, "the founders table should list the full index; a difference needs its own label");

const pins = pinnedCampuses();
assert.equal(pins.length, totals.campusesOnMap);
assert.equal(
  pins.length,
  loadHeroStats().universities.filter((university) => university.lat != null && university.lon != null).length,
);
assert.ok(pins.every((campus) => campus.lat != null && campus.lon != null));
const rawPins = (db.prepare(`SELECT COUNT(*) AS n FROM universities WHERE lat IS NOT NULL AND lon IS NOT NULL`).get() as { n: number }).n;
const overridePins = pins.filter((campus) => campus.coordSource === "public_campus");
assert.equal(pins.length, rawPins + overridePins.length);

const stored = storedFounderCampuses();
assert.equal(stored.length, totals.campusesWithFounders);
assert.equal(
  stored.length,
  (
    db.prepare(
      `SELECT COUNT(DISTINCT a.university_id) AS n
         FROM affiliations a
         JOIN people p ON p.id = a.person_id
        WHERE p.founder_status = 'founder' AND a.university_id IS NOT NULL`,
    ).get() as { n: number }
  ).n,
);
const promoted = promotedFounderCampuses();
assert.notEqual(COUNTED_HREFS.storedFounderCampuses, COUNTED_HREFS.promotedFounderCampuses);
assert.notEqual(COUNTED_HREFS.pins, COUNTED_HREFS.storedFounderCampuses);
console.log(JSON.stringify({ pins: pins.length, rawCoordinateRows: rawPins, publicCampusOverrides: overridePins.length, storedFounderCampuses: stored.length, promotedFounderCampuses: promoted.length }));

const programs = programMemberships();
assert.ok(programs.length > 0);
const program = programs[0]!;
assert.equal(program.href, programPeopleHref(program.id));
assert.equal(program.href.startsWith("/data/people?program="), true);
assert.equal(program.href.includes("/data?q="), false);
const programIds = programPersonIds(program.id);
assert.equal(programIds.length, program.people);
const programPeople = filterPeopleCorpus({ program: program.id });
assert.equal(programPeople.length, program.people);
assert.deepEqual(programPeople.map((person) => person.id).sort(), [...programIds].sort());
const programView = describePeopleMembership({ program: program.id }, programPeople.length);
assert.ok(programView);
assert.match(programView.heading, new RegExp(`^${program.people.toLocaleString("en-US")} people`));
assert.ok(programView.nameSearchHref?.startsWith("/data?q="));
assert.match(programView.nameSearchLabel || "", /name search/i);
assert.match(programView.detail, /different list|counted membership|part_of_program|participated_in_program/);

const sectors = sectorMemberships();
assert.ok(sectors.length > 0);
const sector = sectors[0]!;
assert.equal(sector.href, `/data/people?membership=eligible-company-roles&sector=${encodeURIComponent(sector.id)}`);
const sectorIds = sectorPersonIds(sector.id);
assert.equal(sectorIds.length, sector.people);
const sectorPeople = filterPeopleCorpus({ membership: "eligible-company-roles", sector: sector.id });
assert.equal(sectorPeople.length, sector.people);
assert.deepEqual(sectorPeople.map((person) => person.id).sort(), [...sectorIds].sort());
const sectorOnly = resolvePeopleIds({ sector: sector.id });
assert.equal(sectorOnly?.size, sector.people);

const cards = buildDirectoryFromDb().cards;
const penn = cards.filter((card) => card.schoolId === "univ_penn" && card.name.trim());
assert.ok(penn.length > 0);
penn.sort((a, b) => b.signals - a.signals || a.name.localeCompare(b.name));
const lead = topCampusLeads(cards).find((row) => row.campusId === "univ_penn");
assert.ok(lead);
assert.equal(lead.companyId, penn[0]!.id);
assert.equal(lead.companyName, penn[0]!.name);
assert.equal(campusRecordHref("univ_penn", lead, "penn"), `/startup/${encodeURIComponent(penn[0]!.id)}?from=map&campus=univ_penn`);
assert.match(LEAD_COMPANY_RANKING, /stored signal rows/);
assert.match(LEAD_COMPANY_RANKING, /earlier company name/);
assert.match(LEAD_COMPANY_RANKING, /not distinct articles, a rolling week, source quality, or traction/);

const examples = loadEligibilityExamples();
assert.ok(examples.company);
assert.equal(
  (db.prepare(`SELECT is_investable_candidate AS n FROM projects WHERE id = ?`).get(examples.company.id) as { n: number }).n,
  1,
);
assert.ok(examples.company.note && examples.company.note.trim());
assert.ok(examples.classYear);
assert.notEqual(examples.classYear.enrollmentStatus, "current_student");
assert.equal(typeof examples.classYear.year, "number");
assert.ok(examples.unknown);
const unknownRow = db.prepare(`SELECT enrollment_grad_year AS year, enrollment_status AS status FROM people WHERE id = ?`).get(examples.unknown.id) as {
  year: number | null;
  status: string | null;
};
assert.equal(unknownRow.year, null);
assert.equal((unknownRow.status || "").trim(), "");
const sentences = eligibilitySentences(examples).join("\n");
assert.match(sentences, /not current enrollment/);
assert.match(sentences, /does not confirm every field/);
assert.equal(/\bvetted\b/i.test(sentences), false);
assert.equal(sentences.includes(examples.company.name), true);
assert.equal(sentences.includes(examples.classYear.name), true);
assert.equal(sentences.includes(examples.unknown.name), true);
const narrowed = describePeopleMembership({ membership: "eligible-company-roles" }, roleIds.length - 1);
assert.match(narrowed?.heading || "", /shown of/);

console.log("counted membership tests ok");
