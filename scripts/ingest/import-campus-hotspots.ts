// Import appendix founders and startups from the campus hotspot directory.
// A row is stored only when it has an http(s) source URL. People and
// companies already in the database (same normalized name, website domain,
// or LinkedIn slug) get the excerpt attached instead of a second row.
// Trackers and talent-signal notes are not turned into people or companies.
//
//   npx tsx scripts/ingest/import-campus-hotspots.ts

import { getDb, newId, nowIso } from "../../lib/db/client";
import { linkKind } from "../../lib/domain/company-link";
import { hotspotAppendix } from "../../lib/domain/hotspots";
import { hasPhrase, normHotspotName } from "../../lib/domain/hotspot-model";

const SOURCE_ID = "src_campus_hotspots";
const SOURCE_URL = "https://github.com/campus-scout/campus-scout/blob/main/data/imports/campus_hotspots.csv";

function core(name: string): string {
  return name.replace(/\s*\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
}

function nameKey(name: string): string {
  return normHotspotName(core(name));
}

function splitFounders(raw: string): string[] {
  const stripped = core(raw);
  const parts = stripped.split(/\s*[,;]\s*|\s+&\s+|\s+and\s+/i).map((part) => part.trim()).filter(Boolean);
  const names = parts.filter((part) => part.split(/\s+/).filter(Boolean).length >= 2);
  if (names.length > 0) return names;
  if (stripped.split(/\s+/).filter(Boolean).length >= 2) return [stripped];
  return [];
}

function startupNames(kind: string, name: string): string[] {
  if (kind !== "Startups") return [name];
  const cohort = name.match(/^(.*cohort[^(]*)\(([^)]+)\)\s*$/i);
  if (cohort) {
    return cohort[2].split(",").map((part) => part.trim()).filter((part) => part.length >= 2);
  }
  if (name.includes(" / ")) return name.split(/\s+\/\s+/).map((part) => part.trim()).filter(Boolean);
  return [name];
}

function aliasesFor(name: string): string[] {
  const aliases = new Set<string>([name, core(name)]);
  const formerly = name.match(/\(\s*formerly\s+([^)]+)\)/i);
  if (formerly) aliases.add(formerly[1].trim());
  return [...aliases].filter(Boolean);
}

