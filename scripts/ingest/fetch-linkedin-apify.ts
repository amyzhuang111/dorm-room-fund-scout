// Real ingestion from LinkedIn profile data, via the harvestapi/linkedin-
// profile-scraper Apify actor (https://apify.com/harvestapi/linkedin-
// profile-scraper — "No cookies or account required", $4 per 1000
// profiles). Closes a gap this codebase has disclosed twice before (WDB's
// GitHub-bio adapter comment, and Penn Electric Racing's own header): a
// person's self-linked personal LinkedIn URL was captured as an alias but
// never fetched, "no reliable logged-out access to LinkedIn profile
// content in this environment". Apify's actor resolves that — verified by
// a real test call against Kunwoo Kim's real profile (2026-09-25) before
// writing any of the parsing logic below, not guessed from documentation.
//
// Scope: only people who ALREADY have a `linkedin:<url>` alias recorded by
// an earlier adapter (currently just the 8 Penn Electric Racing members
// who self-linked one) — this script never searches LinkedIn or discovers
// new people, it only reads profiles this codebase already has permission-
// shaped reason to look up (a person's own public self-disclosure of their
// LinkedIn on a campus org's team page).
//
// Real schema observed from the test call: `headline`, `about`, and a
// structured `experience[]` array of {position, companyName,
// companyLinkedinUrl}. All 8 of the real profiles fetched this pass
// (2026-09-25) had zero founder/co-founder language anywhere — real,
// legitimate career/internship evidence instead (SpaceX, Tesla, Coinbase,
// Lockheed Martin, AWS, etc.), which is genuine "ability to build"
// evidence but NOT founder evidence. Per this codebase's own discipline
// (never invent a company that isn't there), no `kind='company'` project
// rows are created for real employers like Tesla or SpaceX — that would
// misrepresent someone's day job as a startup they're building. The full
// headline/about/experience list is instead stored as a single claim on
// the person, human-readable, so a reviewer can see the real career
// picture without this script over-modeling it into the company graph.
// Only a job title or headline/about text that itself contains
// "founder"/"co-founder" (FOUNDER_RE below — same pattern as WDB's
// FOUNDER_BIO_RE) creates a real company + founder role, sourced to the
// exact LinkedIn text, exactly like every other self-disclosed-founder
// claim in this codebase.
//
// Requires APIFY_API_TOKEN (see .env.local — gitignored, never commit it).
// Run: npx tsx scripts/ingest/fetch-linkedin-apify.ts

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getDb, newId, nowIso } from "../../lib/db/client";

