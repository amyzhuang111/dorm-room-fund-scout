// User-submitted leads, not a public-source verification pass. Run before all
// map/directory snapshots so the same catalog is shipped to every app surface.
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const BATCH = 'scouting-list-2026-11-03';
const SOURCE = 'src_manual_scouting_20261103';
const SOURCE_URL = '(user-entered)';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DEFAULT_INPUT = path.join(ROOT, 'data/imports/scouting-list-2026-11-03.json');
const id = (prefix, ...parts) => `${prefix}_${createHash('sha256').update([BATCH, ...parts].join('|')).digest('hex').slice(0, 18)}`;
const key = value => String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const host = value => { try { return new URL(value).hostname.replace(/^www\./, ''); } catch { return null; } };

function findProject(db, entry) {
  if (entry.existingProjectId) {
    const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(entry.existingProjectId);
    if (row) {
      if (![row.name, ...JSON.parse(row.aliases_json || '[]')].some(name => key(name) === key(entry.name))) {
        throw new Error(`Existing project identity changed: ${entry.name}`);
      }
      return row;
    }
  }
  const prior = db.prepare('SELECT * FROM projects WHERE id = ?').get(id('proj', entry.key));
  if (prior) return prior;
  const candidates = db.prepare("SELECT * FROM projects WHERE kind = 'company'").all();
  const hits = candidates.filter(row => {
    if (entry.website && host(entry.website) === host(row.website_url)) return true;
    const names = [row.name, ...JSON.parse(row.aliases_json || '[]')].map(key);
    if (![entry.name, ...(entry.aliases || [])].some(name => names.includes(key(name)))) return false;
    // A name alone does not resolve a new lead to an unrelated company.
    if (!entry.campusId) return false;
    return !!db.prepare(`SELECT 1 FROM relationships WHERE source_entity_type='project' AND source_entity_id=?
      AND target_entity_type='university' AND target_entity_id=? AND relationship_type='affiliated_with'`).get(row.id, entry.campusId);
  });
  if (hits.length > 1) throw new Error(`Ambiguous project match: ${entry.name}`);
  return hits[0] ?? null;
}

