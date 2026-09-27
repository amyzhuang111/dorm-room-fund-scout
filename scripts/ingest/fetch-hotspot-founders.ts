// Public rosters for campus hotspot organizations, plus YC and a16z Speedrun
// pages that name a hotspot campus. Penn and Berkeley tier-A/B directories that
// are already in the database (Venture Lab, E@B, SkyDeck, Penn Labs, GRASP)
// are not re-scraped. New rows are Mayfield Fellows (Stanford STVP, directory tier S),
// MIT delta v cohorts from 2023 onward plus the 2026 cohort (tier A),
// the StartX community page (Stanford, tier B), YC company pages from
// 2023–2026 whose text ties a founder to a hotspot campus, and Speedrun
// founder bios that name a hotspot campus other than the Penn-only pass.
//
// Nothing is invented. A person is added only when the page prints their name.
// A company is added only when the page prints its name. Every row stores the
// page URL and a quoted reason.
//
// Run: npx tsx scripts/ingest/fetch-hotspot-founders.ts

import * as cheerio from "cheerio";
import type Database from "better-sqlite3";
import { getDb, newId, nowIso } from "../../lib/db/client";
import { normalizeCompanyName, websiteIdentity } from "../../lib/domain/dedupe";
import { assembleProjectFacts } from "../../lib/domain/facts";
import {
  HOTSPOT_SCHOOLS,
  parseDeltaV2026,
  parseDeltaVPast,
  parseMayfieldAlumni,
  parseStartXCommunity,
  schoolHitsIn,
  type RosterCompany,
  type SchoolHit,
} from "../../lib/domain/hotspot-roster";
import { parseSpeedrunCompany } from "./fetch-penn-depth";
import { evaluateAllGates } from "../../lib/screening/gates";

const YC_BATCHES = [
  "winter-2023",
  "summer-2023",
  "winter-2024",
  "summer-2024",
  "fall-2024",
  "winter-2025",
  "spring-2025",
  "summer-2025",
  "fall-2025",
  "winter-2026",
  "spring-2026",
  "summer-2026",
  "fall-2026",
];

interface Founder {
  name: string;
  title: string | null;
  bio: string;
  linkedin: string | null;
  userId: number | null;
}

interface CompanyMatch {
  slug: string;
  name: string;
  oneLiner: string | null;
  website: string | null;
  batch: string | null;
  ycUrl: string;
  founders: Founder[];
  founderSchools: { founder: Founder; hits: SchoolHit[] }[];
  companySchools: SchoolHit[];
}

const addedPeople: { name: string; campus: string; org: string; tier: string }[] = [];
const addedCompanies: { name: string; campus: string; org: string; tier: string }[] = [];

function fetchText(url: string): Promise<string> {
  return fetch(url, {
    headers: { "user-agent": "campus-universe-research-bot/0.1 (manual, bounded)" },
    signal: AbortSignal.timeout(12000),
  }).then(async (res) => {
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
    return res.text();
  });
}

async function mapPool<T>(items: T[], n: number, fn: (item: T, index: number) => Promise<void>) {
  let cursor = 0;
  async function worker() {
    for (;;) {
      const index = cursor++;
      if (index >= items.length) return;
      await fn(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: n }, () => worker()));
}

function ensureSource(db: Database.Database, id: string, name: string, url: string, campuses: string[], retrievedAt: string) {
  db.prepare(
    `INSERT INTO sources (id, name, family, url, campuses_json, priority, ingestion_mode, status, last_attempt_at)
     VALUES (?, ?, 'campus_builder_org', ?, ?, 1, 'html_scrape', 'available', ?)
     ON CONFLICT(id) DO UPDATE SET last_attempt_at=excluded.last_attempt_at, status='available', url=excluded.url, name=excluded.name`
  ).run(id, name, url, JSON.stringify(campuses), retrievedAt);
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
  const existing = db.prepare(`SELECT id FROM claims WHERE entity_id = ? AND source_url = ? AND claim_type = ? LIMIT 1`).get(entityId, sourceUrl, claimType) as { id: string } | undefined;
  if (existing) return existing.id;
  const id = newId("claim");
  db.prepare(
    `INSERT INTO claims (id, entity_type, entity_id, claim_type, value_json, excerpt, source_id, source_url, retrieved_at, label, verification_state)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'observed_fact', 'unverified')`
  ).run(id, entityType, entityId, claimType, JSON.stringify(value), excerpt.slice(0, 1400), sourceId, sourceUrl, retrievedAt);
  return id;
}

