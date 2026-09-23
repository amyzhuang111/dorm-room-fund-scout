// Real GitHub enrichment for Penn Labs' own tracked products, via the public
// REST API (docs.github.com/en/rest/repos/repos — no auth needed for public
// repo reads, rate-limited to 60/hr unauthenticated, which is plenty for one
// org). This is exactly the "linked GitHub enrichment" step from the brief's
// build sequence (step 5), applied to the one source where we already have a
// confident, unambiguous name match — Penn Labs' own org — rather than
// guessing which GitHub profile belongs to a same-named person, which the
// brief explicitly warns against ("never name alone").
//
// Run: npx tsx scripts/ingest/enrich-penn-labs-github.ts

import crypto from "node:crypto";
import { getDb, newId, nowIso } from "../../lib/db/client";
import { previousSnapshotHash } from "../../lib/ingest/dedup";

const SOURCE_ID = "src_github_pennlabs_org";
const ORG = "pennlabs";

// Chosen by inspecting the org's real repo list for the clearest, most-active
// name match to each product we already track (some products have several
// repos — e.g. Penn Mobile also has penn-mobile-ios/-android; we record the
// one primary repo per product rather than guessing at a combined picture).
const PRODUCT_TO_REPO: Record<string, string> = {
  "Penn Mobile": "penn-mobile",
  "Penn Clubs": "penn-clubs",
  "Penn Courses": "penn-courses",
  "Office Hours Queue": "office-hours-queue",
};

interface GhRepo {
  name: string;
  html_url: string;
  description: string | null;
  stargazers_count: number;
  pushed_at: string;
  open_issues_count: number;
}

async function fetchAllOrgRepos(): Promise<GhRepo[]> {
  const all: GhRepo[] = [];
  for (let page = 1; page <= 5; page++) {
    const res = await fetch(`https://api.github.com/orgs/${ORG}/repos?per_page=100&page=${page}`, {
      headers: { "user-agent": "campus-universe-research-bot/0.1 (manual, bounded)", accept: "application/vnd.github+json" },
    });
    if (!res.ok) throw new Error(`GitHub API HTTP ${res.status} (page ${page})`);
    const batch = (await res.json()) as GhRepo[];
    all.push(...batch);
    if (batch.length < 100) break;
  }
  return all;
}

async function main() {
  const db = getDb();
  const retrievedAt = nowIso();
  const url = `https://api.github.com/orgs/${ORG}/repos`;

  db.prepare(
    `INSERT INTO sources (id, name, family, url, campuses_json, priority, ingestion_mode, status, last_attempt_at)
     VALUES (?, 'GitHub — pennlabs org', 'code_host', ?, ?, 2, 'api', 'available', ?)
     ON CONFLICT(id) DO UPDATE SET last_attempt_at=excluded.last_attempt_at, status='available'`
  ).run(SOURCE_ID, url, JSON.stringify(["univ_penn"]), retrievedAt);

  const repos = await fetchAllOrgRepos();
  const raw = JSON.stringify(repos.map((r) => [r.name, r.pushed_at, r.stargazers_count])); // stable-ish fingerprint
  const hash = crypto.createHash("sha256").update(raw).digest("hex");

  if (previousSnapshotHash(db, SOURCE_ID, url) === hash) {
    db.prepare(`UPDATE sources SET last_attempt_at=?, status='checked_no_new' WHERE id=?`).run(retrievedAt, SOURCE_ID);
    console.log("GitHub (pennlabs org): unchanged since last fetch — skipping re-ingestion.");
    return;
  }

  const snapshotId = newId("snap");
  db.prepare(
    `INSERT INTO snapshots (id, source_id, url, content_hash, fetched_at, http_status, raw_excerpt)
     VALUES (?, ?, ?, ?, ?, 200, ?)`
  ).run(snapshotId, SOURCE_ID, url, hash, retrievedAt, `${repos.length} repos in pennlabs org`);

  const findProject = db.prepare(`SELECT id FROM projects WHERE name = ?`);
  const findExistingClaim = db.prepare(
    `SELECT id FROM claims WHERE entity_type='project' AND entity_id=? AND claim_type='repo_activity' AND excerpt LIKE ?`
  );
  const insertClaim = db.prepare(
    `INSERT INTO claims (id, entity_type, entity_id, claim_type, value_json, excerpt, source_id, snapshot_id, source_url, published_date, retrieved_at, label, verification_state)
     VALUES (?, 'project', ?, 'repo_activity', ?, ?, ?, ?, ?, ?, ?, 'observed_fact', 'unverified')`
  );
  const insertSignal = db.prepare(
    `INSERT INTO signals (id, project_id, signal_type, current_observation, source_date, significance_note, claim_ids_json)
     VALUES (?, ?, 'continued_dev', ?, ?, ?, ?)`
  );

  let enriched = 0;
  for (const [productName, repoName] of Object.entries(PRODUCT_TO_REPO)) {
    const project = findProject.get(productName) as { id: string } | undefined;
    const repo = repos.find((r) => r.name.toLowerCase() === repoName.toLowerCase());
    if (!project || !repo) {
      console.log(`skip: no match for ${productName} -> ${repoName} (project found: ${!!project}, repo found: ${!!repo})`);
      continue;
    }

    const pushedDate = repo.pushed_at.slice(0, 10);
    const excerptTag = `pushed ${pushedDate}`;
    if (findExistingClaim.get(project.id, `%${excerptTag}%`)) {
      continue; // already recorded this exact observation
    }

    const excerpt = `GitHub repo pennlabs/${repo.name}: ${repo.stargazers_count} stars, ${repo.open_issues_count} open issues, last pushed ${pushedDate}${repo.description ? ` — "${repo.description}"` : ""}.`;
    const claimId = newId("claim");
    insertClaim.run(
      claimId,
      project.id,
      JSON.stringify({ repo: repo.name, stars: repo.stargazers_count, pushedAt: repo.pushed_at }),
      excerpt,
      SOURCE_ID,
      snapshotId,
      repo.html_url,
      pushedDate,
      retrievedAt
    );
    insertSignal.run(
      newId("sig"),
      project.id,
      `Primary GitHub repo (${repo.name}) last pushed ${pushedDate}, ${repo.stargazers_count} stars.`,
      pushedDate,
      "Real commit activity on the actual product repo — direct ability-to-build/continued-maintenance evidence, not a self-report.",
      JSON.stringify([claimId])
    );
    enriched++;
  }

  db.prepare(`UPDATE sources SET last_success_at=?, discovered_lead_count=? WHERE id=?`).run(nowIso(), repos.length, SOURCE_ID);
  console.log(`Enriched ${enriched}/${Object.keys(PRODUCT_TO_REPO).length} Penn Labs products with real GitHub repo activity.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
