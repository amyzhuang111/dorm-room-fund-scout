import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const batch = 'reviewed-class-year-corrections-2026-11-04';
export function applyReviewedClassYears(db, rows) {
  const report = { corrected: 0, alreadyCorrect: 0, skipped: [] };
  db.transaction(() => {
    for (const r of rows) {
      const p = db.prepare('SELECT id,name,enrollment_grad_year FROM people WHERE id=?').get(r.personId);
      // A later independently reviewed correction must not be overwritten.
      if (!p || p.name !== r.name || ![r.previousYear, r.graduationYear].includes(p.enrollment_grad_year)) {
        report.skipped.push({ personId: r.personId, reason: 'Record changed since review' });
        continue;
      }
      const key = `${batch}:${r.personId}`;
      const evidence = `${r.name}: Class of ${r.graduationYear}. ${r.yearMeaning}`;
      db.prepare(`INSERT OR IGNORE INTO claims
        (id,entity_type,entity_id,claim_type,value_json,excerpt,source_url,retrieved_at,label,verification_state,created_at)
        VALUES (?,'person',?,'education',?,?,?,?,'observed_fact','confirmed',?)`).run(
        key, r.personId, JSON.stringify({ graduationYear:r.graduationYear, yearMeaning:r.yearMeaning }), evidence, r.sourceUrl, `${r.checkedAt}T00:00:00Z`, `${r.checkedAt} 00:00:00`);
      db.prepare(`INSERT OR IGNORE INTO accuracy_audit
        (id,entity_type,entity_id,action,field,old_value,new_value,reason,evidence_url,checked_at,idempotency_key)
        VALUES (?,'person',?,'correct','enrollment_grad_year',?,?,?,?,?,?)`).run(
        key, r.personId, String(r.previousYear), String(r.graduationYear),
        'Reviewed official source attaches this class year to the named person, not their teammate.', r.sourceUrl, r.checkedAt, key);
      // A reviewed class year is not a graduation, a departure, or a 2026 enrollment.
      db.prepare(`UPDATE people SET enrollment_grad_year=?,enrollment_label=?,enrollment_evidence=?,
        enrollment_source_url=?,enrollment_source_id=NULL WHERE id=?`).run(
        r.graduationYear, `Class of ${r.graduationYear}`, evidence, r.sourceUrl, r.personId);
      if (p.enrollment_grad_year === r.graduationYear) report.alreadyCorrect++;
      else report.corrected++;
    }
  })();
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const rows = JSON.parse(fs.readFileSync(`data/imports/${batch}.json`, 'utf8'));
  const db = new Database(process.env.CAMPUS_UNIVERSE_DB_PATH || 'data/campus-universe.db');
  db.pragma('foreign_keys=ON');
  console.log(JSON.stringify({ batch, ...applyReviewedClassYears(db, rows) }));
  db.close();
}