function linkUniversity(db: Database.Database, projectId: string, universityId: string, claimId: string | null) {
  const existing = db
    .prepare(
      `SELECT id FROM relationships WHERE source_entity_type='project' AND source_entity_id=? AND target_entity_type='university' AND target_entity_id=? AND relationship_type='affiliated_with'`
    )
    .get(projectId, universityId);
  if (existing) return;
  db.prepare(
    `INSERT INTO relationships (id, source_entity_type, source_entity_id, target_entity_type, target_entity_id, relationship_type, evidence_claim_ids_json, verification_state)
     VALUES (?, 'project', ?, 'university', ?, 'affiliated_with', ?, 'affiliation_only')`
  ).run(newId("rel"), projectId, universityId, JSON.stringify(claimId ? [claimId] : []));
}

class Indexes {
  byName = new Map<string, string[]>();
  bySite = new Map<string, string[]>();

  constructor(db: Database.Database) {
    const rows = db.prepare(`SELECT id, name, website_url, primary_link FROM projects`).all() as {
      id: string;
      name: string;
      website_url: string | null;
      primary_link: string | null;
    }[];
    for (const row of rows) this.add(row.id, row.name, row.website_url, row.primary_link);
  }

  add(id: string, name: string, website: string | null, primary: string | null) {
    const key = normalizeCompanyName(name);
    const list = this.byName.get(key) ?? [];
    if (!list.includes(id)) list.push(id);
    this.byName.set(key, list);
    for (const url of [website, primary]) {
      const site = websiteIdentity(url);
      if (!site) continue;
      const sites = this.bySite.get(site) ?? [];
      if (!sites.includes(id)) sites.push(id);
      this.bySite.set(site, sites);
    }
  }
}

function findCompany(indexes: Indexes, name: string, website: string | null): string | null {
  const site = websiteIdentity(website);
  if (site) {
    const hits = indexes.bySite.get(site) ?? [];
    if (hits.length === 1) return hits[0];
    if (hits.length > 1) return null;
  }
  const named = indexes.byName.get(normalizeCompanyName(name)) ?? [];
  if (named.length === 1) return named[0];
  return null;
}

