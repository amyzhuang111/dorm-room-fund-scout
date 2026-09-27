// Idempotent load of public former DRF student partners.
// Re-running updates the same ids, drops alumni no longer in the file, and
// does not invent a campus, year, firm, or club.
//
//   npx tsx scripts/ingest/import-drf-alumni.ts

import fs from "node:fs";
import path from "node:path";
import { getDb, nowIso } from "../../lib/db/client";
import { DRF_ALUM_TAG, parseAlumniRecords, suggestedPersonId, type DrfAlumniRecord } from "../../lib/domain/drf-alumni";

const JSON_PATH = path.join(process.cwd(), "data", "imports", "drf_alumni.json");
const CSV_PATH = path.join(process.cwd(), "data", "drf-alumni.csv");

function matchPerson(record: DrfAlumniRecord): string | null {
  if (!record.universityId) return null;
  const db = getDb();
  const rows = db.prepare(`SELECT id FROM people WHERE lower(name) = lower(?)`).all(record.name) as { id: string }[];
  if (rows.length !== 1) return null;
  const affiliations = db.prepare(`SELECT university_id FROM affiliations WHERE person_id = ?`).all(rows[0].id) as { university_id: string }[];
  if (affiliations.some((row) => row.university_id === record.universityId)) return rows[0].id;
  return null;
}

