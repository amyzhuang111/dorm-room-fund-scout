import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { applyScoutingList } from './import-scouting-list-2026-11-03.mjs';

const entries = JSON.parse(fs.readFileSync(new URL('../../data/imports/scouting-list-2026-11-03.json', import.meta.url), 'utf8'));
const schema = fs.readFileSync(new URL('../../lib/db/schema.sql', import.meta.url), 'utf8');

function fixture() {
  const db = new DatabaseSync(':memory:');
  db.exec(schema);
  db.exec('ALTER TABLE projects ADD COLUMN excluded_reason TEXT');
  for (const campusId of new Set([...entries.map(e => e.campusId).filter(Boolean), 'univ_rice', 'univ_seton_hall_university'])) {
    db.prepare('INSERT INTO universities(id,name) VALUES (?,?)').run(campusId, campusId);
  }
  for (const entry of entries.filter(e => e.existingProjectId)) {
    db.prepare(`INSERT INTO projects (id,name,kind,verification_status,verification_note,last_verified_at)
      VALUES (?,?,'company','confirmed','Existing sourced evidence','2026-09-27')`).run(entry.existingProjectId, entry.name);
    if (entry.restoreForReview) db.prepare("UPDATE projects SET is_investable_candidate=0, excluded_reason='unverified recency' WHERE id=?").run(entry.existingProjectId);
  }
  for (const [pid, name, campus] of [['pure_seton', 'PURE', 'univ_seton_hall_university'], ['kairos_rice', 'Kairos Health', 'univ_rice']]) {
    db.prepare("INSERT INTO projects(id,name,kind) VALUES (?,?,'company')").run(pid, name);
    db.prepare(`INSERT INTO relationships(id,source_entity_type,source_entity_id,target_entity_type,target_entity_id,relationship_type)
      VALUES (?,'project',?,'university',?,'affiliated_with')`).run(`${pid}_school`, pid, campus);
  }
  return db;
}

function counts(db) {
  const tables = ['projects','people','affiliations','claims','notes','sources','relationships','person_project_roles','gate_results','funding_events','company_facts','accuracy_audit'];
  return Object.fromEntries(tables.map(t => [t, db.prepare(`SELECT count(*) AS n FROM ${t}`).get().n]));
}

test('imports all 21 records without merging school/name collisions or promoting evidence', () => {
  const db = fixture();
  try {
    const result = applyScoutingList(db, entries, '2026-11-03T23:00:00.000Z');
    assert.equal(result.filter(r => r.disposition === 'matched').length, 10);
    assert.equal(result.filter(r => r.disposition === 'created').length, 10);
    assert.equal(result.filter(r => r.disposition === 'source').length, 1);
    assert.notEqual(result.find(r => r.name === 'Pure Poker').id, 'pure_seton');
    assert.notEqual(result.find(r => r.name === 'Kairos Health').id, 'kairos_rice');
    assert.equal(db.prepare("SELECT count(*) AS n FROM projects WHERE name='UNC 1789 Fund'").get().n, 0);
    assert.equal(db.prepare("SELECT count(*) AS n FROM sources WHERE name='UNC 1789 Fund'").get().n, 1);
    assert.equal(db.prepare("SELECT count(*) AS n FROM claims WHERE label!='user_note' OR verification_state!='unverified'").get().n, 0);
    assert.equal(db.prepare('SELECT count(*) AS n FROM funding_events').get().n, 0);
    assert.equal(db.prepare('SELECT count(*) AS n FROM company_facts').get().n, 0);
    assert.equal(db.prepare("SELECT count(*) AS n FROM people WHERE enrollment_status IS NOT NULL").get().n, 0);
    assert.equal(db.prepare("SELECT count(*) AS n FROM projects WHERE verification_status='confirmed'").get().n, 10);
    for (const entry of entries.filter(e => e.restoreForReview)) {
      assert.equal(db.prepare('SELECT is_investable_candidate FROM projects WHERE id=?').get(entry.existingProjectId).is_investable_candidate, 1);
    }
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
    const firstCounts = counts(db);
    const second = applyScoutingList(db, entries, '2026-11-04T23:00:00.000Z');
    assert.deepEqual(counts(db), firstCounts);
    assert.deepEqual(second.map(r => r.id), result.map(r => r.id));
  } finally { db.close(); }
});

test('fails closed and rolls back if a pinned identity changes', () => {
  const db = fixture();
  try {
    db.prepare("UPDATE projects SET name='A different company' WHERE id=?").run(entries.find(e => e.name === 'Photon').existingProjectId);
    const before = counts(db);
    assert.throws(() => applyScoutingList(db, entries), /identity changed/);
    assert.deepEqual(counts(db), before);
  } finally { db.close(); }
});

test('manifest excludes private investment records and internal notes', () => {
  const text = JSON.stringify(entries);
  for (const privateText of ['USV','10612','6268','11609','11474','2469','4977','5731','Nikhil','Mignano','Jay Yu','Julian','5.9M','52/100','100%']) {
    assert.equal(text.includes(privateText), false, privateText);
  }
});

test('integrates idempotently with the actual catalog while preserving prior evidence', () => {
  const original = path.resolve('data/campus-universe.db');
  if (!fs.existsSync(original)) return;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scout-import-test-'));
  const copy = path.join(dir, 'catalog.db');
  fs.copyFileSync(original, copy);
  const db = new DatabaseSync(copy);
  try {
    db.exec('PRAGMA foreign_keys=ON');
    const priorForeignKeyFailures = db.prepare('PRAGMA foreign_key_check').all();
    const before = counts(db);
    const evidence = db.prepare('SELECT id,verification_status,verification_note,last_verified_at,signal_tier FROM projects ORDER BY id').all();
    const result = applyScoutingList(db, entries);
    assert.equal(result.length, 21);
    const created = result.filter(r => r.disposition === 'created').length;
    assert.ok(created <= 10);
    assert.equal(counts(db).projects - before.projects, created);
    assert.equal(counts(db).funding_events, before.funding_events);
    for (const row of result.filter(r => r.disposition !== 'source')) {
      assert.equal(db.prepare('SELECT is_investable_candidate FROM projects WHERE id=?').get(row.id).is_investable_candidate, 1, row.name);
    }
    for (const previous of evidence) {
      assert.deepEqual(db.prepare('SELECT id,verification_status,verification_note,last_verified_at,signal_tier FROM projects WHERE id=?').get(previous.id), previous);
    }
    const first = counts(db);
    applyScoutingList(db, entries);
    assert.deepEqual(counts(db), first);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), priorForeignKeyFailures);
  } finally {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
