/**
 * Sources import 2026-11-02 (pm): cleared weekly candidates not yet imported.
 * Public pages only. Dedupe: domain else name+campus+founders (never name alone).
 * Store university, affiliation_type, cohort/grad year, enrollment_status,
 * website, evidence_url. Faculty never count as student startups.
 * Site eligibility: current students or alums class of 2023+.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type Database from "better-sqlite3";
import { CAMPUSES } from "../lib/domain/campuses";
import { normalizeCompanyName, websiteIdentity } from "../lib/domain/dedupe";
import { getDb, newId, nowIso } from "../lib/db/client";

const UA = "CampusScoutBot/0.1 (+research; polite; campus scout corpus)";
const IMPORTS = path.join(process.cwd(), "data/imports");
const EVIDENCE_DAY = "2026-11-02";
const REVIEWS = "/workspace/reviews";

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
  forceInvestable?: boolean; // unused; recency script decides
  markFacultyOnly?: boolean;
};

type SourceSpec = {
  id: string;
  name: string;
  listUrl: string;
  cache: string;
  campusId: string;
  defaultAffiliation: Affiliation;
  program: string;
};

function stripTags(s: string): string {
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return await res.text();
}

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
  // Name collision across campuses without shared domain/founders → new row
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

function upsertFounder(
  db: Database.Database,
  founder: FounderIn,
  projectId: string,
  campusId: string,
  sourceId: string,
  retrievedAt: string,
): { personId: string; created: boolean } {
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

  // Always store grad year when known
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
  } else if (founder.affiliation_type === "faculty") {
    db.prepare(
      `UPDATE people SET enrollment_status='older_alumni', enrollment_basis='verified',
         enrollment_evidence=?, enrollment_source_url=?, enrollment_source_id=?, enrollment_label='faculty'
       WHERE id=?`,
    ).run(`Faculty founder per ${founder.evidence_url}`, founder.evidence_url, sourceId, personId);
  } else if (founder.affiliation_type === "alumni") {
    db.prepare(
      `UPDATE people SET enrollment_status=COALESCE(enrollment_status, 'older_alumni'), enrollment_basis=COALESCE(enrollment_basis, 'verified'),
         enrollment_evidence=COALESCE(enrollment_evidence, ?), enrollment_source_url=COALESCE(enrollment_source_url, ?)
       WHERE id=?`,
    ).run(`Alumni founder per ${founder.evidence_url}`, founder.evidence_url, personId);
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
      website: null,
      evidence_url: founder.evidence_url,
    }),
    `${founder.name} · ${founder.affiliation_type}${founder.grad_year ? ` · ${founder.grad_year}` : ""}`.slice(0, 500),
    sourceId,
    founder.evidence_url,
    retrievedAt,
  );

  const role =
    founder.affiliation_type === "faculty" ? "faculty_founder" : "founder";
  if (!db.prepare(`SELECT id FROM person_project_roles WHERE person_id=? AND project_id=?`).get(personId, projectId)) {
    db.prepare(`INSERT INTO person_project_roles (id, person_id, project_id, role, claim_id) VALUES (?, ?, ?, ?, ?)`).run(
      newId("ppr"),
      personId,
      projectId,
      role,
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

function importLeads(db: Database.Database, src: SourceSpec, leads: Lead[], retrievedAt: string) {
  ensureSource(db, src, retrievedAt);
  const cachePath = path.join(IMPORTS, src.cache);
  fs.writeFileSync(cachePath, JSON.stringify(leads, null, 2) + "\n");
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
     VALUES (?, ?, '[]', 'company', NULL, ?, ?, 0, ?, ?, ?, ?, ?, 'confirmed', ?, ?)`,
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
  let foundersCreated = 0;
  let foundersLinked = 0;
  let excludedFaculty = 0;
  let excludedPre2023 = 0;

  for (const lead of leads) {
    const name = lead.name.trim();
    if (!name) continue;
    const founderNames = lead.founders.map((f) => f.name);
    const website = lead.website?.trim() || null;
    const evidenceUrl = lead.evidence_url?.trim() || src.listUrl;
    const existing = findExisting(db, name, website, src.campusId, founderNames);
    const desc = lead.description?.trim() || null;
    const note = `${src.name} · ${lead.program} · ${lead.affiliation_type}`;
    const linkKind = website ? "website" : "other";

    // Faculty-only companies never investable as student startups
    const nonFaculty = lead.founders.filter((f) => f.affiliation_type !== "faculty");
    const facultyOnly = lead.markFacultyOnly || (lead.founders.length > 0 && nonFaculty.length === 0);
    const hasRecentFounder = nonFaculty.some(
      (f) =>
        f.affiliation_type === "current_student" ||
        f.enrollment_status === "current_student" ||
        f.enrollment_status === "recent_grad" ||
        (f.grad_year != null && f.grad_year >= 2023),
    );
    const allOld =
      nonFaculty.length > 0 &&
      nonFaculty.every(
        (f) =>
          f.affiliation_type !== "current_student" &&
          f.enrollment_status !== "current_student" &&
          f.enrollment_status !== "recent_grad" &&
          f.grad_year != null &&
          f.grad_year < 2023,
      );
    for (const f of nonFaculty) {
      if (f.grad_year != null && f.grad_year >= 2021 && f.grad_year <= 2022) excludedPre2023 += 1;
    }

    let investable = 1;
    let excludedReason: string | null = null;
    if (facultyOnly) {
      investable = 0;
      excludedReason = "faculty startup (not student)";
      excludedFaculty += 1;
    } else if (allOld) {
      investable = 0;
      excludedReason = "founders not current/recent (<2023)";
    } else if (!hasRecentFounder && lead.founders.length > 0) {
      // leave investable=1 briefly; apply-recency will mark unverified→0, or current_student founders keep
      if (nonFaculty.some((f) => f.affiliation_type === "current_student" || f.enrollment_status === "current_student")) {
        investable = 1;
      } else if (nonFaculty.every((f) => f.grad_year == null && f.affiliation_type !== "current_student")) {
        investable = 0;
        excludedReason = "unverified recency";
      }
    } else if (lead.founders.length === 0) {
      investable = 0;
      excludedReason = "unverified recency";
    }

    let projectId = existing;
    if (!projectId) {
      projectId = newId("proj");
      insertProject.run(
        projectId,
        name,
        desc,
        website,
        investable,
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
      if (investable === 0 && excludedReason) {
        db.prepare(`UPDATE projects SET is_investable_candidate=0, excluded_reason=?, updated_at=? WHERE id=?`).run(
          excludedReason,
          retrievedAt,
          projectId,
        );
      } else if (investable === 1 && hasRecentFounder) {
        db.prepare(
          `UPDATE projects SET is_investable_candidate=1, excluded_reason=NULL, updated_at=? WHERE id=? AND (excluded_reason IS NULL OR excluded_reason LIKE '%recency%' OR excluded_reason LIKE '%current/recent%' OR excluded_reason LIKE 'faculty%')`,
        ).run(retrievedAt, projectId);
      }
    }
    if (investable === 0 && excludedReason && !existing) {
      db.prepare(`UPDATE projects SET excluded_reason=? WHERE id=?`).run(excludedReason, projectId);
    }

    const value = {
      name,
      university: lead.university,
      campusId: src.campusId,
      affiliation_type: lead.affiliation_type,
      cohort_year: lead.cohort_year,
      enrollment_status: lead.enrollment_status,
      website,
      evidence_url: evidenceUrl,
      program: lead.program,
      source: lead.source || src.id,
      founders: lead.founders.map((f) => ({
        name: f.name,
        affiliation_type: f.affiliation_type,
        grad_year: f.grad_year,
        enrollment_status: f.enrollment_status,
        evidence_url: f.evidence_url,
      })),
    };
    const claimId = newId("claim");
    insertClaim.run(
      claimId,
      projectId,
      "campus_program_listing",
      JSON.stringify(value),
      [name, lead.university, lead.program, lead.affiliation_type].filter(Boolean).join(" · ").slice(0, 500),
      src.id,
      evidenceUrl,
      retrievedAt,
    );
    linkCampus(db, projectId, src.campusId, claimId);

    for (const founder of lead.founders) {
      const res = upsertFounder(db, founder, projectId, src.campusId, src.id, retrievedAt);
      if (res.created) foundersCreated++;
      foundersLinked++;
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
    foundersCreated,
    foundersLinked,
    excludedFaculty,
    excludedPre2023FoundersCounted: excludedPre2023,
  };
}

function psvLeads(): Lead[] {
  const url = "https://www.psv.vc/portfolio";
  const featured: { name: string; founders: string[]; desc: string }[] = [
    { name: "Flyway Health", founders: ["Andre Biehl", "Taylan Aydin"], desc: "AI agents for finding strategic insights in life sciences data for pharma and MedTech." },
    { name: "Era", founders: ["Liz Dorman"], desc: "The intelligence layer for AI-powered hardware devices." },
    { name: "Haladir", founders: ["Joseph Tso"], desc: "Operational Superintelligence." },
    { name: "Copperlane", founders: ["Athan Zhang"], desc: "AI-native platform for mortgage origination." },
    { name: "Polygone Systems", founders: ["Nathaniel Banks", "Yidian Liu"], desc: "Scalable solutions to combat microplastic pollution." },
    { name: "NewCo", founders: ["Kelvin Yu"], desc: "Infrastructure to support the next generation of U.S. companies." },
    { name: "Paragon", founders: ["AR Bhatti", "Shlok Patel", "Rose Weathers"], desc: "Patent drafting co-intelligence tool. Acquired." },
    { name: "Adora", founders: ["Ron Miasnik", "Raya Ward", "Joseph Rubin"], desc: "Personalized, AR-powered campus tours. Acquired." },
    { name: "Gamut Ink", founders: ["Huxley Marvit"], desc: "Writing tool that lets users adjust verbosity, style, and vocabulary with sliders. Acquired." },
    { name: "BoreDM", founders: ["Louis Aaron"], desc: "Web platform for geotechnical engineers to upload and analyze soil boring data." },
    { name: "Rescript", founders: ["Nikhil Ajjarapu", "Vincent Huang", "Alex Pesendorfer"], desc: "AI tool that monitors and summarizes congressional meetings." },
    { name: "Rotostitch", founders: ["Anson Tsang"], desc: "Reinventing garment construction starting from the stitch." },
    { name: "Watt-Our", founders: ["Alex Tseng"], desc: "Virtual power plant services for residential customers." },
    { name: "Trestle", founders: ["Francis Barth"], desc: "Data management system for government contractors." },
  ];
  const table: { name: string; founders: string[]; desc: string }[] = [
    { name: "Lovestruck Games", founders: ["Ammon Love"], desc: "Indigenous history RPG" },
    { name: "EVAL", founders: ["Sekou Roland", "Ryan Divan"], desc: "Esports recruiting platform" },
    { name: "Optimesh", founders: ["Chandler Stevenson", "Xavier Lee"], desc: "AI network planning" },
    { name: "Nirvana Carbon Solutions", founders: ["Sunrit Panda", "Emma Limor"], desc: "Carbon capture via biochar" },
    { name: "Shabba Financial", founders: ["Bryson Jandwa", "John Bugeraha"], desc: "Marketmaker on the Dar Stock Exchange in Tanzania" },
    { name: "Overton Bio", founders: ["Mihir Rao", "Keith Matanachai"], desc: "Workflow automation for biopharma" },
    { name: "RePaired", founders: ["Nick Aronow", "Chase Magnano"], desc: "AI-powered home repairs marketplace" },
    { name: "Precision Metrics", founders: ["Nathan Myers"], desc: "RTK GPS device for rowing performance tracking" },
    { name: "Eir", founders: ["Katharine Kalap", "Sterling Hall", "Shelby Fulton", "Nina Weeldreyer"], desc: "Wearable tracking athletic performance and menstrual cycles" },
    { name: "Composer AI", founders: ["Reuel Williams", "Evan Dogariu", "David Shustin"], desc: "AI music generator using natural language inputs" },
    { name: "Chamber AI", founders: ["Christine Sun", "Jenny Sun"], desc: "One-click AI video editing for gaming creators" },
    { name: "Berry", founders: ["Anna Prilutsky", "Franchesca Doell"], desc: "Browser extension for dietary-aware online grocery shopping" },
    { name: "Foogly", founders: ["Kevin Speina"], desc: "Bioplastics from food waste using native heme-enzymes" },
    { name: "Junction", founders: ["Cindy Han", "Angelo Ou", "Amanda Vera"], desc: "Grading management system for educators" },
    { name: "MoVA", founders: ["Sophie Jiang", "Isla Xi Han", "Priscilla Zhang", "Genyuan Hu"], desc: "AR/VR museum experiences" },
    { name: "ProperFi", founders: ["Antonio Knez", "Juan Coloma"], desc: "Tokenization platform for short-term rental properties" },
    { name: "Qlassic", founders: ["Wei Tang", "Yipeng Huang", "Esin Tureci"], desc: "Software toolchain combining quantum and classical computing" },
    { name: "Treun", founders: ["Tanujay Saha", "Isla Xi Han", "Gabriel Dolsten"], desc: "VR environments for phobia exposure therapy" },
    { name: "VICI", founders: ["Nicholas Sanker", "Nia Mosby", "Marco Scarano", "Lance Reaves-Hicks"], desc: "Recruiting and mentorship platform for student athletes" },
  ];
  return [...featured, ...table].map((row) => ({
    name: row.name,
    university: "Princeton University",
    campusId: "univ_princeton",
    affiliation_type: "current_student" as Affiliation,
    cohort_year: null,
    enrollment_status: "current_student",
    website: null,
    evidence_url: url,
    program: "Princeton Student Ventures",
    source: "src_princeton_psv",
    description: row.desc,
    founders: row.founders.map((n) => ({
      name: n,
      affiliation_type: "current_student" as Affiliation,
      grad_year: null,
      enrollment_status: "current_student" as const,
      evidence_url: url,
    })),
  }));
}

function sheaLeads(): Lead[] {
  const url = "https://www.startatshea.com/accelerate-shea";
  const rows: { name: string; founders: string[]; desc: string }[] = [
    { name: "CAVS Technology", founders: ["Brian Kavanaugh"], desc: "Increased efficiency, documents secured, centralized industry necessity" },
    { name: "ClearFeed", founders: ["Nathan Shea"], desc: "Podcast style news summaries with adaptive feedback" },
    { name: "Clone11", founders: ["Jonathan Jiao", "Vedarsh Mishra"], desc: "Mirror your potential. Compete. Outperform it daily." },
    { name: "ClubPack", founders: ["William Armstrong", "Eli Kishinvesky"], desc: "The operating system for modern social clubs" },
    { name: "Court Performance Labs", founders: ["Jack Millar"], desc: "Avoid pickleball injuries, older adults preventative training" },
    { name: "Dish Drop", founders: ["Jackson Mika", "Samuel Lee-Papastavros", "Luke Driscoll"], desc: "Food-powered app assisting humans discover new dishes" },
    { name: "Neuron Trainer", founders: ["Connor Quigley"], desc: "Lowering barriers through scalable digital learning infrastructure" },
    { name: "Pippy", founders: ["Maria Musto", "Gabriella Doherty"], desc: "Community and Class Review App for Pilates/Yoga" },
    { name: "Radar", founders: ["Alejandro Linares"], desc: "Powering recruiting precision and efficiency" },
    { name: "Social Reset", founders: ["Zoe Liu"], desc: "Reimagining Boston’s social experience through community-driven events." },
    { name: "TapN", founders: ["Sarah Bland", "James Koonce"], desc: "Reclaiming attention, reshaping education" },
    { name: "Virnova", founders: ["Dominique Williams", "Raina Yang"], desc: "Accessible and climate-resilient green energy solutions." },
  ];
  return rows.map((row) => ({
    name: row.name,
    university: "Boston College",
    campusId: "univ_bc",
    affiliation_type: "current_student" as Affiliation,
    cohort_year: 2026,
    enrollment_status: "current_student",
    website: null,
    evidence_url: url,
    program: "Accelerate@Shea 2026",
    source: "src_bc_accelerate_shea_2026",
    description: row.desc,
    founders: row.founders.map((n) => ({
      name: n,
      affiliation_type: "current_student" as Affiliation,
      grad_year: null,
      enrollment_status: "current_student" as const,
      evidence_url: url,
    })),
  }));
}

function nyuLaunchpadLeads(): Lead[] {
  const url = "https://entrepreneur.nyu.edu/blog/2026/06/03/meet-the-2026-nyu-summer-launchpad-cohort/";
  type F = { name: string; affiliation_type: Affiliation; grad_year: number | null; enrollment_status: FounderIn["enrollment_status"] };
  const rows: { name: string; desc: string; founders: F[] }[] = [
    {
      name: "Agora",
      desc: "Agentic tool for professional clothing resellers.",
      founders: [
        { name: "Christian Herren", affiliation_type: "current_student", grad_year: 2026, enrollment_status: "current_student" },
        { name: "David Cui", affiliation_type: "current_student", grad_year: 2026, enrollment_status: "current_student" },
        { name: "Tomer Ben Yaakov", affiliation_type: "current_student", grad_year: 2026, enrollment_status: "current_student" },
      ],
    },
    {
      name: "Aquon",
      desc: "AI-powered portfolio operating system for RIAs and wealth managers.",
      founders: [
        { name: "Carlos De Oliveira", affiliation_type: "faculty", grad_year: null, enrollment_status: null },
        { name: "Priya Kundu", affiliation_type: "alumni", grad_year: 2024, enrollment_status: "recent_grad" },
      ],
    },
    {
      name: "Altrovia",
      desc: "Study design intelligence platform for clinical development.",
      founders: [
        { name: "Christos Zoukos", affiliation_type: "alumni", grad_year: 2025, enrollment_status: "recent_grad" },
        { name: "Nicholas Patas", affiliation_type: "alumni", grad_year: 2021, enrollment_status: "older_alumni" },
        { name: "Georgia Lytra", affiliation_type: "unknown", grad_year: null, enrollment_status: null },
      ],
    },
    {
      name: "Binder",
      desc: "Automates research for commercial insurance brokers.",
      founders: [{ name: "Yannick Bierens", affiliation_type: "alumni", grad_year: 2025, enrollment_status: "recent_grad" }],
    },
    {
      name: "Cargon AI",
      desc: "Automates DOT pre-hire screening for trucking fleets.",
      founders: [
        { name: "Khon Sultan", affiliation_type: "current_student", grad_year: 2026, enrollment_status: "current_student" },
        { name: "Azimkhon Sultankhodjaev", affiliation_type: "unknown", grad_year: null, enrollment_status: null },
        { name: "Yongnuo Liang", affiliation_type: "unknown", grad_year: null, enrollment_status: null },
      ],
    },
    {
      name: "Clairdoc",
      desc: "AI revenue layer integrated into EHR workflows.",
      founders: [
        { name: "Bakhtawer Baloch", affiliation_type: "current_student", grad_year: 2026, enrollment_status: "current_student" },
        { name: "Suleman Baloch", affiliation_type: "unknown", grad_year: null, enrollment_status: null },
        { name: "Momal Baloch", affiliation_type: "unknown", grad_year: null, enrollment_status: null },
      ],
    },
    {
      name: "Cortile",
      desc: "AI verification layer for vendor security reviewers.",
      founders: [
        { name: "Nik King Fredel", affiliation_type: "current_student", grad_year: 2026, enrollment_status: "current_student" },
        { name: "Owen Rice", affiliation_type: "unknown", grad_year: null, enrollment_status: null },
      ],
    },
    {
      name: "melodi",
      desc: "Song & album release tool for independent musicians.",
      founders: [
        { name: "Jonathan Gulyak", affiliation_type: "current_student", grad_year: 2027, enrollment_status: "current_student" },
        { name: "Julius Chu", affiliation_type: "current_student", grad_year: 2027, enrollment_status: "current_student" },
      ],
    },
    {
      name: "MilkShaker",
      desc: "Hands-free wearable massager for breastfeeding mothers.",
      founders: [
        { name: "Xiyan Zhu", affiliation_type: "current_student", grad_year: 2027, enrollment_status: "current_student" },
        { name: "Valentina Marini Fichera", affiliation_type: "unknown", grad_year: null, enrollment_status: null },
        { name: "Elise Yang", affiliation_type: "unknown", grad_year: null, enrollment_status: null },
      ],
    },
    {
      name: "SAIL",
      desc: "Platform helping enterprise trade teams maintain supply chain resilience.",
      founders: [
        { name: "Ali Raza", affiliation_type: "alumni", grad_year: 2025, enrollment_status: "recent_grad" },
        { name: "Chansam Kim", affiliation_type: "unknown", grad_year: null, enrollment_status: null },
        { name: "William Reid", affiliation_type: "unknown", grad_year: null, enrollment_status: null },
      ],
    },
  ];
  return rows.map((row) => {
    const studentish = row.founders.filter((f) => f.affiliation_type !== "faculty");
    const affiliation: Affiliation = studentish.some((f) => f.affiliation_type === "current_student")
      ? "current_student"
      : studentish.some((f) => f.affiliation_type === "alumni")
        ? "alumni"
        : "unknown";
    return {
      name: row.name,
      university: "New York University",
      campusId: "univ_nyu",
      affiliation_type: affiliation,
      cohort_year: 2026,
      enrollment_status: affiliation === "current_student" ? "current_student" : null,
      website: null,
      evidence_url: url,
      program: "NYU Summer Launchpad 2026",
      source: "src_nyu_summer_launchpad_2026",
      description: row.desc,
      founders: row.founders.map((f) => ({ ...f, evidence_url: url })),
    };
  });
}

function uqLeads(): Lead[] {
  const url = "https://ventures.uq.edu.au/pitch-night";
  const rows: { name: string; founders: string[]; desc: string }[] = [
    { name: "Approvals Track Pty Ltd", founders: ["Ramith Samayamanthree", "Jason Dunlop"], desc: "Transforming complex approvals into commercial advantage." },
    { name: "Boundary Line", founders: ["Elizabeth Jimmieson"], desc: "Managing sexual harassment by customers, clients, patients, and other third parties." },
    { name: "Clippar", founders: ["Henry Coward"], desc: "AI golf recording app that finds every shot while playing." },
    { name: "Cognisance", founders: ["Alexander Anderson", "Benjamin Sander"], desc: "Business document management and compliance platform." },
    { name: "Conflite", founders: ["Donovan Hossy"], desc: "The content operating system for conferences and other large events." },
    { name: "Qualia", founders: ["Mriganka Iyer", "Sebastian Maldonado", "Abdul Qadir Kallatra"], desc: "AI tool that helps university students think for themselves." },
    { name: "Quigo", founders: ["PS Bhati"], desc: "Create engaging modules in minutes." },
    { name: "Rixem", founders: ["Farah Chamsseddine"], desc: "Prioritise, reduce, and communicate cyber risk through one connected risk graph." },
    { name: "SwipeStuff", founders: ["Marizal Fanani", "Andika Wardana"], desc: "Swipe your clutter into cash." },
    { name: "Tempo", founders: ["Axel Ferreira", "Nikita Svetlov"], desc: "Make plans, skip the back-and-forth." },
  ];
  return rows.map((row) => ({
    name: row.name,
    university: "University of Queensland",
    campusId: "univ_uq",
    affiliation_type: "current_student" as Affiliation,
    cohort_year: 2026,
    enrollment_status: "current_student",
    website: null,
    evidence_url: url,
    program: "UQ Ventures ilab Accelerator Chapter 2 2026",
    source: "src_uq_ilab_chapter2_2026",
    description: row.desc,
    founders: row.founders.map((n) => ({
      name: n,
      affiliation_type: "current_student" as Affiliation,
      grad_year: null,
      enrollment_status: "current_student" as const,
      evidence_url: url,
    })),
  }));
}

function hawaiiLeads(): Lead[] {
  const listUrl = "https://pace.shidler.hawaii.edu/venture-fund/";
  const newsUrl = "https://www.hawaii.edu/news/2022/08/18/venture-fund-first-investments/";
  return [
    {
      name: "Hohonu",
      university: "University of Hawaiʻi at Mānoa",
      campusId: "univ_hawaii",
      affiliation_type: "faculty",
      cohort_year: 2022,
      enrollment_status: null,
      website: "https://www.hohonu.io/",
      evidence_url: newsUrl,
      program: "Calvin Shindo Student Venture Fund",
      source: "src_hawaii_shindo_svf",
      description: "Real-time flood and water-level monitoring; founded by UH Mānoa faculty (Brian Glazer).",
      markFacultyOnly: true,
      founders: [
        {
          name: "Brian Glazer",
          affiliation_type: "faculty",
          grad_year: null,
          enrollment_status: null,
          evidence_url: "https://www.hawaii.edu/news/2026/02/24/hohonu-global-water-challenge/",
        },
      ],
    },
    {
      name: "Reeler",
      university: "University of Hawaiʻi at Mānoa",
      campusId: "univ_hawaii",
      affiliation_type: "alumni",
      cohort_year: 2022,
      enrollment_status: null,
      website: null,
      evidence_url: newsUrl,
      program: "Calvin Shindo Student Venture Fund",
      source: "src_hawaii_shindo_svf",
      description: "Mobile app connecting small-scale fishermen directly to consumers.",
      founders: [
        { name: "Lauren Pierce", affiliation_type: "alumni", grad_year: null, enrollment_status: null, evidence_url: newsUrl },
        { name: "Spencer VanDerKamp", affiliation_type: "alumni", grad_year: null, enrollment_status: null, evidence_url: newsUrl },
      ],
    },
  ];
}

function oleMissLeads(): Lead[] {
  const url = "https://olemisscie.com/programs/rebel-venture-capital-fund/";
  const names = [
    "Automatic AI",
    "RuleNav",
    "SellVNTG",
    "Collegemate",
    "Brandon's Shops",
    "Altar'd Socials",
    "Shielded Security",
    "Rumie App",
    "Curtsy",
    "CollegiateTutoring.com",
    "Fabuluxe Boutique",
    "Jetson Smart Homes",
    "Vault Entertainment",
    "Scout's Resale",
    "Crystal Game Works",
    "DaisNotes",
    "Fraze",
    "Lala Letter",
    "Chasing Ten Figures",
    "LuLu Jax",
    "Manasula Athletics",
    "Kia's Jewels",
    "Rent-a-Reb",
    "Move Fitness",
    "Subly",
    "ShortWork",
    "Pure Mist Distillation",
    "Hangaround",
    "Flok-Up",
    "Royal Sky Investments",
  ];
  return names.map((name) => ({
    name,
    university: "University of Mississippi",
    campusId: "univ_olemiss",
    affiliation_type: "unknown" as Affiliation,
    cohort_year: null,
    enrollment_status: null,
    website: null,
    evidence_url: url,
    program: "Rebel Student Venture Fund",
    source: "src_olemiss_rebel_svf",
    description: "Ole Miss Rebel Student Venture Fund portfolio company (student-led grants; founders not named on page).",
    founders: [],
  }));
}

async function verifyHohonuWebsite(): Promise<string | null> {
  for (const u of ["https://www.hohonu.io/", "https://hohonu.io/", "https://www.hohonu.com/"]) {
    try {
      const res = await fetch(u, { headers: { "User-Agent": UA }, redirect: "follow" });
      if (res.ok) return u;
    } catch {
      /* continue */
    }
  }
  return null;
}

