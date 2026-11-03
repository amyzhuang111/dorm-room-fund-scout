// Loads signals-new.csv into signals, claims, and campus links.
// Re-running keeps the same ids. A month or year is stored as given.
// QFEX and Pharosyn stay low confidence about recent-alumni status.
// A unique company name is reused when it is already at that campus, already
// cites the same source URL, or has no campus yet. A same-name company that
// is already tied to a different campus, with a different source, stays separate.

import crypto from "node:crypto";
import fs from "node:fs";
import { getDb, nowIso } from "../../lib/db/client";

const CSV_PATH = "/cursor/stores/store-1cc600f6-109b-45e3-bdc5-24a3a29849df/campus-scout/signals-new.csv";

const LOW_NOTE =
  "Low confidence. The source describes the founders as Cambridge mathematicians or graduates and does not confirm recent-alumni status.";

const STOP = new Set(
  "the and for with from that this its was are each total won placed their them into over per via not but has have had who she her his they our your".split(" "),
);

interface CsvRow {
  company: string;
  school: string;
  country: string;
  signal_type: string;
  signal_date: string;
  detail: string;
  source_link: string;
  source_file: string;
  in_app: string;
}

function parseCsv(text: string): CsvRow[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c !== "\r") field += c;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  const header = rows[0] ?? [];
  return rows.slice(1).filter((cells) => cells.some((cell) => cell.trim())).map((cells) => {
    const record = {} as CsvRow;
    header.forEach((key, index) => {
      record[key as keyof CsvRow] = (cells[index] ?? "").trim();
    });
    return record;
  });
}

function stableId(prefix: string, material: string): string {
  return prefix + crypto.createHash("sha256").update(material).digest("hex").slice(0, 20);
}

function signalType(raw: string): string {
  const value = raw.trim().toLowerCase();
  if (value.startsWith("accelerator")) return "accelerator";
  if (value === "award" || value === "funding" || value === "launch") return value;
  throw new Error(`Unknown signal_type: ${raw}`);
}

function signalDate(raw: string): string {
  const value = raw.trim();
  if (!/^\d{4}(-\d{2}(-\d{2})?)?$/.test(value)) throw new Error(`Date is not YYYY, YYYY-MM, or YYYY-MM-DD: ${raw}`);
  return value;
}

function monthKey(value: string | null): string | null {
  if (!value) return null;
  const match = /^(\d{4}-\d{2})(?:-\d{2})?$/.exec(value.trim());
  return match ? match[1] : null;
}

function tokens(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .split(" ")
      .filter((token) => token.length > 2 && !STOP.has(token)),
  );
}

function overlap(left: string, right: string): number {
  const other = tokens(right);
  let shared = 0;
  for (const token of tokens(left)) if (other.has(token)) shared += 1;
  return shared;
}

function isLow(row: CsvRow): boolean {
  return row.school === "University of Cambridge" && (row.company === "QFEX" || row.company === "Pharosyn");
}

function batchKey(row: CsvRow, rows: CsvRow[]): string {
  const schools = new Set(
    rows.filter((other) => other.company === row.company && other.detail === row.detail && other.source_link === row.source_link).map((other) => other.school),
  );
  if (schools.size > 1) return `shared\n${row.company}\n${row.detail}\n${row.source_link}`;
  return `school\n${row.company}\n${row.school}`;
}

