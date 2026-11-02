/**
 * Priority campus import batch (Amy 36-list, priority first).
 * Reads prepared JSON caches; corrected dedupe (domain else name+campus; never name alone).
 * Stores per-lead: university, affiliation_type, cohort_year, enrollment_status, website, evidence_url.
 *
 *   npx tsx scripts/import-priority-batch.ts
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type Database from "better-sqlite3";
import { CAMPUSES } from "../lib/domain/campuses";
import { normalizeCompanyName, websiteIdentity } from "../lib/domain/dedupe";
import { classifyDescription } from "../lib/domain/sectors";
import { getDb, newId, nowIso } from "../lib/db/client";

const UA = "CampusScoutBot/0.1 (+research; polite; campus scout corpus)";
const IMPORTS = path.join(process.cwd(), "data/imports");

type Lead = {
  name: string;
  university: string;
  affiliation_type: "current_student" | "alumni" | "faculty" | "research_spinout" | "staff" | "community" | "unknown";
  cohort_year: number | null;
  enrollment_status: string | null;
  website: string | null;
  evidence_url: string;
  program?: string | null;
  source: string;
  description?: string | null;
  affiliation_note?: string | null;
  cohort_label?: string | null;
};

type SourceSpec = {
  id: string;
  name: string;
  listUrl: string;
  cache: string;
  campusId: string;
  defaultAffiliation: Lead["affiliation_type"];
};

const SOURCES: SourceSpec[] = [
  {
    id: "src_harvard_ilab_ventures",
    name: "Harvard Innovation Labs — Ventures",
    listUrl: "https://innovationlabs.harvard.edu/ventures",
    cache: "harvard-ilab-ventures-2026-11-02.json",
    campusId: "univ_harvard",
    defaultAffiliation: "unknown",
  },
  {
    id: "src_northwestern_garage",
    name: "The Garage (Northwestern) — Resident Startups",
    listUrl: "https://www.thegarage.northwestern.edu/startups-founders",
    cache: "northwestern-garage-2026-11-02.json",
    campusId: "univ_northwestern",
    defaultAffiliation: "current_student",
  },
  {
    id: "src_cornell_elab",
    name: "Cornell eLab companies",
    listUrl: "https://www.elabstartup.com/2027-companies/",
    cache: "cornell-elab-2026-11-02.json",
    campusId: "univ_cornell",
    defaultAffiliation: "current_student",
  },
  {
    id: "src_penn_vipx_alumni_page",
    name: "Penn VIP-X Alumni (public page)",
    listUrl: "https://venturelab.upenn.edu/vip-alumni",
    cache: "penn-vipx-alumni-2026-11-02.json",
    campusId: "univ_penn",
    defaultAffiliation: "alumni",
  },
  {
    id: "src_skydeck_partial_public",
    name: "Berkeley SkyDeck companies (partial public HTML)",
    listUrl: "https://skydeck.berkeley.edu/companies/",
    cache: "skydeck-partial-2026-11-02.json",
    campusId: "univ_berkeley",
    defaultAffiliation: "unknown",
  },
];

function ensureSource(db: Database.Database, src: SourceSpec, retrievedAt: string) {
  db.prepare(
    `INSERT INTO sources (id, name, family, url, campuses_json, priority, ingestion_mode, status, last_attempt_at, last_success_at, source_role, tier_rationale)
     VALUES (?, ?, 'campus_builder_org', ?, ?, 2, 'html_public', 'available', ?, ?, 'discovery', ?)
     ON CONFLICT(id) DO UPDATE SET last_attempt_at=excluded.last_attempt_at, last_success_at=excluded.last_success_at, status='available'`,
  ).run(src.id, src.name, src.listUrl, JSON.stringify([src.campusId]), retrievedAt, retrievedAt, `${src.name} public roster`);
}

function campusAffiliated(db: Database.Database, projectId: string, campusId: string): boolean {
  return Boolean(
    db
      .prepare(
        `SELECT 1 FROM relationships WHERE source_entity_type='project' AND source_entity_id=? AND target_entity_type='university' AND target_entity_id=? AND relationship_type='affiliated_with'`,
      )
      .get(projectId, campusId),
  );
}

function findExisting(db: Database.Database, name: string, website: string | null, campusId: string): string | null {
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
  if (onCampus.length >= 1) return onCampus[0].id;
  return null;
}

function linkCampus(db: Database.Database, projectId: string, campusId: string, claimId: string | null) {
  if (campusAffiliated(db, projectId, campusId)) return;
  db.prepare(
    `INSERT INTO relationships (id, source_entity_type, source_entity_id, target_entity_type, target_entity_id, relationship_type, evidence_claim_ids_json, verification_state)
     VALUES (?, 'project', ?, 'university', ?, 'affiliated_with', ?, 'affiliation_only')`,
  ).run(newId("rel"), projectId, campusId, JSON.stringify(claimId ? [claimId] : []));
}

function normalizeAffiliation(raw: string | null | undefined, fallback: Lead["affiliation_type"]): Lead["affiliation_type"] {
  const v = (raw || "").trim();
  const allowed = new Set(["current_student", "alumni", "faculty", "research_spinout", "staff", "community", "unknown"]);
  if (allowed.has(v)) return v as Lead["affiliation_type"];
  return fallback;
}

function importSource(db: Database.Database, src: SourceSpec, retrievedAt: string) {
  const cachePath = path.join(IMPORTS, src.cache);
  if (!fs.existsSync(cachePath)) {
    return { source: src.name, ok: false, error: `missing cache ${src.cache}`, rowsFound: 0, imported: 0, merged: 0, skipped: [] as { name: string; reason: string }[] };
  }
  const leads = JSON.parse(fs.readFileSync(cachePath, "utf8")) as Lead[];
  ensureSource(db, src, retrievedAt);
  const hash = crypto.createHash("sha256").update(fs.readFileSync(cachePath)).digest("hex");
  db.prepare(
    `INSERT INTO snapshots (id, source_id, url, content_hash, fetched_at, http_status, raw_excerpt) VALUES (?, ?, ?, ?, ?, 200, ?)`,
  ).run(newId("snap"), src.id, src.listUrl, hash, retrievedAt, `${src.name} cache (${leads.length} leads)`);

  const insertClaim = db.prepare(
    `INSERT INTO claims (id, entity_type, entity_id, claim_type, value_json, excerpt, source_id, source_url, retrieved_at, label, verification_state)
     VALUES (?, 'project', ?, ?, ?, ?, ?, ?, ?, 'observed_fact', 'observed')`,
  );
  const insertProject = db.prepare(
    `INSERT INTO projects (id, name, aliases_json, kind, sector, description, website_url, is_portfolio_reference, is_investable_candidate, created_at, updated_at, primary_link, primary_link_kind, verification_status, last_verified_at, verification_note)
     VALUES (?, ?, '[]', 'company', ?, ?, ?, 0, 1, ?, ?, ?, ?, 'confirmed', ?, ?)`,
  );
  const updateProject = db.prepare(
    `UPDATE projects SET
       description=COALESCE(description, ?),
       website_url=COALESCE(website_url, ?),
       updated_at=?,
       primary_link=COALESCE(primary_link, ?),
       last_verified_at=?,
       verification_note=COALESCE(verification_note, ?)
     WHERE id=?`,
  );

  let imported = 0;
  let merged = 0;
  const skipped: { name: string; reason: string }[] = [];

  for (const lead of leads) {
    const name = (lead.name || "").trim();
    if (!name) {
      skipped.push({ name: "(empty)", reason: "empty name" });
      continue;
    }
    // Never present alumni/faculty as current students
    let affiliation = normalizeAffiliation(lead.affiliation_type, src.defaultAffiliation);
    if (affiliation === "current_student" && /alumni|faculty/i.test(lead.program || "")) {
      affiliation = /faculty/i.test(lead.program || "") ? "faculty" : "alumni";
    }
    if (src.id.includes("vipx") || /alumni/i.test(lead.program || "") || affiliation === "alumni") {
      if (affiliation === "current_student") affiliation = "alumni";
    }

    const website = lead.website?.trim() || null;
    const evidenceUrl = lead.evidence_url?.trim() || src.listUrl;
    const existing = findExisting(db, name, website, src.campusId);
    const desc = lead.description?.trim() || null;
    const sectorHits = desc ? classifyDescription(desc) : [];
    const sector = sectorHits[0]?.label ?? null;
    const note = `${src.name}${lead.program ? ` · ${lead.program}` : ""} · ${affiliation}`;
    const linkKind = website ? "website" : "other";

    let projectId = existing;
    if (!projectId) {
      projectId = newId("proj");
      insertProject.run(
        projectId,
        name,
        sector,
        desc,
        website,
        retrievedAt,
        retrievedAt,
        website || evidenceUrl,
        linkKind,
        retrievedAt.slice(0, 10),
        note,
      );
      imported++;
    } else {
      updateProject.run(desc, website, retrievedAt, website || evidenceUrl, retrievedAt.slice(0, 10), note, projectId);
      merged++;
    }

    const value = {
      name,
      university: lead.university || CAMPUSES.find((c) => c.id === src.campusId)?.name || null,
      campusId: src.campusId,
      affiliation_type: affiliation,
      cohort_year: lead.cohort_year ?? null,
      enrollment_status: lead.enrollment_status ?? null, // only when source stated it
      website,
      evidence_url: evidenceUrl,
      program: lead.program ?? null,
      cohort_label: lead.cohort_label ?? null,
      affiliation_note: lead.affiliation_note ?? null,
      source: lead.source || src.id,
    };
    const claimId = newId("claim");
    const excerpt = [name, lead.university, lead.program, affiliation, lead.cohort_year != null ? String(lead.cohort_year) : null]
      .filter(Boolean)
      .join(" · ")
      .slice(0, 500);
    insertClaim.run(
      claimId,
      projectId,
      "campus_program_listing",
      JSON.stringify(value),
      excerpt,
      src.id,
      evidenceUrl,
      retrievedAt,
    );
    linkCampus(db, projectId, src.campusId, claimId);

    if (lead.program) {
      insertClaim.run(
        newId("claim"),
        projectId,
        "program_membership",
        JSON.stringify({ name, org: lead.program, campus: lead.university, affiliation_type: affiliation, source: lead.source }),
        `${name} · ${lead.program}`,
        src.id,
        evidenceUrl,
        retrievedAt,
      );
    }
  }

  return {
    source: src.name,
    sourceId: src.id,
    listUrl: src.listUrl,
    ok: true,
    rowsFound: leads.length,
    imported,
    merged,
    skipped,
  };
}

function main() {
  const retrievedAt = nowIso();
  const db = getDb();
  const perSource = SOURCES.map((src) => importSource(db, src, retrievedAt));
  const out = {
    ok: true,
    retrievedAt,
    perSource,
    totals: {
      rowsFound: perSource.reduce((n, s) => n + (s.rowsFound || 0), 0),
      imported: perSource.reduce((n, s) => n + (s.imported || 0), 0),
      merged: perSource.reduce((n, s) => n + (s.merged || 0), 0),
    },
  };
  console.log(JSON.stringify(out, null, 2));
  fs.writeFileSync(path.join("/workspace/reviews", "campus-import-priority-batch-stats-2026-11-02.json"), JSON.stringify(out, null, 2));
}

main();
