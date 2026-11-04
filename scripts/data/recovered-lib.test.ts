import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { applyRecoveredRows } from "./recovered-lib";

const db = new Database(":memory:");
db.exec(`CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT, kind TEXT, extra TEXT DEFAULT 'dflt')`);
db.exec(`CREATE TABLE people (id TEXT PRIMARY KEY, name TEXT)`);
db.prepare(`INSERT INTO projects (id, name, kind) VALUES ('p1', 'ExistingChanged', 'company')`).run();

const data = {
  tables: {
    // 'removed_col' does not exist in the target schema and must be ignored.
    projects: { columns: ["id", "name", "kind", "removed_col"], rows: [["p1", "SHOULD NOT OVERWRITE", "company", "x"], ["p2", "New", "company", "x"]] },
    people: { columns: ["id", "name"], rows: [["a", "Ann"], ["b", "Bob"]] },
    claims: { columns: ["id"], rows: [["c1"]] }, // table absent: ignored
  },
};
let r = applyRecoveredRows(db, data, true);
assert.equal(r.inserted, 3, "dry run counts new rows only");
assert.equal((db.prepare(`SELECT COUNT(*) n FROM people`).get() as { n: number }).n, 0, "dry run changes nothing");
r = applyRecoveredRows(db, data);
assert.equal(r.inserted, 3);
assert.deepEqual(db.prepare(`SELECT name FROM projects WHERE id='p1'`).get(), { name: "ExistingChanged" }, "existing rows are never modified");
assert.deepEqual(db.prepare(`SELECT name, extra FROM projects WHERE id='p2'`).get(), { name: "New", extra: "dflt" });
r = applyRecoveredRows(db, data);
assert.equal(r.inserted, 0, "idempotent");
console.log("recovered-lib tests ok");