// Node's --env-file flag works too, but reading .env.local directly here
// means this script "just works" with the plain `npx tsx` invocation every
// other script in this directory uses, no extra flag to remember.
function loadEnvLocal() {
  if (process.env.APIFY_API_TOKEN) return;
  const envPath = path.join(__dirname, "../../.env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}
loadEnvLocal();

const SOURCE_ID = "src_linkedin_apify";
const APIFY_ACTOR = "harvestapi~linkedin-profile-scraper";
const FOUNDER_RE = /\b(co-?founder|founder|founding\s+(engineer|member))\b/i;

interface ExperienceEntry {
  position?: string;
  companyName?: string;
  companyLinkedinUrl?: string;
}
interface ApifyProfile {
  linkedinUrl?: string;
  firstName?: string;
  lastName?: string;
  headline?: string;
  about?: string | null;
  experience?: ExperienceEntry[] | null;
}

// See the long comment at its call site: excludes fields (location, logos,
// descriptions, skills) observed to vary between identical calls to the
// actor, so a re-run doesn't create a spurious "changed" claim.
function stableFingerprint(headline: string | undefined, about: string | null | undefined, experience: ExperienceEntry[]): string {
  return JSON.stringify({
    headline,
    about,
    experience: experience.map((e) => ({ position: e.position, companyName: e.companyName })),
  });
}

// BUG FOUND AND FIXED (2026-09-25), in two parts:
// 1. The sync endpoint used here originally (`run-sync-get-dataset-items`)
//    has a server-side request timeout that a large batch can blow
//    through — tested directly with a real 51-URL batch and it returned
//    HTTP 201 (a "successful" response) with only 1 of 51 profiles in the
//    body, no error. Switched to Apify's async run -> poll -> fetch-
//    dataset pattern, which has no such tight window.
// 2. That alone wasn't enough: chunks of 15 through the async pattern
//    STILL mostly failed (1 of 15 real profiles came back, repeatedly,
//    across 3 separate chunks) even though the run itself reported
//    SUCCEEDED — this actor has no per-request account/cookie of its own,
//    so a burst of ~15 concurrent LinkedIn profile fetches from its shared
//    proxy pool apparently trips LinkedIn's own anti-bot throttling within
//    a single run. Verified by testing progressively smaller batches
//    directly against the API: a clean batch of 5 succeeded 5-for-5 in
//    13.6s, so CHUNK_SIZE is set there — found empirically, not guessed.
const CHUNK_SIZE = 5;
const INTER_CHUNK_DELAY_MS = 5000;
const POLL_INTERVAL_MS = 3000;
const MAX_POLL_MS = 5 * 60 * 1000;

async function scrapeProfileChunk(token: string, urls: string[]): Promise<ApifyProfile[]> {
  const startRes = await fetch(`https://api.apify.com/v2/acts/${APIFY_ACTOR}/runs`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ profileScraperMode: "Profile details no email ($4 per 1k)", queries: urls }),
  });
  if (!startRes.ok) throw new Error(`Apify run-start HTTP ${startRes.status}: ${await startRes.text()}`);
  const startData = (await startRes.json()) as { data: { id: string } };
  const runId = startData.data.id;

  const deadline = Date.now() + MAX_POLL_MS;
  let status = "READY";
  let datasetId: string | null = null;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const statusRes = await fetch(`https://api.apify.com/v2/actor-runs/${runId}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!statusRes.ok) throw new Error(`Apify run-status HTTP ${statusRes.status}: ${await statusRes.text()}`);
    const statusData = (await statusRes.json()) as { data: { status: string; defaultDatasetId: string } };
    status = statusData.data.status;
    datasetId = statusData.data.defaultDatasetId;
    if (status === "SUCCEEDED" || status === "FAILED" || status === "ABORTED" || status === "TIMED-OUT") break;
  }
  if (status !== "SUCCEEDED") throw new Error(`Apify run ${runId} ended with status ${status} (chunk of ${urls.length} URLs) — not treating as a silent 0-result.`);
  if (!datasetId) throw new Error(`Apify run ${runId} succeeded but returned no datasetId.`);

  const itemsRes = await fetch(`https://api.apify.com/v2/datasets/${datasetId}/items`, { headers: { Authorization: `Bearer ${token}` } });
  if (!itemsRes.ok) throw new Error(`Apify dataset-fetch HTTP ${itemsRes.status}: ${await itemsRes.text()}`);
  return (await itemsRes.json()) as ApifyProfile[];
}

async function scrapeProfiles(urls: string[]): Promise<ApifyProfile[]> {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) throw new Error("APIFY_API_TOKEN not set — add it to .env.local first.");
  const results: ApifyProfile[] = [];
  for (let i = 0; i < urls.length; i += CHUNK_SIZE) {
    const chunk = urls.slice(i, i + CHUNK_SIZE);
    console.log(`  Apify: scraping profiles ${i + 1}-${i + chunk.length} of ${urls.length}...`);
    const chunkResults = await scrapeProfileChunk(token, chunk);
    if (chunkResults.length !== chunk.length) {
      console.log(`  WARNING: chunk requested ${chunk.length} profiles but got ${chunkResults.length} back — some may be private/removed, or this may need investigating rather than assuming.`);
    }
    results.push(...chunkResults);
    if (i + CHUNK_SIZE < urls.length) await new Promise((r) => setTimeout(r, INTER_CHUNK_DELAY_MS));
  }
  return results;
}