function ensureCompany(
  db: Database.Database,
  indexes: Indexes,
  company: RosterCompany,
  sourceId: string,
  sourceUrl: string,
  campusId: string,
  campusLabel: string,
  org: string,
  tier: string,
  orgProjectId: string | null,
  retrievedAt: string,
  excerpt: string
): { id: string; created: boolean } {
  let id = findCompany(indexes, company.name, company.website);
  let created = false;
  if (!id) {
    id = newId("proj");
    const official = company.website && !/ycombinator\.com|speedrun\.a16z\.com|\.edu/i.test(company.website) ? company.website : null;
    db.prepare(
      `INSERT INTO projects (id, name, aliases_json, kind, description, website_url, primary_link, primary_link_kind, is_portfolio_reference, is_investable_candidate)
       VALUES (?, ?, '[]', 'company', ?, ?, ?, ?, 0, 1)`
    ).run(
      id,
      company.name,
      company.description,
      official,
      official ? sourceUrl : company.website || sourceUrl,
      official ? "accelerator" : company.website ? "other" : "accelerator"
    );
    indexes.add(id, company.name, official, sourceUrl);
    created = true;
    addedCompanies.push({ name: company.name, campus: campusLabel, org, tier });
  }
  const claimId = insertClaim(
    db,
    "project",
    id,
    "program_membership",
    { name: company.name, org, tier, campus: campusLabel, year: company.year, website: company.website },
    excerpt,
    sourceId,
    sourceUrl,
    retrievedAt
  );
  linkUniversity(db, id, campusId, claimId);
  if (orgProjectId && claimId) {
    const role = db.prepare(`SELECT id FROM relationships WHERE source_entity_id=? AND target_entity_id=? AND relationship_type='part_of_program'`).get(id, orgProjectId);
    if (!role) {
      db.prepare(
        `INSERT INTO relationships (id, source_entity_type, source_entity_id, target_entity_type, target_entity_id, relationship_type, evidence_claim_ids_json, verification_state)
         VALUES (?, 'project', ?, 'project', ?, 'part_of_program', ?, 'affiliation_only')`
      ).run(newId("rel"), id, orgProjectId, JSON.stringify([claimId]));
    }
  }
  if (created) {
    const facts = assembleProjectFacts(db, id);
    const upsert = db.prepare(
      `INSERT INTO gate_results (id, project_id, gate_name, result, rationale, evaluated_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(project_id, gate_name) DO UPDATE SET result=excluded.result, rationale=excluded.rationale, evaluated_at=excluded.evaluated_at`
    );
    for (const outcome of evaluateAllGates(facts)) upsert.run(newId("gate"), id, outcome.gate, outcome.result, outcome.rationale);
  }
  return { id, created };
}

function findPerson(db: Database.Database, name: string, universityId: string, aliases: string[]): string | null {
  for (const alias of aliases) {
    const row = db.prepare(`SELECT id FROM people WHERE aliases_json LIKE ? ESCAPE '\\'`).get(`%"${alias.replace(/[%_\\]/g, "\\$&")}"%`) as { id: string } | undefined;
    if (row) return row.id;
  }
  const matches = db.prepare(`SELECT id FROM people WHERE lower(name) = lower(?)`).all(name) as { id: string }[];
  const affiliated = matches.filter((row) =>
    db.prepare(`SELECT 1 FROM affiliations WHERE person_id=? AND university_id=?`).get(row.id, universityId)
  );
  if (affiliated.length === 1) return affiliated[0].id;
  if (matches.length === 1 && affiliated.length === 0) {
    const any = db.prepare(`SELECT 1 FROM affiliations WHERE person_id=?`).get(matches[0].id);
    if (!any) return matches[0].id;
  }
  return null;
}

function ensurePerson(
  db: Database.Database,
  name: string,
  universityId: string,
  campusLabel: string,
  role: string,
  aliases: string[],
  sourceId: string,
  sourceUrl: string,
  excerpt: string,
  value: unknown,
  orgProjectId: string | null,
  orgRole: string,
  founderStatus: "founder" | "potential" | null,
  potentialSignal: string | null,
  companyId: string | null,
  retrievedAt: string,
  org: string,
  tier: string
): { id: string; created: boolean } {
  let id = findPerson(db, name, universityId, aliases);
  let created = false;
  if (!id) {
    id = newId("person");
    db.prepare(`INSERT INTO people (id, name, aliases_json, founder_status, potential_signal) VALUES (?, ?, ?, ?, ?)`).run(
      id,
      name,
      JSON.stringify(aliases),
      founderStatus,
      potentialSignal
    );
    created = true;
    addedPeople.push({ name, campus: campusLabel, org, tier });
  } else if (aliases.length) {
    const row = db.prepare(`SELECT aliases_json, founder_status FROM people WHERE id=?`).get(id) as { aliases_json: string; founder_status: string | null };
    const existing = JSON.parse(row.aliases_json) as string[];
    let changed = false;
    for (const alias of aliases) {
      if (!existing.includes(alias)) {
        existing.push(alias);
        changed = true;
      }
    }
    if (changed) db.prepare(`UPDATE people SET aliases_json=? WHERE id=?`).run(JSON.stringify(existing), id);
    if (founderStatus === "founder" && row.founder_status !== "founder") {
      db.prepare(`UPDATE people SET founder_status='founder', potential_signal=NULL WHERE id=?`).run(id);
    } else if (founderStatus === "potential" && !row.founder_status && potentialSignal) {
      db.prepare(`UPDATE people SET founder_status='potential', potential_signal=? WHERE id=?`).run(potentialSignal, id);
    }
  }
  const claimId = insertClaim(db, "person", id, "program_membership", value, excerpt, sourceId, sourceUrl, retrievedAt);
  if (claimId && !db.prepare(`SELECT id FROM affiliations WHERE person_id=? AND university_id=? AND role=?`).get(id, universityId, role)) {
    db.prepare(`INSERT INTO affiliations (id, person_id, university_id, role, status, claim_id) VALUES (?, ?, ?, ?, 'unverified', ?)`).run(
      newId("aff"),
      id,
      universityId,
      role,
      claimId
    );
  }
  if (orgProjectId && claimId && !db.prepare(`SELECT id FROM person_project_roles WHERE person_id=? AND project_id=?`).get(id, orgProjectId)) {
    db.prepare(`INSERT INTO person_project_roles (id, person_id, project_id, role, claim_id) VALUES (?, ?, ?, ?, ?)`).run(
      newId("ppr"),
      id,
      orgProjectId,
      orgRole,
      claimId
    );
  }
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
  return { id, created };
}