function linkedInSlug(url: string): string | null {
  const match = url.match(/linkedin\.com\/in\/([^/?#]+)/i);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]).replace(/\/$/, "").toLowerCase();
  } catch {
    return match[1].toLowerCase();
  }
}

function mentionsCompany(evidenceNorm: string, key: string): boolean {
  if (key.length < 4 || !hasPhrase(evidenceNorm, key)) return false;
  if (key === "series" && /\bseries\s+[a-e]\b/.test(evidenceNorm)) return false;
  return true;
}

function productDomain(url: string): string | null {
  if (!url.startsWith("http")) return null;
  const kind = linkKind(url).kind;
  if (kind !== "other") return null;
  try {
    const host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    if (!host || host.endsWith(".edu") || host.includes("linkedin.com") || host.includes("wikipedia.org")) return null;
    return host;
  } catch {
    return null;
  }
}

function domainOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

function main() {
  const db = getDb();
  const now = nowIso();
  const entries = hotspotAppendix().filter((entry) => ["Founder", "Founders", "Startup", "Startups"].includes(entry.kind));

  const people = db.prepare(`SELECT id, name, aliases_json, founder_status FROM people`).all() as {
    id: string;
    name: string;
    aliases_json: string;
    founder_status: string | null;
  }[];
  const peopleByName = new Map<string, string[]>();
  const peopleByLinkedIn = new Map<string, string[]>();
  const addPersonKey = (map: Map<string, string[]>, key: string, id: string) => {
    if (!key) return;
    const list = map.get(key) ?? [];
    if (!list.includes(id)) list.push(id);
    map.set(key, list);
  };
  for (const person of people) {
    addPersonKey(peopleByName, nameKey(person.name), person.id);
    let aliases: string[] = [];
    try {
      aliases = JSON.parse(person.aliases_json) as string[];
    } catch {
      aliases = [];
    }
    for (const alias of aliases) {
      addPersonKey(peopleByName, nameKey(alias.replace(/^name:/, "")), person.id);
      const slug = linkedInSlug(alias.replace(/^linkedin:/, ""));
      if (slug) addPersonKey(peopleByLinkedIn, slug, person.id);
    }
  }
  const linkedinClaims = db
    .prepare(`SELECT entity_id, value_json, source_url FROM claims WHERE entity_type = 'person' AND (claim_type LIKE '%linkedin%' OR source_url LIKE '%linkedin.com/in/%')`)
    .all() as { entity_id: string; value_json: string; source_url: string }[];
  for (const claim of linkedinClaims) {
    const slug = linkedInSlug(claim.source_url) ?? linkedInSlug(claim.value_json);
    if (slug) addPersonKey(peopleByLinkedIn, slug, claim.entity_id);
  }

  const companies = db.prepare(`SELECT id, name, aliases_json, website_url, kind, description, primary_link FROM projects`).all() as {
    id: string;
    name: string;
    aliases_json: string;
    website_url: string | null;
    kind: string;
    description: string | null;
    primary_link: string | null;
  }[];
  const companyByName = new Map<string, string[]>();
  const companyByDomain = new Map<string, string[]>();
  const addCompanyKey = (map: Map<string, string[]>, key: string, id: string) => {
    if (!key) return;
    const list = map.get(key) ?? [];
    if (!list.includes(id)) list.push(id);
    map.set(key, list);
  };
  for (const company of companies) {
    if (company.kind !== "company") continue;
    addCompanyKey(companyByName, nameKey(company.name), company.id);
    let aliases: string[] = [];
    try {
      aliases = JSON.parse(company.aliases_json) as string[];
    } catch {
      aliases = [];
    }
    for (const alias of aliases) addCompanyKey(companyByName, nameKey(alias), company.id);
    const domain = domainOf(company.website_url);
    if (domain) addCompanyKey(companyByDomain, domain, company.id);
  }

  const existingSource = db.prepare(`SELECT id FROM sources WHERE id = ?`).get(SOURCE_ID);
  if (!existingSource) {
    db.prepare(
      `INSERT INTO sources (id, name, family, url, campuses_json, priority, ingestion_mode, status, source_role, tier_rationale)
       VALUES (?, ?, 'reference', ?, '[]', 3, 'manual', 'available', 'reference', ?)`
    ).run(
      SOURCE_ID,
      "Campus founder hotspots directory",
      SOURCE_URL,
      "Owner directory of campus rooms and named founders/startups. Source-priority context only; tiers are not Founder Signal."
    );
  }

  const claimExists = db.prepare(
    `SELECT id FROM claims WHERE entity_type = ? AND entity_id = ? AND claim_type = 'source_mention' AND source_url = ? AND excerpt = ? LIMIT 1`
  );
  const insertClaim = db.prepare(
    `INSERT INTO claims (id, entity_type, entity_id, claim_type, value_json, excerpt, source_id, source_url, retrieved_at, label, verification_state)
     VALUES (?, ?, ?, 'source_mention', ?, ?, ?, ?, ?, 'observed_fact', 'unverified')`
  );
  const insertPerson = db.prepare(
    `INSERT INTO people (id, name, aliases_json, founder_status, left_school) VALUES (?, ?, '[]', 'founder', ?)`
  );
  const insertProject = db.prepare(
    `INSERT INTO projects (id, name, aliases_json, kind, description, website_url, primary_link, primary_link_kind, is_investable_candidate)
     VALUES (?, ?, ?, 'company', ?, NULL, ?, ?, 1)`
  );
  const insertAffiliation = db.prepare(
    `INSERT INTO affiliations (id, person_id, university_id, role, status, claim_id) VALUES (?, ?, ?, 'mentioned', 'unverified', ?)`
  );
  const affiliationExists = db.prepare(`SELECT id FROM affiliations WHERE person_id = ? AND university_id = ? LIMIT 1`);
  const insertRelationship = db.prepare(
    `INSERT INTO relationships (id, source_entity_type, source_entity_id, target_entity_type, target_entity_id, relationship_type, evidence_claim_ids_json, verification_state)
     VALUES (?, 'project', ?, 'university', ?, 'affiliated_with', ?, 'unverified')`
  );
  const relationshipExists = db.prepare(
    `SELECT id FROM relationships WHERE source_entity_type = 'project' AND source_entity_id = ? AND target_entity_type = 'university' AND target_entity_id = ? AND relationship_type = 'affiliated_with' LIMIT 1`
  );
  const insertRole = db.prepare(
    `INSERT INTO person_project_roles (id, person_id, project_id, role, claim_id) VALUES (?, ?, ?, 'founder', ?)`
  );
  const roleExists = db.prepare(`SELECT id FROM person_project_roles WHERE person_id = ? AND project_id = ? AND role = 'founder' LIMIT 1`);
  const setFounderStatus = db.prepare(`UPDATE people SET founder_status = 'founder' WHERE id = ? AND founder_status IS NULL`);
  const setPrimary = db.prepare(`UPDATE projects SET primary_link = ?, primary_link_kind = ? WHERE id = ? AND (primary_link IS NULL OR trim(primary_link) = '')`);
  const setDescription = db.prepare(`UPDATE projects SET description = ? WHERE id = ? AND (description IS NULL OR trim(description) = '')`);

  const stats = {
    createdPeople: 0,
    matchedPeople: 0,
    ambiguousPeople: 0,
    skippedPeople: 0,
    createdCompanies: 0,
    matchedCompanies: 0,
    ambiguousCompanies: 0,
    claims: 0,
    roles: 0,
    affiliations: 0,
  };

  function ensureClaim(entityType: string, entityId: string, excerpt: string, url: string, value: unknown): string | null {
    const text = excerpt.trim();
    if (!text || !url.startsWith("http")) return null;
    const existing = claimExists.get(entityType, entityId, url, text) as { id: string } | undefined;
    if (existing) return existing.id;
    const id = newId("claim");
    insertClaim.run(id, entityType, entityId, JSON.stringify(value), text, SOURCE_ID, url, now);
    stats.claims += 1;
    return id;
  }

  const appendixCompanies = new Map<string, string>();

  const removeCombined = db.transaction(() => {
    const rows = db.prepare(`SELECT id, name FROM people WHERE name LIKE '%;%' OR name LIKE '% & %'`).all() as { id: string; name: string }[];
    for (const person of rows) {
      if (splitFounders(person.name).length < 2) continue;
      const other = db.prepare(`SELECT COUNT(*) AS n FROM claims WHERE entity_id = ? AND entity_type = 'person' AND IFNULL(source_id, '') != ?`).get(person.id, SOURCE_ID) as { n: number };
      if (other.n > 0) continue;
      db.prepare(`DELETE FROM person_project_roles WHERE person_id = ?`).run(person.id);
      db.prepare(`DELETE FROM affiliations WHERE person_id = ?`).run(person.id);
      db.prepare(`DELETE FROM claims WHERE entity_type = 'person' AND entity_id = ?`).run(person.id);
      db.prepare(`DELETE FROM people WHERE id = ?`).run(person.id);
    }
  });
  removeCombined();

  const tx = db.transaction(() => {
    for (const entry of entries.filter((row) => row.kind === "Startup" || row.kind === "Startups")) {
      for (const name of startupNames(entry.kind, entry.name)) {
        const keys = aliasesFor(name).map(nameKey).filter((key) => key.length >= 2);
        const domain = productDomain(entry.url);
        const ids = new Set<string>();
        for (const key of keys) for (const id of companyByName.get(key) ?? []) ids.add(id);
        if (domain) for (const id of companyByDomain.get(domain) ?? []) ids.add(id);
        let projectId: string | null = null;
        if (ids.size === 1) {
          projectId = [...ids][0];
          stats.matchedCompanies += 1;
        } else if (ids.size > 1) {
          stats.ambiguousCompanies += 1;
          continue;
        } else {
          projectId = newId("proj");
          const kind = linkKind(entry.url);
          insertProject.run(projectId, name, JSON.stringify(aliasesFor(name).filter((alias) => alias !== name)), entry.evidence, entry.url, kind.kind);
          stats.createdCompanies += 1;
          for (const key of keys) addCompanyKey(companyByName, key, projectId);
          if (domain) addCompanyKey(companyByDomain, domain, projectId);
        }
        for (const key of keys) if (!appendixCompanies.has(key)) appendixCompanies.set(key, projectId);
        const claimId = ensureClaim("project", projectId, entry.evidence, entry.url, { name, campus: entry.campus, tier: entry.tier, kind: entry.kind });
        setPrimary.run(entry.url, linkKind(entry.url).kind, projectId);
        setDescription.run(entry.evidence, projectId);
        if (entry.campusId && claimId && !relationshipExists.get(projectId, entry.campusId)) {
          insertRelationship.run(newId("rel"), projectId, entry.campusId, JSON.stringify([claimId]));
        }
      }
    }

    const peopleTouched: { id: string; evidence: string; campusId: string | null; claimId: string | null }[] = [];
    for (const entry of entries.filter((row) => row.kind === "Founder" || row.kind === "Founders")) {
      const names = splitFounders(entry.name);
      if (names.length === 0) {
        stats.skippedPeople += 1;
        continue;
      }
      for (const name of names) {
        const key = nameKey(name);
        const slug = linkedInSlug(entry.url);
        const ids = new Set<string>(peopleByName.get(key) ?? []);
        if (slug) for (const id of peopleByLinkedIn.get(slug) ?? []) ids.add(id);
        let personId: string | null = null;
        if (ids.size === 1) {
          personId = [...ids][0];
          stats.matchedPeople += 1;
          setFounderStatus.run(personId);
        } else if (ids.size > 1) {
          stats.ambiguousPeople += 1;
          continue;
        } else {
          personId = newId("per");
          const left = /dropout|\bon leave\b|left (school|college|berkeley|penn|stanford|harvard|mit)\b/i.test(`${name} ${entry.evidence}`) ? 1 : 0;
          insertPerson.run(personId, name, left);
          stats.createdPeople += 1;
          addPersonKey(peopleByName, key, personId);
        }
        const claimId = ensureClaim("person", personId, entry.evidence, entry.url, { name, campus: entry.campus, tier: entry.tier, kind: entry.kind });
        if (entry.campusId && claimId && !affiliationExists.get(personId, entry.campusId)) {
          insertAffiliation.run(newId("aff"), personId, entry.campusId, claimId);
          stats.affiliations += 1;
        }
        peopleTouched.push({ id: personId, evidence: normHotspotName(entry.evidence), campusId: entry.campusId, claimId });
      }
    }

    const staleRoles = db
      .prepare(
        `SELECT ppr.id, ppr.person_id, pr.name AS project_name, c.excerpt
         FROM person_project_roles ppr
         JOIN projects pr ON pr.id = ppr.project_id
         JOIN claims c ON c.id = ppr.claim_id
         WHERE c.source_id = ? AND ppr.role = 'founder'`
      )
      .all(SOURCE_ID) as { id: string; person_id: string; project_name: string; excerpt: string }[];
    const deleteRole = db.prepare(`DELETE FROM person_project_roles WHERE id = ?`);
    for (const role of staleRoles) {
      const key = nameKey(role.project_name);
      if (!mentionsCompany(normHotspotName(role.excerpt), key)) deleteRole.run(role.id);
    }

    for (const person of peopleTouched) {
      if (!person.claimId) continue;
      for (const [key, projectId] of appendixCompanies) {
        if (!mentionsCompany(person.evidence, key)) continue;
        if (roleExists.get(person.id, projectId)) continue;
        insertRole.run(newId("ppr"), person.id, projectId, person.claimId);
        stats.roles += 1;
      }
    }
  });
  tx();

  console.log(JSON.stringify(stats, null, 2));
}

main();
