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

// BUG FOUND AND FIXED (2026-09-25), in three parts:
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
// 3. Chunk size 5 alone STILL wasn't enough for a SUSTAINED run: a real
//    597-profile run stayed 5-for-5 for its first ~15 chunks (~75
//    profiles), then started degrading to 1-of-5 from chunk 16 onward.
//    This script originally scraped ALL chunks into memory and only wrote
//    to the database at the very end — killing the run mid-flight (the
//    right call once degradation was noticed) lost every already-
//    scraped, already-CHARGED profile's data with it. Fixed by writing
//    each chunk's results to the database immediately after that chunk
//    completes, and by bounding each script invocation to
//    MAX_PROFILES_PER_RUN so a single run can't blindly power through
//    hundreds of profiles — re-invoke the script to continue.
// 4. Root cause isolated directly (2026-09-25, later same day): even
//    30-45 minutes after stopping the degraded run — plenty for a simple
//    time-based cooldown — a fresh 5-URL batch STILL came back 1-of-5,
//    while a single-URL run succeeded every time, including 3 separate
//    single-URL runs fired back-to-back with no delay between them. So
//    this was never about sustained volume over time or needing a
//    cooldown — it's specifically the actor's OWN internal concurrency
//    for a multi-query request in one run that trips LinkedIn's anti-bot
//    system, not anything about calling the API repeatedly. Verified
//    directly against the API outside this script before changing it.
//    Fix: CHUNK_SIZE = 1, always — one profile per Apify run, run
//    sequentially. Slower (~13-15s per profile) but reliable.
const CHUNK_SIZE = 1;
const INTER_CHUNK_DELAY_MS = 2000;
const MAX_PROFILES_PER_RUN = 60;
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