function ensureOrg(db: Database.Database, id: string, name: string, description: string, url: string, universityId: string) {
  const existing = db.prepare(`SELECT id FROM projects WHERE id=?`).get(id);
  if (!existing) {
    db.prepare(
      `INSERT INTO projects (id, name, aliases_json, kind, description, website_url, is_portfolio_reference, is_investable_candidate)
       VALUES (?, ?, '[]', 'project', ?, ?, 0, 0)`
    ).run(id, name, description, url);
  }
  linkUniversity(db, id, universityId, null);
}

function nameInExcerpt(name: string, excerpt: string): boolean {
  const last = name.split(/\s+/).slice(-1)[0];
  if (!last || last.length < 3) return excerpt.toLowerCase().includes(name.toLowerCase());
  return excerpt.toLowerCase().includes(name.toLowerCase()) || new RegExp(`\\b${last.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(excerpt);
}

function parseYcCompany(html: string, slug: string): CompanyMatch | null {
  const $ = cheerio.load(html);
  const raw = $("[data-page]").attr("data-page");
  if (!raw) return null;
  let data: { props?: { company?: Record<string, unknown> } };
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  const co = data.props?.company;
  if (!co || typeof co.name !== "string") return null;
  const status = typeof co.ycdc_status === "string" ? co.ycdc_status : null;
  if (status && /inactive|acquired|public|dead/i.test(status)) return null;
  const founders: Founder[] = Array.isArray(co.founders)
    ? (co.founders as Record<string, unknown>[])
        .map((f) => ({
          userId: typeof f.user_id === "number" ? f.user_id : null,
          name: typeof f.full_name === "string" ? f.full_name.trim() : "",
          title: typeof f.title === "string" ? f.title : null,
          bio: typeof f.founder_bio === "string" ? f.founder_bio : "",
          linkedin: typeof f.linkedin_url === "string" && f.linkedin_url.startsWith("http") ? f.linkedin_url.split("?")[0] : null,
        }))
        .filter((f) => f.name)
    : [];
  const long = typeof co.long_description === "string" ? co.long_description : "";
  const companySchools = schoolHitsIn(long);
  const founderSchools: CompanyMatch["founderSchools"] = [];
  for (const founder of founders) {
    const own = schoolHitsIn(founder.bio);
    const fromTeam = companySchools.filter((hit) => nameInExcerpt(founder.name, hit.excerpt));
    const hits = [...own];
    for (const hit of fromTeam) {
      if (!hits.some((h) => h.universityId === hit.universityId)) hits.push(hit);
    }
    if (hits.length) founderSchools.push({ founder, hits });
  }
  if (companySchools.length === 0 && founderSchools.length === 0) return null;
  const website = typeof co.website === "string" && co.website.startsWith("http") ? co.website : null;
  return {
    slug,
    name: String(co.name),
    oneLiner: typeof co.one_liner === "string" ? co.one_liner : null,
    website,
    batch: typeof co.batch_name === "string" ? co.batch_name : typeof co.batch === "string" ? co.batch : null,
    ycUrl: `https://www.ycombinator.com/companies/${slug}`,
    founders,
    founderSchools,
    companySchools,
  };
}