function main() {
  if (!fs.existsSync(CSV_PATH)) {
    console.error(`Cannot read ${CSV_PATH}`);
    process.exit(1);
  }
  const rows = parseCsv(fs.readFileSync(CSV_PATH, "utf8"));
  if (rows.length !== 259) throw new Error(`Expected 259 rows, read ${rows.length}`);

  const db = getDb();
  const retrievedAt = nowIso();
  const universityByName = new Map(
    (db.prepare(`SELECT id, name FROM universities`).all() as { id: string; name: string }[]).map((row) => [row.name.trim().toLowerCase(), row.id]),
  );

  const projectsCreated = new Set<string>();
  const projectsMatched = new Set<string>();
  const relationshipsAdded: string[] = [];
  const signalsInserted: string[] = [];
  const collapsed: string[] = [];
  const skippedExisting: { company: string; date: string; existingDate: string | null; overlap: number }[] = [];
  const separateNames: { company: string; school: string; existing: string }[] = [];
  const chosenProject = new Map<string, string>();

  const campusIds = db.prepare(
    `SELECT university_id as id FROM (
       SELECT a.university_id as university_id
       FROM person_project_roles ppr
       JOIN affiliations a ON a.person_id = ppr.person_id
       WHERE ppr.project_id = ? AND a.university_id IS NOT NULL
       UNION
       SELECT target_entity_id FROM relationships
       WHERE source_entity_type = 'project' AND source_entity_id = ? AND target_entity_type = 'university'
     )`,
  );
  const nameHits = db.prepare(`SELECT id, name FROM projects WHERE lower(trim(name)) = lower(trim(?))`);
  const claimUrl = db.prepare(
    `SELECT 1 as ok FROM claims WHERE entity_type = 'project' AND entity_id = ? AND source_url = ? LIMIT 1`,
  );
  const existingSignals = db.prepare(
    `SELECT id, signal_type, source_date, current_observation FROM signals WHERE project_id = ?`,
  );

  const write = db.transaction(() => {
    for (const row of rows) {
      const universityId = universityByName.get(row.school.trim().toLowerCase());
      if (!universityId) throw new Error(`No campus named ${row.school}`);
      const type = signalType(row.signal_type);
      const date = signalDate(row.signal_date);
      if (!row.company || !row.detail || !row.source_link.startsWith("http")) throw new Error(`Incomplete row for ${row.company || "(blank)"}`);
      const low = isLow(row);
      const key = batchKey(row, rows);

      let projectId = chosenProject.get(key);
      const stableProjectId = stableId("proj_pub_", key);
      if (!projectId && db.prepare(`SELECT id FROM projects WHERE id = ?`).get(stableProjectId)) projectId = stableProjectId;
      if (!projectId) {
        const hits = nameHits.all(row.company) as { id: string; name: string }[];
        const eligible = hits.filter((hit) => {
          const campuses = (campusIds.all(hit.id, hit.id) as { id: string }[]).map((item) => item.id);
          const sameCampus = campuses.includes(universityId);
          const sameUrl = Boolean(claimUrl.get(hit.id, row.source_link));
          const noCampus = campuses.length === 0;
          return sameCampus || sameUrl || noCampus;
        });
        if (eligible.length > 1) throw new Error(`Ambiguous company name: ${row.company}`);
        if (eligible.length === 1) {
          projectId = eligible[0].id;
          projectsMatched.add(eligible[0].id);
        } else if (hits.length === 1) {
          separateNames.push({ company: row.company, school: row.school, existing: hits[0].name });
        }
      }

      if (!projectId) {
        projectId = stableId("proj_pub_", key);
        const status = low ? "partial" : "confirmed";
        const note = low ? LOW_NOTE : null;
        const existingProject = db.prepare(`SELECT id FROM projects WHERE id = ?`).get(projectId) as { id: string } | undefined;
        if (!existingProject) {
          db.prepare(
            `INSERT INTO projects (id, name, kind, description, is_investable_candidate, verification_status, verification_note, created_at, updated_at)
             VALUES (?, ?, 'company', NULL, 1, ?, ?, ?, ?)`,
          ).run(projectId, row.company, status, note, retrievedAt, retrievedAt);
          projectsCreated.add(projectId);
        } else {
          db.prepare(`UPDATE projects SET verification_status = ?, verification_note = ?, updated_at = ? WHERE id = ?`).run(status, note, retrievedAt, projectId);
        }
      }
      chosenProject.set(key, projectId);

      const claimMaterial = `${row.company}\n${type}\n${date}\n${row.source_link}\n${row.detail}`;
      const claimId = stableId("claim_pub_", claimMaterial);
      const signalId = stableId("sig_pub_", claimMaterial);

      const prior = existingSignals.all(projectId) as {
        id: string;
        signal_type: string;
        source_date: string | null;
        current_observation: string;
      }[];
      const duplicate = prior.find((signal) => {
        if (signal.id === signalId) return false;
        if (signal.signal_type !== type) return false;
        if (monthKey(signal.source_date) == null || monthKey(signal.source_date) !== monthKey(date)) return false;
        return overlap(signal.current_observation, row.detail) >= 4;
      });
      if (duplicate) {
        skippedExisting.push({
          company: row.company,
          date,
          existingDate: duplicate.source_date,
          overlap: overlap(duplicate.current_observation, row.detail),
        });
        continue;
      }

      const seenThisRun = signalsInserted.includes(signalId);
      const storedAlready = prior.some((signal) => signal.id === signalId);
      db.prepare(
        `INSERT INTO claims (id, entity_type, entity_id, claim_type, value_json, excerpt, source_url, published_date, retrieved_at, label, verification_state)
         VALUES (?, 'project', ?, ?, ?, ?, ?, ?, ?, 'observed_fact', ?)
         ON CONFLICT(id) DO UPDATE SET
           excerpt = excluded.excerpt,
           source_url = excluded.source_url,
           published_date = excluded.published_date,
           verification_state = excluded.verification_state`,
      ).run(
        claimId,
        projectId,
        type,
        JSON.stringify({ company: row.company, school: row.school, signal_type: type, signal_date: date }),
        row.detail,
        row.source_link,
        date,
        retrievedAt,
        low ? "likely" : "corroborated",
      );

      const relId = stableId("rel_pub_", `${projectId}\n${universityId}`);
      const relInserted = db
        .prepare(
          `INSERT INTO relationships (id, source_entity_type, source_entity_id, target_entity_type, target_entity_id, relationship_type, evidence_claim_ids_json, verification_state, created_at)
           SELECT ?, 'project', ?, 'university', ?, 'affiliated_with', ?, ?, ?
           WHERE NOT EXISTS (
             SELECT 1 FROM relationships
             WHERE source_entity_type = 'project' AND source_entity_id = ?
               AND target_entity_type = 'university' AND target_entity_id = ?
               AND relationship_type = 'affiliated_with'
           )`,
        )
        .run(
          relId,
          projectId,
          universityId,
          JSON.stringify([claimId]),
          low ? "unverified" : "affiliation_only",
          retrievedAt,
          projectId,
          universityId,
        );
      if (relInserted.changes > 0) relationshipsAdded.push(`${row.company} → ${row.school}`);

      if (seenThisRun) {
        collapsed.push(`${row.company} @ ${row.school}`);
        continue;
      }
      if (storedAlready) {
        db.prepare(
          `UPDATE signals SET current_observation = ?, source_date = ?, significance_note = ?, claim_ids_json = ? WHERE id = ?`,
        ).run(row.detail, date, low ? LOW_NOTE : null, JSON.stringify([claimId]), signalId);
        continue;
      }

      db.prepare(
        `INSERT INTO signals (id, project_id, signal_type, current_observation, source_date, significance_note, claim_ids_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(signalId, projectId, type, row.detail, date, low ? LOW_NOTE : null, JSON.stringify([claimId]), retrievedAt);
      signalsInserted.push(signalId);
    }
  });
  write();

  const total = (db.prepare(`SELECT COUNT(*) as c FROM signals`).get() as { c: number }).c;
  const investable = (
    db.prepare(`SELECT COUNT(*) as c FROM projects WHERE kind = 'company' AND is_investable_candidate = 1`).get() as { c: number }
  ).c;
  const perCampus = db
    .prepare(
      `WITH link AS (
         SELECT ppr.project_id as project_id, a.university_id as university_id
         FROM person_project_roles ppr
         JOIN affiliations a ON a.person_id = ppr.person_id
         WHERE a.university_id IS NOT NULL
         UNION
         SELECT r.source_entity_id, r.target_entity_id
         FROM relationships r
         WHERE r.source_entity_type = 'project' AND r.target_entity_type = 'university'
       )
       SELECT u.name as campus, COUNT(DISTINCT s.id) as signals
       FROM universities u
       LEFT JOIN link ON link.university_id = u.id
       LEFT JOIN signals s ON s.project_id = link.project_id
       WHERE u.lat IS NOT NULL AND u.lon IS NOT NULL
       GROUP BY u.id
       ORDER BY signals DESC, u.name`,
    )
    .all() as { campus: string; signals: number }[];

  const padded = db
    .prepare(
      `SELECT COUNT(*) as c FROM signals WHERE id LIKE 'sig_pub_%' AND source_date IS NOT NULL AND length(source_date) NOT IN (4, 7, 10)`,
    )
    .get() as { c: number };
  const lowRows = db
    .prepare(
      `SELECT p.name as name, s.source_date as source_date, p.verification_status as status, c.verification_state as claim_state, r.verification_state as rel_state
       FROM signals s
       JOIN projects p ON p.id = s.project_id
       JOIN claims c ON c.id = json_extract(s.claim_ids_json, '$[0]')
       JOIN relationships r ON r.source_entity_type = 'project' AND r.source_entity_id = p.id AND r.target_entity_type = 'university'
       WHERE p.name IN ('QFEX', 'Pharosyn') AND s.id LIKE 'sig_pub_%'`,
    )
    .all();

  db.pragma("wal_checkpoint(TRUNCATE)");

  console.log(
    JSON.stringify(
      {
        csvRows: rows.length,
        signalsInserted: signalsInserted.length,
        collapsedExtraCampus: collapsed,
        skippedExisting,
        separateSameName: separateNames,
        companiesCreated: projectsCreated.size,
        companiesMatched: projectsMatched.size,
        relationshipsAdded: relationshipsAdded.length,
        totalSignals: total,
        investableCompanies: investable,
        plottedCampuses: perCampus.length,
        paddedDates: padded.c,
        lowConfidence: lowRows,
        perCampus,
      },
      null,
      2,
    ),
  );
}

main();