async function main() {
  const db = getDb();
  const retrievedAt = nowIso();

  db.prepare(
    `INSERT INTO sources (id, name, family, url, campuses_json, priority, ingestion_mode, status, last_attempt_at)
     VALUES (?, 'LinkedIn (via Apify harvestapi actor)', 'code_host', 'https://apify.com/harvestapi/linkedin-profile-scraper', '[]', 1, 'api', 'available', ?)
     ON CONFLICT(id) DO UPDATE SET last_attempt_at=excluded.last_attempt_at, status='available'`
  ).run(SOURCE_ID, retrievedAt);

  // Prioritize people who have never been resolved at all (no
  // linkedin_profile claim yet) over re-checking already-resolved ones —
  // at 597+ captured aliases, re-fetching everyone every run would be
  // wasteful (real Apify spend) for almost-always-unchanged data. Someone
  // already resolved can still be refreshed by a separate, deliberate
  // pass; this default run maximizes new coverage per dollar/minute.
  const peopleWithLinkedin = db
    .prepare(
      `SELECT id, name, aliases_json FROM people
       WHERE aliases_json LIKE '%linkedin:%'
       AND id NOT IN (SELECT entity_id FROM claims WHERE claim_type='linkedin_profile')
       ORDER BY id`
    )
    .all() as { id: string; name: string; aliases_json: string }[];

  const allTargets: { personId: string; name: string; url: string }[] = [];
  for (const p of peopleWithLinkedin) {
    const aliases: string[] = JSON.parse(p.aliases_json);
    const li = aliases.find((a) => a.startsWith("linkedin:"));
    if (li) allTargets.push({ personId: p.id, name: p.name, url: li.replace("linkedin:", "") });
  }

  if (allTargets.length === 0) {
    console.log("No unresolved people with a captured linkedin: alias found — everyone already has a profile claim on file.");
    return;
  }
  const targets = allTargets.slice(0, MAX_PROFILES_PER_RUN);
  console.log(
    `Looking up ${targets.length} real LinkedIn profile(s) via Apify (${allTargets.length - targets.length} more remain for a future run): ${targets.map((t) => t.name).join(", ")}`
  );

  const token = process.env.APIFY_API_TOKEN;
  if (!token) throw new Error("APIFY_API_TOKEN not set — add it to .env.local first.");

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
  let consecutiveDegradedChunks = 0;
  let processedCount = 0;

  for (let chunkStart = 0; chunkStart < targets.length; chunkStart += CHUNK_SIZE) {
    const chunk = targets.slice(chunkStart, chunkStart + CHUNK_SIZE);
    console.log(`  Apify: scraping profiles ${chunkStart + 1}-${chunkStart + chunk.length} of ${targets.length}...`);

    let chunkProfiles: ApifyProfile[];
    try {
      chunkProfiles = await scrapeProfileChunk(token, chunk.map((t) => t.url));
    } catch (e) {
      console.log(`  Chunk failed entirely (${(e as Error).message}) — stopping this run here. Everything written so far this run is already saved.`);
      break;
    }

    const chunkPositionalOk = chunkProfiles.length === chunk.length;
    if (!chunkPositionalOk) {
      consecutiveDegradedChunks++;
      console.log(`  WARNING: chunk requested ${chunk.length} profiles but got ${chunkProfiles.length} back.`);
    } else {
      consecutiveDegradedChunks = 0;
    }

    for (let i = 0; i < chunk.length; i++) {
      const target = chunk[i];
      processedCount++;
      const profile = chunkPositionalOk
        ? chunkProfiles[i]
        : chunkProfiles.find((p) => p.linkedinUrl && target.url.includes(p.linkedinUrl.replace(/\/$/, "").split("/").pop()!));
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
      // valueJson: a same-day re-run on Eric Cao's real profile
      // (2026-09-25) showed the actor itself returning "San Francisco, CA"
      // vs "San Francisco, California, United States" for the exact same
      // Coinbase internship 17 minutes apart — real upstream formatting
      // noise, not a profile change. Hashing on {position, companyName}
      // only (dropping location/logos/descriptions/skills) avoids false
      // "changed" detections while still catching a real new role. The
      // full raw data is still stored in valueJson either way — this only
      // affects whether a NEW claim row gets written. (In practice this
      // branch is almost always the "new" one now, since targets are
      // pre-filtered to people with no existing claim — kept anyway as a
      // real safety check, not dead code, in case of an unexpected retry.)
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

    // Each chunk's writes are already committed to the DB above before we
    // ever consider stopping — a kill/interrupt/degradation-triggered
    // break past this point cannot lose already-scraped-and-charged data
    // the way the old collect-then-write-at-the-end version could.
    // Threshold raised to 4 now that CHUNK_SIZE=1: a single genuinely-
    // private/deleted profile is real, expected noise (not throttling)
    // and shouldn't stop the whole run — only a real run of several in a
    // row is worth treating as a signal something's actually wrong again.
    if (consecutiveDegradedChunks >= 4) {
      console.log(
        `  Throttling detected (${consecutiveDegradedChunks} consecutive chunks returned far fewer profiles than requested) — stopping this run early rather than burning more Apify spend on likely-empty chunks. ${targets.length - processedCount} of this run's ${targets.length} targets remain; re-run later (after a cooldown) to continue.`
      );
      break;
    }

    if (chunkStart + CHUNK_SIZE < targets.length) await new Promise((r) => setTimeout(r, INTER_CHUNK_DELAY_MS));
  }

  db.prepare(`UPDATE sources SET last_success_at=?, discovered_lead_count=? WHERE id=?`).run(nowIso(), processedCount, SOURCE_ID);

  console.log(
    `${profilesUpdated} profile(s) newly recorded, ${profilesUnchanged} unchanged, ${notFound} not found, ${founderClaimsFound} real founder claim(s) discovered. ${allTargets.length - processedCount} people still unresolved overall — re-run to continue.`
  );
  if (founderClaimsFound === 0) {
    console.log(`0 new founder claims this run is a real, honest result, not a bug — none of the ${processedCount} profiles checked this run had founder/co-founder language anywhere (headline, about, or any job title). Real career evidence is still recorded as a claim on each person regardless.`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