async function ingestMayfield(db: Database.Database, indexes: Indexes, retrievedAt: string) {
  const url = "https://stvp.stanford.edu/mayfield-fellows-program-alumni";
  const sourceId = "src_hotspot_mayfield";
  ensureSource(db, sourceId, "Mayfield Fellows Program alumni", url, ["univ_stanford"], retrievedAt);
  ensureOrg(
    db,
    "proj_mayfield_fellows",
    "Mayfield Fellows Program",
    "Stanford STVP undergraduate fellowship. Recorded as the organization, not as an investable company.",
    "https://stvp.stanford.edu/students/fellows-programs/mayfield-fellows-program",
    "univ_stanford"
  );
  const html = await fetchText(url);
  const cohorts = parseMayfieldAlumni(html);
  console.log(`Mayfield alumni page: ${cohorts.reduce((n, c) => n + c.names.length, 0)} names in ${cohorts.length} cohorts.`);
  if (cohorts.length === 0) throw new Error("Mayfield alumni page parsed no cohorts.");
  let created = 0;
  for (const cohort of cohorts) {
    for (const name of cohort.names) {
      const alias = `mayfield:${cohort.year}:${name.toLowerCase()}`;
      const result = ensurePerson(
        db,
        name,
        "univ_stanford",
        "Stanford",
        `Mayfield Fellow ${cohort.year}`,
        [alias],
        sourceId,
        url,
        `The Mayfield Fellows Program alumni page lists ${name} in the ${cohort.year} cohort. The program page says it admits active Stanford undergraduates.`,
        { name, cohort: cohort.year, org: "Mayfield Fellows Program", tier: "S", campus: "Stanford" },
        "proj_mayfield_fellows",
        "member",
        "potential",
        `Mayfield Fellows ${cohort.year} cohort, listed on the STVP alumni page.`,
        null,
        retrievedAt,
        "Mayfield Fellows Program",
        "S"
      );
      if (result.created) created++;
    }
  }
  console.log(`Mayfield new people: ${created}`);
}

async function ingestDeltaV(db: Database.Database, indexes: Indexes, retrievedAt: string) {
  const sourceId = "src_hotspot_deltav";
  const pastUrl = "https://entrepreneurship.mit.edu/accelerator/past-teams/";
  const currentUrl = "https://entrepreneurship.mit.edu/accelerator/2026-delta-v/";
  ensureSource(db, sourceId, "MIT delta v cohorts 2023–2026", currentUrl, ["univ_mit"], retrievedAt);
  ensureOrg(
    db,
    "proj_mit_deltav",
    "MIT delta v",
    "Martin Trust Center student accelerator. Recorded as the organization, not as an investable company.",
    "https://entrepreneurship.mit.edu/accelerator/",
    "univ_mit"
  );
  const pastHtml = await fetchText(pastUrl);
  const currentHtml = await fetchText(currentUrl);
  const past = parseDeltaVPast(pastHtml, 2023);
  const current = parseDeltaV2026(currentHtml);
  console.log(`delta v: ${past.length} teams from 2023–2025, ${current.length} teams on the 2026 page.`);
  if (past.length < 10 || current.length < 5) throw new Error("delta v pages parsed fewer teams than the public pages show.");
  let created = 0;
  for (const team of past) {
    const result = ensureCompany(
      db,
      indexes,
      team,
      sourceId,
      pastUrl,
      "univ_mit",
      "MIT",
      "MIT delta v",
      "A",
      "proj_mit_deltav",
      retrievedAt,
      `MIT delta v's past-teams page lists "${team.name}" in the ${team.year} cohort${team.website ? ` and links ${team.website}` : ""}. The page does not name founders.`
    );
    if (result.created) created++;
  }
  for (const team of current) {
    const result = ensureCompany(
      db,
      indexes,
      team,
      sourceId,
      currentUrl,
      "univ_mit",
      "MIT",
      "MIT delta v",
      "A",
      "proj_mit_deltav",
      retrievedAt,
      `MIT's 2026 delta v page lists "${team.name}"${team.description ? `: ${team.description}` : ""}${team.website ? ` Website on the page: ${team.website}.` : ""} The page does not name founders.`
    );
    if (result.created) created++;
  }
  console.log(`delta v new companies: ${created}`);
}

