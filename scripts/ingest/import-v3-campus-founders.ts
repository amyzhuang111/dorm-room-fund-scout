// Idempotent import of sourced campus founders and startups.
// Every row in the JSON file cites a public page. Re-running attaches the
// same claim instead of inserting a second person or company.
//
//   npx tsx scripts/ingest/import-v3-campus-founders.ts data/imports/v3-campus-founders-batch1.json
//
// A person whose name already exists once is updated in place. Two people
// with the same name are left alone and reported. Name-only rows stay
// verification_status = unverified.

import crypto from "node:crypto";
import fs from "node:fs";
import type Database from "better-sqlite3";
import { getDb, newId, nowIso } from "../../lib/db/client";
import { linkKind } from "../../lib/domain/company-link";
import { normalizeCompanyName, normalizePersonName, websiteIdentity } from "../../lib/domain/dedupe";
import { assembleProjectFacts } from "../../lib/domain/facts";
import { classifyDescription } from "../../lib/domain/sectors";
import { evaluateAllGates } from "../../lib/screening/gates";

interface Enrollment {
  status: "current_student" | "recent_grad" | "older_alumni" | null;
  basis: "verified" | "inferred" | null;
  label: string | null;
  gradYear: number | null;
  evidence: string | null;
}

interface FounderRow {
  name: string;
  aliases?: string[];
  campusId: string | null;
  affiliationRole: string;
  founderStatus: "founder" | "potential";
  potentialSignal: string | null;
  verificationStatus: "confirmed" | "partial" | "unverified";
  verificationNote: string;
  enrollment?: Enrollment | null;
  leftSchool?: boolean;
  excerpt: string;
}

interface FundingRow {
  stage: string;
  amountUsd: number | null;
  amountText: string;
  date: string | null;
  leads: string[];
  investors: string[];
  excerpt: string;
  sourceUrl: string;
}

interface InvestorRow {
  name: string;
  excerpt: string;
  sourceUrl: string;
  batch?: string;
  kind?: string;
}

interface CompanyRow {
  name: string;
  description: string | null;
  website: string | null;
  sourceUrl: string;
  excerpt: string;
  orgPlace: string;
  campusIds: string[];
  investable?: boolean;
  founders: FounderRow[];
  funding?: FundingRow[];
  investors?: InvestorRow[];
}

interface PotentialRow {
  name: string;
  aliases?: string[];
  campusId: string;
  affiliationRole: string;
  potentialSignal: string;
  verificationStatus: "confirmed" | "partial" | "unverified";
  verificationNote: string;
  orgPlace: string;
  sourceUrl: string;
  excerpt: string;
  enrollment?: Enrollment | null;
  leftSchool?: boolean;
}

interface LinkRow {
  personName: string;
  campusId: string;
  affiliationRole: string;
  sourceUrl: string;
  excerpt: string;
  enrollment?: Enrollment | null;
  founderStatus?: "founder" | "potential";
}

interface FileShape {
  retrievedAt: string;
  companies: CompanyRow[];
  potential: PotentialRow[];
  links: LinkRow[];
}

function assertHttp(url: string, label: string) {
  if (!url.startsWith("http://") && !url.startsWith("https://")) throw new Error(`${label} is missing an http source URL`);
}

function assertExcerptHasName(name: string, excerpt: string, label: string) {
  const norm = normalizePersonName(name);
  const hay = normalizePersonName(excerpt);
  const tokens = norm.split(" ").filter((token) => token.length >= 2);
  if (!tokens.length || !tokens.every((token) => hay.includes(token))) {
    throw new Error(`${label}: excerpt does not contain "${name}"`);
  }
}

function sourceIdFor(url: string): string {
  const host = new URL(url).hostname.replace(/^www\./, "").replace(/[^a-z0-9]+/gi, "_").slice(0, 40);
  return `src_v3_${host}`;
}

function ensureSource(db: Database.Database, url: string, campuses: string[], retrievedAt: string): string {
  const id = sourceIdFor(url);
  const host = new URL(url).hostname.replace(/^www\./, "");
  db.prepare(
    `INSERT INTO sources (id, name, family, url, campuses_json, priority, ingestion_mode, status, last_success_at, source_role, tier_rationale)
     VALUES (?, ?, 'campus_builder_org', ?, ?, 2, 'manual', 'available', ?, 'discovery', ?)
     ON CONFLICT(id) DO UPDATE SET last_success_at=excluded.last_success_at, status='available'`
  ).run(
    id,
    `v3 campus scan (${host})`,
    url,
    JSON.stringify(campuses),
    retrievedAt,
    "Public roster or article cited by the v3 campus founder import. Tiers are not Founder Signal."
  );
  return id;
}

