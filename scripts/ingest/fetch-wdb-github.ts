// Real ingestion from Web Development at Berkeley's GitHub org
// (github.com/web-at-berkeley, 42 public repos), via the public REST API —
// no auth needed for public reads, 60 req/hr unauthenticated (same budget
// note as enrich-penn-labs-github.ts). This is the first real adapter for
// `cat_wdb` in lib/domain/source-quality.ts (previously "unconfigured").
//
// WDB's own site (webatberkeley.org) has NO team roster, member directory,
// or per-project credits page — verified by direct inspection before
// writing any scraper (§7: never guess at a page that doesn't exist).
// Its public project showcase is a Behance portfolio
// (behance.net/webdevatberk); Behance's own project-page JSON was inspected
// too and carries no credits/collaborator field for these entries — dead
// end, not usable. The GitHub org is the one place WDB's actual builders
// are named: real commit authorship by real GitHub accounts, which is
// strictly stronger evidence than a claimed team-member list (Hack4Impact,
// Devpost) because it's derived from actual code contribution, not a
// self-reported roster.
//
// Repo selection (bounded, not the full 42-repo org — same "don't
// overclaim" logic as excluding Devpost non-winners' role, just applied to
// repo selection instead): included are real Industry-initiative client
// repos, WDB's own internal tools (Penn-Mobile-style — real build evidence,
// but never a Startup Scout candidate), and the most recent 2.5 years of
// Training-initiative semester team-project repos (tp-*). EXCLUDED:
// recruiting-interview repos (wdb-*-interview-*, *-interview-fa23 — an
// individual technical assessment, not real collaborative building),
// bootcamp-week-*-starter / decal / education / workshop repos (training
// material, no real ownership), and template/infra repos (git-demo,
// next-template, eslint-config, prettier-config, lib, .github,
// github-pages-demo) — none of these represent a real shipped product a
// contributor built.
//
// Per-contributor identity: GitHub's own public profile `name`/`bio`/
// `company` fields are the person's own self-disclosure, read directly —
// never guessed at, matching §40/§42's "never merge on name alone" by
// doing the opposite (start from a real, unambiguous GitHub identity, then
// take whatever real name they've chosen to disclose on it; if they've
// disclosed none, key on the GitHub handle itself, which is still a real,
// stable, unambiguous identifier, not a guess).
//
// One contributor's bio, read verbatim, discloses an actual company:
// Emir Karabeg's profile bio is "co-founder @simstudioai" (company field:
// "Sim"). That's a real, self-reported company-formation claim — recorded
// as a genuine `kind='company'` candidate with a `founder` role, sourced
// directly to his own public GitHub profile, not inferred or guessed.
//
// Run: npx tsx scripts/ingest/fetch-wdb-github.ts

import crypto from "node:crypto";
import { getDb, newId, nowIso } from "../../lib/db/client";
import { previousSnapshotHash } from "../../lib/ingest/dedup";
import { assembleProjectFacts } from "../../lib/domain/facts";
import { evaluateAllGates } from "../../lib/screening/gates";

const SOURCE_ID = "src_wdb_github";
const UNIV_ID = "univ_berkeley";
const ORG = "web-at-berkeley";
const ORG_URL = `https://github.com/${ORG}`;

// name -> { kind, label } — kind drives how the project row + relationship
// are recorded. 'client' = real external client (Industry initiative);
// 'internal' = WDB's own product (Penn-Mobile pattern, is_investable_candidate=0);
// 'team_project' = Training-initiative semester team project (also internal,
// never a Startup Scout candidate — it's a training exercise, not a venture).
const REPOS: { repo: string; kind: "client" | "internal" | "team_project"; label: string; client?: string }[] = [
  { repo: "kiwibot-landing-page", kind: "client", label: "Kiwibot landing page", client: "Kiwibot" },
  { repo: "berkeley-investment-group", kind: "client", label: "Berkeley Investment Group site", client: "Berkeley Investment Group" },
  { repo: "wdb-website-fa26", kind: "internal", label: "WDB's own website (Fall 2026)" },
  { repo: "application-portal", kind: "internal", label: "WDB application portal (Convex)" },
  { repo: "tp-fa22-frontend", kind: "team_project", label: "Fall 2022 technical project — frontend" },
  { repo: "tp-fa22-backend", kind: "team_project", label: "Fall 2022 technical project — backend" },
  { repo: "tp-sp23-frontend", kind: "team_project", label: "Spring 2023 technical project — frontend" },
  { repo: "tp-sp23-backend", kind: "team_project", label: "Spring 2023 technical project — backend" },
  { repo: "tp-fa23-backend", kind: "team_project", label: "Fall 2023 technical project — backend" },
];

interface GhContributor {
  login: string;
  contributions: number;
  type: string;
}
interface GhUser {
  login: string;
  name: string | null;
  bio: string | null;
  company: string | null;
  location: string | null;
  html_url: string;
}

