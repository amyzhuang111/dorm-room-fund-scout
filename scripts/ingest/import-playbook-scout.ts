// Import a judged playbook scouting file:
//   { companies, people, updates }
//
//   npx tsx scripts/ingest/import-playbook-scout.ts data/exports/playbook-scouted-2026-09-25.json
//
// New companies and people are inserted. A record is merged into an existing
// row when the normalized name, website domain, or LinkedIn slug matches one
// person/project. Aura, Relay and Caravan are name clashes with different
// products and stay separate. Updates only add claims, links and aliases to
// the ids already in the file. Enrollment is recomputed from excerpts.

import fs from "node:fs";
import { getDb, newId, nowIso } from "../../lib/db/client";
import { CAMPUSES } from "../../lib/domain/campuses";
import { linkKind } from "../../lib/domain/company-link";
import { recomputePersonEnrollment } from "../../lib/domain/enrollment-store";
import { SECTORS } from "../../lib/domain/sectors";
import { isSignalTier, preferSignalTier } from "../../lib/domain/signal-tier";

const SECTOR_IDS = new Set(SECTORS.map((s) => s.id));
const SEARCH_URL = "https://html.duckduckgo.com/html/";

interface ScoutClaim {
  claim_type?: string;
  source_id?: string;
  source_name?: string;
  source_url?: string | null;
  excerpt?: string;
  published_date?: string | null;
  retrieved_at?: string;
  label?: string;
  verification_state?: string;
  value_json?: unknown;
}

interface ScoutCompany {
  id: string;
  name: string;
  aliases_json?: string[];
  kind?: string;
  sector?: string | null;
  sector_tags?: { tag: string; is_primary?: boolean; excerpt?: string }[];
  description?: string | null;
  website_url?: string | null;
  primary_link?: string | null;
  primary_link_kind?: string | null;
  campus_id?: string | null;
  flags?: string[];
  founders?: string[];
  programs?: string[];
  is_investable_candidate?: boolean;
  claims?: ScoutClaim[];
  signal_tier?: string | null;
  signal_tier_basis?: string | null;
}

interface ScoutPerson {
  id: string;
  name: string;
  aliases_json?: string[];
  campus_id?: string | null;
  affiliation?: { university_id?: string | null; role?: string | null; status?: string | null } | null;
  projects?: { project_name: string; role?: string; role_detail?: string }[];
  enrollment_status?: string | null;
  enrollment_evidence?: string | null;
  linkedin?: string | null;
  linkedin_status?: string | null;
  linkedin_evidence?: string | null;
  claims?: ScoutClaim[];
  signal_tier?: string | null;
  signal_tier_basis?: string | null;
  left_school?: boolean | null;
}

interface ScoutProjectLink {
  project_name: string;
  role?: string;
}

interface ScoutUpdate {
  entity_type: string;
  repo_entity_id: string;
  name: string;
  new_claims?: ScoutClaim[];
  new_links?: string[] | null;
  new_aliases?: string[] | null;
  founders?: string[] | null;
  programs?: string[] | null;
  new_projects?: ScoutProjectLink[] | null;
  linkedin?: string | null;
  linkedin_status?: string | null;
  linkedin_evidence?: string | null;
  enrollment_status?: string | null;
  signal_tier?: string | null;
  signal_tier_basis?: string | null;
  notes?: string[] | null;
  left_school?: boolean | null;
}

function normName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(inc|llc|ltd|corp|co)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^the /, "");
}

function tokensOf(name: string): string[] {
  return normName(name).split(" ").filter(Boolean);
}

function domainOf(url: string | null | undefined): string | null {
  if (!url) return null;
  const clean = url.match(/https?:\/\/[^\s)]+/)?.[0];
  if (!clean) return null;
  try {
    const host = new URL(clean).hostname.replace(/^www\./, "").toLowerCase();
    if (
      !host ||
      host.includes("linkedin.com") ||
      host.includes("devpost.com") ||
      host.endsWith(".edu") ||
      host.includes("airtable.com") ||
      host.includes("wikipedia.org") ||
      host.includes("crunchbase.com") ||
      host.includes("ycombinator.com")
    ) {
      return null;
    }
    return host;
  } catch {
    return null;
  }
}

function cleanUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const match = url.match(/https?:\/\/[^\s)]+/);
  return match ? match[0] : null;
}

function linkedInUrl(url: string | null | undefined): string | null {
  const clean = cleanUrl(url);
  if (!clean || !clean.includes("linkedin.com/in/")) return null;
  try {
    const parsed = new URL(clean);
    const slug = parsed.pathname.split("/in/")[1]?.split("/")[0];
    if (!slug) return null;
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    const storedHost = host === "linkedin.com" ? "www.linkedin.com" : parsed.hostname.toLowerCase();
    return `https://${storedHost}/in/${slug}`;
  } catch {
    return null;
  }
}

function linkedInSlug(url: string | null | undefined): string | null {
  const canonical = linkedInUrl(url);
  if (!canonical) return null;
  return canonical.split("/in/")[1]?.toLowerCase() ?? null;
}

function familyOf(sourceId: string): string {
  if (/hack|devfest|devpost/.test(sourceId)) return "hackathon";
  if (/vip_x|free_ventures|desai|create_x|cardinal|accelerator/.test(sourceId)) return "accelerator";
  if (/pci|portfolio/.test(sourceId)) return "portfolio_directory";
  if (/senior_design|widjaja|showcase|pennovation/.test(sourceId)) return "event";
  return "competition";
}