function insertClaim(
  db: Database.Database,
  entityType: string,
  entityId: string,
  claimType: string,
  value: unknown,
  excerpt: string,
  sourceId: string,
  sourceUrl: string,
  retrievedAt: string
): string | null {
  const existing = db
    .prepare(`SELECT id FROM claims WHERE entity_type=? AND entity_id=? AND claim_type=? AND source_url=? AND excerpt=? LIMIT 1`)
    .get(entityType, entityId, claimType, sourceUrl, excerpt) as { id: string } | undefined;
  if (existing) return existing.id;
  const id = newId("claim");
  db.prepare(
    `INSERT INTO claims (id, entity_type, entity_id, claim_type, value_json, excerpt, source_id, source_url, retrieved_at, label, verification_state)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'observed_fact', 'unverified')`
  ).run(id, entityType, entityId, claimType, JSON.stringify(value), excerpt.slice(0, 1400), sourceId, sourceUrl, retrievedAt);
  return id;
}

function peopleIndex(db: Database.Database) {
  const rows = db.prepare(`SELECT id, name, aliases_json FROM people`).all() as { id: string; name: string; aliases_json: string }[];
  const byName = new Map<string, string[]>();
  const add = (key: string, id: string) => {
    if (!key) return;
    const list = byName.get(key) ?? [];
    if (!list.includes(id)) list.push(id);
    byName.set(key, list);
  };
  for (const row of rows) {
    add(normalizePersonName(row.name), row.id);
    try {
      const aliases = JSON.parse(row.aliases_json) as string[];
      for (const alias of aliases) {
        if (alias.startsWith("v3cf:")) add(alias, row.id);
        else add(normalizePersonName(alias), row.id);
      }
    } catch {
      /* ignore bad alias json */
    }
  }
  return byName;
}

function remember(byName: Map<string, string[]>, name: string, aliases: string[], id: string) {
  const add = (key: string) => {
    if (!key) return;
    const list = byName.get(key) ?? [];
    if (!list.includes(id)) list.push(id);
    byName.set(key, list);
  };
  add(normalizePersonName(name));
  for (const alias of aliases) {
    if (alias.startsWith("v3cf:")) add(alias);
    else add(normalizePersonName(alias));
  }
}

const CAMPUS_MENTION: Record<string, RegExp> = {
  univ_brown: /\bbrown\b/i,
  univ_cornell: /\bcornell university\b|\bat cornell\b/i,
  univ_cornell_tech: /cornell tech/i,
  univ_duke: /\bduke\b/i,
  univ_hmc: /harvey mudd|\bhmc\b|\bmudd student\b/i,
  univ_nyu: /\bnyu\b|new york university/i,
  univ_yale: /\byale\b/i,
  univ_princeton: /\bprinceton\b/i,
  univ_columbia: /\bcolumbia\b/i,
  univ_penn: /\bpenn\b|pennsylvania/i,
  univ_harvard: /\bharvard\b/i,
  univ_berkeley: /\bberkeley\b/i,
  univ_northwestern: /\bnorthwestern\b/i,
  univ_uchicago: /university of chicago|\buchicago\b/i,
  univ_uiuc: /urbana-champaign|\buiuc\b|university of illinois/i,
  univ_michigan: /university of michigan|\bumich\b/i,
  univ_utexas: /university of texas|\but austin\b/i,
  univ_cmu: /carnegie mellon|\bcmu\b/i,
  univ_gatech: /georgia tech/i,
  univ_uva: /university of virginia|\buva\b/i,
  univ_georgetown: /\bgeorgetown\b/i,
  univ_emory: /\bemory\b/i,
  univ_unc: /chapel hill|\bunc\b/i,
  univ_dartmouth: /\bdartmouth\b/i,
  univ_rice: /\brice university\b|\bat rice\b/i,
  univ_vanderbilt: /\bvanderbilt\b/i,
  univ_washu: /washington university in st\. louis|\bwashu\b/i,
  univ_notredame: /notre dame/i,
  univ_usc: /\busc\b/i,
  univ_ucla: /\bucla\b/i,
  univ_uw: /university of washington/i,
  univ_caltech: /caltech/i,
  univ_bu: /boston university/i,
  univ_lafayette: /lafayette/i,
  univ_waterloo: /waterloo/i,
  univ_toronto: /university of toronto/i,
  univ_queens: /queen'?s university|queen's/i,
  univ_laurentian: /laurentian/i,
  univ_cambridge: /university of cambridge|\bcambridge\b/i,
};