async function ingestStartX(db: Database.Database, indexes: Indexes, retrievedAt: string) {
  const url = "https://web.startx.com/community";
  const sourceId = "src_hotspot_startx";
  ensureSource(db, sourceId, "StartX community directory", url, ["univ_stanford"], retrievedAt);
  ensureOrg(
    db,
    "proj_startx",
    "StartX",
    "Stanford-affiliated founder accelerator. Recorded as the organization, not as an investable company.",
    "https://web.startx.com/",
    "univ_stanford"
  );
  const html = await fetchText(url);
  const companies = parseStartXCommunity(html);
  console.log(`StartX community page: ${companies.length} companies in the server-rendered list.`);
  if (companies.length < 10) throw new Error("StartX community page parsed fewer companies than the rendered list.");
  let created = 0;
  for (const company of companies) {
    const result = ensureCompany(
      db,
      indexes,
      company,
      sourceId,
      url,
      "univ_stanford",
      "Stanford",
      "StartX",
      "B",
      "proj_startx",
      retrievedAt,
      `StartX's public community page lists "${company.name}"${company.session ? ` (${company.session})` : ""}${company.description ? `: ${company.description}` : ""}. The card does not name founders. The page describes the directory as Stanford-affiliated founders.`
    );
    if (result.created) created++;
  }
  console.log(`StartX new companies: ${created}`);
}

async function ycSlugs(db: Database.Database): Promise<string[]> {
  const seen = new Set<string>();
  const claimed = new Set(
    (db.prepare(`SELECT DISTINCT source_url FROM claims WHERE source_url LIKE 'https://www.ycombinator.com/companies/%'`).all() as { source_url: string }[]).map(
      (row) => row.source_url.replace(/\/$/, "")
    )
  );
  const slugs: string[] = [];
  for (const batch of YC_BATCHES) {
    const body = await fetchText(`https://yc-oss.github.io/api/batches/${batch}.json`);
    const rows = JSON.parse(body) as { slug?: string; status?: string }[];
    let kept = 0;
    for (const row of rows) {
      if (!row.slug || seen.has(row.slug)) continue;
      seen.add(row.slug);
      if (row.status && /inactive|acquired|public|dead/i.test(row.status)) continue;
      const url = `https://www.ycombinator.com/companies/${row.slug}`;
      if (claimed.has(url)) continue;
      slugs.push(row.slug);
      kept++;
    }
    console.log(`YC ${batch}: ${rows.length} listed, ${kept} not already stored`);
  }
  return slugs;
}