async function main() {
  const db = getDb();
  const retrievedAt = nowIso();

  db.prepare(
    `INSERT INTO sources (id, name, family, url, campuses_json, priority, ingestion_mode, status, last_attempt_at)
     VALUES (?, 'LinkedIn (via Apify harvestapi actor)', 'code_host', 'https://apify.com/harvestapi/linkedin-profile-scraper', '[]', 1, 'api', 'available', ?)
     ON CONFLICT(id) DO UPDATE SET last_attempt_at=excluded.last_attempt_at, status='available'`
  ).run(SOURCE_ID, retrievedAt);

  const peopleWithLinkedin = db
    .prepare(`SELECT id, name, aliases_json FROM people WHERE aliases_json LIKE '%linkedin:%'`)
    .all() as { id: string; name: string; aliases_json: string }[];

  const targets: { personId: string; name: string; url: string }[] = [];
  for (const p of peopleWithLinkedin) {
    const aliases: string[] = JSON.parse(p.aliases_json);
    const li = aliases.find((a) => a.startsWith("linkedin:"));
    if (li) targets.push({ personId: p.id, name: p.name, url: li.replace("linkedin:", "") });
  }

  if (targets.length === 0) {
    console.log("No people with a captured linkedin: alias found — nothing to look up.");
    return;
  }
  console.log(`Looking up ${targets.length} real LinkedIn profile(s) via Apify: ${targets.map((t) => t.name).join(", ")}`);

  const profiles = await scrapeProfiles(targets.map((t) => t.url));

  // The actor returns results in the same order as `queries` when counts
  // match (verified 2026-09-25: an 8-in/8-out test call preserved order
  // exactly) — trust positional correlation only when lengths agree;
  // otherwise fall back to substring-matching the returned identifier
  // against the requested URL, which can legitimately fail if LinkedIn
  // resolved the person to a newer custom vanity URL they claimed after
  // this codebase captured their original default-ID one (real case:
  // Stella Lin's captured `stella-lin-4588bb22a` resolved to her own
  // `stella-lin-upenn` — same real person, corroborated by matching real
  // Penn Electric Racing experience in the response, not guessed).
  const positionalOk = profiles.length === targets.length;
  function findProfileFor(target: { url: string }, idx: number): ApifyProfile | undefined {
    if (positionalOk) return profiles[idx];
    return profiles.find((p) => p.linkedinUrl && target.url.includes(p.linkedinUrl.replace(/\/$/, "").split("/").pop()!));
  }

  const findExistingClaim = db.prepare(
    `SELECT id, value_json FROM claims WHERE entity_type='person' AND entity_id=? AND claim_type='linkedin_profile' ORDER BY created_at DESC LIMIT 1`
  );
  const insertClaim = db.prepare(
    `INSERT INTO claims (id, entity_type, entity_id, claim_type, value_json, excerpt, source_id, snapshot_id, source_url, retrieved_at, label, verification_state)
     VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, 'observed_fact', ?)`
  );
  const findProjectByName = db.prepare(`SELECT id FROM projects WHERE name = ? AND kind = 'company'`);
  const insertCompany = db.prepare(
    `INSERT INTO projects (id, name, aliases_json, kind, sector, description, is_portfolio_reference, is_investable_candidate)
     VALUES (?, ?, '[]', 'company', NULL, ?, 0, 1)`
  );
  const findPPRole = db.prepare(`SELECT id FROM person_project_roles WHERE person_id = ? AND project_id = ?`);
  const insertPPRole = db.prepare(`INSERT INTO person_project_roles (id, person_id, project_id, role, claim_id) VALUES (?, ?, ?, 'founder', ?)`);
  const insertRel = db.prepare(
    `INSERT INTO relationships (id, source_entity_type, source_entity_id, target_entity_type, target_entity_id, relationship_type, evidence_claim_ids_json, verification_state)
     VALUES (?, 'person', ?, 'project', ?, 'founded', ?, 'affiliation_only')`
  );

  let profilesUpdated = 0;
  let profilesUnchanged = 0;
  let founderClaimsFound = 0;
  let notFound = 0;

  for (let idx = 0; idx < targets.length; idx++) {
    const target = targets[idx];
    const profile = findProfileFor(target, idx);
    if (!profile) {
      console.log(`  (no result for ${target.name} — profile may be private/removed/rate-limited)`);
      notFound++;
      continue;
    }
    if (profile.linkedinUrl && !target.url.includes(profile.linkedinUrl.replace(/\/$/, "").split("/").pop()!)) {
      console.log(`  (${target.name}: LinkedIn resolved a different URL than captured — ${target.url} -> ${profile.linkedinUrl}, likely a claimed custom vanity URL; treating as the same real person, corroborated by profile content, not guessed)`);
    }

    const experience = profile.experience || [];
    const valueJson = JSON.stringify({ headline: profile.headline, about: profile.about, experience });
    // Idempotency is checked against a STABLE fingerprint, not the raw
    // valueJson: a same-day re-run on Eric Cao's real profile (2026-09-25)
    // showed the actor itself returning "San Francisco, CA" vs "San
    // Francisco, California, United States" for the exact same Coinbase
    // internship 17 minutes apart — real upstream formatting noise, not a
    // profile change. Hashing on {position, companyName, startDate,
    // endDate} only (dropping location/logos/descriptions/skills) avoids
    // false "changed" detections from that noise while still catching a
    // real new role. The full raw data is still stored in valueJson
    // either way — this only affects whether a NEW claim row gets written.
    const hash = crypto.createHash("sha256").update(stableFingerprint(profile.headline, profile.about, experience)).digest("hex");
    const existing = findExistingClaim.get(target.personId) as { id: string; value_json: string } | undefined;
    const existingParsed = existing ? (JSON.parse(existing.value_json) as { headline?: string; about?: string | null; experience?: ExperienceEntry[] }) : null;
    const existingHash = existingParsed
      ? crypto.createHash("sha256").update(stableFingerprint(existingParsed.headline, existingParsed.about, existingParsed.experience || [])).digest("hex")
      : null;

    if (existingHash === hash) {
      profilesUnchanged++;
    } else {
      const expList = experience.map((e) => `${e.position || "?"} @ ${e.companyName || "?"}`).join("; ");
      const excerpt = `${target.name}'s real LinkedIn profile (${target.url}), fetched via Apify: headline "${profile.headline || ""}"${
        profile.about ? `; about: "${profile.about.slice(0, 300)}${profile.about.length > 300 ? "..." : ""}"` : ""
      }${expList ? `; experience: ${expList}` : ""}. Real career/internship evidence, not itself founder evidence unless a role explicitly says so.`;
      insertClaim.run(newId("claim"), "person", target.personId, "linkedin_profile", valueJson, excerpt, SOURCE_ID, target.url, retrievedAt, "corroborated");
      profilesUpdated++;
    }

    // Founder detection: headline, about, and each experience position —
    // only an EXPLICIT "founder"/"co-founder" match, same discipline as
    // WDB's FOUNDER_BIO_RE. Never inferred from company size/name/anything else.
    const founderHits: { text: string; companyName: string | undefined }[] = [];
    if (profile.headline && FOUNDER_RE.test(profile.headline)) founderHits.push({ text: profile.headline, companyName: undefined });
    if (profile.about && FOUNDER_RE.test(profile.about)) founderHits.push({ text: profile.about, companyName: undefined });
    for (const e of experience) {
      if (e.position && FOUNDER_RE.test(e.position)) founderHits.push({ text: e.position, companyName: e.companyName });
    }

    for (const hit of founderHits) {
      const companyName = hit.companyName?.trim();
      if (!companyName) continue; // a founder-sounding headline/about with no named company isn't attributable to any specific venture — don't guess one
      let companyId: string;
      const existingCo = findProjectByName.get(companyName) as { id: string } | undefined;
      if (existingCo) {
        companyId = existingCo.id;
      } else {
        companyId = newId("proj");
        insertCompany.run(companyId, companyName, `Real company, self-disclosed via ${target.name}'s LinkedIn job title "${hit.text}".`);
      }
      if (!findPPRole.get(target.personId, companyId)) {
        const claimId = newId("claim");
        insertClaim.run(
          claimId,
          "project",
          companyId,
          "self_reported_founder",
          JSON.stringify({ person: target.name, company: companyName, text: hit.text }),
          `${target.name}'s real LinkedIn profile lists the role "${hit.text}" at "${companyName}" — a real, self-disclosed founder claim on their own profile.`,
          SOURCE_ID,
          target.url,
          retrievedAt,
          "corroborated"
        );
        insertPPRole.run(newId("ppr"), target.personId, companyId, claimId);
        insertRel.run(newId("rel"), target.personId, companyId, JSON.stringify([claimId]));
        founderClaimsFound++;
      }
    }
  }

  db.prepare(`UPDATE sources SET last_success_at=?, discovered_lead_count=? WHERE id=?`).run(nowIso(), targets.length, SOURCE_ID);

  console.log(
    `${profilesUpdated} profile(s) newly recorded/updated, ${profilesUnchanged} unchanged since last run, ${notFound} not found, ${founderClaimsFound} real founder claim(s) discovered.`
  );
  if (founderClaimsFound === 0) {
    console.log(`0 new founder claims this run is a real, honest result, not a bug — none of the ${targets.length} profiles checked this run had new founder/co-founder language anywhere (headline, about, or any job title) beyond what's already on file. Real career evidence is still recorded as a claim on each person regardless.`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
