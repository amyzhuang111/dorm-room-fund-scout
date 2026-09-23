// Shared ingestion logic for any Devpost-hosted hackathon gallery (PennApps,
// TreeHacks, Cal Hacks, Hack the North, ... — Devpost's markup is identical
// across events, verified directly against both PennApps XXVI and TreeHacks
// 2026). Bounded to a ~30-fetch scan budget PER RUN, but walks the gallery's
// real pagination (`?page=N`, verified against the live PennApps/TreeHacks/
// Cal Hacks galleries — e.g. PennApps XXVI is 85 projects across 4 pages,
// TreeHacks 2026 is 378, Cal Hacks 12.0 is 699) instead of only ever
// re-fetching page 1. The next page to start from is persisted on the
// source row (`refresh_suggestion` — otherwise-unused column, repurposed
// here rather than adding a migration) so repeated runs make real forward
// progress through a large gallery instead of re-discovering the same
// already-ingested page 1 as duplicates every time. Affiliation is ALWAYS
// seeded "unverified" — a Devpost profile carries no school field, so
// submitting to a campus-hosted hackathon can't by itself confirm enrollment
// there; the affiliation gate is exactly the right place to hold that
// uncertainty, not a reason to skip ingestion.

import * as cheerio from "cheerio";
import crypto from "node:crypto";
import { getDb, newId, nowIso } from "../db/client";
import { previousSnapshotHash } from "./dedup";
import { assembleProjectFacts } from "../domain/facts";
import { evaluateAllGates } from "../screening/gates";

export interface DevpostHackathonConfig {
  sourceId: string;
  sourceName: string;
  galleryUrl: string;
  universityId: string;
  eventLabel: string; // e.g. "PennApps XXVI", used in claim/signal text
  roleLabel: string; // e.g. "PennApps XXVI team member"
  maxProjectFetches?: number;
}

interface GalleryEntry {
  name: string;
  url: string;
  tagline: string;
  isWinner: boolean;
}

function extractGalleryEntries(html: string): GalleryEntry[] {
  const $ = cheerio.load(html);
  const out: GalleryEntry[] = [];
  $(".gallery-item").each((_, el) => {
    const $el = $(el);
    const url = $el.find("a.link-to-software").attr("href") || "";
    const name = $el.find("h5").first().text().trim();
    const tagline = $el.find(".tagline").first().text().trim();
    const isWinner = $el.find("img.winner").length > 0;
    if (name && url) out.push({ name, url, tagline, isWinner });
  });
  return out;
}

interface TeamMember {
  name: string;
  profileUrl: string;
  contributionNote: string | null;
}

function extractProjectDetail(html: string): { title: string; tagline: string; members: TeamMember[] } {
  const $ = cheerio.load(html);
  const title = $("#app-title").first().text().trim();
  const tagline = $("#app-title").parent().find("p.large").first().text().trim();
  const members: TeamMember[] = [];
  $("li.software-team-member").each((_, el) => {
    const $el = $(el);
    const link = $el.find("a.user-profile-link").first();
    const profileUrl = link.attr("href") || "";
    const name = link.find("img").attr("alt") || link.find("img").attr("title") || "";
    const contributionNote = $el.find(".bubble p").first().text().trim() || null;
    if (name && profileUrl) members.push({ name, profileUrl, contributionNote });
  });
  return { title, tagline, members };
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "user-agent": "campus-universe-research-bot/0.1 (manual, bounded)" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return res.text();
}