async function gh<T>(path: string): Promise<T | null> {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: { "user-agent": "campus-universe-research-bot/0.1 (manual, bounded)", accept: "application/vnd.github+json" },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub API HTTP ${res.status} fetching ${path}`);
  return (await res.json()) as T;
}

const FOUNDER_BIO_RE = /\b(co-?founder|founder)\b/i;

async function main() {
  const db = getDb();
  const retrievedAt = nowIso();
  let fetches = 0;

  db.prepare(
    `INSERT INTO sources (id, name, family, url, campuses_json, priority, ingestion_mode, status, last_attempt_at)
     VALUES (?, 'GitHub — web-at-berkeley org', 'code_host', ?, ?, 1, 'api', 'available', ?)
     ON CONFLICT(id) DO UPDATE SET last_attempt_at=excluded.last_attempt_at, status='available'`
  ).run(SOURCE_ID, ORG_URL, JSON.stringify([UNIV_ID]), retrievedAt);

  const findProjectByName = db.prepare(`SELECT id FROM projects WHERE name = ?`);
  const insertProject = db.prepare(
    `INSERT INTO projects (id, name, aliases_json, kind, sector, description, website_url, is_portfolio_reference, is_investable_candidate)
     VALUES (?, ?, '[]', ?, ?, ?, ?, 0, ?)`
  );
  const findPerson = db.prepare(`SELECT id FROM people WHERE name = ?`);
  const insertPerson = db.prepare(`INSERT INTO people (id, name, aliases_json) VALUES (?, ?, ?)`);
  const findAffiliation = db.prepare(`SELECT id FROM affiliations WHERE person_id = ? AND university_id = ? AND role = ?`);
  const insertAffiliation = db.prepare(
    `INSERT INTO affiliations (id, person_id, university_id, role, status, claim_id) VALUES (?, ?, ?, ?, 'unverified', ?)`
  );
  const findRole = db.prepare(`SELECT id FROM person_project_roles WHERE person_id = ? AND project_id = ?`);
  const insertRole = db.prepare(`INSERT INTO person_project_roles (id, person_id, project_id, role, claim_id) VALUES (?, ?, ?, ?, ?)`);
  const insertRel = db.prepare(
    `INSERT INTO relationships (id, source_entity_type, source_entity_id, target_entity_type, target_entity_id, relationship_type, evidence_claim_ids_json, verification_state)
     VALUES (?, 'person', ?, 'project', ?, ?, ?, 'affiliation_only')`
  );
  const insertClaim = db.prepare(
    `INSERT INTO claims (id, entity_type, entity_id, claim_type, value_json, excerpt, source_id, snapshot_id, source_url, retrieved_at, label, verification_state)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unverified')`
  );
  const insertSignal = db.prepare(
    `INSERT INTO signals (id, project_id, signal_type, current_observation, source_date, significance_note, claim_ids_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  const upsertGate = db.prepare(
    `INSERT INTO gate_results (id, project_id, gate_name, result, rationale, evaluated_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(project_id, gate_name) DO UPDATE SET result=excluded.result, rationale=excluded.rationale, evaluated_at=excluded.evaluated_at`
  );

  const userCache = new Map<string, GhUser | null>();
  let newProjects = 0;
  let newPeople = 0;
  let newCompanies = 0;

  for (const entry of REPOS) {
    if (fetches >= 50) {
      console.log("Hit the 50-fetch scan budget — stopping early (this is intentional, not a bug).");
      break;
    }

    const repoDetail = await gh<{ description: string | null; html_url: string }>(`/repos/${ORG}/${entry.repo}`);
    fetches++;
    if (!repoDetail) {
      console.log(`skip ${entry.repo}: repo not found (renamed/removed since this script was written)`);
      continue;
    }

    const projectName = entry.kind === "client" ? `${entry.client} (via WDB)` : `WDB — ${entry.label}`;
    let projectId: string;
    const existing = findProjectByName.get(projectName) as { id: string } | undefined;
    if (existing) {
      projectId = existing.id;
    } else {
      projectId = newId("proj");
      const sector = entry.kind === "client" ? "client_software" : "internal_tooling";
      insertProject.run(projectId, projectName, "project", sector, repoDetail.description || entry.label, repoDetail.html_url, 0);
      newProjects++;

      insertSignal.run(
        newId("sig"),
        projectId,
        "demo",
        `WDB (Web Development at Berkeley) real GitHub repo "${entry.repo}": ${entry.label}${repoDetail.description ? ` — "${repoDetail.description}"` : ""}.`,
        null,
        entry.kind === "client"
          ? "A real Industry-initiative client project — ability-to-build evidence for the team, not a WDB venture of its own."
          : "WDB's own internal tool/training project — real build evidence, never itself a Startup Scout candidate.",
        JSON.stringify([])
      );
    }

    const contributors = (await gh<GhContributor[]>(`/repos/${ORG}/${entry.repo}/contributors?per_page=100`)) || [];
    fetches++;

    for (const c of contributors) {
      if (c.type !== "User") continue; // skip bots
      if (fetches >= 50) break;

      if (!userCache.has(c.login)) {
        const u = await gh<GhUser>(`/users/${c.login}`);
        fetches++;
        userCache.set(c.login, u);
      }
      const profile = userCache.get(c.login) || null;
      const displayName = profile?.name?.trim() || `@${c.login} (GitHub)`;

      const person = findPerson.get(displayName) as { id: string } | undefined;
      const personId = person?.id ?? newId("person");
      if (!person) {
        insertPerson.run(personId, displayName, JSON.stringify([c.login]));
        newPeople++;
      }

      // Both markers are parsed back out by lib/domain/company-detection.ts —
      // keep this exact `GitHub bio: "..."` / `GitHub company field: "..."`
      // phrasing in sync with that module's regexes if it ever changes.
      const bioNote = profile?.bio ? ` GitHub bio: "${profile.bio}".` : "";
      const companyFieldNote = profile?.company ? ` GitHub company field: "${profile.company}".` : "";
      const excerpt = `GitHub commit history for ${ORG}/${entry.repo} (${entry.label}) credits "${c.login}" (${displayName}) with ${c.contributions} commit(s) — real code contribution, not a self-reported membership claim.${bioNote}${companyFieldNote} Commit-based credit doesn't by itself distinguish project leadership from a smaller contribution, and doesn't confirm current Berkeley enrollment — affiliation seeded unverified.`;
      const claimId = newId("claim");
      insertClaim.run(
        claimId,
        "project",
        projectId,
        "repo_contribution",
        JSON.stringify({ repo: entry.repo, login: c.login, name: profile?.name ?? null, contributions: c.contributions }),
        excerpt,
        SOURCE_ID,
        null,
        `https://github.com/${ORG}/${entry.repo}/commits?author=${c.login}`,
        retrievedAt,
        "observed_fact"
      );

      if (!findAffiliation.get(personId, UNIV_ID, "WDB GitHub contributor")) {
        insertAffiliation.run(newId("aff"), personId, UNIV_ID, "WDB GitHub contributor", claimId);
      }
      if (!findRole.get(personId, projectId)) {
        insertRole.run(newId("ppr"), personId, projectId, "team_member", claimId);
        insertRel.run(newId("rel"), personId, projectId, "contributed_to_project", JSON.stringify([claimId]));
      }

      // Real, self-disclosed founder claim on the person's own GitHub
      // profile — recorded as its own company candidate, never guessed.
      if (profile?.bio && FOUNDER_BIO_RE.test(profile.bio) && profile.company) {
        const companyName = profile.company.replace(/^@/, "").trim();
        if (companyName && companyName.toLowerCase() !== "web-at-berkeley") {
          let companyId: string;
          const existingCo = findProjectByName.get(companyName) as { id: string } | undefined;
          if (existingCo) {
            companyId = existingCo.id;
          } else {
            companyId = newId("proj");
            insertProject.run(companyId, companyName, "company", null, null, null, 1);
            newCompanies++;
          }

          const coExcerpt = `${displayName}'s public GitHub profile (${profile.html_url}) bio self-discloses "${profile.bio}" (company field: "${profile.company}") — a real, self-reported company-formation claim, not independently corroborated yet. Found via WDB's GitHub org because ${displayName} also has real commit history on ${entry.repo}.`;
          const coClaimId = newId("claim");
          insertClaim.run(
            coClaimId,
            "project",
            companyId,
            "self_reported_founder",
            JSON.stringify({ person: displayName, login: c.login, bio: profile.bio, company: profile.company }),
            coExcerpt,
            SOURCE_ID,
            null,
            profile.html_url,
            retrievedAt,
            "observed_fact"
          );
          if (!findRole.get(personId, companyId)) {
            insertRole.run(newId("ppr"), personId, companyId, "founder", coClaimId);
            insertRel.run(newId("rel"), personId, companyId, "founded", JSON.stringify([coClaimId]));
          }
          insertSignal.run(
            newId("sig"),
            companyId,
            "affiliation_change",
            `${displayName} self-discloses "${profile.bio}" on their public GitHub profile.`,
            null,
            "Self-reported company formation, surfaced via a real WDB contributor's own profile — not yet independently verified.",
            JSON.stringify([coClaimId])
          );

          const facts = assembleProjectFacts(db, companyId);
          const outcomes = evaluateAllGates(facts);
          for (const o of outcomes) upsertGate.run(newId("gate"), companyId, o.gate, o.result, o.rationale);
        }
      }
    }
  }

  const totalIngested = (
    db.prepare(`SELECT COUNT(DISTINCT project_id) c FROM person_project_roles ppr JOIN claims c ON c.id = ppr.claim_id WHERE c.source_id = ?`).get(SOURCE_ID) as {
      c: number;
    }
  ).c;
  db.prepare(`UPDATE sources SET last_success_at=?, discovered_lead_count=? WHERE id=?`).run(nowIso(), totalIngested, SOURCE_ID);
  console.log(
    `${newProjects} new project(s), ${newPeople} new person(s), ${newCompanies} new self-reported compan(y/ies), ${fetches} total fetches used, ${totalIngested} projects with real evidence from this source.`
  );
  console.log("All affiliations seeded 'unverified' — a WDB commit credit doesn't by itself confirm current Berkeley enrollment. Roles are 'team_member' from commit history alone, except the one self-disclosed 'founder' claim sourced to the person's own GitHub bio.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