function httpUrl(url: string | null | undefined): string | null {
  const clean = cleanUrl(url);
  if (!clean || !/^https?:\/\//.test(clean)) return null;
  return clean;
}

// A roster line lists several people. Keep the clause that names this person
// so a teammate's class year is not stored as this person's evidence.
function excerptForPerson(name: string, excerpt: string): string {
  const parts = excerpt
    .split(/[;|]/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length < 2) return excerpt;
  const tokens = tokensOf(name).filter((token) => token.length >= 3);
  if (tokens.length === 0) return excerpt;
  const hits = parts.filter((part) => {
    const normalized = normName(part);
    return tokens.every((token) => normalized.includes(token));
  });
  return hits.length > 0 ? hits.join("; ") : excerpt;
}

function main() {
  const filePath = process.argv[2] || "data/exports/playbook-scouted-2026-09-25.json";
  const data = JSON.parse(fs.readFileSync(filePath, "utf8")) as {
    companies: ScoutCompany[];
    people: ScoutPerson[];
    updates: ScoutUpdate[];
  };
  const db = getDb();
  const now = nowIso();

  const countCompanies = () =>
    (
      db.prepare(`SELECT COUNT(*) as n FROM projects WHERE kind = 'company' AND is_investable_candidate = 1`).get() as { n: number }
    ).n;
  const countPeople = () => (db.prepare(`SELECT COUNT(*) as n FROM people`).get() as { n: number }).n;
  const countLinkedIn = () =>
    (db.prepare(`SELECT COUNT(*) as n FROM people WHERE aliases_json LIKE '%linkedin.com/in/%'`).get() as { n: number }).n;
  const byCampus = (sql: string) => db.prepare(sql).all() as { campus: string; n: number }[];

  const companyCampusSql = `
    WITH link AS (
      SELECT ppr.project_id as project_id, a.university_id as university_id
      FROM person_project_roles ppr
      JOIN affiliations a ON a.person_id = ppr.person_id AND ppr.role LIKE '%founder%'
      UNION
      SELECT r.source_entity_id, r.target_entity_id
      FROM relationships r
      WHERE r.source_entity_type = 'project' AND r.target_entity_type = 'university' AND r.relationship_type = 'affiliated_with'
    )
    SELECT link.university_id as campus, COUNT(DISTINCT p.id) as n
    FROM projects p JOIN link ON link.project_id = p.id
    WHERE p.kind = 'company' AND p.is_investable_candidate = 1
    GROUP BY link.university_id ORDER BY campus`;
  const peopleCampusSql = `SELECT university_id as campus, COUNT(DISTINCT person_id) as n FROM affiliations GROUP BY university_id ORDER BY campus`;
  const liCampusSql = `
    SELECT a.university_id as campus, COUNT(DISTINCT pe.id) as n
    FROM people pe JOIN affiliations a ON a.person_id = pe.id
    WHERE pe.aliases_json LIKE '%linkedin.com/in/%'
    GROUP BY a.university_id ORDER BY campus`;

  const before = {
    companies: countCompanies(),
    people: countPeople(),
    linkedin: countLinkedIn(),
    companiesByCampus: byCampus(companyCampusSql),
    peopleByCampus: byCampus(peopleCampusSql),
    linkedinByCampus: byCampus(liCampusSql),
  };
  console.log("BEFORE", JSON.stringify(before));

  const projectsByNorm = new Map<string, string[]>();
  const projectDomain = new Map<string, string[]>();
  const projectText = new Map<string, string>();
  function rememberProject(id: string, name: string, website: string | null) {
    const n = normName(name);
    if (!n) return;
    const list = projectsByNorm.get(n) ?? [];
    if (!list.includes(id)) list.push(id);
    projectsByNorm.set(n, list);
    const domain = domainOf(website);
    if (domain) {
      const dl = projectDomain.get(domain) ?? [];
      if (!dl.includes(id)) dl.push(id);
      projectDomain.set(domain, dl);
    }
  }
  for (const row of db.prepare(`SELECT id, name, aliases_json, website_url, description FROM projects`).all() as {
    id: string;
    name: string;
    aliases_json: string;
    website_url: string | null;
    description: string | null;
  }[]) {
    rememberProject(row.id, row.name, row.website_url);
    let aliases: unknown[] = [];
    try {
      aliases = JSON.parse(row.aliases_json || "[]");
    } catch {
      aliases = [];
    }
    for (const alias of aliases) {
      if (typeof alias === "string") rememberProject(row.id, alias, null);
    }
    const people = db
      .prepare(
        `SELECT pe.name as name FROM person_project_roles ppr JOIN people pe ON pe.id = ppr.person_id WHERE ppr.project_id = ?`
      )
      .all(row.id) as { name: string }[];
    projectText.set(row.id, `${row.name} ${row.description ?? ""} ${people.map((p) => p.name).join(" ")}`.toLowerCase());
  }

  const peopleByNorm = new Map<string, string[]>();
  const peopleBySlug = new Map<string, string[]>();
  const peopleTokens = new Map<string, string[]>();
  function rememberPerson(id: string, name: string, aliasesJson: string) {
    const n = normName(name);
    const list = peopleByNorm.get(n) ?? [];
    if (!list.includes(id)) list.push(id);
    peopleByNorm.set(n, list);
    peopleTokens.set(id, tokensOf(name));
    let aliases: string[] = [];
    try {
      aliases = JSON.parse(aliasesJson || "[]");
    } catch {
      aliases = [];
    }
    for (const alias of aliases) {
      const slug = linkedInSlug(alias.replace(/^linkedin:/, ""));
      if (!slug) continue;
      const sl = peopleBySlug.get(slug) ?? [];
      if (!sl.includes(id)) sl.push(id);
      peopleBySlug.set(slug, sl);
    }
  }
  for (const row of db.prepare(`SELECT id, name, aliases_json FROM people`).all() as { id: string; name: string; aliases_json: string }[]) {
    rememberPerson(row.id, row.name, row.aliases_json);
  }

  const mergedProjects: string[] = [];
  const mergedPeople: string[] = [];
  const skipped: string[] = [];
  const separate: string[] = [];
  const touchedPeople = new Set<string>();
  const scoutProjectId = new Map<string, string>();

  const insertClaim = db.prepare(
    `INSERT INTO claims (id, entity_type, entity_id, claim_type, value_json, excerpt, source_id, source_url, published_date, retrieved_at, label, verification_state)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const claimExists = db.prepare(
    `SELECT id FROM claims WHERE entity_type = ? AND entity_id = ? AND claim_type = ? AND source_url = ? AND excerpt = ? LIMIT 1`
  );

  function addClaim(entityType: string, entityId: string, claim: ScoutClaim, fallbackSource: string): string | null {
    const excerpt = (claim.excerpt || "").trim();
    if (!excerpt) return null;
    const sourceUrl = cleanUrl(claim.source_url) || (claim.claim_type === "linkedin_web_search_attempt" ? SEARCH_URL : null);
    if (!sourceUrl) {
      skipped.push(`claim without URL on ${entityType} ${entityId}`);
      return null;
    }
    const claimType = claim.claim_type || "source_mention";
    const existing = claimExists.get(entityType, entityId, claimType, sourceUrl, excerpt) as { id: string } | undefined;
    if (existing) return existing.id;
    const id = newId("claim");
    const value = JSON.stringify(claim.value_json ?? { excerpt });
    insertClaim.run(
      id,
      entityType,
      entityId,
      claimType,
      value,
      excerpt,
      claim.source_id || fallbackSource,
      sourceUrl,
      claim.published_date || null,
      claim.retrieved_at || now,
      claim.label || "observed_fact",
      claim.verification_state || "unverified"
    );
    return id;
  }

  const tx = db.transaction(() => {
    const seed = db.prepare(
      `INSERT INTO universities (id, name, aliases_json, country, lat, lon, coord_source)
       VALUES (@id, @name, @aliases, @country, @lat, @lon, @coord_source)
       ON CONFLICT(id) DO UPDATE SET name=excluded.name, aliases_json=excluded.aliases_json,
         country=excluded.country, lat=excluded.lat, lon=excluded.lon, coord_source=excluded.coord_source`
    );
    for (const campus of CAMPUSES) {
      seed.run({
        id: campus.id,
        name: campus.name,
        aliases: JSON.stringify(campus.aliases),
        country: campus.country,
        lat: campus.lat,
        lon: campus.lon,
        coord_source: campus.coordSource,
      });
    }

    const sourceMeta = new Map<string, { name: string; url: string; campuses: Set<string>; companies: number }>();
    function noteSource(claim: ScoutClaim, campusId: string | null, isCompany: boolean) {
      if (!claim.source_id) return;
      const url = cleanUrl(claim.source_url) || SEARCH_URL;
      const cur = sourceMeta.get(claim.source_id) ?? {
        name: claim.source_name || claim.source_id,
        url,
        campuses: new Set<string>(),
        companies: 0,
      };
      if (claim.source_name) cur.name = claim.source_name;
      if (claim.source_url && cur.url === SEARCH_URL) cur.url = url;
      if (campusId) cur.campuses.add(campusId);
      if (isCompany) cur.companies += 1;
      sourceMeta.set(claim.source_id, cur);
    }
    for (const company of data.companies) {
      for (const claim of company.claims ?? []) noteSource(claim, company.campus_id ?? null, true);
    }
    for (const person of data.people) {
      for (const claim of person.claims ?? []) noteSource(claim, person.campus_id ?? null, false);
    }
    for (const update of data.updates) {
      for (const claim of update.new_claims ?? []) noteSource(claim, null, false);
    }
    const upsertSource = db.prepare(
      `INSERT INTO sources (id, name, family, url, campuses_json, priority, ingestion_mode, status, last_attempt_at, last_success_at, discovered_lead_count)
       VALUES (?, ?, ?, ?, ?, ?, 'manual', 'available', ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name=excluded.name, url=excluded.url, campuses_json=excluded.campuses_json,
         last_attempt_at=excluded.last_attempt_at, last_success_at=excluded.last_success_at,
         discovered_lead_count=excluded.discovered_lead_count`
    );
    for (const [id, meta] of sourceMeta) {
      const priority = /hack|devfest|pci/.test(id) ? 3 : 2;
      upsertSource.run(id, meta.name, familyOf(id), meta.url, JSON.stringify([...meta.campuses]), priority, now, now, meta.companies);
    }

    function collision(company: ScoutCompany): boolean {
      return (company.flags ?? []).some((flag) => flag.includes("name_collision"));
    }

    function matchCompany(company: ScoutCompany): { id: string; reason: string } | null {
      if (collision(company)) return null;
      const n = normName(company.name);
      const exact = projectsByNorm.get(n) ?? [];
      if (exact.length === 1) return { id: exact[0], reason: "normalized name" };
      const domain = domainOf(company.website_url);
      if (domain) {
        const hits = projectDomain.get(domain) ?? [];
        if (hits.length === 1) return { id: hits[0], reason: `domain ${domain}` };
      }
      if (n.split(" ").length < 2) return null;
      const prefix: string[] = [];
      for (const [existing, ids] of projectsByNorm) {
        if (existing.startsWith(`${n} `) || n.startsWith(`${existing} `)) prefix.push(...ids);
      }
      const surnames = (company.founders ?? []).map((name) => tokensOf(name).at(-1)).filter((t): t is string => Boolean(t && t.length >= 4));
      const confirmed = [...new Set(prefix)].filter((id) => {
        const text = projectText.get(id) ?? "";
        return surnames.filter((s) => text.includes(s)).length >= 2;
      });
      if (confirmed.length === 1) return { id: confirmed[0], reason: "name prefix and shared founders" };
      return null;
    }

    function applyTier(table: "people" | "projects", id: string, tier: string | null | undefined, basis: string | null | undefined) {
      if (!isSignalTier(tier)) return;
      const row = db.prepare(`SELECT signal_tier FROM ${table} WHERE id = ?`).get(id) as { signal_tier: string | null };
      if (preferSignalTier(row.signal_tier, tier) !== tier || row.signal_tier === tier) return;
      db.prepare(`UPDATE ${table} SET signal_tier = ?, signal_tier_basis = ? WHERE id = ?`).run(tier, basis ?? null, id);
    }

    const insertProject = db.prepare(
      `INSERT INTO projects (id, name, aliases_json, kind, sector, description, website_url, primary_link, primary_link_kind, is_portfolio_reference, is_investable_candidate, signal_tier, signal_tier_basis, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)`
    );
    const insertRel = db.prepare(
      `INSERT INTO relationships (id, source_entity_type, source_entity_id, target_entity_type, target_entity_id, relationship_type, evidence_claim_ids_json, verification_state)
       VALUES (?, 'project', ?, 'university', ?, 'affiliated_with', ?, 'affiliation_only')`
    );
    const relExists = db.prepare(
      `SELECT id FROM relationships WHERE source_entity_type = 'project' AND source_entity_id = ? AND target_entity_type = 'university' AND target_entity_id = ? AND relationship_type = 'affiliated_with'`
    );
    const insertTag = db.prepare(
      `INSERT OR IGNORE INTO project_sector_tags (id, project_id, tag, is_primary, excerpt, source_url) VALUES (?, ?, ?, ?, ?, ?)`
    );

    function linkCampus(projectId: string, campusId: string | null, claimId: string | null) {
      if (!campusId) return;
      if (relExists.get(projectId, campusId)) return;
      insertRel.run(newId("rel"), projectId, campusId, JSON.stringify(claimId ? [claimId] : []));
    }

    function addTags(projectId: string, company: ScoutCompany) {
      const sourceUrl = cleanUrl(company.claims?.[0]?.source_url);
      for (const tag of company.sector_tags ?? []) {
        if (!SECTOR_IDS.has(tag.tag)) {
          skipped.push(`unknown sector tag ${tag.tag} on ${company.name}`);
          continue;
        }
        insertTag.run(newId("tag"), projectId, tag.tag, tag.is_primary ? 1 : 0, tag.excerpt || company.description || company.name, sourceUrl);
      }
    }

    function addPrograms(projectId: string, programs: string[] | null | undefined, claim: ScoutClaim | undefined) {
      for (const program of programs ?? []) {
        const text = program.trim();
        if (!text) continue;
        addClaim(
          "project",
          projectId,
          {
            claim_type: "program_membership",
            source_id: claim?.source_id,
            source_url: claim?.source_url,
            excerpt: text,
            published_date: claim?.published_date,
            retrieved_at: claim?.retrieved_at,
            label: "observed_fact",
            verification_state: "unverified",
          },
          claim?.source_id || "src_scout_web_search"
        );
      }
    }

    let insertedCompanies = 0;
    for (const company of data.companies) {
      if (collision(company)) separate.push(`${company.name} kept separate (${(company.flags ?? []).join("; ")})`);
      const match = matchCompany(company);
      const kind = company.kind === "company" ? "company" : "project";
      const investable = company.is_investable_candidate ? 1 : 0;
      const sector = company.sector && SECTOR_IDS.has(company.sector) ? company.sector : null;
      const website = httpUrl(company.website_url);
      const primary = httpUrl(company.primary_link);
      const primaryKind = primary ? linkKind(primary).kind : null;
      let projectId: string;
      let firstClaim: string | null = null;
      if (match) {
        projectId = match.id;
        mergedProjects.push(`${company.name} -> ${projectId} (${match.reason})`);
        const current = db.prepare(`SELECT name, aliases_json, kind, description, website_url, primary_link, sector, is_investable_candidate FROM projects WHERE id = ?`).get(projectId) as {
          name: string;
          aliases_json: string;
          kind: string;
          description: string | null;
          website_url: string | null;
          primary_link: string | null;
          sector: string | null;
          is_investable_candidate: number;
        };
        let aliases: string[] = [];
        try {
          aliases = JSON.parse(current.aliases_json || "[]");
        } catch {
          aliases = [];
        }
        if (normName(current.name) !== normName(company.name) && !aliases.includes(company.name)) aliases.push(company.name);
        const upgrade = current.kind === "project" && kind === "company" && investable === 1;
        const nextKind = upgrade ? "company" : current.kind;
        const nextInvestable = current.is_investable_candidate === 1 || investable === 1 ? 1 : 0;
        const nextName = upgrade ? company.name : current.name;
        if (upgrade && current.name !== company.name && !aliases.includes(current.name)) aliases.push(current.name);
        const nextDescription = (company.description || "").length > (current.description || "").length ? company.description : current.description;
        db.prepare(
          `UPDATE projects SET name = ?, aliases_json = ?, kind = ?, sector = COALESCE(sector, ?), description = ?, website_url = COALESCE(website_url, ?), primary_link = COALESCE(primary_link, ?), primary_link_kind = COALESCE(primary_link_kind, ?), is_investable_candidate = ?, updated_at = ? WHERE id = ?`
        ).run(nextName, JSON.stringify(aliases), nextKind, sector, nextDescription, website, primary, primaryKind, nextInvestable, now, projectId);
        applyTier("projects", projectId, company.signal_tier, company.signal_tier_basis);
        rememberProject(projectId, company.name, website);
        if (upgrade) rememberProject(projectId, nextName, website);
      } else {
        projectId = newId("proj");
        insertProject.run(
          projectId,
          company.name,
          JSON.stringify(company.aliases_json ?? []),
          kind,
          sector,
          company.description ?? null,
          website,
          primary,
          primaryKind,
          investable,
          isSignalTier(company.signal_tier) ? company.signal_tier : null,
          company.signal_tier_basis ?? null,
          now,
          now
        );
        rememberProject(projectId, company.name, website);
        projectText.set(projectId, `${company.name} ${company.description ?? ""} ${(company.founders ?? []).join(" ")}`.toLowerCase());
        insertedCompanies += 1;
      }
      scoutProjectId.set(company.id, projectId);
      projectsByNorm.set(normName(company.name), [projectId]);
      for (const claim of company.claims ?? []) {
        const id = addClaim("project", projectId, claim, "src_scout_web_search");
        if (!firstClaim && id) firstClaim = id;
      }
      addPrograms(projectId, company.programs, company.claims?.[0]);
      addTags(projectId, company);
      if (investable === 1 || kind === "company") linkCampus(projectId, company.campus_id ?? null, firstClaim);
      else linkCampus(projectId, company.campus_id ?? null, firstClaim);
    }
    console.log(`Companies inserted ${insertedCompanies}. Merged ${mergedProjects.length}.`);
    for (const line of mergedProjects) console.log("  merge project", line);
    for (const line of separate) console.log("  separate", line);

    function projectIdForName(name: string): string | null {
      const hits = projectsByNorm.get(normName(name)) ?? [];
      if (hits.length === 1) return hits[0];
      return null;
    }

    function personProjects(person: ScoutPerson): string[] {
      return (person.projects ?? []).map((p) => p.project_name);
    }

    function projectOverlap(personId: string, names: string[]): boolean {
      const existing = db
        .prepare(`SELECT p.name as name FROM person_project_roles ppr JOIN projects p ON p.id = ppr.project_id WHERE ppr.person_id = ?`)
        .all(personId) as { name: string }[];
      const existingTokens = new Set(existing.flatMap((row) => tokensOf(row.name)).filter((t) => t.length >= 4));
      const incoming = names.flatMap((name) => tokensOf(name)).filter((t) => t.length >= 4);
      return incoming.some((token) => existingTokens.has(token));
    }

    function containsSequence(hay: string[], needle: string[]): boolean {
      if (needle.length < 2 || needle.length > hay.length) return false;
      for (let i = 0; i <= hay.length - needle.length; i++) {
        if (needle.every((token, j) => hay[i + j] === token)) return true;
      }
      return false;
    }

    function matchPerson(person: ScoutPerson): { id: string; reason: string } | null {
      const slug = linkedInSlug(person.linkedin);
      if (slug) {
        const hits = peopleBySlug.get(slug) ?? [];
        if (hits.length === 1) return { id: hits[0], reason: `linkedin ${slug}` };
        if (hits.length > 1) {
          skipped.push(`${person.name}: LinkedIn slug ${slug} matches ${hits.length} people; left unmerged`);
        }
      }
      const exact = peopleByNorm.get(normName(person.name)) ?? [];
      if (exact.length === 1) {
        const existingSlug = [...peopleBySlug.entries()].find(([, ids]) => ids.includes(exact[0]))?.[0];
        if (slug && existingSlug && existingSlug !== slug) return null;
        // Two new records can share a display name and still be different people.
        // Merge them only when they also share a project. A name already in the
        // database before this import is a real duplicate.
        if (createdThisRun.has(exact[0]) && !projectOverlap(exact[0], personProjects(person))) return null;
        return { id: exact[0], reason: "normalized name" };
      }
      const mine = tokensOf(person.name);
      if (mine.length < 2) return null;
      const contiguous: string[] = [];
      const subset: string[] = [];
      for (const [id, tokens] of peopleTokens) {
        if (tokens.length < 2) continue;
        if (containsSequence(tokens, mine) || containsSequence(mine, tokens)) {
          if (tokens.join(" ") !== mine.join(" ")) contiguous.push(id);
          continue;
        }
        const sameEnds = tokens[0] === mine[0] && tokens.at(-1) === mine.at(-1);
        const tokenSubset = mine.every((token) => tokens.includes(token)) || tokens.every((token) => mine.includes(token));
        if (tokenSubset && sameEnds) subset.push(id);
      }
      const contiguousUnique = [...new Set(contiguous)];
      if (contiguousUnique.length === 1) return { id: contiguousUnique[0], reason: "full name is part of one existing name" };
      const overlapped = [...new Set(subset)].filter((id) => projectOverlap(id, personProjects(person)));
      if (overlapped.length === 1) return { id: overlapped[0], reason: "shared name and project" };
      return null;
    }

    const insertPerson = db.prepare(
      `INSERT INTO people (id, name, aliases_json, signal_tier, signal_tier_basis, left_school, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    function markLeftSchool(personId: string, left: boolean | null | undefined) {
      if (left !== true) return;
      db.prepare(`UPDATE people SET left_school = 1 WHERE id = ?`).run(personId);
    }
    const insertAff = db.prepare(
      `INSERT INTO affiliations (id, person_id, university_id, role, status, claim_id) VALUES (?, ?, ?, ?, 'unverified', ?)`
    );
    const affExists = db.prepare(`SELECT id FROM affiliations WHERE person_id = ? AND university_id = ? LIMIT 1`);
    const insertRole = db.prepare(
      `INSERT INTO person_project_roles (id, person_id, project_id, role, claim_id) VALUES (?, ?, ?, ?, ?)`
    );
    const roleExists = db.prepare(`SELECT id FROM person_project_roles WHERE person_id = ? AND project_id = ? AND role = ? LIMIT 1`);

    function readAliases(personId: string): string[] {
      const row = db.prepare(`SELECT aliases_json FROM people WHERE id = ?`).get(personId) as { aliases_json: string };
      try {
        const parsed = JSON.parse(row.aliases_json || "[]") as unknown;
        return Array.isArray(parsed) ? parsed.filter((a): a is string => typeof a === "string") : [];
      } catch {
        return [];
      }
    }

    function writeAliases(personId: string, aliases: string[]) {
      const uniq = [...new Set(aliases)];
      db.prepare(`UPDATE people SET aliases_json = ? WHERE id = ?`).run(JSON.stringify(uniq), personId);
      const row = db.prepare(`SELECT name FROM people WHERE id = ?`).get(personId) as { name: string };
      rememberPerson(personId, row.name, JSON.stringify(uniq));
    }

    function storeLinkedIn(personId: string, person: ScoutPerson) {
      const url = linkedInUrl(person.linkedin);
      const aliases = readAliases(personId);
      const confirmedAlready = aliases.some((alias) => alias.includes("linkedin.com/in/"));
      if (person.linkedin_status === "confirmed" && url) {
        const alias = `linkedin:${url}`;
        if (!aliases.some((a) => linkedInSlug(a.replace(/^linkedin:/, "")) === linkedInSlug(url))) aliases.push(alias);
        if (!aliases.includes("linkedin_checked")) aliases.push("linkedin_checked");
        writeAliases(personId, aliases);
        const evidence = (person.linkedin_evidence || "").trim();
        const hasClaim = (person.claims ?? []).some((c) => c.claim_type === "linkedin_alias_discovered");
        if (!hasClaim && evidence) {
          addClaim(
            "person",
            personId,
            {
              claim_type: "linkedin_alias_discovered",
              source_id: "src_scout_web_search",
              source_url: url,
              excerpt: `${person.name}: confirmed LinkedIn ${url}. ${evidence}`,
              value_json: { linkedin: url, why: evidence },
              label: "observed_fact",
              verification_state: "corroborated",
              retrieved_at: now,
            },
            "src_scout_web_search"
          );
        }
        return;
      }
      if (person.linkedin_status === "unverified" && url && !confirmedAlready) {
        const hasClaim = (person.claims ?? []).some((c) => c.claim_type === "linkedin_candidate");
        if (!hasClaim) {
          const evidence = (person.linkedin_evidence || "name matched; school and company did not").trim();
          addClaim(
            "person",
            personId,
            {
              claim_type: "linkedin_candidate",
              source_id: "src_scout_web_search",
              source_url: url,
              excerpt: `Unverified LinkedIn candidate for ${person.name}: ${url}. name matched; school and company did not. ${evidence}`,
              value_json: { linkedin: url, reason: "name matched; school and company did not" },
              label: "observed_fact",
              verification_state: "unverified",
              retrieved_at: now,
            },
            "src_scout_web_search"
          );
        }
        const kept = aliases.filter((a) => !a.startsWith("linkedin:"));
        if (!kept.includes("linkedin_checked")) kept.push("linkedin_checked");
        writeAliases(personId, kept);
      }
    }

    function linkRole(personId: string, projectId: string, role: string, claimId: string | null) {
      const project = db.prepare(`SELECT kind, is_investable_candidate FROM projects WHERE id = ?`).get(projectId) as {
        kind: string;
        is_investable_candidate: number;
      };
      let stored = role || "contributor";
      if (project.kind !== "company") stored = stored === "founder" ? "team_member" : stored === "contributor" ? "team_member" : stored;
      if (project.kind === "company" && project.is_investable_candidate === 0 && stored === "founder") {
        skipped.push(`did not attach a founder role on low-relevance company ${projectId} for ${personId}`);
        return;
      }
      if (roleExists.get(personId, projectId, stored)) return;
      insertRole.run(newId("ppr"), personId, projectId, stored, claimId);
    }

    let insertedPeople = 0;
    const createdThisRun = new Set<string>();
    const scoutEnrollment = new Map<string, string>();
    for (const person of data.people) {
      const match = matchPerson(person);
      let personId: string;
      if (match) {
        personId = match.id;
        mergedPeople.push(`${person.name} -> ${personId} (${match.reason})`);
        applyTier("people", personId, person.signal_tier, person.signal_tier_basis);
        markLeftSchool(personId, person.left_school);
      } else {
        personId = newId("person");
        const aliases = (person.aliases_json ?? []).filter((alias) => person.linkedin_status === "confirmed" || !alias.startsWith("linkedin:"));
        insertPerson.run(
          personId,
          person.name,
          JSON.stringify(aliases),
          isSignalTier(person.signal_tier) ? person.signal_tier : null,
          person.signal_tier_basis ?? null,
          person.left_school ? 1 : 0,
          now
        );
        rememberPerson(personId, person.name, JSON.stringify(aliases));
        createdThisRun.add(personId);
        insertedPeople += 1;
      }
      touchedPeople.add(personId);
      scoutEnrollment.set(personId, person.enrollment_status || "unknown");
      const extraAliases = (person.aliases_json ?? []).filter((alias) => !alias.startsWith("linkedin:") && !alias.startsWith("linkedin_checked"));
      if (extraAliases.length) {
        const aliases = readAliases(personId);
        writeAliases(personId, [...aliases, ...extraAliases]);
      }
      let firstClaim: string | null = null;
      for (const claim of person.claims ?? []) {
        if (claim.claim_type === "linkedin_alias_discovered" && person.linkedin_status !== "confirmed") continue;
        if (claim.claim_type === "linkedin_candidate" && person.linkedin_status === "confirmed") continue;
        const id = addClaim(
          "person",
          personId,
          { ...claim, excerpt: claim.excerpt ? excerptForPerson(person.name, claim.excerpt) : claim.excerpt },
          "src_scout_web_search"
        );
        if (!firstClaim && id) firstClaim = id;
      }
      if (person.enrollment_evidence) {
        addClaim(
          "person",
          personId,
          {
            claim_type: "source_mention",
            source_id: person.claims?.[0]?.source_id,
            source_url: person.claims?.[0]?.source_url || person.linkedin || SEARCH_URL,
            excerpt: excerptForPerson(person.name, person.enrollment_evidence),
            label: "observed_fact",
            verification_state: "unverified",
            retrieved_at: now,
          },
          person.claims?.[0]?.source_id || "src_scout_web_search"
        );
      }
      storeLinkedIn(personId, person);
      const campus = person.affiliation?.university_id || person.campus_id || null;
      if (campus && !affExists.get(personId, campus)) {
        const role = person.affiliation?.role || null;
        insertAff.run(newId("aff"), personId, campus, role, firstClaim);
      }
      for (const proj of person.projects ?? []) {
        const projectId = projectIdForName(proj.project_name);
        if (!projectId) {
          skipped.push(`no project named ${proj.project_name} for ${person.name}`);
          continue;
        }
        linkRole(personId, projectId, proj.role || "contributor", firstClaim);
      }
    }
    console.log(`People inserted ${insertedPeople}. Merged ${mergedPeople.length}.`);
    for (const line of mergedPeople) console.log("  merge person", line);

    function personIdForName(name: string): string | null {
      const hits = peopleByNorm.get(normName(name)) ?? [];
      return hits.length === 1 ? hits[0] : null;
    }

    for (const company of data.companies) {
      if (!company.is_investable_candidate || company.kind !== "company") continue;
      const projectId = scoutProjectId.get(company.id);
      if (!projectId) continue;
      for (const founder of company.founders ?? []) {
        if (normName(founder) === "yash iyer" && normName(company.name) === "zorbe") {
          skipped.push("did not attach Yash Iyer to Zorbe: the existing record is W'29 on CarboWells, and the Zorbe post does not mention that team or class year");
          continue;
        }
        if (normName(founder) === "brian williams" && normName(company.name) === "tidy") {
          skipped.push("did not attach Brian Williams to Tidy: the excerpt only names him as a cofounder, which does not match the Hack4Impact Brian Williams");
          continue;
        }
        const personId = personIdForName(founder);
        if (!personId) continue;
        linkRole(personId, projectId, "founder", null);
        touchedPeople.add(personId);
      }
    }

    function resolveByName(table: "people" | "projects", name: string): { id: string; name: string } | null {
      const rows = db.prepare(`SELECT id, name FROM ${table}`).all() as { id: string; name: string }[];
      const hits = rows.filter((row) => normName(row.name) === normName(name));
      return hits.length === 1 ? hits[0] : null;
    }

    function mergePersonInto(keepId: string, dropId: string) {
      if (keepId === dropId) return;
      const affs = db.prepare(`SELECT id, university_id FROM affiliations WHERE person_id = ?`).all(dropId) as { id: string; university_id: string }[];
      for (const aff of affs) {
        const exists = db.prepare(`SELECT id FROM affiliations WHERE person_id = ? AND university_id = ?`).get(keepId, aff.university_id);
        if (exists) db.prepare(`DELETE FROM affiliations WHERE id = ?`).run(aff.id);
        else db.prepare(`UPDATE affiliations SET person_id = ? WHERE id = ?`).run(keepId, aff.id);
      }
      const roles = db.prepare(`SELECT id, project_id, role FROM person_project_roles WHERE person_id = ?`).all(dropId) as {
        id: string;
        project_id: string;
        role: string;
      }[];
      for (const role of roles) {
        const exists = db.prepare(`SELECT id FROM person_project_roles WHERE person_id = ? AND project_id = ? AND role = ?`).get(keepId, role.project_id, role.role);
        if (exists) db.prepare(`DELETE FROM person_project_roles WHERE id = ?`).run(role.id);
        else db.prepare(`UPDATE person_project_roles SET person_id = ? WHERE id = ?`).run(keepId, role.id);
      }
      db.prepare(`UPDATE claims SET entity_id = ? WHERE entity_type = 'person' AND entity_id = ?`).run(keepId, dropId);
      db.prepare(`UPDATE possible_companies SET person_id = ? WHERE person_id = ?`).run(keepId, dropId);
      db.prepare(`UPDATE notes SET entity_id = ? WHERE entity_type = 'person' AND entity_id = ?`).run(keepId, dropId);
      db.prepare(`UPDATE relationships SET source_entity_id = ? WHERE source_entity_type = 'person' AND source_entity_id = ?`).run(keepId, dropId);
      db.prepare(`UPDATE relationships SET target_entity_id = ? WHERE target_entity_type = 'person' AND target_entity_id = ?`).run(keepId, dropId);
      const kept = readAliases(keepId);
      const dropped = readAliases(dropId);
      writeAliases(keepId, [...kept, ...dropped]);
      db.prepare(`DELETE FROM people WHERE id = ?`).run(dropId);
      for (const [key, ids] of peopleByNorm) peopleByNorm.set(key, ids.filter((id) => id !== dropId));
      for (const [key, ids] of peopleBySlug) peopleBySlug.set(key, ids.filter((id) => id !== dropId));
      peopleTokens.delete(dropId);
    }

    // Name-only matches the scout flagged. Attach only when the new excerpt
    // shares a school or company with the existing record.
    function personUpdateDetachReason(update: ScoutUpdate): string | null {
      const excerpt = (update.new_claims ?? []).map((claim) => claim.excerpt || "").join(" ");
      if (normName(update.name) === "yash iyer" && !/carbowells|w'29|w’29/i.test(excerpt)) {
        return "Zorbe post is an 18-year-old UPenn dropout and does not mention CarboWells or W'29";
      }
      if (normName(update.name) === "brian williams" && !/hack4impact|beat the streets|exposurepedia|penn labs/i.test(excerpt)) {
        return "excerpt names a cofounder and does not mention Hack4Impact or Penn Labs";
      }
      return null;
    }

    function applyPersonUpdate(personId: string, update: ScoutUpdate) {
      touchedPeople.add(personId);
      scoutEnrollment.set(personId, update.enrollment_status || "unknown");
      let firstClaim: string | null = null;
      for (const claim of update.new_claims ?? []) {
        const id = addClaim(
          "person",
          personId,
          { ...claim, excerpt: claim.excerpt ? excerptForPerson(update.name, claim.excerpt) : claim.excerpt },
          "src_scout_web_search"
        );
        if (!firstClaim && id) firstClaim = id;
      }
      const slug = linkedInSlug(update.linkedin);
      if (update.linkedin_status === "confirmed" && slug) {
        const other = (peopleBySlug.get(slug) ?? []).filter((id) => id !== personId);
        if (other.length === 1) {
          const otherName = db.prepare(`SELECT name FROM people WHERE id = ?`).get(other[0]) as { name: string } | undefined;
          if (otherName && normName(otherName.name) === normName(update.name)) {
            mergePersonInto(personId, other[0]);
            mergedPeople.push(`${update.name} ${other[0]} -> ${personId} (linkedin ${slug})`);
          }
        }
      }
      storeLinkedIn(personId, {
        id: update.repo_entity_id,
        name: update.name,
        linkedin: update.linkedin,
        linkedin_status: update.linkedin_status,
        linkedin_evidence: update.linkedin_evidence || update.new_claims?.[0]?.excerpt || null,
        claims: update.new_claims,
      });
      const aliases = readAliases(personId);
      const extra = (update.new_aliases ?? []).filter((alias) => !alias.startsWith("linkedin:"));
      if (extra.length) writeAliases(personId, [...aliases, ...extra]);
      applyTier("people", personId, update.signal_tier, update.signal_tier_basis);
      markLeftSchool(personId, update.left_school);
      for (const proj of update.new_projects ?? []) {
        const projectId = projectIdForName(proj.project_name);
        if (!projectId) {
          skipped.push(`no project named ${proj.project_name} for ${update.name}`);
          continue;
        }
        linkRole(personId, projectId, proj.role || "contributor", firstClaim);
      }
      if (normName(update.name) === "yash iyer" && /upenn|university of pennsylvania/i.test((update.new_claims ?? []).map((c) => c.excerpt || "").join(" "))) {
        if (!affExists.get(personId, "univ_penn")) insertAff.run(newId("aff"), personId, "univ_penn", null, firstClaim);
      }
    }

    let appliedUpdates = 0;
    let createdFromUpdates = 0;
    for (const update of data.updates) {
      const table = update.entity_type === "person" ? "people" : "projects";
      const byId = db.prepare(`SELECT id, name FROM ${table} WHERE id = ?`).get(update.repo_entity_id) as { id: string; name: string } | undefined;
      const row = byId ?? resolveByName(table, update.name);
      const detach = update.entity_type === "person" ? personUpdateDetachReason(update) : null;
      if (detach) {
        const personId = newId("person");
        insertPerson.run(personId, update.name, "[]", isSignalTier(update.signal_tier) ? update.signal_tier : null, update.signal_tier_basis ?? null, update.left_school ? 1 : 0, now);
        rememberPerson(personId, update.name, "[]");
        createdThisRun.add(personId);
        createdFromUpdates += 1;
        separate.push(`${update.name} kept as a new person (${detach})`);
        applyPersonUpdate(personId, update);
        continue;
      }
      if (!row) {
        skipped.push(`update ${update.name} missing ${update.repo_entity_id}`);
        continue;
      }
      if (normName(row.name) !== normName(update.name) && !normName(row.name).includes(normName(update.name)) && !normName(update.name).includes(normName(row.name))) {
        skipped.push(`update name ${update.name} does not match ${row.name} (${row.id})`);
        continue;
      }
      if (!byId) separate.push(`${update.name} update resolved ${update.repo_entity_id} -> ${row.id} by normalized name`);
      appliedUpdates += 1;
      if (update.entity_type === "person") {
        applyPersonUpdate(row.id, update);
        continue;
      }
      for (const claim of update.new_claims ?? []) addClaim("project", row.id, claim, "src_scout_web_search");
      addPrograms(row.id, update.programs, update.new_claims?.[0]);
      applyTier("projects", row.id, update.signal_tier, update.signal_tier_basis);
      for (const link of update.new_links ?? []) {
        const url = httpUrl(link);
        if (!url) continue;
        const current = db.prepare(`SELECT website_url, primary_link FROM projects WHERE id = ?`).get(row.id) as {
          website_url: string | null;
          primary_link: string | null;
        };
        const kind = linkKind(url).kind;
        if (!current.website_url && kind === "other") {
          db.prepare(`UPDATE projects SET website_url = ?, updated_at = ? WHERE id = ?`).run(url, now, row.id);
        } else if (!current.primary_link) {
          db.prepare(`UPDATE projects SET primary_link = ?, primary_link_kind = ?, updated_at = ? WHERE id = ?`).run(url, kind, now, row.id);
        } else if (!current.website_url) {
          db.prepare(`UPDATE projects SET primary_link = COALESCE(primary_link, ?), updated_at = ? WHERE id = ?`).run(url, now, row.id);
        }
      }
      const project = db.prepare(`SELECT kind, is_investable_candidate FROM projects WHERE id = ?`).get(row.id) as {
        kind: string;
        is_investable_candidate: number;
      };
      if (project.kind === "company" && project.is_investable_candidate === 1) {
        for (const founder of update.founders ?? []) {
          const personId = personIdForName(founder);
          if (!personId) continue;
          linkRole(personId, row.id, "founder", null);
          touchedPeople.add(personId);
        }
      }
    }
    const hackathons = data.companies.filter((company) => company.kind === "hackathon_project").length;
    console.log(`Hackathon projects stored as kind=project without team-member people: ${hackathons}.`);
    console.log(`Updates applied ${appliedUpdates} of ${data.updates.length}. New people from detached updates: ${createdFromUpdates}.`);

    const enrollmentChanges: string[] = [];
    for (const personId of touchedPeople) {
      const beforeRow = db.prepare(`SELECT name, enrollment_status FROM people WHERE id = ?`).get(personId) as {
        name: string;
        enrollment_status: string | null;
      };
      const decision = recomputePersonEnrollment(db, personId);
      db.prepare(`UPDATE affiliations SET status = ? WHERE person_id = ? AND status = 'unverified'`).run(
        decision.status === "unknown" ? "unverified" : decision.status,
        personId
      );
      const scout = scoutEnrollment.get(personId);
      if (scout && scout !== decision.status) {
        enrollmentChanges.push(`${beforeRow.name}: file said ${scout}, rules set ${decision.status}${decision.label ? " " + decision.label : ""}`);
      } else if (!scout && (beforeRow.enrollment_status || "unknown") !== decision.status) {
        enrollmentChanges.push(`${beforeRow.name}: ${beforeRow.enrollment_status || "unknown"} -> ${decision.status}${decision.label ? " " + decision.label : ""}`);
      }
    }
    console.log(`Enrollment differences ${enrollmentChanges.length}.`);
    for (const line of enrollmentChanges) console.log("  enroll", line);
    console.log(`Skipped notes ${skipped.length}.`);
    for (const line of skipped) console.log("  skip", line);
  });

  tx();
  db.pragma("wal_checkpoint(TRUNCATE)");

  const after = {
    companies: countCompanies(),
    people: countPeople(),
    linkedin: countLinkedIn(),
    companiesByCampus: byCampus(companyCampusSql),
    peopleByCampus: byCampus(peopleCampusSql),
    linkedinByCampus: byCampus(liCampusSql),
  };
  console.log("AFTER", JSON.stringify(after));
  console.log("MERGED PROJECTS", mergedProjects.length);
  console.log("MERGED PEOPLE", mergedPeople.length);
}

main();
