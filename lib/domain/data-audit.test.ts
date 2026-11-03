import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { auditData, hotspotUrlConflicts, normalizeOrgName } from "./data-audit";

assert.equal(normalizeOrgName("Mayfield Fellows Program"), "mayfield fellow");
assert.equal(normalizeOrgName("Mayfield Fellows Organization"), "mayfield fellow");
assert.equal(normalizeOrgName("Mayfield Fellow Program"), "mayfield fellow");
assert.equal(normalizeOrgName("Founders Inc"), "founders inc");
assert.equal(normalizeOrgName("Founders"), "founders");
assert.notEqual(normalizeOrgName("Founders Inc"), normalizeOrgName("Founders"));
assert.equal(normalizeOrgName("Entrepreneurs @ Berkeley"), "entrepreneurs");
assert.equal(normalizeOrgName("Entrepreneurs at Berkeley"), "entrepreneurs");
assert.equal(normalizeOrgName("E@B"), "entrepreneurs");
assert.equal(normalizeOrgName("BAIR"), "berkeley artificial intelligence research");

function memoryDb() {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE people (id TEXT PRIMARY KEY, name TEXT, aliases_json TEXT DEFAULT '[]');
    CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT, kind TEXT, website_url TEXT);
    CREATE TABLE universities (id TEXT PRIMARY KEY, name TEXT);
    CREATE TABLE relationships (
      id TEXT PRIMARY KEY,
      source_entity_type TEXT, source_entity_id TEXT,
      target_entity_type TEXT, target_entity_id TEXT,
      relationship_type TEXT
    );
    CREATE TABLE person_project_roles (id TEXT PRIMARY KEY, person_id TEXT, project_id TEXT, claim_id TEXT);
    CREATE TABLE affiliations (id TEXT PRIMARY KEY, person_id TEXT, university_id TEXT, claim_id TEXT);
    CREATE TABLE claims (id TEXT PRIMARY KEY, entity_type TEXT, entity_id TEXT);
    CREATE TABLE entity_redirects (old_id TEXT PRIMARY KEY, entity_type TEXT, survivor_id TEXT);
    CREATE TABLE program_signals (id TEXT PRIMARY KEY, person_id TEXT, claim_id TEXT);
    CREATE TABLE company_facts (id TEXT PRIMARY KEY, project_id TEXT);
    CREATE TABLE precollege_signals (id TEXT PRIMARY KEY, person_id TEXT);
    CREATE TABLE funding_events (id TEXT PRIMARY KEY, project_id TEXT, claim_id TEXT);
    INSERT INTO universities (id, name) VALUES ('univ_stanford', 'Stanford'), ('univ_berkeley', 'Berkeley');
    INSERT INTO people (id, name) VALUES ('person_a', 'Ada');
  `);
  return db;
}

const clean = memoryDb();
clean.prepare(`INSERT INTO projects (id, name, kind) VALUES ('proj_mayfield', 'Mayfield Fellows Program', 'project')`).run();
clean.prepare(`INSERT INTO relationships (id, source_entity_type, source_entity_id, target_entity_type, target_entity_id, relationship_type) VALUES ('rel_1', 'project', 'proj_mayfield', 'university', 'univ_stanford', 'affiliated_with')`).run();
assert.equal(auditData(clean).length, 0);

const dupes = memoryDb();
dupes.prepare(`INSERT INTO projects (id, name, kind) VALUES ('proj_a', 'Mayfield Fellows Program', 'project'), ('proj_b', 'Mayfield Fellows Organization', 'project')`).run();
dupes.prepare(`INSERT INTO relationships (id, source_entity_type, source_entity_id, target_entity_type, target_entity_id, relationship_type) VALUES ('rel_a', 'project', 'proj_a', 'university', 'univ_stanford', 'affiliated_with'), ('rel_b', 'project', 'proj_b', 'university', 'univ_berkeley', 'affiliated_with')`).run();
const dupeIssues = auditData(dupes);
assert.ok(dupeIssues.some((issue) => issue.code === "duplicate_org_name"));
assert.ok(dupeIssues.filter((issue) => issue.code === "conflicting_campus").length === 0);

const split = memoryDb();
split.prepare(`INSERT INTO projects (id, name, kind) VALUES ('proj_spc', 'South Park Commons', 'project')`).run();
split.prepare(`INSERT INTO relationships (id, source_entity_type, source_entity_id, target_entity_type, target_entity_id, relationship_type) VALUES ('rel_s', 'project', 'proj_spc', 'university', 'univ_stanford', 'affiliated_with'), ('rel_b', 'project', 'proj_spc', 'university', 'univ_berkeley', 'affiliated_with')`).run();
assert.ok(auditData(split).some((issue) => issue.code === "conflicting_campus"));

const hack = memoryDb();
hack.prepare(`INSERT INTO projects (id, name, kind) VALUES ('proj_r1', 'Relay', 'project'), ('proj_r2', 'Relay', 'project')`).run();
assert.equal(auditData(hack).filter((issue) => issue.code === "duplicate_org_name").length, 0);

const orphan = memoryDb();
orphan.prepare(`INSERT INTO person_project_roles (id, person_id, project_id, claim_id) VALUES ('role_1', 'person_missing', 'proj_missing', NULL)`).run();
assert.ok(auditData(orphan).some((issue) => issue.code === "orphan_link"));

const linkedin = memoryDb();
linkedin.prepare(`UPDATE people SET aliases_json = ? WHERE id = 'person_a'`).run(JSON.stringify(["linkedin:https://www.linkedin.com/in/julianweng"]));
linkedin.prepare(`INSERT INTO people (id, name, aliases_json) VALUES ('person_b', 'Julian Weng', ?)`).run(JSON.stringify(["linkedin:https://www.linkedin.com/in/julianweng"]));
assert.ok(auditData(linkedin).some((issue) => issue.code === "duplicate_linkedin"));

const sameHost = `campus,Place,urls
Harvard,Harvard St. Commons,https://harvardst.co/
Boston,Harvard St. Commons,https://harvardst.co/
`;
assert.equal(hotspotUrlConflicts(sameHost).length, 0);

const differentHost = `campus,Place,urls
Stanford,Example Fellows Program,https://example.edu/fellows
Berkeley,Example Fellows Program,https://other.edu/fellows
`;
assert.equal(hotspotUrlConflicts(differentHost).length, 1);

console.log("data-audit tests passed");