export function applyScoutingList(db, entries, now = new Date().toISOString()) {
  if (!Array.isArray(entries) || entries.length !== 21 || new Set(entries.map(e => e.key)).size !== 21) {
    throw new Error('Expected 21 distinct scouting records.');
  }
  for (const entry of entries) {
    if (!entry.key || !entry.name || !['company', 'source'].includes(entry.type)) throw new Error('Invalid scouting record.');
    if (entry.campusId && !db.prepare('SELECT 1 FROM universities WHERE id=?').get(entry.campusId)) {
      throw new Error(`Unknown campus for ${entry.name}; campus not guessed.`);
    }
  }
  const results = [];
  // Existing catalog imports can contain legacy orphan references. Preserve
  // those for a separate repair; this import must introduce no new violations.
  const existingForeignKeyFailures = new Set(db.prepare('PRAGMA foreign_key_check').all().map(row => JSON.stringify(row)));
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare(`INSERT OR IGNORE INTO sources
      (id,name,family,url,campuses_json,priority,ingestion_mode,status,source_role,tier_rationale)
      VALUES (?, 'User-submitted scouting list · Nov 3, 2026', 'manual_referral', ?, '[]', 3, 'manual', 'available', 'discovery',
      'User-supplied leads. Source labels in the submitted list are not independent verification.')`).run(SOURCE, SOURCE_URL);

    function claim(entityType, entityId, type, value, excerpt, suffix) {
      const claimId = id('claim', suffix);
      db.prepare(`INSERT OR IGNORE INTO claims
        (id,entity_type,entity_id,claim_type,value_json,excerpt,source_id,source_url,retrieved_at,label,verification_state)
        VALUES (?,?,?,?,?,?,?,?,?,'user_note','unverified')`).run(
          claimId, entityType, entityId, type, JSON.stringify(value), excerpt, SOURCE, SOURCE_URL, now);
      return claimId;
    }
    function relation(fromType, from, toType, to, type, claimId) {
      const exists = db.prepare(`SELECT 1 FROM relationships WHERE source_entity_type=? AND source_entity_id=?
        AND target_entity_type=? AND target_entity_id=? AND relationship_type=?`).get(fromType, from, toType, to, type);
      if (!exists) db.prepare(`INSERT INTO relationships
        (id,source_entity_type,source_entity_id,target_entity_type,target_entity_id,relationship_type,evidence_claim_ids_json,verification_state)
        VALUES (?,?,?,?,?,?,?,'unverified')`).run(id('rel', from, to, type), fromType, from, toType, to, type, JSON.stringify([claimId]));
    }

    for (const entry of entries) {
      if (entry.type === 'source') {
        const sourceId = id('src', entry.key);
        db.prepare(`INSERT OR IGNORE INTO sources
          (id,name,family,url,campuses_json,priority,ingestion_mode,status,source_role,refresh_suggestion,tier_rationale)
          VALUES (?,?, 'student_fund', ?, ?, 3, 'manual', 'unconfigured', 'discovery', ?, ?)`).run(
            sourceId, entry.name, SOURCE_URL, JSON.stringify([entry.campusId]),
            'Verify the official program page and identify student-founder leads.',
            'User-submitted student-run fund/program. A lead source, not a startup or verified program.');
        claim('source', sourceId, 'manual_referral', { name: entry.name, school: entry.school },
          'User-submitted: student-run fund/program; possible source of leads. Not independently verified.', `${entry.key}:source`);
        results.push({ name: entry.name, id: sourceId, disposition: 'source' });
        continue;
      }

      const existing = findProject(db, entry);
      const projectId = existing?.id ?? id('proj', entry.key);
      const verificationNote = entry.reviewNote || 'User-submitted lead. Company identity and student-founder status require public-source verification.';
      if (!existing) {
        db.prepare(`INSERT INTO projects
          (id,name,aliases_json,kind,description,website_url,is_portfolio_reference,is_investable_candidate,verification_status,verification_note,created_at,updated_at)
          VALUES (?,?,?,'company',?,?,0,1,'unverified',?,?,?)`).run(
            projectId, entry.name, JSON.stringify(entry.aliases || []),
            entry.description || 'User-submitted lead; product and founder details await verification.',
            entry.website || null, verificationNote, now, now);
      } else if (entry.website && !existing.website_url) {
        db.prepare('UPDATE projects SET website_url=?, updated_at=? WHERE id=?').run(entry.website, now, projectId);
      }

      const supplied = Object.fromEntries(Object.entries({
        name: entry.name, school: entry.school, location: entry.location, funding: entry.funding,
        backersOrProgram: entry.backersOrProgram, graduationOrStatus: entry.graduationOrStatus,
        reportedSource: entry.reportedSource, reviewNote: entry.reviewNote,
      }).filter(([, value]) => value));
      const labels = { school: 'Reported school', location: 'Reported location', funding: 'Reported funding',
        backersOrProgram: 'Reported backers / program', graduationOrStatus: 'Reported education / status',
        reportedSource: 'Source label in submitted list', reviewNote: 'Verification note' };
      const lines = ['User-submitted scouting list (Nov 3, 2026). Not independently reverified.',
        ...Object.entries(supplied).filter(([k]) => k !== 'name').map(([k, value]) => `${labels[k] || k}: ${value}`)];
      const note = lines.join('\n');
      const claimId = claim('project', projectId, 'manual_referral', supplied, note, `${entry.key}:project`);
      db.prepare(`INSERT OR IGNORE INTO notes (id,entity_type,entity_id,body,author) VALUES (?,'project',?,?,'scout')`)
        .run(id('note', entry.key), projectId, note);
      if (entry.campusId) relation('project', projectId, 'university', entry.campusId, 'affiliated_with', claimId);

      for (const founder of entry.founders || []) {
        let person = founder.existingPersonId ? db.prepare('SELECT * FROM people WHERE id=?').get(founder.existingPersonId) : null;
        if (person && key(person.name) !== key(founder.name)) throw new Error(`Founder identity changed: ${founder.name}`);
        if (!person) {
          const hits = db.prepare(`SELECT DISTINCT pe.* FROM people pe JOIN person_project_roles ppr ON ppr.person_id=pe.id
            WHERE ppr.project_id=? AND lower(pe.name)=lower(?)`).all(projectId, founder.name);
          if (hits.length > 1) throw new Error(`Ambiguous founder: ${founder.name}`);
          person = hits[0] ?? null;
        }
        const personId = person?.id ?? id('person', entry.key, founder.name);
        if (!person) db.prepare(`INSERT OR IGNORE INTO people
          (id,name,aliases_json,founder_status,verification_status,verification_note)
          VALUES (?,?,'[]','founder','unverified','User-submitted founder; identity and education require verification.')`).run(personId, founder.name);
        const founderClaim = claim('person', personId, 'manual_referral', {
          company: entry.name, role: founder.role || 'founder', school: founder.school || entry.school || null,
          education: founder.education || null,
        }, `User-submitted founder: ${founder.name}; ${founder.education || 'education not supplied'}. Not independently verified.`, `${entry.key}:founder:${founder.name}`);
        if (!db.prepare('SELECT 1 FROM person_project_roles WHERE person_id=? AND project_id=?').get(personId, projectId)) {
          db.prepare('INSERT INTO person_project_roles (id,person_id,project_id,role,claim_id) VALUES (?,?,?,?,?)')
            .run(id('ppr', projectId, personId), personId, projectId, founder.role ? `co-founder / ${founder.role}` : 'co-founder', founderClaim);
        }
        relation('person', personId, 'project', projectId, 'founded', founderClaim);
        const campusId = founder.campusId || entry.campusId;
        if (campusId && !db.prepare('SELECT 1 FROM affiliations WHERE person_id=? AND university_id=?').get(personId, campusId)) {
          db.prepare(`INSERT INTO affiliations (id,person_id,university_id,role,status,claim_id)
            VALUES (?,?,?,'User-reported education','unverified',?)`).run(id('aff', personId, campusId), personId, campusId, founderClaim);
        }
        if (campusId) relation('person', personId, 'university', campusId, 'affiliated_with', founderClaim);
      }
      // Do not turn unverified reported rounds into funding events, inferred
      // graduation years into verified enrollment, or USV statuses into gates.
      if (!existing) {
        for (const gate of ['affiliation', 'stage', 'prior_funding', 'business_model', 'portfolio_relationship', 'funding_availability']) {
          db.prepare(`INSERT OR IGNORE INTO gate_results (id,project_id,gate_name,result,rationale,evaluated_at)
            VALUES (?,?,?,'needs_verification','User-submitted lead; corroborating evidence is still required.',?)`)
            .run(id('gate', projectId, gate), projectId, gate, now);
        }
      }
      results.push({ name: entry.name, id: projectId, disposition: existing ? 'matched' : 'created' });
    }
    const failures = db.prepare('PRAGMA foreign_key_check').all().filter(row => !existingForeignKeyFailures.has(JSON.stringify(row)));
    if (failures.length) throw new Error(`Foreign-key validation failed (${failures.length} rows).`);
    db.exec('COMMIT');
    return results;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dbPath = process.env.CAMPUS_UNIVERSE_DB_PATH || path.join(ROOT, 'data/campus-universe.db');
  if (!fs.existsSync(dbPath)) throw new Error('The existing Campus Scout database is required; refusing to create an empty catalog.');
  const db = new DatabaseSync(dbPath);
  try {
    db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=8000;');
    const result = applyScoutingList(db, JSON.parse(fs.readFileSync(DEFAULT_INPUT, 'utf8')));
    db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
    console.log(JSON.stringify({ batch: BATCH, records: result.length, results: result }));
  } finally {
    db.close();
  }
}