async function ingestYc(db: Database.Database, indexes: Indexes, retrievedAt: string) {
  const sourceId = "src_yc_campus_expand";
  ensureSource(db, sourceId, "Y Combinator company directory (hotspot campuses)", "https://www.ycombinator.com/companies", HOTSPOT_SCHOOLS.map((s) => s.id), retrievedAt);
  const slugs = await ycSlugs(db);
  console.log(`Fetching ${slugs.length} YC company pages.`);
  let failed = 0;
  let matched = 0;
  await mapPool(slugs, 8, async (slug, index) => {
    if (index > 0 && index % 200 === 0) console.log(`  YC scanned ${index}/${slugs.length}, matches ${matched}, failed ${failed}`);
    try {
      const html = await fetchText(`https://www.ycombinator.com/companies/${slug}`);
      const company = parseYcCompany(html, slug);
      if (!company) return;
      matched++;
      const campusIds = new Set<string>([
        ...company.companySchools.map((h) => h.universityId),
        ...company.founderSchools.flatMap((f) => f.hits.map((h) => h.universityId)),
      ]);
      const campusLabel = HOTSPOT_SCHOOLS.filter((s) => campusIds.has(s.id)).map((s) => s.label).join(", ");
      const stored = ensureCompany(
        db,
        indexes,
        {
          name: company.name,
          website: company.website,
          description: company.oneLiner,
          year: null,
          session: company.batch,
        },
        sourceId,
        company.ycUrl,
        [...campusIds][0],
        campusLabel,
        "Y Combinator",
        "national",
        null,
        retrievedAt,
        `Y Combinator company page for ${company.name}${company.batch ? ` (${company.batch})` : ""}. ${company.founderSchools
          .flatMap((f) => f.hits.map((h) => `${f.founder.name} (${h.label}): "${h.excerpt}"`))
          .join(" | ")
          .slice(0, 900)}`
      );
      for (const universityId of campusIds) linkUniversity(db, stored.id, universityId, null);
      for (const founder of company.founderSchools) {
        const aliases = [
          founder.founder.userId != null ? `yc-user:${founder.founder.userId}` : `yc-name:${company.slug}:${founder.founder.name.toLowerCase()}`,
        ];
        if (founder.founder.linkedin) aliases.push(`linkedin:${founder.founder.linkedin.replace(/\/$/, "")}`);
        for (const hit of founder.hits) {
          ensurePerson(
            db,
            founder.founder.name,
            hit.universityId,
            hit.label,
            `YC founder; page names ${hit.label}`,
            aliases,
            sourceId,
            company.ycUrl,
            `Y Combinator's page for ${company.name}${company.batch ? ` (${company.batch})` : ""} lists ${founder.founder.name}${founder.founder.title ? ` (${founder.founder.title})` : ""}. Bio excerpt: "${hit.excerpt}"`,
            { name: founder.founder.name, company: company.name, batch: company.batch, campus: hit.label, org: "Y Combinator", tier: "national" },
            null,
            "member",
            "founder",
            null,
            stored.id,
            retrievedAt,
            "Y Combinator",
            "national"
          );
        }
      }
    } catch (error) {
      failed++;
      if (failed <= 8) console.log(`  skip ${slug}: ${(error as Error).message}`);
    }
  });
  console.log(`YC campus expand matches ${matched}, failed fetches ${failed}.`);
}