async function main() {
  fs.mkdirSync(IMPORTS, { recursive: true });
  const retrievedAt = nowIso();
  const db = getDb();

  // Seed new campuses into universities table
  const seed = db.prepare(
    `INSERT INTO universities (id, name, aliases_json, country, lat, lon, coord_source)
     VALUES (@id, @name, @aliases, @country, @lat, @lon, @coord_source)
     ON CONFLICT(id) DO UPDATE SET name=excluded.name, aliases_json=excluded.aliases_json,
       country=excluded.country, lat=excluded.lat, lon=excluded.lon, coord_source=excluded.coord_source`,
  );
  for (const id of ["univ_hawaii", "univ_nebraska", "univ_olemiss", "univ_uq"]) {
    const c = CAMPUSES.find((x) => x.id === id);
    if (!c) throw new Error(`missing campus ${id}`);
    seed.run({
      id: c.id,
      name: c.name,
      aliases: JSON.stringify(c.aliases),
      country: c.country,
      lat: c.lat,
      lon: c.lon,
      coord_source: c.coordSource,
    });
  }

  const hohonuSite = await verifyHohonuWebsite();
  const hawaii = hawaiiLeads();
  if (hohonuSite) hawaii[0].website = hohonuSite;
  else hawaii[0].website = null;

  const skipped = [
    {
      source: "Columbia entrepreneurship directory",
      reason: "Crunchbase-powered; reuse unresolved — stay excluded",
      url: "https://startups.columbia.edu/founders",
    },
    {
      source: "CampusHunt",
      reason: "Unverified / provisional; not a real startup portfolio",
      url: "https://campushunt.co/",
    },
    {
      source: "UCSD Startup Database",
      reason: "Airtable embed; row payload not in public HTML",
      url: "https://innovation.ucsd.edu/startup/startup-database.html",
    },
    {
      source: "BuildList /map",
      reason: "No campus/student/grad-year fields to apply Amy's filter",
      url: "https://buildlist.xyz/map",
    },
    {
      source: "BuildList /companies",
      reason: "No campus/student/grad-year fields to apply Amy's filter",
      url: "https://buildlist.xyz/companies",
    },
    {
      source: "Nebraska Husker Venture Fund",
      reason: "Student-run fund portfolio; founders' UNL affiliation generally not stated on page (cannot claim university without evidence)",
      url: "https://business.unl.edu/student-resources/center-entrepreneurship/student-involvement/husker-venture-fund/investment-portfolio/",
    },
    {
      source: "Waterloo Student Venture Fund investments",
      reason: "Investment years only; no founder names or campus/grad-year evidence (Velocity remains Waterloo source)",
      url: "https://uwaterloo.ca/school-of-accounting-and-finance/students/student-opportunities/student-venture-fund/svf-investments",
    },
  ];

  const alreadyImported = [
    { source: "Georgia KickStart Fund", sourceId: "src_uga_georgia_kickstart", note: "already in corpus from morning weekly import" },
    { source: "Illinois iVenture", sourceId: "src_uiuc_iventure", note: "already in corpus from morning weekly import" },
    { source: "USF SII", sourceId: "src_usf_sii", note: "already in corpus from morning weekly import" },
    { source: "UConn Hillside Ventures", sourceId: "src_uconn_hillside", note: "already in corpus from morning weekly import" },
    { source: "RIT Venture Fund", sourceId: "src_rit_venture_fund", note: "already in corpus from morning weekly import" },
    { source: "CU Boulder Deming", sourceId: "src_cu_deming", note: "already in corpus from morning weekly import" },
    { source: "Duke BRiDGE", sourceId: "src_duke_bridge", note: "already in corpus from morning weekly import" },
    { source: "Duke Startup Showcase 2025", sourceId: "src_duke_showcase_2025", note: "already in corpus from morning weekly import" },
  ];

  const jobs: { spec: SourceSpec; leads: Lead[] }[] = [
    {
      spec: {
        id: "src_princeton_psv",
        name: "Princeton Student Ventures portfolio",
        listUrl: "https://www.psv.vc/portfolio",
        cache: `princeton-psv-${EVIDENCE_DAY}.json`,
        campusId: "univ_princeton",
        defaultAffiliation: "current_student",
        program: "Princeton Student Ventures",
      },
      leads: psvLeads(),
    },
    {
      spec: {
        id: "src_bc_accelerate_shea_2026",
        name: "Boston College Accelerate@Shea 2026",
        listUrl: "https://www.startatshea.com/accelerate-shea",
        cache: `bc-accelerate-shea-2026-${EVIDENCE_DAY}.json`,
        campusId: "univ_bc",
        defaultAffiliation: "current_student",
        program: "Accelerate@Shea 2026",
      },
      leads: sheaLeads(),
    },
    {
      spec: {
        id: "src_nyu_summer_launchpad_2026",
        name: "NYU Summer Launchpad 2026 cohort",
        listUrl: "https://entrepreneur.nyu.edu/blog/2026/06/03/meet-the-2026-nyu-summer-launchpad-cohort/",
        cache: `nyu-summer-launchpad-2026-${EVIDENCE_DAY}.json`,
        campusId: "univ_nyu",
        defaultAffiliation: "unknown",
        program: "NYU Summer Launchpad 2026",
      },
      leads: nyuLaunchpadLeads(),
    },
    {
      spec: {
        id: "src_uq_ilab_chapter2_2026",
        name: "UQ Ventures ilab Pitch Night Chapter 2 2026",
        listUrl: "https://ventures.uq.edu.au/pitch-night",
        cache: `uq-ilab-chapter2-2026-${EVIDENCE_DAY}.json`,
        campusId: "univ_uq",
        defaultAffiliation: "current_student",
        program: "UQ Ventures ilab Accelerator Chapter 2 2026",
      },
      leads: uqLeads(),
    },
    {
      spec: {
        id: "src_hawaii_shindo_svf",
        name: "UH Calvin Shindo Student Venture Fund portfolio",
        listUrl: "https://pace.shidler.hawaii.edu/venture-fund/",
        cache: `hawaii-shindo-svf-${EVIDENCE_DAY}.json`,
        campusId: "univ_hawaii",
        defaultAffiliation: "unknown",
        program: "Calvin Shindo Student Venture Fund",
      },
      leads: hawaii,
    },
    {
      spec: {
        id: "src_olemiss_rebel_svf",
        name: "Ole Miss Rebel Student Venture Fund portfolio",
        listUrl: "https://olemisscie.com/programs/rebel-venture-capital-fund/",
        cache: `olemiss-rebel-svf-${EVIDENCE_DAY}.json`,
        campusId: "univ_olemiss",
        defaultAffiliation: "unknown",
        program: "Rebel Student Venture Fund",
      },
      leads: oleMissLeads(),
    },
  ];

  const perSource: Record<string, unknown>[] = [];
  for (const job of jobs) {
    perSource.push(importLeads(db, job.spec, job.leads, retrievedAt));
  }

  // Light live check that source pages still return 200
  const liveChecks: { url: string; status: number | string }[] = [];
  for (const job of jobs) {
    try {
      const res = await fetch(job.spec.listUrl, { headers: { "User-Agent": UA }, method: "GET" });
      liveChecks.push({ url: job.spec.listUrl, status: res.status });
    } catch (e) {
      liveChecks.push({ url: job.spec.listUrl, status: String(e) });
    }
  }

  const companies = (db.prepare(`SELECT COUNT(*) AS c FROM projects WHERE kind='company'`).get() as { c: number }).c;
  const investable = (
    db.prepare(`SELECT COUNT(*) AS c FROM projects WHERE kind='company' AND is_investable_candidate=1`).get() as { c: number }
  ).c;
  const excludedOlder = (
    db
      .prepare(`SELECT COUNT(*) AS c FROM projects WHERE kind='company' AND excluded_reason='founders not current/recent (<2023)'`)
      .get() as { c: number }
  ).c;
  const excluded2021_2022_people = (
    db
      .prepare(
        `SELECT COUNT(*) AS c FROM people WHERE enrollment_grad_year IN (2021, 2022) AND enrollment_basis='verified'`,
      )
      .get() as { c: number }
  ).c;

  const out = {
    ok: true,
    retrievedAt,
    companiesAfter: companies,
    investableAfterImport: investable,
    excludedOlderAlumniCompanies: excludedOlder,
    excluded2021_2022VerifiedAlumniPeople: excluded2021_2022_people,
    perSource,
    alreadyImported,
    skipped,
    liveChecks,
    totals: {
      rowsFound: perSource.reduce((n, s) => n + Number((s as { rowsFound?: number }).rowsFound || 0), 0),
      imported: perSource.reduce((n, s) => n + Number((s as { imported?: number }).imported || 0), 0),
      merged: perSource.reduce((n, s) => n + Number((s as { merged?: number }).merged || 0), 0),
      foundersCreated: perSource.reduce((n, s) => n + Number((s as { foundersCreated?: number }).foundersCreated || 0), 0),
      foundersLinked: perSource.reduce((n, s) => n + Number((s as { foundersLinked?: number }).foundersLinked || 0), 0),
    },
    notes: {
      cutoff: "2023-or-later (Amy confirmed 2026-11-02); no held 2021-2022 list",
      hawaii: "Hohonu faculty-only → not a student startup; Reeler alumni without stated grad year → unverified recency",
      huskerWaterloo: "skipped — insufficient founder campus/grad evidence",
    },
  };
  console.log(JSON.stringify(out, null, 2));
  fs.writeFileSync(path.join(REVIEWS, `campus-import-sources-pm-stats-${EVIDENCE_DAY}.json`), JSON.stringify(out, null, 2));
  fs.writeFileSync(path.join(process.cwd(), "reviews", `campus-import-sources-pm-stats-${EVIDENCE_DAY}.json`), JSON.stringify(out, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