function claimsMentionCampus(db: Database.Database, personId: string, campusId: string | null): boolean {
  if (!campusId) return false;
  const pattern = CAMPUS_MENTION[campusId];
  if (!pattern) return false;
  const rows = db.prepare(`SELECT excerpt FROM claims WHERE entity_type='person' AND entity_id=?`).all(personId) as { excerpt: string }[];
  return rows.some((row) => pattern.test(row.excerpt ?? ""));
}

function resolvePerson(db: Database.Database, byName: Map<string, string[]>, name: string, aliases: string[], campusId: string | null): { id: string | null; ambiguous: boolean } {
  const marker = aliases.find((alias) => alias.startsWith("v3cf:"));
  if (marker) {
    const marked = byName.get(marker) ?? [];
    if (marked.length === 1) return { id: marked[0], ambiguous: false };
  }
  const keys = [normalizePersonName(name), ...aliases.filter((alias) => !alias.startsWith("v3cf:")).map((alias) => normalizePersonName(alias))];
  const hits = new Set<string>();
  for (const key of keys) for (const id of byName.get(key) ?? []) hits.add(id);
  const ids = [...hits];
  if (ids.length === 0) return { id: null, ambiguous: false };
  if (campusId) {
    const affiliated = ids.filter((id) => db.prepare(`SELECT 1 FROM affiliations WHERE person_id=? AND university_id=?`).get(id, campusId));
    if (affiliated.length === 1) return { id: affiliated[0], ambiguous: false };
    if (affiliated.length > 1) return { id: null, ambiguous: true };
  }
  const mentioned = ids.filter((id) => claimsMentionCampus(db, id, campusId));
  if (mentioned.length === 1) return { id: mentioned[0], ambiguous: false };
  if (mentioned.length > 1) return { id: null, ambiguous: true };
  if (ids.length === 1) {
    const anyCampus = db.prepare(`SELECT 1 FROM affiliations WHERE person_id=?`).get(ids[0]);
    // Same name already tied to a different school, and nothing on that record names this school.
    if (anyCampus) return { id: null, ambiguous: false };
    return { id: ids[0], ambiguous: false };
  }
  return { id: null, ambiguous: false };
}

function applyEnrollment(db: Database.Database, personId: string, enrollment: Enrollment | null | undefined, sourceUrl: string) {
  if (!enrollment?.status || !enrollment.evidence) return;
  const row = db.prepare(`SELECT enrollment_status, enrollment_basis FROM people WHERE id=?`).get(personId) as {
    enrollment_status: string | null;
    enrollment_basis: string | null;
  };
  if (row.enrollment_status && row.enrollment_basis === "verified" && enrollment.basis !== "verified") return;
  if (row.enrollment_status && row.enrollment_basis === "verified" && enrollment.basis === "verified" && row.enrollment_status === enrollment.status) return;
  db.prepare(
    `UPDATE people SET enrollment_status=?, enrollment_label=?, enrollment_evidence=?, enrollment_source_url=?, enrollment_grad_year=?, enrollment_basis=? WHERE id=?`
  ).run(enrollment.status, enrollment.label, enrollment.evidence, sourceUrl, enrollment.gradYear, enrollment.basis, personId);
}

function applyVerification(db: Database.Database, personId: string, status: string, note: string, retrievedAt: string) {
  const row = db.prepare(`SELECT verification_status FROM people WHERE id=?`).get(personId) as { verification_status: string | null };
  if (row.verification_status === "confirmed") return;
  db.prepare(`UPDATE people SET verification_status=?, verification_note=?, last_verified_at=? WHERE id=?`).run(status, note, retrievedAt.slice(0, 10), personId);
}

