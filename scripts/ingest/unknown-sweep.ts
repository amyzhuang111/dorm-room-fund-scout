// Fill Unknown profile fields only when a stored excerpt or a public page states
// the value. Anything unconfirmed stays Unknown.
//
//   npx tsx scripts/ingest/unknown-sweep.ts
//   npx tsx scripts/ingest/unknown-sweep.ts --dry-run
//
// --dry-run prints the current counts and applies nothing. It does not fetch.

import * as cheerio from "cheerio";
import crypto from "node:crypto";
import type Database from "better-sqlite3";
import { getDb, newId, nowIso } from "../../lib/db/client";
import { isOfficialProductHost } from "../../lib/domain/company-link";
import { decideEnrollment } from "../../lib/domain/founder-status";
import { recomputePersonEnrollment } from "../../lib/domain/enrollment-store";
import { classifyDescription, isBoilerplateDescription, sectorLabel } from "../../lib/domain/sectors";
import { assembleProjectFacts } from "../../lib/domain/facts";
import { evaluateAllGates } from "../../lib/screening/gates";
import {
  announcedRaiseIn,
  companyLinkedInIn,
  excerptNamesCompany,
  foundedYearIn,
  headquartersExcerptOk,
  headquartersIn,
  isPublisherPage,
  labeledOfficialWebsite,
  preferOfficialWebsite,
  schoolHitsInPersonExcerpt,
  teamSizeIn,
} from "../../lib/domain/unknown-sweep";

const SOURCE_ID = "src_unknown_sweep";
const CONCURRENCY = 8;

interface Counts {
  people: number;
  enrollment_unknown: number;
  class_year_missing: number;
  campus_missing: number;
  linkedin_missing: number;
  affiliation_role_blank: number;
  startups: number;
  description_unknown: number;
  website_unknown: number;
  sector_unknown: number;
  founders_unknown: number;
  funding_unknown: number;
  hq_unknown: number;
  founded_year_unknown: number;
  company_linkedin_unknown: number;
  team_size_unknown: number;
  campus_unknown: number;
}

