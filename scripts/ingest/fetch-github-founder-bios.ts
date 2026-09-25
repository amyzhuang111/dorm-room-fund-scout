// GitHub user search for people whose own bio names Penn or UC Berkeley
// and says they are a founder of a named company. Unauthenticated search
// is rate-limited (10 requests/minute). This script stays inside a small
// budget and only writes a company when the bio itself names one.
//
// Affiliation is unverified: a GitHub bio is self-reported and undated.
//
// Run: npx tsx scripts/ingest/fetch-github-founder-bios.ts

import { getDb, newId, nowIso } from "../../lib/db/client";
import { assembleProjectFacts } from "../../lib/domain/facts";
import { evaluateAllGates } from "../../lib/screening/gates";

const SOURCE_ID = "src_github_founder_bios";
const QUERIES: { q: string; universityId: string }[] = [
  { q: `"university of pennsylvania" founder in:bio`, universityId: "univ_penn" },
  { q: `"upenn" founder in:bio`, universityId: "univ_penn" },
  { q: `"uc berkeley" founder in:bio`, universityId: "univ_berkeley" },
  { q: `"university of california, berkeley" founder in:bio`, universityId: "univ_berkeley" },
];

const SCHOOL_RE: Record<string, RegExp> = {
  univ_penn: /\buniversity of pennsylvania\b|\bupenn\b/i,
  univ_berkeley: /\buc berkeley\b|\buniversity of california,?\s+berkeley\b/i,
};

interface Profile {
  login: string;
  name: string | null;
  bio: string | null;
  company: string | null;
  blog: string | null;
  htmlUrl: string;
}

async function gh<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: {
      accept: "application/vnd.github+json",
      "user-agent": "campus-universe-research-bot/0.1",
      "x-github-api-version": "2022-11-28",
    },
  });
  if (res.status === 403) {
    const reset = res.headers.get("x-ratelimit-reset");
    throw new Error(`GitHub rate limited (resets at ${reset ?? "unknown"})`);
  }
  if (!res.ok) throw new Error(`GitHub HTTP ${res.status} for ${url}`);
  return (await res.json()) as T;
}

function companyName(bio: string, companyField: string | null): string | null {
  const field = companyField?.replace(/^@/, "").trim();
  if (field && !/university|berkeley|penn|student|college/i.test(field) && field.length > 1 && field.length < 60) {
    return field;
  }
  const m = bio.match(/\b(?:co-?founder|founder)\s+(?:at|of|@)\s+([A-Z0-9][\w.&'-]*(?:\s+[A-Z0-9][\w.&'-]*){0,3})/);
  if (!m) return null;
  return m[1].replace(/[.,;:]+$/, "");
}