function ensureAffiliation(db: Database.Database, personId: string, campusId: string, role: string, claimId: string | null): boolean {
  const existing = db.prepare(`SELECT id FROM affiliations WHERE person_id=? AND university_id=? LIMIT 1`).get(personId, campusId) as { id: string } | undefined;
  if (existing) return false;
  db.prepare(`INSERT INTO affiliations (id, person_id, university_id, role, status, claim_id) VALUES (?, ?, ?, ?, 'unverified', ?)`).run(
    newId("aff"),
    personId,
    campusId,
    role,
    claimId
  );
  return true;
}

function linkCompanyCampus(db: Database.Database, projectId: string, campusId: string, claimId: string | null) {
  const existing = db
    .prepare(
      `SELECT id FROM relationships WHERE source_entity_type='project' AND source_entity_id=? AND target_entity_type='university' AND target_entity_id=? AND relationship_type='affiliated_with'`
    )
    .get(projectId, campusId);
  if (existing) return;
  db.prepare(
    `INSERT INTO relationships (id, source_entity_type, source_entity_id, target_entity_type, target_entity_id, relationship_type, evidence_claim_ids_json, verification_state)
     VALUES (?, 'project', ?, 'university', ?, 'affiliated_with', ?, 'affiliation_only')`
  ).run(newId("rel"), projectId, campusId, JSON.stringify(claimId ? [claimId] : []));
}

function companyIndex(db: Database.Database) {
  const rows = db.prepare(`SELECT id, name, website_url FROM projects WHERE kind='company'`).all() as { id: string; name: string; website_url: string | null }[];
  const byName = new Map<string, string[]>();
  for (const row of rows) {
    const key = normalizeCompanyName(row.name);
    const list = byName.get(key) ?? [];
    if (!list.includes(row.id)) list.push(row.id);
    byName.set(key, list);
  }
  return byName;
}

function resolveCompany(
  db: Database.Database,
  byCompany: Map<string, string[]>,
  name: string,
  sourceUrl: string,
  campusIds: string[],
  website: string | null
): { id: string | null; ambiguous: boolean } {
  const site = websiteIdentity(website);
  if (site) {
    const rows = db.prepare(`SELECT id, website_url FROM projects WHERE kind='company' AND website_url IS NOT NULL`).all() as {
      id: string;
      website_url: string;
    }[];
    const bySite = rows.filter((row) => websiteIdentity(row.website_url) === site);
    if (bySite.length === 1) return { id: bySite[0].id, ambiguous: false };
    if (bySite.length > 1) return { id: null, ambiguous: true };
  }
  const hits = byCompany.get(normalizeCompanyName(name)) ?? [];
  if (hits.length === 0) return { id: null, ambiguous: false };
  const claimed = hits.filter((id) =>
    db.prepare(`SELECT 1 FROM claims WHERE entity_type='project' AND entity_id=? AND source_url=?`).get(id, sourceUrl)
  );
  if (claimed.length === 1) return { id: claimed[0], ambiguous: false };
  const onCampus = hits.filter((id) =>
    campusIds.some((campusId) =>
      db
        .prepare(
          `SELECT 1 FROM relationships WHERE source_entity_type='project' AND source_entity_id=? AND target_entity_type='university' AND target_entity_id=? AND relationship_type='affiliated_with'`
        )
        .get(id, campusId)
    )
  );
  if (onCampus.length === 1) return { id: onCampus[0], ambiguous: false };
  if (hits.length === 1) {
    const elsewhere = db
      .prepare(
        `SELECT target_entity_id FROM relationships WHERE source_entity_type='project' AND source_entity_id=? AND target_entity_type='university' AND relationship_type='affiliated_with'`
      )
      .all(hits[0]) as { target_entity_id: string }[];
    if (elsewhere.length === 0 || elsewhere.some((row) => campusIds.includes(row.target_entity_id))) return { id: hits[0], ambiguous: false };
    return { id: null, ambiguous: false };
  }
  // Same display name as other companies, but this page gives a different product website.
  if (site) return { id: null, ambiguous: false };
  return { id: null, ambiguous: true };
}