export async function ingestDevpostHackathon(cfg: DevpostHackathonConfig) {
  const maxProjectFetches = cfg.maxProjectFetches ?? 24;
  const db = getDb();
  const retrievedAt = nowIso();

  const existing = db.prepare(`SELECT refresh_suggestion FROM sources WHERE id = ?`).get(cfg.sourceId) as
    | { refresh_suggestion: string | null }
    | undefined;
  const startPage = Math.max(1, parseInt(existing?.refresh_suggestion || "1", 10) || 1);

  db.prepare(
    `INSERT INTO sources (id, name, family, url, campuses_json, priority, ingestion_mode, status, last_attempt_at)
     VALUES (?, ?, 'hackathon', ?, ?, 1, 'html_scrape', 'available', ?)
     ON CONFLICT(id) DO UPDATE SET last_attempt_at=excluded.last_attempt_at, status='available'`
  ).run(cfg.sourceId, cfg.sourceName, cfg.galleryUrl, JSON.stringify([cfg.universityId]), retrievedAt);

  // Projects are keyed by their Devpost project URL, not name — generic
  // one-word hackathon project names ("Aegis", "Freebie", ...) legitimately
  // recur across unrelated events.
  const findProjectByUrl = db.prepare(`SELECT id FROM projects WHERE website_url = ?`);

  // Walk gallery pages starting from where the last run left off, collecting
  // not-yet-ingested entries until we have enough to fill this run's budget
  // or the gallery ends. A page whose content is unchanged since last seen
  // still gets parsed for entries (we may be walking past it for the first
  // time even if its content is stable) — only the snapshot INSERT itself is
  // skipped on an unchanged page, to avoid duplicate snapshot rows.
  let page = startPage;
  let resumePage = startPage;
  let fetches = 0;
  const entriesToProcess: GalleryEntry[] = [];
  let reachedEnd = false;

  while (entriesToProcess.length < maxProjectFetches && fetches < 30) {
    const pageUrl = page === 1 ? cfg.galleryUrl : `${cfg.galleryUrl}?page=${page}`;
    let html: string;
    try {
      html = await fetchText(pageUrl);
      fetches++;
    } catch (e) {
      console.log(`${cfg.eventLabel} gallery page ${page}: fetch failed (${(e as Error).message}) — stopping the pagination walk here for this run.`);
      break;
    }

    const hash = crypto.createHash("sha256").update(html).digest("hex");
    if (previousSnapshotHash(db, cfg.sourceId, pageUrl) !== hash) {
      db.prepare(
        `INSERT INTO snapshots (id, source_id, url, content_hash, fetched_at, http_status, raw_excerpt) VALUES (?, ?, ?, ?, ?, 200, ?)`
      ).run(newId("snap"), cfg.sourceId, pageUrl, hash, retrievedAt, `${cfg.eventLabel} project-gallery page ${page}`);
    }

    const pageEntries = extractGalleryEntries(html);
    if (pageEntries.length === 0) {
      // Past the last real page — wrap back to page 1 on the next run so a
      // late-added submission (or a re-numbered gallery) still gets picked up.
      console.log(`${cfg.eventLabel} gallery: page ${page} is empty — reached the end of the gallery.`);
      reachedEnd = true;
      resumePage = 1;
      break;
    }

    const newOnThisPage = pageEntries.filter((e) => !findProjectByUrl.get(e.url));
    const remainingBudget = maxProjectFetches - entriesToProcess.length;
    if (newOnThisPage.length <= remainingBudget) {
      entriesToProcess.push(...newOnThisPage);
      resumePage = page + 1; // this page is fully consumed (all its new entries queued)
      page++;
    } else {
      entriesToProcess.push(...newOnThisPage.slice(0, remainingBudget));
      resumePage = page; // leftover new entries remain on this page — retry it next run
      break;
    }
  }

  console.log(
    `${cfg.eventLabel} gallery: walked page ${startPage}${page > startPage ? `–${reachedEnd ? page - 1 : page}` : ""}, ${entriesToProcess.length} new project(s) queued this run (bounded sample, not necessarily the full event yet).`
  );

  const insertProject = db.prepare(
    `INSERT INTO projects (id, name, aliases_json, kind, sector, description, website_url, is_portfolio_reference, is_investable_candidate)
     VALUES (?, ?, '[]', 'project', NULL, ?, ?, 0, 1)`
  );
  // People are keyed by their Devpost profile URL (stored as a `devpost:<url>`
  // alias), not display name — common names (e.g. "William Feng") otherwise
  // silently merge unrelated real people across different hackathons/campuses.
  // This is the "same-name people remain separate without corroboration" rule.
  const findPersonByAlias = db.prepare(`SELECT id FROM people WHERE aliases_json LIKE ?`);
  const insertPerson = db.prepare(`INSERT INTO people (id, name, aliases_json) VALUES (?, ?, ?)`);
  const findPersonByDevpostProfile = (profileUrl: string): { id: string } | undefined =>
    findPersonByAlias.get(`%"devpost:${profileUrl}"%`) as { id: string } | undefined;
  const findAffiliation = db.prepare(`SELECT id FROM affiliations WHERE person_id = ? AND university_id = ? AND role = ?`);
  const insertAffiliation = db.prepare(
    `INSERT INTO affiliations (id, person_id, university_id, role, status, claim_id) VALUES (?, ?, ?, ?, 'unverified', ?)`
  );
  const findRole = db.prepare(`SELECT id FROM person_project_roles WHERE person_id = ? AND project_id = ?`);
  // 'team_member', not 'founder' — Devpost's public team-member list never
  // tells us who owned what (FOUNDER_SCOUT_SOURCING.md §8/§18: "do not assume
  // equal contribution from team membership"), and this is a hackathon
  // submission (kind='project'), not a claim of company founder status.
  const insertRole = db.prepare(`INSERT INTO person_project_roles (id, person_id, project_id, role, claim_id) VALUES (?, ?, ?, 'team_member', ?)`);
  const insertRel = db.prepare(
    `INSERT INTO relationships (id, source_entity_type, source_entity_id, target_entity_type, target_entity_id, relationship_type, evidence_claim_ids_json, verification_state)
     VALUES (?, 'person', ?, 'project', ?, 'founded', ?, 'affiliation_only')`
  );
  const insertClaim = db.prepare(
    `INSERT INTO claims (id, entity_type, entity_id, claim_type, value_json, excerpt, source_id, snapshot_id, source_url, retrieved_at, label, verification_state)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unverified')`
  );
  const insertSignal = db.prepare(
    `INSERT INTO signals (id, project_id, signal_type, current_observation, source_date, significance_note, claim_ids_json)
     VALUES (?, ?, 'demo', ?, ?, ?, ?)`
  );
  const upsertGate = db.prepare(
    `INSERT INTO gate_results (id, project_id, gate_name, result, rationale, evaluated_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(project_id, gate_name) DO UPDATE SET result=excluded.result, rationale=excluded.rationale, evaluated_at=excluded.evaluated_at`
  );

  let newProjects = 0;
  let newPeople = 0;

  for (const entry of entriesToProcess) {
    if (fetches >= 30) {
      console.log("Hit the 30-fetch scan budget — stopping early (this is intentional, not a bug).");
      break;
    }
    if (findProjectByUrl.get(entry.url)) continue; // already ingested this exact submission (found again on a re-walked page)

    let detailHtml: string;
    try {
      detailHtml = await fetchText(entry.url);
      fetches++;
    } catch (e) {
      console.log(`skip ${entry.name}: fetch failed (${(e as Error).message})`);
      continue;
    }
    const detailHash = crypto.createHash("sha256").update(detailHtml).digest("hex");
    const detailSnapshotId = newId("snap");
    db.prepare(
      `INSERT INTO snapshots (id, source_id, url, content_hash, fetched_at, http_status, raw_excerpt) VALUES (?, ?, ?, ?, ?, 200, ?)`
    ).run(detailSnapshotId, cfg.sourceId, entry.url, detailHash, retrievedAt, `Devpost project page: ${entry.name}`);

    const detail = extractProjectDetail(detailHtml);
    const projectId = newId("proj");
    insertProject.run(projectId, entry.name, detail.tagline || entry.tagline || null, entry.url);
    newProjects++;

    const winnerNote = entry.isWinner ? " (won a prize at the event — one evidence record, not a ranking by itself)" : "";
    insertSignal.run(
      newId("sig"),
      projectId,
      `${cfg.eventLabel} project gallery submission: "${entry.name}" — ${detail.tagline || entry.tagline}${winnerNote}.`,
      null,
      "Hackathon submission is a real, dated build-evidence signal. Absence of a prize is not evidence against the team — non-winning teams can still be strong.",
      JSON.stringify([])
    );

    for (const member of detail.members) {
      const person = findPersonByDevpostProfile(member.profileUrl);
      const personId = person?.id ?? newId("person");
      if (!person) {
        insertPerson.run(personId, member.name, JSON.stringify([`devpost:${member.profileUrl}`]));
        newPeople++;
      }

      const excerpt = `Devpost profile "${member.profileUrl}" (display name "${member.name}") listed as a team member on ${cfg.eventLabel} submission "${entry.name}".${
        member.contributionNote ? ` Their own note: "${member.contributionNote}"` : ""
      } Devpost profiles carry no school field, so this does NOT by itself confirm enrollment — affiliation is seeded as unverified pending independent research.`;
      const claimId = newId("claim");
      insertClaim.run(claimId, "project", projectId, "hackathon_submission", JSON.stringify({ project: entry.name, member: member.name }), excerpt, cfg.sourceId, detailSnapshotId, entry.url, retrievedAt, "observed_fact");

      if (!findAffiliation.get(personId, cfg.universityId, cfg.roleLabel)) {
        insertAffiliation.run(newId("aff"), personId, cfg.universityId, cfg.roleLabel, claimId);
      }
      if (!findRole.get(personId, projectId)) {
        insertRole.run(newId("ppr"), personId, projectId, claimId);
        insertRel.run(newId("rel"), personId, projectId, JSON.stringify([claimId]));
      }
    }

    const facts = assembleProjectFacts(db, projectId);
    const outcomes = evaluateAllGates(facts);
    for (const o of outcomes) upsertGate.run(newId("gate"), projectId, o.gate, o.result, o.rationale);
  }

  // Cumulative total, not just this run's slice — a real count of every
  // project ever ingested from this source, so the number stays honest as
  // repeated runs walk further into the gallery over time.
  const totalIngested = (
    db.prepare(`SELECT COUNT(DISTINCT project_id) c FROM person_project_roles ppr JOIN claims c ON c.id = ppr.claim_id WHERE c.source_id = ?`).get(cfg.sourceId) as { c: number }
  ).c;
  db.prepare(`UPDATE sources SET last_success_at=?, discovered_lead_count=?, refresh_suggestion=? WHERE id=?`).run(
    nowIso(),
    totalIngested,
    String(resumePage),
    cfg.sourceId
  );
  console.log(`${newProjects} new project(s), ${newPeople} new person(s), ${fetches} total fetches used, ${totalIngested} total ingested from this source so far.`);
  console.log(`Next run resumes at gallery page ${resumePage}${reachedEnd ? " (wrapped back to the start — the last walk reached the end of the gallery)" : "."}`);
  console.log("All affiliations seeded as 'unverified' — confirming enrollment for any of these people is a research task, not assumed.");
}
