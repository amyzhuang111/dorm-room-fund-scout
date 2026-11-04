/**
 * Import 18 campus source URLs from campus-sources-scan-all-2026-11-03.md.
 * Keep only companies with a current-student or class-of-2023+ founder (public evidence).
 * Tech-transfer / faculty spinouts without student founders are excluded (not inserted).
 * Dedupe: website identity else name+campus(+founders). Never merge by name alone.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type Database from "better-sqlite3";
import { CAMPUSES } from "../lib/domain/campuses";
import { normalizeCompanyName, websiteIdentity } from "../lib/domain/dedupe";
import { getDb, newId, nowIso } from "../lib/db/client";

const UA_NOTE = "sources-scan-all-2026-11-03";
const IMPORTS = path.join(process.cwd(), "data/imports");
const LEADS_PATH = path.join(IMPORTS, "sources-scan-all-2026-11-03.json");
const REPORT_PATH = path.join(process.cwd(), "reviews/sources-import-scan-all-2026-11-03.md");
const STATS_PATH = "/tmp/backfill-2026-11-03/source-stats.json";

type Affiliation =
  | "current_student"
  | "alumni"
  | "faculty"
  | "research_spinout"
  | "staff"
  | "community"
  | "unknown";

type FounderIn = {
  name: string;
  affiliation_type: Affiliation;
  grad_year: number | null;
  enrollment_status: "current_student" | "recent_grad" | "older_alumni" | null;
  evidence_url: string;
};

type Lead = {
  name: string;
  university: string;
  campusId: string;
  affiliation_type: Affiliation;
  cohort_year: number | null;
  enrollment_status: string | null;
  website: string | null;
  evidence_url: string;
  program: string;
  source: string;
  description?: string | null;
  founders: FounderIn[];
  markFacultyOnly?: boolean;
  _eligible: boolean;
  _exclude_reason: string | null;
  _source_key: string;
};

function campusAffiliated(db: Database.Database, projectId: string, campusId: string): boolean {
  return Boolean(
    db
      .prepare(
        `SELECT 1 FROM relationships WHERE source_entity_type='project' AND source_entity_id=? AND target_entity_type='university' AND target_entity_id=? AND relationship_type='affiliated_with'`,
      )
      .get(projectId, campusId),
  );
}

function findExisting(
  db: Database.Database,
  name: string,
  website: string | null,
  campusId: string,
  founderNames: string[],
): string | null {
  const site = websiteIdentity(website);
  if (site) {
    const rows = db.prepare(`SELECT id, website_url FROM projects WHERE kind='company' AND website_url IS NOT NULL`).all() as {
      id: string;
      website_url: string;
    }[];
    const hits = rows.filter((r) => websiteIdentity(r.website_url) === site);
    if (hits.length >= 1) return hits[0].id;
  }
  const key = normalizeCompanyName(name);
  const rows = db.prepare(`SELECT id, name FROM projects WHERE kind='company'`).all() as { id: string; name: string }[];
  const nameHits = rows.filter((r) => normalizeCompanyName(r.name) === key);
  const onCampus = nameHits.filter((r) => campusAffiliated(db, r.id, campusId));
  if (onCampus.length === 1) return onCampus[0].id;
  if (onCampus.length > 1 && founderNames.length) {
    for (const hit of onCampus) {
      const founders = db
        .prepare(
          `SELECT pe.name FROM person_project_roles ppr JOIN people pe ON pe.id=ppr.person_id
           WHERE ppr.project_id=? AND lower(ppr.role) LIKE '%founder%'`,
        )
        .all(hit.id) as { name: string }[];
      const set = new Set(founders.map((f) => f.name.toLowerCase()));
      if (founderNames.some((n) => set.has(n.toLowerCase()))) return hit.id;
    }
  }
  // Same name on another campus, or multiple same-name on campus without shared founders → new row
  return null;
}

function findPerson(db: Database.Database, name: string, campusId: string): string | null {
  const rows = db.prepare(`SELECT id, name FROM people WHERE lower(name)=lower(?)`).all(name) as { id: string; name: string }[];
  if (rows.length === 1) return rows[0].id;
  if (rows.length > 1) {
    for (const r of rows) {
      const aff = db.prepare(`SELECT 1 FROM affiliations WHERE person_id=? AND university_id=?`).get(r.id, campusId);
      if (aff) return r.id;
    }
  }
  return null;
}

function linkCampus(db: Database.Database, projectId: string, campusId: string, claimId: string | null) {
  if (campusAffiliated(db, projectId, campusId)) return;
  db.prepare(
    `INSERT INTO relationships (id, source_entity_type, source_entity_id, target_entity_type, target_entity_id, relationship_type, evidence_claim_ids_json, verification_state)
     VALUES (?, 'project', ?, 'university', ?, 'affiliated_with', ?, 'affiliation_only')`,
  ).run(newId("rel"), projectId, campusId, JSON.stringify(claimId ? [claimId] : []));
}

function ensureSource(db: Database.Database, sourceId: string, name: string, listUrl: string, campusId: string, retrievedAt: string) {
  db.prepare(
    `INSERT INTO sources (id, name, family, url, campuses_json, priority, ingestion_mode, status, last_attempt_at, last_success_at, source_role, tier_rationale)
     VALUES (?, ?, 'campus_builder_org', ?, ?, 2, 'html_public', 'available', ?, ?, 'discovery', ?)
     ON CONFLICT(id) DO UPDATE SET last_attempt_at=excluded.last_attempt_at, last_success_at=excluded.last_success_at, status='available'`,
  ).run(sourceId, name, listUrl, JSON.stringify([campusId]), retrievedAt, retrievedAt, `${name} public roster`);
}

function upsertFounder(
  db: Database.Database,
  founder: FounderIn,
  projectId: string,
  campusId: string,
  sourceId: string,
  retrievedAt: string,
): { personId: string; created: boolean } {
  if (!founder.name || founder.name.startsWith("(")) return { personId: "", created: false };
  let personId = findPerson(db, founder.name, campusId);
  let created = false;
  if (!personId) {
    personId = newId("person");
    db.prepare(
      `INSERT INTO people (id, name, aliases_json, founder_status, verification_status, verification_note, last_verified_at)
       VALUES (?, ?, '[]', 'founder', 'confirmed', ?, ?)`,
    ).run(personId, founder.name, `Public roster ${founder.evidence_url}`, retrievedAt.slice(0, 10));
    created = true;
  } else {
    db.prepare(`UPDATE people SET founder_status='founder' WHERE id=? AND (founder_status IS NULL OR founder_status!='founder')`).run(personId);
  }

  if (founder.grad_year != null) {
    const status =
      founder.enrollment_status ??
      (founder.affiliation_type === "current_student"
        ? "current_student"
        : founder.grad_year >= 2023
          ? "recent_grad"
          : "older_alumni");
    db.prepare(
      `UPDATE people SET enrollment_grad_year=?, enrollment_status=?, enrollment_basis='verified',
         enrollment_evidence=?, enrollment_source_url=?, enrollment_source_id=?
       WHERE id=?`,
    ).run(
      founder.grad_year,
      status,
      `${founder.name} · class ${founder.grad_year} · ${founder.affiliation_type}`,
      founder.evidence_url,
      sourceId,
      personId,
    );
  } else if (founder.affiliation_type === "current_student") {
    db.prepare(
      `UPDATE people SET enrollment_status='current_student', enrollment_basis='verified',
         enrollment_evidence=?, enrollment_source_url=?, enrollment_source_id=?
       WHERE id=? AND (enrollment_status IS NULL OR enrollment_status='unknown')`,
    ).run(`Listed as student founder on ${founder.evidence_url}`, founder.evidence_url, sourceId, personId);
  }

  const claimId = newId("claim");
  db.prepare(
    `INSERT INTO claims (id, entity_type, entity_id, claim_type, value_json, excerpt, source_id, source_url, retrieved_at, label, verification_state)
     VALUES (?, 'person', ?, 'campus_program_listing', ?, ?, ?, ?, ?, 'observed_fact', 'observed')`,
  ).run(
    claimId,
    personId,
    JSON.stringify({
      name: founder.name,
      university: CAMPUSES.find((c) => c.id === campusId)?.name ?? null,
      campusId,
      affiliation_type: founder.affiliation_type,
      cohort_year: founder.grad_year,
      enrollment_status: founder.enrollment_status,
      evidence_url: founder.evidence_url,
    }),
    `${founder.name} · ${founder.affiliation_type}${founder.grad_year ? ` · ${founder.grad_year}` : ""}`.slice(0, 500),
    sourceId,
    founder.evidence_url,
    retrievedAt,
  );

  if (!db.prepare(`SELECT id FROM person_project_roles WHERE person_id=? AND project_id=?`).get(personId, projectId)) {
    db.prepare(`INSERT INTO person_project_roles (id, person_id, project_id, role, claim_id) VALUES (?, ?, ?, ?, ?)`).run(
      newId("ppr"),
      personId,
      projectId,
      "founder",
      claimId,
    );
  }
  if (
    !db
      .prepare(
        `SELECT 1 FROM relationships WHERE source_entity_type='person' AND source_entity_id=? AND target_entity_type='project' AND target_entity_id=? AND relationship_type='founded'`,
      )
      .get(personId, projectId)
  ) {
    db.prepare(
      `INSERT INTO relationships (id, source_entity_type, source_entity_id, target_entity_type, target_entity_id, relationship_type, evidence_claim_ids_json, verification_state)
       VALUES (?, 'person', ?, 'project', ?, 'founded', ?, 'affiliation_only')`,
    ).run(newId("rel"), personId, projectId, JSON.stringify([claimId]));
  }
  if (!db.prepare(`SELECT 1 FROM affiliations WHERE person_id=? AND university_id=?`).get(personId, campusId)) {
    const affStatus =
      founder.affiliation_type === "current_student"
        ? "current_student"
        : founder.grad_year != null && founder.grad_year >= 2023
          ? "recent_grad"
          : founder.affiliation_type === "alumni"
            ? "older_alumni"
            : "unverified";
    db.prepare(
      `INSERT INTO affiliations (id, person_id, university_id, role, status, claim_id) VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(newId("aff"), personId, campusId, founder.affiliation_type, affStatus, claimId);
  }
  return { personId, created };
}

type PerSource = {
  source_key: string;
  found: number;
  kept: number;
  excluded: number;
  duplicates: number;
  imported_new: number;
  merged_existing: number;
  exclude_reasons: Record<string, number>;
  notes: string[];
};

function main() {
  const retrievedAt = nowIso();
  const leads = JSON.parse(fs.readFileSync(LEADS_PATH, "utf8")) as Lead[];
  const preStats = fs.existsSync(STATS_PATH) ? JSON.parse(fs.readFileSync(STATS_PATH, "utf8")) : {};
  const db = getDb();

  const beforeInvestable = (
    db.prepare(`SELECT COUNT(*) AS c FROM projects WHERE kind='company' AND is_investable_candidate=1`).get() as { c: number }
  ).c;

  const perSource = new Map<string, PerSource>();
  const ensure = (key: string): PerSource => {
    if (!perSource.has(key)) {
      const notes = (preStats[key]?.notes as string[]) || [];
      perSource.set(key, {
        source_key: key,
        found: 0,
        kept: 0,
        excluded: 0,
        duplicates: 0,
        imported_new: 0,
        merged_existing: 0,
        exclude_reasons: {},
        notes,
      });
    }
    return perSource.get(key)!;
  };

  // Register sources once per distinct evidence URL
  const sourceByUrl = new Map<string, { id: string; campusId: string; name: string }>();

  const insertProject = db.prepare(
    `INSERT INTO projects (id, name, aliases_json, kind, sector, description, website_url, is_portfolio_reference, is_investable_candidate, created_at, updated_at, primary_link, primary_link_kind, verification_status, last_verified_at, verification_note)
     VALUES (?, ?, '[]', 'company', NULL, ?, ?, 0, 1, ?, ?, ?, ?, 'confirmed', ?, ?)`,
  );
  const updateProject = db.prepare(
    `UPDATE projects SET
       description=COALESCE(description, ?),
       website_url=COALESCE(website_url, ?),
       updated_at=?,
       primary_link=COALESCE(primary_link, ?),
       last_verified_at=?,
       verification_note=COALESCE(verification_note, ?),
       is_investable_candidate=1,
       excluded_reason=NULL
     WHERE id=?`,
  );

  let importedNew = 0;
  let merged = 0;
  let foundersCreated = 0;
  let skippedExcluded = 0;
  let duplicates = 0;

  const tx = db.transaction(() => {
    for (const lead of leads) {
      const stats = ensure(lead._source_key);
      stats.found += 1;

      if (!lead._eligible) {
        stats.excluded += 1;
        skippedExcluded += 1;
        const reason = lead._exclude_reason || "excluded";
        stats.exclude_reasons[reason] = (stats.exclude_reasons[reason] || 0) + 1;
        continue;
      }

      stats.kept += 1;
      const name = lead.name.trim();
      if (!name) {
        stats.excluded += 1;
        stats.kept -= 1;
        continue;
      }

      const founderNames = (lead.founders || []).map((f) => f.name).filter(Boolean);
      const website = lead.website?.trim() || null;
      const evidenceUrl = lead.evidence_url?.trim();
      const campusId = lead.campusId;
      const sourceId = lead.source || `src_${lead._source_key}`;

      if (!sourceByUrl.has(evidenceUrl)) {
        const srcName = lead.program.split("—")[0].trim() || lead.program;
        ensureSource(db, sourceId, srcName, evidenceUrl, campusId, retrievedAt);
        sourceByUrl.set(evidenceUrl, { id: sourceId, campusId, name: srcName });
        const cacheName = `${lead._source_key}-2026-11-03.json`;
        const subset = leads.filter((l) => l.evidence_url === evidenceUrl);
        fs.writeFileSync(path.join(IMPORTS, cacheName), JSON.stringify(subset, null, 2) + "\n");
        const hash = crypto.createHash("sha256").update(fs.readFileSync(path.join(IMPORTS, cacheName))).digest("hex");
        db.prepare(
          `INSERT INTO snapshots (id, source_id, url, content_hash, fetched_at, http_status, raw_excerpt) VALUES (?, ?, ?, ?, ?, 200, ?)`,
        ).run(newId("snap"), sourceId, evidenceUrl, hash, retrievedAt, `${srcName} cache (${subset.length} leads)`);
      }

      const existing = findExisting(db, name, website, campusId, founderNames);
      const desc = lead.description?.trim() || null;
      const note = `${UA_NOTE} · ${lead.program} · ${lead.affiliation_type}`;
      const linkKind = website ? "website" : "other";

      let projectId = existing;
      if (!projectId) {
        projectId = newId("proj");
        insertProject.run(
          projectId,
          name,
          desc,
          website,
          retrievedAt,
          retrievedAt,
          website || evidenceUrl,
          linkKind,
          retrievedAt.slice(0, 10),
          note,
        );
        importedNew += 1;
        stats.imported_new += 1;
      } else {
        updateProject.run(desc, website, retrievedAt, website || evidenceUrl, retrievedAt.slice(0, 10), note, projectId);
        merged += 1;
        duplicates += 1;
        stats.duplicates += 1;
        stats.merged_existing += 1;
      }

      const claimId = newId("claim");
      db.prepare(
        `INSERT INTO claims (id, entity_type, entity_id, claim_type, value_json, excerpt, source_id, source_url, retrieved_at, label, verification_state)
         VALUES (?, 'project', ?, 'campus_program_listing', ?, ?, ?, ?, ?, 'observed_fact', 'observed')`,
      ).run(
        claimId,
        projectId,
        JSON.stringify({
          name,
          university: lead.university,
          campusId,
          affiliation_type: lead.affiliation_type,
          cohort_year: lead.cohort_year,
          enrollment_status: lead.enrollment_status,
          website,
          evidence_url: evidenceUrl,
          program: lead.program,
          source: sourceId,
        }),
        `${name} · ${lead.program}`.slice(0, 500),
        sourceId,
        evidenceUrl,
        retrievedAt,
      );

      linkCampus(db, projectId, campusId, claimId);

      for (const f of lead.founders || []) {
        if (!f?.name || f.name.startsWith("(")) continue;
        const res = upsertFounder(db, f, projectId, campusId, sourceId, retrievedAt);
        if (res.created) foundersCreated += 1;
      }
    }
  });
  tx();

  const afterInvestable = (
    db.prepare(`SELECT COUNT(*) AS c FROM projects WHERE kind='company' AND is_investable_candidate=1`).get() as { c: number }
  ).c;

  const reportLines: string[] = [
    `# Sources import — scan-all 2026-11-03`,
    ``,
    `Branch: \`cursor/data-backfill-2026-11-03\`. Eligibility: current student or class of 2023+ with public evidence. Tech-transfer/faculty spinouts without student founders excluded (not inserted). Dedupe: website else name+campus(+founders); never name alone.`,
    ``,
    `## Totals`,
    ``,
    `- Leads parsed: **${leads.length}**`,
    `- Eligible (kept for import): **${leads.filter((l) => l._eligible).length}**`,
    `- Excluded (not inserted): **${skippedExcluded}**`,
    `- New investable companies inserted: **${importedNew}**`,
    `- Matched existing (dedupe merge/update): **${merged}**`,
    `- Founders created: **${foundersCreated}**`,
    `- Investable companies before → after: **${beforeInvestable} → ${afterInvestable}**`,
    ``,
    `## Per-source`,
    ``,
    `| Source | Found | Kept | Excluded | Duplicates | New | Notes |`,
    `|---|---:|---:|---:|---:|---:|---|`,
  ];

  for (const stats of [...perSource.values()].sort((a, b) => a.source_key.localeCompare(b.source_key))) {
    const topReason = Object.entries(stats.exclude_reasons).sort((a, b) => b[1] - a[1])[0];
    const note =
      stats.notes[0] ||
      (topReason ? `top exclude: ${topReason[0]} (${topReason[1]})` : "");
    reportLines.push(
      `| ${stats.source_key} | ${stats.found} | ${stats.kept} | ${stats.excluded} | ${stats.duplicates} | ${stats.imported_new} | ${note.replace(/\|/g, "/")} |`,
    );
  }

  reportLines.push(``);
  reportLines.push(`## Exclude reason rollup`);
  reportLines.push(``);
  const reasonRollup: Record<string, number> = {};
  for (const stats of perSource.values()) {
    for (const [r, n] of Object.entries(stats.exclude_reasons)) {
      reasonRollup[r] = (reasonRollup[r] || 0) + n;
    }
  }
  for (const [r, n] of Object.entries(reasonRollup).sort((a, b) => b[1] - a[1])) {
    reportLines.push(`- **${n}** — ${r}`);
  }

  fs.writeFileSync(REPORT_PATH, reportLines.join("\n") + "\n");
  fs.writeFileSync(
    "/tmp/backfill-2026-11-03/import-result.json",
    JSON.stringify(
      {
        beforeInvestable,
        afterInvestable,
        importedNew,
        merged,
        foundersCreated,
        skippedExcluded,
        perSource: [...perSource.values()],
      },
      null,
      2,
    ),
  );

  console.log(
    JSON.stringify(
      {
        beforeInvestable,
        afterInvestable,
        importedNew,
        merged,
        foundersCreated,
        skippedExcluded,
        report: REPORT_PATH,
      },
      null,
      2,
    ),
  );
}

main();