function audit(db: Database.Database): Counts {
  const people = db.prepare(`SELECT COUNT(*) AS n FROM people`).get() as { n: number };
  const enrollment = db.prepare(`SELECT COUNT(*) AS n FROM people WHERE enrollment_status IS NULL OR enrollment_status = 'unknown'`).get() as { n: number };
  const classYear = db.prepare(`SELECT COUNT(*) AS n FROM people WHERE enrollment_grad_year IS NULL`).get() as { n: number };
  const campus = db.prepare(`SELECT COUNT(*) AS n FROM people WHERE id NOT IN (SELECT person_id FROM affiliations)`).get() as { n: number };
  const linkedin = db.prepare(`SELECT COUNT(*) AS n FROM people WHERE aliases_json NOT LIKE '%linkedin.com/in/%'`).get() as { n: number };
  const role = db.prepare(`SELECT COUNT(*) AS n FROM affiliations WHERE role IS NULL OR trim(role) = ''`).get() as { n: number };
  const row = db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM projects WHERE kind='company' AND is_investable_candidate=1) AS startups,
         (SELECT COUNT(*) FROM projects p WHERE p.kind='company' AND p.is_investable_candidate=1
            AND p.id NOT IN (SELECT project_id FROM company_facts WHERE fact_key='description')) AS description_unknown,
         (SELECT COUNT(*) FROM projects p WHERE p.kind='company' AND p.is_investable_candidate=1
            AND (p.website_url IS NULL OR trim(p.website_url)='' OR p.website_url NOT LIKE 'http%')) AS website_blank,
         (SELECT COUNT(*) FROM projects p WHERE p.kind='company' AND p.is_investable_candidate=1
            AND p.id NOT IN (SELECT project_id FROM project_sector_tags)) AS sector_unknown,
         (SELECT COUNT(*) FROM projects p WHERE p.kind='company' AND p.is_investable_candidate=1
            AND p.id NOT IN (SELECT project_id FROM person_project_roles WHERE role LIKE '%founder%')) AS founders_unknown,
         (SELECT COUNT(*) FROM projects p WHERE p.kind='company' AND p.is_investable_candidate=1
            AND p.id NOT IN (SELECT project_id FROM company_facts WHERE fact_key IN ('funding_total','funding_round'))) AS funding_unknown,
         (SELECT COUNT(*) FROM projects p WHERE p.kind='company' AND p.is_investable_candidate=1
            AND p.id NOT IN (SELECT project_id FROM company_facts WHERE fact_key='hq')) AS hq_unknown,
         (SELECT COUNT(*) FROM projects p WHERE p.kind='company' AND p.is_investable_candidate=1
            AND p.id NOT IN (SELECT project_id FROM company_facts WHERE fact_key='founded_year')) AS founded_year_unknown,
         (SELECT COUNT(*) FROM projects p WHERE p.kind='company' AND p.is_investable_candidate=1
            AND p.id NOT IN (SELECT project_id FROM company_facts WHERE fact_key='company_linkedin')) AS company_linkedin_unknown,
         (SELECT COUNT(*) FROM projects p WHERE p.kind='company' AND p.is_investable_candidate=1
            AND p.id NOT IN (SELECT project_id FROM company_facts WHERE fact_key='team_size')) AS team_size_unknown,
         (SELECT COUNT(*) FROM projects p WHERE p.kind='company' AND p.is_investable_candidate=1
            AND p.id NOT IN (
              SELECT ppr.project_id FROM person_project_roles ppr
              JOIN affiliations a ON a.person_id = ppr.person_id
              WHERE ppr.role LIKE '%founder%'
            )) AS campus_unknown`
    )
    .get() as Record<string, number>;
  const officialMissing = (
    db
      .prepare(
        `SELECT website_url FROM projects WHERE kind='company' AND is_investable_candidate=1 AND website_url LIKE 'http%'`
      )
      .all() as { website_url: string }[]
  ).filter((row) => !isOfficialProductHost(row.website_url)).length;
  return {
    people: people.n,
    enrollment_unknown: enrollment.n,
    class_year_missing: classYear.n,
    campus_missing: campus.n,
    linkedin_missing: linkedin.n,
    affiliation_role_blank: role.n,
    startups: row.startups,
    description_unknown: row.description_unknown,
    website_unknown: row.website_blank + officialMissing,
    sector_unknown: row.sector_unknown,
    founders_unknown: row.founders_unknown,
    funding_unknown: row.funding_unknown,
    hq_unknown: row.hq_unknown,
    founded_year_unknown: row.founded_year_unknown,
    company_linkedin_unknown: row.company_linkedin_unknown,
    team_size_unknown: row.team_size_unknown,
    campus_unknown: row.campus_unknown,
  };
}

function printCounts(label: string, counts: Counts) {
  console.log(`\n${label}`);
  console.log(`people ${counts.people}`);
  console.log(`  enrollment Unknown ${counts.enrollment_unknown}`);
  console.log(`  class year missing ${counts.class_year_missing}`);
  console.log(`  campus missing ${counts.campus_missing}`);
  console.log(`  LinkedIn missing ${counts.linkedin_missing}`);
  console.log(`  affiliation role blank ${counts.affiliation_role_blank}`);
  console.log(`startups ${counts.startups}`);
  console.log(`  description Unknown ${counts.description_unknown}`);
  console.log(`  website Unknown ${counts.website_unknown}`);
  console.log(`  sector Unknown ${counts.sector_unknown}`);
  console.log(`  founders Unknown ${counts.founders_unknown}`);
  console.log(`  funding Unknown ${counts.funding_unknown}`);
  console.log(`  HQ Unknown ${counts.hq_unknown}`);
  console.log(`  founded year Unknown ${counts.founded_year_unknown}`);
  console.log(`  company LinkedIn missing ${counts.company_linkedin_unknown}`);
  console.log(`  team size Unknown ${counts.team_size_unknown}`);
  console.log(`  campus Unknown ${counts.campus_unknown}`);
}

async function mapPool<T>(items: T[], n: number, fn: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  async function worker() {
    for (;;) {
      const index = cursor++;
      if (index >= items.length) return;
      await fn(items[index]);
    }
  }
  await Promise.all(Array.from({ length: n }, () => worker()));
}

async function fetchHtml(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { "user-agent": "campus-universe-research-bot/0.1 (unknown sweep)", accept: "text/html" },
    redirect: "follow",
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const type = response.headers.get("content-type") || "";
  if (!type.includes("html") && !type.includes("text")) throw new Error("not html");
  return (await response.text()).slice(0, 400_000);
}

function pageBits(html: string): { text: string; hrefs: string[]; anchors: { text: string; href: string }[]; meta: string | null } {
  const $ = cheerio.load(html);
  const anchors = $("a[href]")
    .map((_, el) => ({ text: $(el).text(), href: $(el).attr("href") || "" }))
    .get();
  const hrefs = anchors.map((anchor) => anchor.href);
  const meta =
    $('meta[property="og:description"]').attr("content") || $('meta[name="description"]').attr("content") || "";
  $("script,style,noscript,svg").remove();
  const text = $("body").text().replace(/\s+/g, " ").trim();
  const cleaned = meta.replace(/\s+/g, " ").trim();
  return { text, hrefs, anchors, meta: cleaned.length >= 40 && !isBoilerplateDescription(cleaned) ? cleaned.slice(0, 420) : null };
}

function hasFact(db: Database.Database, projectId: string, factKey: string): boolean {
  return !!db.prepare(`SELECT 1 FROM company_facts WHERE project_id = ? AND fact_key = ? LIMIT 1`).get(projectId, factKey);
}

function repairLooseFacts(db: Database.Database) {
  const facts = db
    .prepare(
      `SELECT f.id, f.project_id, f.fact_key, f.value_text, f.excerpt, f.source_url, p.name
       FROM company_facts f JOIN projects p ON p.id = f.project_id
       WHERE f.origin = 'company_site'`
    )
    .all() as { id: string; project_id: string; fact_key: string; value_text: string; excerpt: string; source_url: string; name: string }[];
  const shared = new Set(
    facts
      .map((fact) => fact.source_url)
      .filter((url, _index, all) => all.filter((item) => item === url).length > 1),
  );
  const drop = new Set<string>();
  const fundingProjects = new Set<string>();
  for (const fact of facts) {
    const publisher = isPublisherPage(fact.source_url) || shared.has(fact.source_url);
    const linkedinPublisher = fact.fact_key === "company_linkedin" && /linkedin\.com\/company\/(techcrunch|hypepotamus|pulse2news|cardinalventures|businessinsider|prnewswire)/i.test(fact.value_text);
    const hqMiss = fact.fact_key === "hq" && !headquartersExcerptOk(fact.excerpt, fact.name);
    const priorRound = fact.fact_key.startsWith("funding") && /after it raised/i.test(fact.excerpt);
    const unnamedPublisher = publisher && !excerptNamesCompany(fact.excerpt, fact.name) && fact.fact_key !== "company_linkedin";
    if (linkedinPublisher || hqMiss || priorRound || unnamedPublisher || (publisher && fact.fact_key === "company_linkedin")) {
      drop.add(fact.id);
      if (fact.fact_key.startsWith("funding")) fundingProjects.add(fact.project_id);
    }
  }
  const delFact = db.prepare(`DELETE FROM company_facts WHERE id = ?`);
  const delClaim = db.prepare(`DELETE FROM claims WHERE source_id = ? AND entity_id = ? AND claim_type = 'funding' AND source_url = ?`);
  const delFund = db.prepare(`DELETE FROM funding_events WHERE project_id = ? AND claim_id IN (SELECT id FROM claims WHERE source_id = ? AND entity_id = ? AND claim_type = 'funding')`);
  for (const fact of facts) {
    if (!drop.has(fact.id) || !fact.fact_key.startsWith("funding")) continue;
    delFund.run(fact.project_id, SOURCE_ID, fact.project_id);
    delClaim.run(SOURCE_ID, fact.project_id, fact.source_url);
  }
  for (const id of drop) delFact.run(id);

  db.prepare(`DELETE FROM affiliations WHERE role LIKE 'Page names %'`).run();
  const unaffiliated = db.prepare(`SELECT id, name FROM people WHERE id NOT IN (SELECT person_id FROM affiliations)`).all() as { id: string; name: string }[];
  const personClaims = db.prepare(`SELECT id, excerpt, claim_type FROM claims WHERE entity_id=? AND length(excerpt) > 20`);
  const insertAff = db.prepare(
    `INSERT INTO affiliations (id, person_id, university_id, role, status, claim_id) VALUES (?, ?, ?, ?, 'unverified', ?)`
  );
  let campuses = 0;
  for (const person of unaffiliated) {
    const claims = personClaims.all(person.id) as { id: string; excerpt: string; claim_type: string }[];
    const seen = new Set<string>();
    for (const claim of claims) {
      for (const hit of schoolHitsInPersonExcerpt(claim.excerpt, { personName: person.name, claimType: claim.claim_type })) {
        if (seen.has(hit.universityId)) continue;
        seen.add(hit.universityId);
        insertAff.run(newId("aff"), person.id, hit.universityId, `Page names ${hit.label}`, claim.id);
        campuses++;
      }
    }
  }

  const upsertGate = db.prepare(
    `INSERT INTO gate_results (id, project_id, gate_name, result, rationale, evaluated_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(project_id, gate_name) DO UPDATE SET result=excluded.result, rationale=excluded.rationale, evaluated_at=excluded.evaluated_at`
  );
  for (const projectId of fundingProjects) {
    const gateFacts = assembleProjectFacts(db, projectId);
    for (const outcome of evaluateAllGates(gateFacts)) upsertGate.run(newId("gate"), projectId, outcome.gate, outcome.result, outcome.rationale);
  }
  console.log(`Removed ${drop.size} facts that were about a different organization. Re-checked campuses (${campuses} kept).`);
}

function main() {
  const dryRun = process.argv.includes("--dry-run");
  const repairOnly = process.argv.includes("--repair-only");
  if (process.argv.some((arg) => arg.startsWith("--") && arg !== "--dry-run" && arg !== "--repair-only")) {
    console.error("Unknown argument. Supported flags: --dry-run, --repair-only");
    process.exit(1);
  }
  return run(dryRun, repairOnly);
}

async function run(dryRun: boolean, repairOnly = false) {
  const db = getDb();
  const before = audit(db);
  printCounts("Before", before);
  if (dryRun) {
    console.log("\nDry run only. No rows were changed and no pages were fetched.");
    return;
  }
  if (repairOnly) {
    repairLooseFacts(db);
    db.pragma("wal_checkpoint(TRUNCATE)");
    printCounts("After", audit(db));
    return;
  }

  const retrievedAt = nowIso();
  db.prepare(
    `INSERT INTO sources (id, name, family, url, campuses_json, priority, ingestion_mode, status, last_attempt_at, last_success_at)
     VALUES (?, 'Unknown sweep public pages', 'reference', 'https://campus-scout.local/unknown-sweep', '[]', 3, 'html_scrape', 'available', ?, ?)
     ON CONFLICT(id) DO UPDATE SET last_success_at=excluded.last_success_at, last_attempt_at=excluded.last_attempt_at, status='available'`
  ).run(SOURCE_ID, retrievedAt, retrievedAt);

  const insertFact = db.prepare(
    `INSERT INTO company_facts (id, project_id, fact_key, value_text, amount_usd, amount_status, detail_json, source_url, excerpt, origin, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insertClaim = db.prepare(
    `INSERT INTO claims (id, entity_type, entity_id, claim_type, value_json, excerpt, source_id, source_url, retrieved_at, label, verification_state)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'observed_fact', 'unverified')`
  );
  const insertFunding = db.prepare(
    `INSERT INTO funding_events (id, project_id, amount, currency, instrument, event_date, dedupe_key, claim_id)
     VALUES (?, ?, ?, 'USD', 'unknown', NULL, ?, ?)
     ON CONFLICT(dedupe_key) DO NOTHING`
  );
  const upsertGate = db.prepare(
    `INSERT INTO gate_results (id, project_id, gate_name, result, rationale, evaluated_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(project_id, gate_name) DO UPDATE SET result=excluded.result, rationale=excluded.rationale, evaluated_at=excluded.evaluated_at`
  );
  const touched = new Set<string>();

  function addFact(input: {
    projectId: string;
    factKey: string;
    valueText: string;
    amountUsd?: number | null;
    amountStatus?: string | null;
    detail?: Record<string, unknown>;
    sourceUrl: string;
    excerpt: string;
    origin: string;
  }) {
    if (!input.sourceUrl.startsWith("http") || input.excerpt.trim().length < 8) return;
    if (hasFact(db, input.projectId, input.factKey) && input.factKey !== "funding_round" && input.factKey !== "investor") return;
    if (input.factKey === "funding_round" || input.factKey === "investor") {
      const existing = db
        .prepare(`SELECT 1 FROM company_facts WHERE project_id = ? AND fact_key = ? AND value_text = ? LIMIT 1`)
        .get(input.projectId, input.factKey, input.valueText);
      if (existing) return;
    }
    insertFact.run(
      newId("fact"),
      input.projectId,
      input.factKey,
      input.valueText,
      input.amountUsd ?? null,
      input.amountStatus ?? null,
      JSON.stringify(input.detail ?? {}),
      input.sourceUrl,
      input.excerpt.slice(0, 500),
      input.origin,
      retrievedAt,
    );
    if (input.factKey === "funding_round" || input.factKey === "funding_total") touched.add(input.projectId);
  }

  const local = db.transaction(() => {
    let websites = 0;
    let descriptions = 0;
    let sectors = 0;
    let campuses = 0;
    let years = 0;

    const companies = db
      .prepare(
        `SELECT id, name, description, website_url, primary_link FROM projects
         WHERE kind='company' AND is_investable_candidate=1`
      )
      .all() as { id: string; name: string; description: string | null; website_url: string | null; primary_link: string | null }[];

    const claimUrl = db.prepare(
      `SELECT source_url FROM claims WHERE entity_type='project' AND entity_id=? AND source_url LIKE 'http%' ORDER BY length(excerpt) DESC LIMIT 1`
    );
    for (const company of companies) {
      const swapped = preferOfficialWebsite(company.website_url, company.primary_link);
      if (swapped && swapped.website !== company.website_url) {
        db.prepare(`UPDATE projects SET website_url=?, primary_link=?, updated_at=? WHERE id=?`).run(
          swapped.website,
          swapped.primary,
          retrievedAt,
          company.id,
        );
        company.website_url = swapped.website;
        company.primary_link = swapped.primary;
        websites++;
      }
      if (company.website_url && isOfficialProductHost(company.website_url) && !hasFact(db, company.id, "website")) {
        addFact({
          projectId: company.id,
          factKey: "website",
          valueText: company.website_url,
          sourceUrl: company.website_url,
          excerpt: `Stored company website: ${company.website_url}`,
          origin: "stored_description",
        });
      }
      const description = (company.description ?? "").replace(/\s+/g, " ").trim();
      if (description.length >= 25 && !isBoilerplateDescription(description) && !hasFact(db, company.id, "description")) {
        const source = (claimUrl.get(company.id) as { source_url: string } | undefined)?.source_url || company.primary_link || company.website_url;
        if (source && source.startsWith("http")) {
          addFact({
            projectId: company.id,
            factKey: "description",
            valueText: description.slice(0, 420),
            sourceUrl: source,
            excerpt: description.slice(0, 420),
            origin: "stored_description",
          });
          descriptions++;
        }
      }
    }

    const untagged = db
      .prepare(
        `SELECT p.id, p.name, p.description, p.website_url, p.primary_link FROM projects p
         WHERE p.kind='company' AND p.is_investable_candidate=1
           AND p.id NOT IN (SELECT project_id FROM project_sector_tags)`
      )
      .all() as { id: string; name: string; description: string | null; website_url: string | null; primary_link: string | null }[];
    const claimExcerpt = db.prepare(
      `SELECT excerpt, source_url FROM claims WHERE entity_type='project' AND entity_id=? AND length(excerpt) > 40 ORDER BY length(excerpt) DESC LIMIT 3`
    );
    const insertTag = db.prepare(
      `INSERT INTO project_sector_tags (id, project_id, tag, is_primary, excerpt, source_url) VALUES (?, ?, ?, ?, ?, ?)`
    );
    for (const company of untagged) {
      let text = company.description;
      let sourceUrl = company.website_url || company.primary_link;
      if (isBoilerplateDescription(text)) {
        const claims = claimExcerpt.all(company.id) as { excerpt: string; source_url: string | null }[];
        const useful = claims.find((claim) => !isBoilerplateDescription(claim.excerpt));
        text = useful?.excerpt ?? null;
        sourceUrl = useful?.source_url || sourceUrl;
      }
      const hits = classifyDescription(text, company.name);
      if (hits.length === 0 || !sourceUrl || !sourceUrl.startsWith("http")) continue;
      hits.forEach((hit, index) => insertTag.run(newId("sect"), company.id, hit.tag, index === 0 ? 1 : 0, hit.excerpt, sourceUrl));
      db.prepare(`UPDATE projects SET sector=?, updated_at=? WHERE id=?`).run(sectorLabel(hits[0].tag), retrievedAt, company.id);
      touched.add(company.id);
      sectors++;
    }

    const unaffiliated = db.prepare(`SELECT id FROM people WHERE id NOT IN (SELECT person_id FROM affiliations)`).all() as { id: string }[];
    const personClaims = db.prepare(`SELECT id, excerpt, claim_type FROM claims WHERE entity_id=? AND length(excerpt) > 20`);
    const hasAff = db.prepare(`SELECT 1 FROM affiliations WHERE person_id=? AND university_id=?`);
    const insertAff = db.prepare(
      `INSERT INTO affiliations (id, person_id, university_id, role, status, claim_id) VALUES (?, ?, ?, ?, 'unverified', ?)`
    );
    for (const person of unaffiliated) {
      const claims = personClaims.all(person.id) as { id: string; excerpt: string; claim_type: string }[];
      const personName = (db.prepare(`SELECT name FROM people WHERE id=?`).get(person.id) as { name: string } | undefined)?.name ?? "";
      const seen = new Set<string>();
      for (const claim of claims) {
        for (const hit of schoolHitsInPersonExcerpt(claim.excerpt, { personName, claimType: claim.claim_type })) {
          if (seen.has(hit.universityId) || hasAff.get(person.id, hit.universityId)) continue;
          seen.add(hit.universityId);
          insertAff.run(newId("aff"), person.id, hit.universityId, `Page names ${hit.label}`, claim.id);
          campuses++;
        }
      }
    }

    const unknownPeople = db.prepare(`SELECT id FROM people WHERE enrollment_status IS NULL OR enrollment_status = 'unknown'`).all() as { id: string }[];
    for (const person of unknownPeople) {
      const beforeStatus = "unknown";
      const decision = recomputePersonEnrollment(db, person.id);
      if (decision.status !== beforeStatus || decision.gradYear != null) years++;
    }

    return { websites, descriptions, sectors, campuses, years };
  })();
  console.log(
    `Local fills: ${local.websites} website promotions, ${local.descriptions} descriptions, ${local.sectors} sectors, ${local.campuses} campuses, ${local.years} enrollment updates.`,
  );

  const targets = db
    .prepare(
      `SELECT id, website_url FROM projects
       WHERE kind='company' AND is_investable_candidate=1 AND website_url LIKE 'http%'`
    )
    .all() as { id: string; website_url: string }[];
  const grasp = db
    .prepare(
      `SELECT id, website_url, primary_link FROM projects
       WHERE kind='company' AND is_investable_candidate=1
         AND (website_url LIKE '%grasp.upenn.edu/startups/%' OR primary_link LIKE '%grasp.upenn.edu/startups/%')`
    )
    .all() as { id: string; website_url: string | null; primary_link: string | null }[];

  let graspSites = 0;
  await mapPool(grasp, 4, async (company) => {
    const pageUrl = [company.website_url, company.primary_link].find((url) => url?.includes("grasp.upenn.edu/startups/"));
    if (!pageUrl) return;
    try {
      const bits = pageBits(await fetchHtml(pageUrl));
      const site = labeledOfficialWebsite(bits.anchors);
      if (!site) return;
      const current = db.prepare(`SELECT website_url, primary_link FROM projects WHERE id=?`).get(company.id) as {
        website_url: string | null;
        primary_link: string | null;
      };
      if (current.website_url && isOfficialProductHost(current.website_url)) return;
      db.prepare(`UPDATE projects SET website_url=?, primary_link=?, updated_at=? WHERE id=?`).run(
        site,
        current.website_url && current.website_url.startsWith("http") ? current.website_url : pageUrl,
        retrievedAt,
        company.id,
      );
      addFact({
        projectId: company.id,
        factKey: "website",
        valueText: site,
        sourceUrl: pageUrl,
        excerpt: `Website: ${site}`,
        origin: "company_site",
      });
      graspSites++;
    } catch {
      /* the directory page did not state a product site */
    }
  });
  console.log(`GRASP pages named ${graspSites} product websites.`);

  const sharedUrls = new Set(
    (
      db.prepare(
        `SELECT website_url FROM projects
         WHERE kind='company' AND website_url LIKE 'http%'
         GROUP BY website_url HAVING COUNT(*) > 1`
      ).all() as { website_url: string }[]
    ).map((row) => row.website_url),
  );
  const toFetch = (
    db
      .prepare(
        `SELECT id, name, website_url, description FROM projects
         WHERE kind='company' AND is_investable_candidate=1 AND website_url LIKE 'http%'`
      )
      .all() as { id: string; name: string; website_url: string; description: string | null }[]
  ).filter((company) => {
    if (!isOfficialProductHost(company.website_url)) return false;
    if (isPublisherPage(company.website_url) || sharedUrls.has(company.website_url)) return false;
    return (
      !hasFact(db, company.id, "founded_year") ||
      !hasFact(db, company.id, "hq") ||
      !hasFact(db, company.id, "company_linkedin") ||
      !hasFact(db, company.id, "team_size") ||
      (!hasFact(db, company.id, "funding_total") && !hasFact(db, company.id, "funding_round")) ||
      !hasFact(db, company.id, "description")
    );
  });
  console.log(`Reading ${toFetch.length} company sites.`);

  const foundersByProject = new Map<string, { id: string; name: string }[]>();
  for (const row of db
    .prepare(
      `SELECT ppr.project_id, pe.id, pe.name FROM person_project_roles ppr
       JOIN people pe ON pe.id = ppr.person_id
       WHERE ppr.role LIKE '%founder%'`
    )
    .all() as { project_id: string; id: string; name: string }[]) {
    const list = foundersByProject.get(row.project_id) ?? [];
    list.push({ id: row.id, name: row.name });
    foundersByProject.set(row.project_id, list);
  }

  let fetched = 0;
  let failed = 0;
  let classYears = 0;
  await mapPool(toFetch, CONCURRENCY, async (company) => {
    try {
      const bits = pageBits(await fetchHtml(company.website_url));
      fetched++;
      if (!hasFact(db, company.id, "founded_year")) {
        const year = foundedYearIn(bits.text);
        if (year) {
          addFact({
            projectId: company.id,
            factKey: "founded_year",
            valueText: String(year.year),
            sourceUrl: company.website_url,
            excerpt: year.excerpt,
            origin: "company_site",
          });
        }
      }
      if (!hasFact(db, company.id, "hq")) {
        const hq = headquartersIn(bits.text);
        if (hq && headquartersExcerptOk(hq.excerpt, company.name)) {
          addFact({
            projectId: company.id,
            factKey: "hq",
            valueText: hq.place,
            sourceUrl: company.website_url,
            excerpt: hq.excerpt,
            origin: "company_site",
          });
        }
      }
      if (!hasFact(db, company.id, "company_linkedin")) {
        const linkedin = companyLinkedInIn(bits.hrefs);
        if (linkedin) {
          addFact({
            projectId: company.id,
            factKey: "company_linkedin",
            valueText: linkedin,
            sourceUrl: company.website_url,
            excerpt: `LinkedIn: ${linkedin}`,
            origin: "company_site",
          });
        }
      }
      if (!hasFact(db, company.id, "team_size")) {
        const team = teamSizeIn(bits.text);
        if (team) {
          addFact({
            projectId: company.id,
            factKey: "team_size",
            valueText: String(team.size),
            sourceUrl: company.website_url,
            excerpt: team.excerpt,
            origin: "company_site",
          });
        }
      }
      if (!hasFact(db, company.id, "funding_total") && !hasFact(db, company.id, "funding_round")) {
        const raise = announcedRaiseIn(bits.text);
        if (raise && excerptNamesCompany(raise.excerpt, company.name)) {
          const claimId = newId("claim");
          insertClaim.run(
            claimId,
            "project",
            company.id,
            "funding",
            JSON.stringify({ amountUsd: raise.amountUsd, stage: raise.stage }),
            raise.excerpt.slice(0, 500),
            SOURCE_ID,
            company.website_url,
            retrievedAt,
          );
          if (raise.stage) {
            addFact({
              projectId: company.id,
              factKey: "funding_round",
              valueText: `${raise.stage}|${raise.amountText}`,
              amountUsd: raise.amountUsd,
              amountStatus: "announced",
              detail: { stage: raise.stage, amountText: raise.amountText, date: null, leads: [] },
              sourceUrl: company.website_url,
              excerpt: raise.excerpt,
              origin: "company_site",
            });
          } else {
            addFact({
              projectId: company.id,
              factKey: "funding_total",
              valueText: `${raise.amountText} announced`,
              amountUsd: raise.amountUsd,
              amountStatus: "announced",
              sourceUrl: company.website_url,
              excerpt: raise.excerpt,
              origin: "company_site",
            });
          }
          const key = crypto.createHash("sha256").update(`${company.id}|${raise.amountUsd}|${raise.stage ?? ""}`).digest("hex").slice(0, 40);
          insertFunding.run(newId("fund"), company.id, raise.amountUsd, key, claimId);
        }
      }
      if (!hasFact(db, company.id, "description") && bits.meta) {
        addFact({
          projectId: company.id,
          factKey: "description",
          valueText: bits.meta,
          sourceUrl: company.website_url,
          excerpt: bits.meta,
          origin: "company_site",
        });
        if (isBoilerplateDescription(company.description) || !(company.description ?? "").trim()) {
          db.prepare(`UPDATE projects SET description=?, updated_at=? WHERE id=?`).run(bits.meta, retrievedAt, company.id);
        }
      }
      if (!db.prepare(`SELECT 1 FROM project_sector_tags WHERE project_id=?`).get(company.id)) {
        const text = !isBoilerplateDescription(company.description)
          ? company.description
          : bits.meta && excerptNamesCompany(bits.meta, company.name)
            ? bits.meta
            : null;
        const hits = classifyDescription(text, company.name);
        if (hits.length > 0) {
          const insertTag = db.prepare(
            `INSERT INTO project_sector_tags (id, project_id, tag, is_primary, excerpt, source_url) VALUES (?, ?, ?, ?, ?, ?)`
          );
          hits.forEach((hit, index) => insertTag.run(newId("sect"), company.id, hit.tag, index === 0 ? 1 : 0, hit.excerpt, company.website_url));
          db.prepare(`UPDATE projects SET sector=?, updated_at=? WHERE id=?`).run(sectorLabel(hits[0].tag), retrievedAt, company.id);
          touched.add(company.id);
        }
      }
      for (const founder of foundersByProject.get(company.id) ?? []) {
        const person = db.prepare(`SELECT enrollment_status FROM people WHERE id=?`).get(founder.id) as { enrollment_status: string | null };
        if (person.enrollment_status && person.enrollment_status !== "unknown") continue;
        if (founder.name.trim().split(/\s+/).length < 2) continue;
        const idx = bits.text.toLowerCase().indexOf(founder.name.toLowerCase());
        if (idx < 0) continue;
        const window = bits.text.slice(Math.max(0, idx - 40), Math.min(bits.text.length, idx + founder.name.length + 90));
        if (!/\b(founder|co-founder|ceo|cto|studied|class of|degree|major)\b/i.test(window)) continue;
        const decision = decideEnrollment([{ excerpt: window, sourceUrl: company.website_url, sourceId: SOURCE_ID }], { personName: founder.name });
        if (decision.gradYear == null || !decision.evidence) continue;
        insertClaim.run(
          newId("claim"),
          "person",
          founder.id,
          "source_mention",
          JSON.stringify({ gradYear: decision.gradYear }),
          decision.evidence.slice(0, 500),
          SOURCE_ID,
          company.website_url,
          retrievedAt,
        );
        recomputePersonEnrollment(db, founder.id);
        classYears++;
      }
    } catch {
      failed++;
    }
  });
  console.log(`Company sites read ${fetched}, failed ${failed}, class years added ${classYears}.`);

  const gateTx = db.transaction(() => {
    for (const projectId of touched) {
      const facts = assembleProjectFacts(db, projectId);
      for (const outcome of evaluateAllGates(facts)) {
        upsertGate.run(newId("gate"), projectId, outcome.gate, outcome.result, outcome.rationale);
      }
    }
  });
  gateTx();
  db.pragma("wal_checkpoint(TRUNCATE)");

  const after = audit(db);
  printCounts("After", after);
  console.log(`\nTargets considered with a stored URL: ${targets.length}.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
