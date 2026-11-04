// Unit test for the restore logic, on an in-memory database.
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { applyRestoreList, vettedCount } from "./restore-lib";

const db = new Database(":memory:");
db.exec(`CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT, kind TEXT, is_investable_candidate INTEGER, excluded_reason TEXT, updated_at TEXT)`);
const ins = db.prepare(`INSERT INTO projects VALUES (?, ?, ?, ?, ?, NULL)`);
ins.run("a", "NoReason", "company", 0, null);
ins.run("b", "Unverified", "company", 0, "unverified recency");
ins.run("c", "TooOld", "company", 0, "founders not current/recent (<2023)");
ins.run("d", "AlreadyVetted", "company", 1, null);
ins.run("e", "NotACompany", "project", 0, null);
assert.equal(vettedCount(db), 1);

const all = { restore: ["a", "b", "c", "d", "e", "missing"].map((id) => ({ id, name: id })) };

// No fromReasons: only the no-reason company is eligible.
let r = applyRestoreList(db, all, true);
assert.equal(r.changed, 1, "dry run counts a only");
assert.equal(vettedCount(db), 1, "dry run changes nothing");
r = applyRestoreList(db, all);
assert.equal(r.changed, 1);
assert.deepEqual(db.prepare(`SELECT is_investable_candidate AS v FROM projects WHERE id='a'`).get(), { v: 1 });
assert.deepEqual(db.prepare(`SELECT is_investable_candidate AS v FROM projects WHERE id='b'`).get(), { v: 0 }, "named reason is not cleared unless listed");

// With fromReasons: the unverified one is restored and its reason is cleared; too-old is never touched.
r = applyRestoreList(db, { ...all, fromReasons: ["unverified recency"] });
assert.equal(r.changed, 1);
assert.deepEqual(db.prepare(`SELECT is_investable_candidate AS v, excluded_reason AS r FROM projects WHERE id='b'`).get(), { v: 1, r: null });
assert.deepEqual(db.prepare(`SELECT is_investable_candidate AS v FROM projects WHERE id='c'`).get(), { v: 0 }, "too-old founders stay excluded");
assert.deepEqual(db.prepare(`SELECT is_investable_candidate AS v FROM projects WHERE id='e'`).get(), { v: 0 }, "only companies");

// Idempotent.
r = applyRestoreList(db, { ...all, fromReasons: ["unverified recency"] });
assert.equal(r.changed, 0);
assert.equal(vettedCount(db), 3, "d + a + b");
console.log("restore-lib tests ok");
