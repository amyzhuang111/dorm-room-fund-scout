/**
 * Import RN fellowship / DRF / PearX / Thiel / Z Fellows / Afore / VC-backed leads.
 * Eligibility: current student or class of 2023+ with public evidence.
 * Never merge by name alone; Ghost AI ≠ Ghost Robotics; Known ≠ other Known.
 * Records investor company_facts with source_url for the network map.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type Database from "better-sqlite3";
import { CAMPUSES } from "../lib/domain/campuses";
import { normalizeCompanyName, websiteIdentity } from "../lib/domain/dedupe";
import { getDb, newId, nowIso } from "../lib/db/client";

const UA_NOTE = "rn-fellowships-vc-2026-11-03";
const IMPORTS = path.join(process.cwd(), "data/imports");
const LEADS_PATH = path.join(IMPORTS, "rn-fellowships-vc-2026-11-03.json");
const FAMILY_STATS_PATH = path.join(IMPORTS, "rn-source-family-stats-2026-11-03.json");
const REPORT_PATH = path.join(process.cwd(), "reviews/rn-fellowships-vc-import-2026-11-03.md");

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

type InvestorIn = { name: string; source_url: string; round: string | null };

type Lead = {
  name: string;
  university: string | null;
  campusId: string | null;
  affiliation_type: Affiliation;
  cohort_year: number | null;
  enrollment_status: string | null;
  website: string | null;
  evidence_url: string;
  program: string;
  source: string;
  description?: string | null;
  founders: FounderIn[];
  investors?: InvestorIn[];
  _eligible: boolean;
  _exclude_reason: string | null;
  _source_key: string;
  _alias_match?: string[];
  _investor_only_if_existing?: boolean;
  _reenable_note?: string;
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
  campusId: string | null,
  founderNames: string[],
  aliases: string[] = [],
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
  for (const alias of [name, ...aliases]) {
    const key = normalizeCompanyName(alias);
    const rows = db.prepare(`SELECT id, name FROM projects WHERE kind='company'`).all() as { id: string; name: string }[];
    const nameHits = rows.filter((r) => normalizeCompanyName(r.name) === key);
    if (nameHits.length === 1 && !campusId) return nameHits[0].id;
    if (!campusId) {
      if (nameHits.length === 1) return nameHits[0].id;
      continue;
    }
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
    // Exact unique name hit when alias list used (e.g. Known Dating)
    if (aliases.includes(alias) && nameHits.length === 1) return nameHits[0].id;
  }
  return null;
}

function findPerson(db: Database.Database, name: string, campusId: string | null): string | null {
  const rows = db.prepare(`SELECT id, name FROM people WHERE lower(name)=lower(?)`).all(name) as { id: string; name: string }[];
  if (rows.length === 1) return rows[0].id;
  if (rows.length > 1 && campusId) {
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

function ensureSource(db: Database.Database, sourceId: string, name: string, listUrl: string, campusId: string | null, retrievedAt: string) {
  db.prepare(
    `INSERT INTO sources (id, name, family, url, campuses_json, priority, ingestion_mode, status, last_attempt_at, last_success_at, source_role, tier_rationale)
     VALUES (?, ?, 'fellowship_vc_directory', ?, ?, 2, 'html_public', 'available', ?, ?, 'discovery', ?)
     ON CONFLICT(id) DO UPDATE SET last_attempt_at=excluded.last_attempt_at, last_success_at=excluded.last_success_at, status='available'`,
  ).run(
    sourceId,
    name,
    listUrl,
    JSON.stringify(campusId ? [campusId] : []),
    retrievedAt,
    retrievedAt,
    `${name} public roster / press`,
  );
}

function upsertInvestorFact(db: Database.Database, projectId: string, inv: InvestorIn, retrievedAt: string) {
  const existing = db
    .prepare(`SELECT id FROM company_facts WHERE project_id=? AND fact_key='investor' AND value_text=? AND ifnull(source_url,'')=?`)
    .get(projectId, inv.name, inv.source_url || "");
  if (existing) return false;
  db.prepare(
    `INSERT INTO company_facts (id, project_id, fact_key, value_text, detail_json, source_url, excerpt, origin, created_at)
     VALUES (?, ?, 'investor', ?, ?, ?, ?, 'import', ?)`,
  ).run(
    newId("fact"),
    projectId,
    inv.name,
    JSON.stringify({ round: inv.round, imported: UA_NOTE }),
    inv.source_url,
    `${inv.name}${inv.round ? ` · ${inv.round}` : ""}`.slice(0, 400),
    retrievedAt,
  );
  return true;
}

function upsertFounder(
  db: Database.Database,
  founder: FounderIn,
  projectId: string,
  campusId: string | null,
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
    ).run(personId, founder.name, `Public evidence ${founder.evidence_url}`, retrievedAt.slice(0, 10));
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
      university: campusId ? CAMPUSES.find((c) => c.id === campusId)?.name ?? null : null,
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
  if (campusId && !db.prepare(`SELECT 1 FROM affiliations WHERE person_id=? AND university_id=?`).get(personId, campusId)) {
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
  investor_edges_added: number;
  exclude_reasons: Record<string, number>;
  notes: string[];
};

function main() {
  const retrievedAt = nowIso();
  const leads = JSON.parse(fs.readFileSync(LEADS_PATH, "utf8")) as Lead[];
  const familyStats = JSON.parse(fs.readFileSync(FAMILY_STATS_PATH, "utf8")) as Record<string, any>;
  const db = getDb();

  const beforeInvestable = (
    db.prepare(`SELECT COUNT(*) AS c FROM projects WHERE kind='company' AND is_investable_candidate=1`).get() as { c: number }
  ).c;
  const beforeInvestorFacts = (
    db.prepare(`SELECT COUNT(*) AS c FROM company_facts WHERE fact_key='investor'`).get() as { c: number }
  ).c;

  const perSource = new Map<string, PerSource>();
  const ensure = (key: string): PerSource => {
    if (!perSource.has(key)) {
      perSource.set(key, {
        source_key: key,
        found: 0,
        kept: 0,
        excluded: 0,
        duplicates: 0,
        imported_new: 0,
        merged_existing: 0,
        investor_edges_added: 0,
        exclude_reasons: {},
        notes: [],
      });
    }
    return perSource.get(key)!;
  };

  let importedNew = 0;
  let merged = 0;
  let foundersCreated = 0;
  let skippedExcluded = 0;
  let investorEdges = 0;
  const newInvestorEdgeList: { company: string; investor: string; source_url: string }[] = [];

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
       verification_note=?,
       is_investable_candidate=1,
       excluded_reason=NULL
     WHERE id=?`,
  );

  const tx = db.transaction(() => {
    for (const lead of leads) {
      const stats = ensure(lead._source_key);
      stats.found += 1;

      const founderNames = (lead.founders || []).map((f) => f.name).filter(Boolean);
      const website = lead.website?.trim() || null;
      const evidenceUrl = lead.evidence_url?.trim();
      const campusId = lead.campusId;
      const sourceId = lead.source || `src_${lead._source_key}`;
      const existing = findExisting(db, lead.name, website, campusId, founderNames, lead._alias_match || []);

      // Investor-only path for excluded leads that already exist
      if (!lead._eligible) {
        stats.excluded += 1;
        skippedExcluded += 1;
        const reason = lead._exclude_reason || "excluded";
        stats.exclude_reasons[reason] = (stats.exclude_reasons[reason] || 0) + 1;
        if (lead._investor_only_if_existing && existing && lead.investors?.length) {
          ensureSource(db, sourceId, lead.program.split("—")[0].trim() || lead.program, evidenceUrl, campusId, retrievedAt);
          for (const inv of lead.investors) {
            if (upsertInvestorFact(db, existing, inv, retrievedAt)) {
              investorEdges += 1;
              stats.investor_edges_added += 1;
              newInvestorEdgeList.push({ company: lead.name, investor: inv.name, source_url: inv.source_url });
            }
          }
          // Confirm DRF portfolio membership when applicable
          if (invIncludesDrf(lead.investors)) {
            db.prepare(
              `UPDATE portfolio_memberships SET project_id=?, match_status='confirmed' WHERE matched_name=? AND match_status='unmatched'`,
            ).run(existing, lead.name);
          }
        }
        continue;
      }

      stats.kept += 1;
      const name = lead.name.trim();
      if (!name || !campusId) {
        stats.excluded += 1;
        stats.kept -= 1;
        skippedExcluded += 1;
        stats.exclude_reasons["missing name or campus"] = (stats.exclude_reasons["missing name or campus"] || 0) + 1;
        continue;
      }

      ensureSource(db, sourceId, lead.program.split("/")[0].trim() || lead.program, evidenceUrl, campusId, retrievedAt);

      const desc = lead.description?.trim() || null;
      const note = `${UA_NOTE} · ${lead.program} · ${lead.affiliation_type}${lead._reenable_note ? ` · ${lead._reenable_note}` : ""}`;
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
          investors: lead.investors || [],
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

      for (const inv of lead.investors || []) {
        if (upsertInvestorFact(db, projectId, inv, retrievedAt)) {
          investorEdges += 1;
          stats.investor_edges_added += 1;
          newInvestorEdgeList.push({ company: name, investor: inv.name, source_url: inv.source_url });
        }
      }

      // Confirm DRF portfolio membership for Kinth etc.
      if ((lead.investors || []).some((i) => /dorm room/i.test(i.name))) {
        db.prepare(
          `UPDATE portfolio_memberships SET project_id=?, match_status='confirmed' WHERE lower(matched_name)=lower(?) AND match_status IN ('unmatched','ambiguous')`,
        ).run(projectId, name);
      }
    }
  });
  tx();

  const afterInvestable = (
    db.prepare(`SELECT COUNT(*) AS c FROM projects WHERE kind='company' AND is_investable_candidate=1`).get() as { c: number }
  ).c;
  const afterInvestorFacts = (
    db.prepare(`SELECT COUNT(*) AS c FROM company_facts WHERE fact_key='investor'`).get() as { c: number }
  ).c;

  const report: string[] = [
    `# RN fellowships / DRF / VC import — 2026-11-03`,
    ``,
    `Branch: \`cursor/data-backfill-2026-11-03\`. Eligibility: current student or class of 2023+ with public evidence. Never merge by name alone (Ghost AI ≠ Ghost Robotics; Known ≠ other Known). Investor edges stored as \`company_facts.fact_key='investor'\` with \`source_url\`.`,
    ``,
    `## Named examples (Amy)`,
    ``,
    `- **Kinth**: never a \`projects\` row before; was unmatched DRF \`portfolio_memberships\` only. **Added** (Columbia current/2026, DRF+Dynamo+Equal). Materials in \`/workspace/bot-archive/dd-kinth/\`.`,
    `- **Bobyard**: never sourced. **Added** (Stanford dropout 2023, PearX S23, Series A 8VC/Pear/Primary).`,
    `- **Ghost**: corpus had only **Ghost Robotics** (different company). **Ghost AI** (Zain Javaid, a16z seed, ghost.ai) **excluded**: recent HS graduate who declined Yale; no college student / class-of-2023+ enrollment evidence.`,
    ``,
    `## Prior +163 vs +154 discrepancy`,
    ``,
    `Scan-all import inserted **154** new investable rows and matched **17** existing. \`updateProject\` sets \`is_investable_candidate=1\` on merges, so **9 of those 17** that were previously non-investable were re-enabled → **1225 + 154 + 9 = 1388**. Only LegalTime AI shows the scan-all verification note among merges because \`COALESCE(verification_note, ?)\` kept prior notes on the other 16.`,
    ``,
    `## Totals (this import)`,
    ``,
    `- Curated leads in JSON: **${leads.length}**`,
    `- Eligible kept: **${leads.filter((l) => l._eligible).length}**`,
    `- Excluded / edge-only: **${skippedExcluded}**`,
    `- New investable inserted: **${importedNew}**`,
    `- Matched existing (merge/update): **${merged}**`,
    `- Founders created: **${foundersCreated}**`,
    `- Investor edges added: **${investorEdges}** (facts ${beforeInvestorFacts} → ${afterInvestorFacts})`,
    `- Investable companies before → after: **${beforeInvestable} → ${afterInvestable}**`,
    ``,
    `## Per curated source_key`,
    ``,
    `| Source | Found | Kept | Excluded | Duplicates | New | Investor edges | Notes |`,
    `|---|---:|---:|---:|---:|---:|---:|---|`,
  ];

  for (const stats of [...perSource.values()].sort((a, b) => a.source_key.localeCompare(b.source_key))) {
    const topReason = Object.entries(stats.exclude_reasons).sort((a, b) => b[1] - a[1])[0];
    const note = topReason ? `top exclude: ${topReason[0].slice(0, 80)} (${topReason[1]})` : "";
    report.push(
      `| ${stats.source_key} | ${stats.found} | ${stats.kept} | ${stats.excluded} | ${stats.duplicates} | ${stats.imported_new} | ${stats.investor_edges_added} | ${note.replace(/\|/g, "/")} |`,
    );
  }

  report.push(``, `## Family-level scan stats (directories)`, ``);
  for (const [k, v] of Object.entries(familyStats)) {
    report.push(`### ${k}`);
    report.push(`- found: **${v.found}**, kept: **${v.kept ?? "n/a"}**, excluded: **${v.excluded ?? v.excluded_or_edge_only ?? "n/a"}**`);
    if (v.notes) report.push(`- ${v.notes}`);
    report.push(``);
  }

  report.push(`## Investor edges added`, ``);
  for (const e of newInvestorEdgeList) {
    report.push(`- ${e.company} ← **${e.investor}** (${e.source_url})`);
  }
  report.push(``);

  fs.writeFileSync(REPORT_PATH, report.join("\n") + "\n");
  console.log(report.join("\n"));
  fs.writeFileSync(
    "/tmp/backfill-2026-11-03/rn-import-summary.json",
    JSON.stringify(
      {
        beforeInvestable,
        afterInvestable,
        importedNew,
        merged,
        foundersCreated,
        investorEdges,
        newInvestorEdgeList,
        perSource: [...perSource.values()],
      },
      null,
      2,
    ),
  );
}

function invIncludesDrf(investors: InvestorIn[]): boolean {
  return investors.some((i) => /dorm room/i.test(i.name));
}

main();