function main() {
  const file = process.argv[2];
  if (!file) throw new Error("Pass the JSON file.");
  const data = JSON.parse(fs.readFileSync(file, "utf8")) as FileShape;
  const retrievedAt = data.retrievedAt || nowIso();
  const db = getDb();
  const byPerson = peopleIndex(db);
  const byCompany = companyIndex(db);
  const ambiguous: string[] = [];
  let newPeople = 0;
  let newCompanies = 0;
  let linked = 0;

  const upsertPerson = (
    row: FounderRow,
    sourceUrl: string,
    sourceId: string,
    orgPlace: string,
    companyId: string | null
  ) => {
    assertExcerptHasName(row.name, row.excerpt, row.name);
    const marker = `v3cf:${normalizePersonName(row.name)}:${new URL(sourceUrl).hostname}`;
    const aliases = [...(row.aliases ?? []), marker];
    const resolved = resolvePerson(db, byPerson, row.name, aliases, row.campusId);
    if (resolved.ambiguous) {
      ambiguous.push(row.name);
      return;
    }
    let id = resolved.id;
    if (!id) {
      id = newId("person");
      db.prepare(
        `INSERT INTO people (id, name, aliases_json, founder_status, potential_signal, verification_status, verification_note, last_verified_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id,
        row.name,
        JSON.stringify(aliases),
        row.founderStatus,
        row.founderStatus === "potential" ? row.potentialSignal : null,
        row.verificationStatus,
        row.verificationNote,
        retrievedAt.slice(0, 10)
      );
      if (row.leftSchool) db.prepare(`UPDATE people SET left_school=1 WHERE id=?`).run(id);
      newPeople++;
      remember(byPerson, row.name, aliases, id);
    } else {
      const existing = db.prepare(`SELECT aliases_json, founder_status FROM people WHERE id=?`).get(id) as {
        aliases_json: string;
        founder_status: string | null;
      };
      const current = JSON.parse(existing.aliases_json) as string[];
      let changed = false;
      for (const alias of aliases) {
        if (!current.includes(alias)) {
          current.push(alias);
          changed = true;
        }
      }
      if (changed) db.prepare(`UPDATE people SET aliases_json=? WHERE id=?`).run(JSON.stringify(current), id);
      if (row.founderStatus === "founder" && existing.founder_status !== "founder") {
        db.prepare(`UPDATE people SET founder_status='founder', potential_signal=NULL WHERE id=?`).run(id);
      } else if (row.founderStatus === "potential" && !existing.founder_status) {
        db.prepare(`UPDATE people SET founder_status='potential', potential_signal=? WHERE id=?`).run(row.potentialSignal, id);
      }
      applyVerification(db, id, row.verificationStatus, row.verificationNote, retrievedAt);
    }
    if (row.leftSchool) db.prepare(`UPDATE people SET left_school=1 WHERE id=?`).run(id);
    const claimId = insertClaim(
      db,
      "person",
      id,
      "program_membership",
      { name: row.name, org: orgPlace, campusId: row.campusId, founderStatus: row.founderStatus },
      row.excerpt,
      sourceId,
      sourceUrl,
      retrievedAt
    );
    if (row.campusId && claimId && ensureAffiliation(db, id, row.campusId, row.affiliationRole, claimId)) linked++;
    applyEnrollment(db, id, row.enrollment, sourceUrl);
    if (companyId && claimId && !db.prepare(`SELECT id FROM person_project_roles WHERE person_id=? AND project_id=?`).get(id, companyId)) {
      db.prepare(`INSERT INTO person_project_roles (id, person_id, project_id, role, claim_id) VALUES (?, ?, ?, 'founder', ?)`).run(
        newId("ppr"),
        id,
        companyId,
        claimId
      );
      db.prepare(
        `INSERT INTO relationships (id, source_entity_type, source_entity_id, target_entity_type, target_entity_id, relationship_type, evidence_claim_ids_json, verification_state)
         VALUES (?, 'person', ?, 'project', ?, 'founded', ?, 'affiliation_only')`
      ).run(newId("rel"), id, companyId, JSON.stringify([claimId]));
    }
  };

  const tx = db.transaction(() => {
    for (const company of data.companies) {
      assertHttp(company.sourceUrl, company.name);
      const nameKey = normalizeCompanyName(company.name);
      const excerptKey = normalizeCompanyName(company.excerpt);
      if (nameKey && !excerptKey.includes(nameKey.split(" ")[0] ?? nameKey)) {
        throw new Error(`Company excerpt does not mention ${company.name}`);
      }
      const sourceId = ensureSource(db, company.sourceUrl, company.campusIds, retrievedAt);
      const resolvedCompany = resolveCompany(db, byCompany, company.name, company.sourceUrl, company.campusIds, company.website);
      if (resolvedCompany.ambiguous) {
        ambiguous.push(`company:${company.name}`);
        continue;
      }
      let id = resolvedCompany.id;
      let createdCompany = false;
      if (!id) {
        id = newId("proj");
        const website = company.website && linkKind(company.website).kind === "other" ? company.website : null;
        db.prepare(
          `INSERT INTO projects (id, name, aliases_json, kind, description, website_url, primary_link, primary_link_kind, is_portfolio_reference, is_investable_candidate, verification_status, verification_note, last_verified_at)
           VALUES (?, ?, '[]', 'company', ?, ?, ?, ?, 0, ?, 'partial', ?, ?)`
        ).run(
          id,
          company.name,
          company.description,
          website,
          website ? company.sourceUrl : company.website || company.sourceUrl,
          website ? "other" : company.website ? linkKind(company.website).kind : linkKind(company.sourceUrl).kind,
          company.investable === false ? 0 : 1,
          `Named on ${company.sourceUrl}`,
          retrievedAt.slice(0, 10)
        );
        const list = byCompany.get(nameKey) ?? [];
        list.push(id);
        byCompany.set(nameKey, list);
        newCompanies++;
        createdCompany = true;
      }
      const claimId = insertClaim(
        db,
        "project",
        id,
        "program_membership",
        { name: company.name, org: company.orgPlace, campuses: company.campusIds },
        company.excerpt,
        sourceId,
        company.sourceUrl,
        retrievedAt
      );
      for (const campusId of company.campusIds) linkCompanyCampus(db, id, campusId, claimId);
      for (const founder of company.founders) {
        assertHttp(company.sourceUrl, founder.name);
        upsertPerson(founder, company.sourceUrl, sourceId, company.orgPlace, id);
      }
      if (company.description) {
        const current = db.prepare(`SELECT description FROM projects WHERE id=?`).get(id) as { description: string | null };
        if (!current.description) db.prepare(`UPDATE projects SET description=? WHERE id=?`).run(company.description, id);
      }
      const factExists = db.prepare(`SELECT id FROM company_facts WHERE project_id=? AND fact_key=? AND value_text=?`);
      const insertFact = db.prepare(
        `INSERT INTO company_facts (id, project_id, fact_key, value_text, amount_usd, amount_status, detail_json, source_url, excerpt, origin, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'campus_scan', ?)`
      );
      if (company.description && !factExists.get(id, "description", company.description)) {
        insertFact.run(newId("cf"), id, "description", company.description, null, null, "{}", company.sourceUrl, company.excerpt, retrievedAt);
      }
      if (company.website && linkKind(company.website).kind === "other" && !factExists.get(id, "website", company.website)) {
        insertFact.run(
          newId("cf"),
          id,
          "website",
          company.website,
          null,
          null,
          "{}",
          company.sourceUrl,
          `Website recorded from ${company.sourceUrl}.`,
          retrievedAt
        );
      }
      for (const investor of company.investors ?? []) {
        assertHttp(investor.sourceUrl, investor.name);
        if (factExists.get(id, "investor", investor.name)) continue;
        insertFact.run(
          newId("cf"),
          id,
          "investor",
          investor.name,
          null,
          null,
          JSON.stringify({ batch: investor.batch ?? null, kind: investor.kind ?? null }),
          investor.sourceUrl,
          investor.excerpt,
          retrievedAt
        );
      }
      for (const round of company.funding ?? []) {
        assertHttp(round.sourceUrl, company.name);
        const fundingSourceId = round.sourceUrl === company.sourceUrl ? sourceId : ensureSource(db, round.sourceUrl, company.campusIds, retrievedAt);
        const claimId = insertClaim(
          db,
          "project",
          id,
          "funding",
          { stage: round.stage, amountUsd: round.amountUsd, leads: round.leads, investors: round.investors },
          round.excerpt,
          fundingSourceId,
          round.sourceUrl,
          retrievedAt
        );
        if (!factExists.get(id, "funding_round", round.amountText)) {
          insertFact.run(
            newId("cf"),
            id,
            "funding_round",
            round.amountText,
            round.amountUsd,
            round.amountUsd ? "announced" : "undisclosed",
            JSON.stringify({ stage: round.stage, amountText: round.amountText, date: round.date, leads: round.leads }),
            round.sourceUrl,
            round.excerpt,
            retrievedAt
          );
        }
        const dedupe = crypto.createHash("sha256").update(`${id}|${round.stage}|${round.amountUsd}|${round.date}`).digest("hex");
        db.prepare(
          `INSERT INTO funding_events (id, project_id, amount, currency, instrument, event_date, dedupe_key, claim_id)
           VALUES (?, ?, ?, 'USD', ?, ?, ?, ?)
           ON CONFLICT(dedupe_key) DO NOTHING`
        ).run(newId("fund"), id, round.amountUsd, round.stage === "grant" || round.stage === "prize" ? "grant" : "equity", round.date, dedupe, claimId);
        for (const name of [...round.leads, ...round.investors]) {
          if (factExists.get(id, "investor", name)) continue;
          insertFact.run(
            newId("cf"),
            id,
            "investor",
            name,
            null,
            null,
            JSON.stringify({ round: round.stage, kind: round.leads.includes(name) ? "lead" : null }),
            round.sourceUrl,
            round.excerpt,
            retrievedAt
          );
        }
      }
      if (company.description && !db.prepare(`SELECT 1 FROM project_sector_tags WHERE project_id=? LIMIT 1`).get(id)) {
        const tags = classifyDescription(company.description, company.name);
        const insertTag = db.prepare(
          `INSERT INTO project_sector_tags (id, project_id, tag, is_primary, excerpt, source_url) VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(project_id, tag) DO NOTHING`
        );
        tags.forEach((tag, index) => {
          insertTag.run(newId("tag"), id, tag.tag, index === 0 ? 1 : 0, company.description!.slice(0, 280), company.sourceUrl);
        });
        if (tags[0]) db.prepare(`UPDATE projects SET sector=? WHERE id=? AND sector IS NULL`).run(tags[0].tag, id);
      }
      // Score after founders, funding, and sector tags exist. A new company
      // otherwise records "no funding" because the gates ran before those rows.
      if (createdCompany) {
        const facts = assembleProjectFacts(db, id);
        const upsertGate = db.prepare(
          `INSERT INTO gate_results (id, project_id, gate_name, result, rationale, evaluated_at)
           VALUES (?, ?, ?, ?, ?, datetime('now'))
           ON CONFLICT(project_id, gate_name) DO UPDATE SET result=excluded.result, rationale=excluded.rationale, evaluated_at=excluded.evaluated_at`
        );
        for (const outcome of evaluateAllGates(facts)) upsertGate.run(newId("gate"), id, outcome.gate, outcome.result, outcome.rationale);
      }
    }

    for (const person of data.potential) {
      assertHttp(person.sourceUrl, person.name);
      const sourceId = ensureSource(db, person.sourceUrl, [person.campusId], retrievedAt);
      upsertPerson(
        {
          name: person.name,
          aliases: person.aliases,
          campusId: person.campusId,
          affiliationRole: person.affiliationRole,
          founderStatus: "potential",
          potentialSignal: person.potentialSignal,
          verificationStatus: person.verificationStatus,
          verificationNote: person.verificationNote,
          enrollment: person.enrollment,
          leftSchool: person.leftSchool,
          excerpt: person.excerpt,
        },
        person.sourceUrl,
        sourceId,
        person.orgPlace,
        null
      );
    }

    for (const link of data.links) {
      assertHttp(link.sourceUrl, link.personName);
      assertExcerptHasName(link.personName, link.excerpt, link.personName);
      const resolved = resolvePerson(db, byPerson, link.personName, [], link.campusId);
      if (!resolved.id || resolved.ambiguous) {
        ambiguous.push(`link:${link.personName}`);
        continue;
      }
      const sourceId = ensureSource(db, link.sourceUrl, [link.campusId], retrievedAt);
      const claimId = insertClaim(
        db,
        "person",
        resolved.id,
        "program_membership",
        { name: link.personName, campusId: link.campusId, linkedExisting: true },
        link.excerpt,
        sourceId,
        link.sourceUrl,
        retrievedAt
      );
      if (ensureAffiliation(db, resolved.id, link.campusId, link.affiliationRole, claimId)) linked++;
      applyEnrollment(db, resolved.id, link.enrollment, link.sourceUrl);
      if (link.founderStatus === "founder") {
        db.prepare(`UPDATE people SET founder_status='founder' WHERE id=? AND (founder_status IS NULL OR founder_status!='founder')`).run(resolved.id);
      }
    }
  });
  tx();
  db.pragma("wal_checkpoint(TRUNCATE)");
  console.log(JSON.stringify({ newPeople, newCompanies, newAffiliations: linked, ambiguous }, null, 2));
}

main();