async function main() {
  const db = getDb();
  const retrievedAt = nowIso();
  db.prepare(
    `INSERT INTO sources (id, name, family, url, campuses_json, priority, ingestion_mode, status, last_attempt_at)
     VALUES (?, 'GitHub founder bios (Penn / Berkeley)', 'code_host', 'https://github.com', ?, 2, 'api', 'available', ?)
     ON CONFLICT(id) DO UPDATE SET last_attempt_at=excluded.last_attempt_at, status='available'`
  ).run(SOURCE_ID, JSON.stringify(["univ_penn", "univ_berkeley"]), retrievedAt);

  const seen = new Set<string>();
  const profiles: { profile: Profile; universityId: string }[] = [];

  for (const query of QUERIES) {
    let data: { items: { login: string }[] };
    try {
      data = await gh<{ items: { login: string }[] }>(
        `https://api.github.com/search/users?q=${encodeURIComponent(query.q)}&per_page=8`
      );
    } catch (e) {
      const message = (e as Error).message;
      console.log(`GitHub search stopped: ${message}`);
      db.prepare(`UPDATE sources SET error=?, last_success_at=COALESCE(last_success_at, ?) WHERE id=?`).run(message, retrievedAt, SOURCE_ID);
      break;
    }
    console.log(`GitHub search "${query.q}": ${data.items.length} users`);
    for (const item of data.items) {
      if (seen.has(item.login)) continue;
      seen.add(item.login);
      const user = await gh<{
        login: string;
        name: string | null;
        bio: string | null;
        company: string | null;
        blog: string | null;
        html_url: string;
      }>(`https://api.github.com/users/${item.login}`);
      profiles.push({
        profile: {
          login: user.login,
          name: user.name,
          bio: user.bio,
          company: user.company,
          blog: user.blog,
          htmlUrl: user.html_url,
        },
        universityId: query.universityId,
      });
    }
  }

  const findPerson = db.prepare(`SELECT id FROM people WHERE aliases_json LIKE ?`);
  const insertPerson = db.prepare(`INSERT INTO people (id, name, aliases_json) VALUES (?, ?, ?)`);
  const findProject = db.prepare(`SELECT id FROM projects WHERE name = ? AND kind = 'company'`);
  const insertProject = db.prepare(
    `INSERT INTO projects (id, name, aliases_json, kind, description, website_url, is_portfolio_reference, is_investable_candidate)
     VALUES (?, ?, '[]', 'company', ?, ?, 0, 1)`
  );
  const findAffiliation = db.prepare(`SELECT id FROM affiliations WHERE person_id = ? AND university_id = ? AND role = ?`);
  const insertAffiliation = db.prepare(
    `INSERT INTO affiliations (id, person_id, university_id, role, status, claim_id) VALUES (?, ?, ?, ?, 'unverified', ?)`
  );
  const findRole = db.prepare(`SELECT id FROM person_project_roles WHERE person_id = ? AND project_id = ?`);
  const insertRole = db.prepare(
    `INSERT INTO person_project_roles (id, person_id, project_id, role, claim_id) VALUES (?, ?, ?, 'founder', ?)`
  );
  const insertRel = db.prepare(
    `INSERT INTO relationships (id, source_entity_type, source_entity_id, target_entity_type, target_entity_id, relationship_type, evidence_claim_ids_json, verification_state)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'affiliation_only')`
  );
  const hasRel = db.prepare(
    `SELECT id FROM relationships WHERE source_entity_id = ? AND target_entity_id = ? AND relationship_type = 'affiliated_with'`
  );
  const insertClaim = db.prepare(
    `INSERT INTO claims (id, entity_type, entity_id, claim_type, value_json, excerpt, source_id, source_url, retrieved_at, label, verification_state)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'company_reported', 'unverified')`
  );
  const upsertGate = db.prepare(
    `INSERT INTO gate_results (id, project_id, gate_name, result, rationale, evaluated_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(project_id, gate_name) DO UPDATE SET result=excluded.result, rationale=excluded.rationale, evaluated_at=excluded.evaluated_at`
  );

  let written = 0;
  let skipped = 0;
  for (const { profile, universityId } of profiles) {
    const bio = profile.bio?.replace(/\s+/g, " ").trim() ?? "";
    if (!bio || !SCHOOL_RE[universityId].test(bio) || !/\b(co-?founder|founder)\b/i.test(bio)) {
      skipped++;
      continue;
    }
    const company = companyName(bio, profile.company);
    if (!company) {
      console.log(`skip @${profile.login}: founder language but no company name in the bio`);
      skipped++;
      continue;
    }
    const displayName = profile.name?.trim() || profile.login;
    const alias = `github:${profile.login}`;
    const existingPerson = findPerson.get(`%"${alias}"%`) as { id: string } | undefined;
    const personId = existingPerson?.id ?? newId("person");
    if (!existingPerson) insertPerson.run(personId, displayName, JSON.stringify([alias]));

    const existingProject = findProject.get(company) as { id: string } | undefined;
    const projectId = existingProject?.id ?? newId("proj");
    if (!existingProject) {
      const site = profile.blog && profile.blog.startsWith("http") ? profile.blog : `https://github.com/${profile.login}`;
      insertProject.run(
        projectId,
        company,
        `Named in @${profile.login}'s GitHub bio as a company they founded. Self-reported; not independently verified.`,
        site
      );
    }

    const excerpt = `GitHub user @${profile.login} (${displayName}) bio: "${bio.slice(0, 400)}". Company field: ${profile.company ?? "none"}. This is self-reported and undated.`;
    const claimId = newId("claim");
    insertClaim.run(
      claimId,
      "person",
      personId,
      "self_reported_founder",
      JSON.stringify({ login: profile.login, company, universityId }),
      excerpt,
      SOURCE_ID,
      profile.htmlUrl,
      retrievedAt
    );
    const role = "GitHub bio founder (self-reported)";
    if (!findAffiliation.get(personId, universityId, role)) {
      insertAffiliation.run(newId("aff"), personId, universityId, role, claimId);
    }
    if (!findRole.get(personId, projectId)) {
      insertRole.run(newId("ppr"), personId, projectId, claimId);
      insertRel.run(newId("rel"), "person", personId, "project", projectId, "founded", JSON.stringify([claimId]));
    }
    if (!hasRel.get(projectId, universityId)) {
      insertRel.run(newId("rel"), "project", projectId, "university", universityId, "affiliated_with", JSON.stringify([claimId]));
    }
    const facts = assembleProjectFacts(db, projectId);
    for (const o of evaluateAllGates(facts)) upsertGate.run(newId("gate"), projectId, o.gate, o.result, o.rationale);
    written++;
    console.log(`wrote @${profile.login} → ${company} (${universityId})`);
  }

  db.prepare(`UPDATE sources SET last_success_at=?, discovered_lead_count=?, error=NULL, refresh_suggestion=? WHERE id=?`).run(
    nowIso(),
    written,
    "Unauthenticated GitHub search, 15 users per query, 4 queries. A token is not required. Results are only bios that name the school and a company.",
    SOURCE_ID
  );
  console.log(`GitHub bios: ${written} founder-company rows written, ${skipped} skipped.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