function csvCell(value: string | number | null | undefined): string {
  const text = value == null ? "" : String(value);
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function writeCsv(records: DrfAlumniRecord[]) {
  const header = ["name", "drf_team", "year_start", "year_end", "class_year", "school", "university_id", "current_role", "current_firm", "linkedin_url", "x_url", "confidence", "founder", "matched_startup_id", "evidence_urls", "source_url", "excerpt"];
  const lines = [header.join(",")];
  for (const record of records) {
    const founder = record.currentRole && /\bfounder\b/i.test(record.currentRole) ? "yes" : "";
    lines.push(
      [
        record.name,
        record.drfTeam,
        record.yearStart,
        record.yearEnd,
        record.classYear,
        record.schoolLabel,
        record.universityId,
        record.currentRole,
        record.currentFirm,
        record.linkedinUrl,
        record.xUrl,
        record.confidence,
        founder,
        record.foundedProjectId,
        record.sourceUrls.join(" "),
        record.sourceUrl,
        record.excerpt,
      ].map(csvCell).join(",")
    );
  }
  fs.writeFileSync(CSV_PATH, lines.join("\n") + "\n");
}

function enrollmentLabel(record: DrfAlumniRecord): string | null {
  if (!record.classYear) return null;
  const tick = `'${String(record.classYear).slice(2)}`;
  if (record.programLabel) return `${record.programLabel} ${tick}`;
  return tick;
}

function main() {
  const records = parseAlumniRecords(JSON.parse(fs.readFileSync(JSON_PATH, "utf8")));
  writeCsv(records);
  const db = getDb();
  const universities = new Set((db.prepare(`SELECT id FROM universities`).all() as { id: string }[]).map((row) => row.id));
  const projects = new Set((db.prepare(`SELECT id FROM projects`).all() as { id: string }[]).map((row) => row.id));
  const retrievedAt = nowIso();
  const kept: string[] = [];

  const write = db.transaction(() => {
    for (const record of records) {
      kept.push(record.id);
      const existing = db.prepare(`SELECT person_id FROM drf_alumni WHERE id = ?`).get(record.id) as { person_id: string } | undefined;
      const personId = existing?.person_id ?? matchPerson(record) ?? suggestedPersonId(record.id);
      const owned = personId.startsWith("person_drf_");
      const person = db.prepare(`SELECT id FROM people WHERE id = ?`).get(personId) as { id: string } | undefined;
      if (!person) {
        const status = record.affiliationStatus === "older_alumni" || record.affiliationStatus === "recent_grad" || record.affiliationStatus === "current_student" ? record.affiliationStatus : null;
        db.prepare(
          `INSERT INTO people (
             id, name, aliases_json, enrollment_status, enrollment_label, enrollment_evidence, enrollment_source_url,
             enrollment_grad_year, enrollment_basis, verification_status, last_verified_at, verification_note
           ) VALUES (?, ?, '[]', ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          personId,
          record.name,
          status,
          enrollmentLabel(record),
          status ? record.excerpt : null,
          status ? record.firmSourceUrl ?? record.sourceUrl : null,
          record.classYear,
          status ? "verified" : null,
          record.confidence === "confirmed" ? "confirmed" : "partial",
          retrievedAt.slice(0, 10),
          "Public record of a former Dorm Room Fund student partner. Used for warm-intro paths, not as a founder score."
        );
      } else if (owned) {
        db.prepare(`UPDATE people SET name = ? WHERE id = ?`).run(record.name, personId);
      }

      const universityId = record.universityId && universities.has(record.universityId) ? record.universityId : null;
      if (record.universityId && !universityId) console.warn(`${record.id}: university ${record.universityId} is not in this database; school link skipped.`);
      const programId = record.programId && projects.has(record.programId) ? record.programId : null;
      if (record.programId && !programId) console.warn(`${record.id}: program ${record.programId} is not in this database; club link skipped.`);

      const claimId = `claim_${record.id}`;
      db.prepare(
        `INSERT INTO claims (
           id, entity_type, entity_id, claim_type, value_json, excerpt, source_url, retrieved_at, label, verification_state
         ) VALUES (?, 'person', ?, 'person_tag', ?, ?, ?, ?, 'observed_fact', ?)
         ON CONFLICT(id) DO UPDATE SET
           entity_id = excluded.entity_id,
           value_json = excluded.value_json,
           excerpt = excluded.excerpt,
           source_url = excluded.source_url,
           retrieved_at = excluded.retrieved_at,
           verification_state = excluded.verification_state`
      ).run(
        claimId,
        personId,
        JSON.stringify({ tag: DRF_ALUM_TAG, confidence: record.confidence, firm: record.currentFirm, role: record.currentRole, team: record.drfTeam }),
        record.excerpt,
        record.sourceUrl,
        retrievedAt,
        record.confidence === "confirmed" ? "corroborated" : "unverified"
      );

      db.prepare(`DELETE FROM affiliations WHERE id = ?`).run(`aff_${record.id}`);
      if (universityId) {
        db.prepare(
          `INSERT INTO affiliations (id, person_id, university_id, role, status, claim_id)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             person_id = excluded.person_id,
             university_id = excluded.university_id,
             role = excluded.role,
             status = excluded.status,
             claim_id = excluded.claim_id`
        ).run(
          `aff_${record.id}`,
          personId,
          universityId,
          record.schoolRole ?? "student",
          record.affiliationStatus ?? "unverified",
          claimId
        );
      }

      db.prepare(`DELETE FROM person_project_roles WHERE id = ?`).run(`ppr_${record.id}`);
      if (programId) {
        db.prepare(
          `INSERT INTO person_project_roles (id, person_id, project_id, role, claim_id)
           VALUES (?, ?, ?, 'member', ?)
           ON CONFLICT(id) DO UPDATE SET person_id = excluded.person_id, project_id = excluded.project_id, role = excluded.role, claim_id = excluded.claim_id`
        ).run(`ppr_${record.id}`, personId, programId, claimId);
      }

      db.prepare(`DELETE FROM relationships WHERE id = ?`).run(`rel_${record.id}`);
      db.prepare(`DELETE FROM person_project_roles WHERE id = ?`).run(`ppr_${record.id}_founded`);
      db.prepare(`DELETE FROM relationships WHERE id = ?`).run(`rel_${record.id}_founded`);
      if (record.foundedProjectId && projects.has(record.foundedProjectId)) {
        db.prepare(
          `INSERT INTO person_project_roles (id, person_id, project_id, role, claim_id)
           VALUES (?, ?, ?, 'founder', ?)
           ON CONFLICT(id) DO UPDATE SET person_id = excluded.person_id, project_id = excluded.project_id, role = excluded.role, claim_id = excluded.claim_id`
        ).run(`ppr_${record.id}_founded`, personId, record.foundedProjectId, claimId);
        db.prepare(
          `INSERT INTO relationships (
             id, source_entity_type, source_entity_id, target_entity_type, target_entity_id,
             relationship_type, evidence_claim_ids_json, verification_state
           ) VALUES (?, 'person', ?, 'project', ?, 'founded', ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             source_entity_id = excluded.source_entity_id,
             target_entity_id = excluded.target_entity_id,
             evidence_claim_ids_json = excluded.evidence_claim_ids_json,
             verification_state = excluded.verification_state`
        ).run(
          `rel_${record.id}_founded`,
          personId,
          record.foundedProjectId,
          JSON.stringify([claimId]),
          record.confidence === "confirmed" ? "affiliation_only" : "unverified"
        );
      }
      if (record.investorId && record.currentFirm) {
        db.prepare(
          `INSERT INTO relationships (
             id, source_entity_type, source_entity_id, target_entity_type, target_entity_id,
             relationship_type, evidence_claim_ids_json, verification_state
           ) VALUES (?, 'person', ?, 'investor', ?, 'works_at', ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             source_entity_id = excluded.source_entity_id,
             target_entity_id = excluded.target_entity_id,
             evidence_claim_ids_json = excluded.evidence_claim_ids_json,
             verification_state = excluded.verification_state`
        ).run(
          `rel_${record.id}`,
          personId,
          record.investorId,
          JSON.stringify([claimId]),
          record.confidence === "confirmed" ? "affiliation_only" : "unverified"
        );
      }

      db.prepare(
        `INSERT INTO drf_alumni (
           id, person_id, name, drf_team, university_id, school_label, program_id, program_label,
           year_start, year_end, class_year, current_firm, current_role, investor_id,
           source_url, firm_source_url, sources_json, confidence, excerpt
         ) VALUES (
           @id, @person_id, @name, @drf_team, @university_id, @school_label, @program_id, @program_label,
           @year_start, @year_end, @class_year, @current_firm, @current_role, @investor_id,
           @source_url, @firm_source_url, @sources_json, @confidence, @excerpt
         )
         ON CONFLICT(id) DO UPDATE SET
           person_id = excluded.person_id,
           name = excluded.name,
           drf_team = excluded.drf_team,
           university_id = excluded.university_id,
           school_label = excluded.school_label,
           program_id = excluded.program_id,
           program_label = excluded.program_label,
           year_start = excluded.year_start,
           year_end = excluded.year_end,
           class_year = excluded.class_year,
           current_firm = excluded.current_firm,
           current_role = excluded.current_role,
           investor_id = excluded.investor_id,
           source_url = excluded.source_url,
           firm_source_url = excluded.firm_source_url,
           sources_json = excluded.sources_json,
           confidence = excluded.confidence,
           excerpt = excluded.excerpt`
      ).run({
        id: record.id,
        person_id: personId,
        name: record.name,
        drf_team: record.drfTeam,
        university_id: universityId,
        school_label: record.schoolLabel,
        program_id: programId,
        program_label: programId ? record.programLabel : null,
        year_start: record.yearStart,
        year_end: record.yearEnd,
        class_year: record.classYear,
        current_firm: record.currentFirm,
        current_role: record.currentRole,
        investor_id: record.investorId,
        source_url: record.sourceUrl,
        firm_source_url: record.firmSourceUrl,
        sources_json: JSON.stringify(record.sourceUrls),
        confidence: record.confidence,
        excerpt: record.excerpt,
      });
    }

    const stale = db.prepare(`SELECT id, person_id FROM drf_alumni`).all() as { id: string; person_id: string }[];
    for (const row of stale) {
      if (kept.includes(row.id)) continue;
      db.prepare(`DELETE FROM affiliations WHERE id = ?`).run(`aff_${row.id}`);
      db.prepare(`DELETE FROM person_project_roles WHERE id = ?`).run(`ppr_${row.id}`);
      db.prepare(`DELETE FROM person_project_roles WHERE id = ?`).run(`ppr_${row.id}_founded`);
      db.prepare(`DELETE FROM relationships WHERE id = ?`).run(`rel_${row.id}`);
      db.prepare(`DELETE FROM relationships WHERE id = ?`).run(`rel_${row.id}_founded`);
      db.prepare(`DELETE FROM claims WHERE id = ?`).run(`claim_${row.id}`);
      db.prepare(`DELETE FROM drf_alumni WHERE id = ?`).run(row.id);
      if (row.person_id.startsWith("person_drf_")) {
        const roles = db.prepare(`SELECT COUNT(*) AS n FROM person_project_roles WHERE person_id = ?`).get(row.person_id) as { n: number };
        const affs = db.prepare(`SELECT COUNT(*) AS n FROM affiliations WHERE person_id = ?`).get(row.person_id) as { n: number };
        if (roles.n === 0 && affs.n === 0) db.prepare(`DELETE FROM people WHERE id = ?`).run(row.person_id);
      }
    }
  });
  write();
  db.pragma("wal_checkpoint(TRUNCATE)");

  const counts = db.prepare(`SELECT confidence, current_firm, COUNT(*) AS n FROM drf_alumni GROUP BY confidence, current_firm ORDER BY confidence, current_firm`).all() as {
    confidence: string;
    current_firm: string | null;
    n: number;
  }[];
  const total = db.prepare(`SELECT confidence, COUNT(*) AS n FROM drf_alumni GROUP BY confidence`).all() as { confidence: string; n: number }[];
  console.log(`drf alumni: ${records.length} records`);
  for (const row of total) console.log(`  ${row.confidence}: ${row.n}`);
  for (const row of counts) console.log(`  ${row.confidence} · ${row.current_firm ?? "(no firm)"}: ${row.n}`);
}

main();