async function ingestSpeedrun(db: Database.Database, indexes: Indexes, retrievedAt: string) {
  const sourceId = "src_speedrun_campus_expand";
  ensureSource(db, sourceId, "a16z Speedrun company pages (hotspot campuses)", "https://speedrun.a16z.com/companies", HOTSPOT_SCHOOLS.map((s) => s.id), retrievedAt);
  const slugs: string[] = [];
  for (let offset = 0; offset < 400; offset += 100) {
    const body = await fetchText(`https://speedrun-api.a16z.com/api/companies/companies/?limit=100&offset=${offset}`);
    const parsed = JSON.parse(body) as { results?: { slug: string }[] };
    const batch = parsed.results ?? [];
    for (const row of batch) if (row.slug) slugs.push(row.slug);
    if (batch.length < 100) break;
  }
  console.log(`Speedrun slugs: ${slugs.length}`);
  let matched = 0;
  let failed = 0;
  await mapPool(slugs, 6, async (slug) => {
    const url = `https://speedrun.a16z.com/companies/${slug}`;
    if (db.prepare(`SELECT id FROM claims WHERE source_url=? AND source_id='src_a16z_speedrun' LIMIT 1`).get(url)) return;
    try {
      const html = await fetchText(url);
      const company = parseSpeedrunCompany(html);
      if (!company) return;
      const people = company.people
        .map((person) => ({ person, hits: schoolHitsIn(`${person.introduction} ${person.title}`) }))
        .filter((row) => row.hits.length > 0 && row.person.founder);
      if (people.length === 0) return;
      matched++;
      const campusIds = [...new Set(people.flatMap((row) => row.hits.map((h) => h.universityId)))];
      const stored = ensureCompany(
        db,
        indexes,
        { name: company.name, website: company.website, description: company.description, year: null, session: null },
        sourceId,
        url,
        campusIds[0],
        HOTSPOT_SCHOOLS.filter((s) => campusIds.includes(s.id)).map((s) => s.label).join(", "),
        "a16z Speedrun",
        "national",
        null,
        retrievedAt,
        `a16z Speedrun page for ${company.name}. ${people
          .flatMap((row) => row.hits.map((h) => `${row.person.name} (${h.label}): "${h.excerpt}"`))
          .join(" | ")
          .slice(0, 900)}`
      );
      for (const universityId of campusIds) linkUniversity(db, stored.id, universityId, null);
      for (const row of people) {
        const aliases = row.person.linkedin ? [`linkedin:${row.person.linkedin.replace(/\/$/, "")}`] : [`speedrun:${slug}:${row.person.name.toLowerCase()}`];
        for (const hit of row.hits) {
          ensurePerson(
            db,
            row.person.name,
            hit.universityId,
            hit.label,
            `Speedrun founder; page names ${hit.label}`,
            aliases,
            sourceId,
            url,
            `${row.person.name}, ${row.person.title || "founder"} of ${company.name}, on the Speedrun page: "${hit.excerpt}"`,
            { name: row.person.name, company: company.name, campus: hit.label, org: "a16z Speedrun", tier: "national" },
            null,
            "member",
            "founder",
            null,
            stored.id,
            retrievedAt,
            "a16z Speedrun",
            "national"
          );
        }
      }
    } catch (error) {
      failed++;
      if (failed <= 8) console.log(`  speedrun skip ${slug}: ${(error as Error).message}`);
    }
  });
  console.log(`Speedrun campus matches ${matched}, failed ${failed}.`);
}

function tally(rows: { campus: string; org: string; tier: string }[]) {
  const byCampus = new Map<string, number>();
  const byOrg = new Map<string, number>();
  for (const row of rows) {
    byCampus.set(row.campus, (byCampus.get(row.campus) ?? 0) + 1);
    byOrg.set(`${row.tier} · ${row.org}`, (byOrg.get(`${row.tier} · ${row.org}`) ?? 0) + 1);
  }
  return { byCampus: Object.fromEntries(byCampus), byOrg: Object.fromEntries(byOrg) };
}

async function main() {
  const db = getDb();
  const retrievedAt = nowIso();
  const beforePeople = (db.prepare(`SELECT COUNT(*) AS n FROM people`).get() as { n: number }).n;
  const beforeCompanies = (db.prepare(`SELECT COUNT(*) AS n FROM projects WHERE kind='company'`).get() as { n: number }).n;
  const indexes = new Indexes(db);
  await ingestMayfield(db, indexes, retrievedAt);
  await ingestDeltaV(db, indexes, retrievedAt);
  await ingestStartX(db, indexes, retrievedAt);
  await ingestYc(db, indexes, retrievedAt);
  await ingestSpeedrun(db, indexes, retrievedAt);
  db.pragma("wal_checkpoint(TRUNCATE)");
  const afterPeople = (db.prepare(`SELECT COUNT(*) AS n FROM people`).get() as { n: number }).n;
  const afterCompanies = (db.prepare(`SELECT COUNT(*) AS n FROM projects WHERE kind='company'`).get() as { n: number }).n;
  console.log(
    JSON.stringify(
      {
        people: { before: beforePeople, after: afterPeople, added: afterPeople - beforePeople },
        companies: { before: beforeCompanies, after: afterCompanies, added: afterCompanies - beforeCompanies },
        addedPeople: tally(addedPeople),
        addedCompanies: tally(addedCompanies),
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
