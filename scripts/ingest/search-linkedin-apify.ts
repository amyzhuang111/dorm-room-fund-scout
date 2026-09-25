// Search LinkedIn for people who still have no linkedin.com/in/ URL.
// Meant to run on Amy's machine, where APIFY_API_TOKEN is in .env.local.
//
// PowerShell (from the repo root):
//   npx tsx scripts/ingest/search-linkedin-apify.ts --dry-run --campus univ_penn
//   npx tsx scripts/ingest/search-linkedin-apify.ts --campus univ_penn --limit 20
//
// A profile is stored as a confirmed `linkedin:` alias only when its
// education or experience text names this person's school or one of their
// companies. Other name matches are stored as claim_type linkedin_candidate
// with verification_state unverified — the UI flags those and does not
// treat them as confirmed links.
//
// Pricing checked against the public harvestapi/linkedin-profile-search
// actor page (Free/Starter tier): $0.10 per search page plus $0.004 per
// full profile. This script asks for one page and at most 3 full profiles
// per person, so the upper bound is $0.112 per person. Scale plan search
// pages are $0.08; Business and above are $0.05. Confirm the live price
// before a large run.
//
// Resumable: each attempted person gets a linkedin_search_attempt claim,
// written before the next person, so a stopped run continues later.
// --limit bounds a single invocation (default 20).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getDb, newId, nowIso } from "../../lib/db/client";

const ACTOR = "harvestapi~linkedin-profile-search";
const SOURCE_ID = "src_linkedin_search_apify";
const SEARCH_PAGE_USD = 0.1;
const FULL_PROFILE_USD = 0.004;
const MAX_FULL_PROFILES = 3;
const DELAY_MS = 2000;

const SCHOOL_PATTERNS: Record<string, RegExp> = {
  univ_penn: /university of pennsylvania|\bupenn\b|\bwharton\b|penn engineering/i,
  univ_berkeley: /university of california,?\s*berkeley|uc berkeley|\bberkeley\b/i,
  univ_waterloo: /university of waterloo|\bwaterloo\b/i,
  univ_stanford: /\bstanford\b/i,
  univ_mit: /massachusetts institute of technology|\bmit\b/i,
  univ_harvard: /\bharvard\b/i,
};

const SCHOOL_QUERY: Record<string, string> = {
  univ_penn: "University of Pennsylvania",
  univ_berkeley: "UC Berkeley",
  univ_waterloo: "University of Waterloo",
  univ_stanford: "Stanford University",
  univ_mit: "MIT",
  univ_harvard: "Harvard University",
};

function loadEnvLocal() {
  if (process.env.APIFY_API_TOKEN) return;
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [path.resolve(process.cwd(), ".env.local"), path.resolve(here, "../../.env.local")];
  for (const envPath of candidates) {
    if (!fs.existsSync(envPath)) continue;
    const text = fs.readFileSync(envPath, "utf8").replace(/^\uFEFF/, "");
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (key && !process.env[key]) process.env[key] = value;
    }
    return;
  }
}

function argValue(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  if (i === -1) return null;
  return process.argv[i + 1] ?? null;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

interface SearchProfile {
  linkedinUrl?: string;
  firstName?: string;
  lastName?: string;
  headline?: string;
  about?: string | null;
  profileTopEducation?: { schoolName?: string }[];
  education?: { schoolName?: string }[];
  currentPosition?: { companyName?: string; position?: string }[];
  experience?: { companyName?: string; position?: string }[];
}

function profileText(p: SearchProfile): string {
  const schools = [...(p.profileTopEducation ?? []), ...(p.education ?? [])].map((s) => s.schoolName ?? "");
  const jobs = [...(p.currentPosition ?? []), ...(p.experience ?? [])].map((j) => `${j.position ?? ""} ${j.companyName ?? ""}`);
  return [p.headline, p.about, ...schools, ...jobs].filter(Boolean).join(" \n ");
}

function nameMatches(personName: string, profile: SearchProfile): boolean {
  const tokens = personName
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.replace(/[^a-z'-]/g, ""))
    .filter((t) => t.length > 1);
  if (tokens.length < 2) return false;
  const first = tokens[0];
  const last = tokens[tokens.length - 1];
  const hay = `${profile.firstName ?? ""} ${profile.lastName ?? ""}`.toLowerCase();
  return hay.includes(first) && hay.includes(last);
}

function confirms(profile: SearchProfile, schoolRe: RegExp | null, companies: string[]): { ok: boolean; why: string } {
  const text = profileText(profile);
  if (schoolRe && schoolRe.test(text)) return { ok: true, why: "profile text names the school on record" };
  for (const company of companies) {
    const needle = company.toLowerCase().trim();
    if (needle.length < 4) continue;
    if (text.toLowerCase().includes(needle)) return { ok: true, why: `profile text names ${company}` };
  }
  return { ok: false, why: "name matched; school and company on the profile did not match records" };
}

async function runSearch(token: string, query: string): Promise<SearchProfile[]> {
  const startRes = await fetch(`https://api.apify.com/v2/acts/${ACTOR}/runs`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      searchQuery: query,
      profileScraperMode: "Full",
      takePages: 1,
      maxItems: MAX_FULL_PROFILES,
    }),
  });
  if (!startRes.ok) throw new Error(`Apify run-start HTTP ${startRes.status}: ${await startRes.text()}`);
  const startData = (await startRes.json()) as { data: { id: string } };
  const runId = startData.data.id;
  const deadline = Date.now() + 5 * 60 * 1000;
  let status = "READY";
  let datasetId: string | null = null;
  while (Date.now() < deadline) {
    await sleep(3000);
    const statusRes = await fetch(`https://api.apify.com/v2/actor-runs/${runId}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!statusRes.ok) throw new Error(`Apify status HTTP ${statusRes.status}`);
    const statusData = (await statusRes.json()) as { data: { status: string; defaultDatasetId: string } };
    status = statusData.data.status;
    datasetId = statusData.data.defaultDatasetId;
    if (["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"].includes(status)) break;
  }
  if (status !== "SUCCEEDED" || !datasetId) throw new Error(`Apify run ${runId} ended ${status}`);
  const itemsRes = await fetch(`https://api.apify.com/v2/datasets/${datasetId}/items`, { headers: { Authorization: `Bearer ${token}` } });
  if (!itemsRes.ok) throw new Error(`Apify dataset HTTP ${itemsRes.status}`);
  return (await itemsRes.json()) as SearchProfile[];
}

function upperBoundUsd(people: number): number {
  return people * (SEARCH_PAGE_USD + MAX_FULL_PROFILES * FULL_PROFILE_USD);
}

async function main() {
  loadEnvLocal();
  const dry = process.argv.includes("--dry-run");
  const campus = argValue("--campus");
  const limit = Math.max(1, parseInt(argValue("--limit") || "20", 10) || 20);
  const db = getDb();

  const campusClause = campus ? "AND a.university_id = ?" : "";
  const params: string[] = campus ? [campus] : [];
  const pending = db
    .prepare(
      `SELECT pe.id, pe.name, a.university_id,
              (SELECT group_concat(p.name, ' | ')
                 FROM person_project_roles ppr
                 JOIN projects p ON p.id = ppr.project_id AND p.kind = 'company'
                WHERE ppr.person_id = pe.id) AS companies
       FROM people pe
       JOIN affiliations a ON a.person_id = pe.id
       WHERE pe.aliases_json NOT LIKE '%linkedin.com/in/%'
         AND pe.id NOT IN (SELECT entity_id FROM claims WHERE claim_type = 'linkedin_search_attempt')
         ${campusClause}
       GROUP BY pe.id
       ORDER BY pe.id`
    )
    .all(...params) as { id: string; name: string; university_id: string; companies: string | null }[];

  const byCampus = new Map<string, number>();
  for (const row of pending) byCampus.set(row.university_id, (byCampus.get(row.university_id) ?? 0) + 1);

  console.log("LinkedIn search backlog (no linkedin.com/in/ URL, not yet attempted):");
  for (const [id, n] of [...byCampus.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${id}: ${n} people, upper bound $${upperBoundUsd(n).toFixed(2)} (Free/Starter: $0.10/page + $0.004 x up to ${MAX_FULL_PROFILES} full profiles)`);
  }
  console.log(`This invocation would search ${Math.min(limit, pending.length)} of ${pending.length} pending${campus ? ` (${campus})` : ""}.`);
  console.log(`Upper bound for this invocation: $${upperBoundUsd(Math.min(limit, pending.length)).toFixed(2)}.`);
  console.log("A page is still charged when the search returns nobody. Confirm the actor price on https://apify.com/harvestapi/linkedin-profile-search before a large run.");

  if (dry) return;
  const token = process.env.APIFY_API_TOKEN;
  if (!token) {
    console.log("APIFY_API_TOKEN is not set. Put it in .env.local and re-run. Nothing was searched.");
    return;
  }

  const now = nowIso();
  db.prepare(
    `INSERT INTO sources (id, name, family, url, campuses_json, priority, ingestion_mode, status, last_attempt_at)
     VALUES (?, 'LinkedIn people search (Apify harvestapi)', 'code_host', 'https://apify.com/harvestapi/linkedin-profile-search', '[]', 2, 'api', 'available', ?)
     ON CONFLICT(id) DO UPDATE SET last_attempt_at = excluded.last_attempt_at`
  ).run(SOURCE_ID, now);

  const insertClaim = db.prepare(
    `INSERT INTO claims (id, entity_type, entity_id, claim_type, value_json, excerpt, source_id, source_url, retrieved_at, label, verification_state)
     VALUES (?, 'person', ?, ?, ?, ?, ?, ?, ?, 'observed_fact', ?)`
  );
  const readAliases = db.prepare(`SELECT aliases_json FROM people WHERE id = ?`);
  const writeAliases = db.prepare(`UPDATE people SET aliases_json = ? WHERE id = ?`);

  const batch = pending.slice(0, limit);
  let confirmed = 0;
  let candidates = 0;
  for (const person of batch) {
    const companies = (person.companies ?? "").split(" | ").map((s) => s.trim()).filter(Boolean);
    const schoolName = SCHOOL_QUERY[person.university_id] ?? person.university_id;
    const companyBit = companies[0] ? ` "${companies[0]}"` : "";
    const query = `"${person.name}" "${schoolName}"${companyBit}`;
    console.log(`Searching ${person.name} — ${query}`);
    let profiles: SearchProfile[] = [];
    try {
      profiles = await runSearch(token, query);
    } catch (e) {
      console.log(`  stopped: ${(e as Error).message}`);
      break;
    }
    const schoolRe = SCHOOL_PATTERNS[person.university_id] ?? null;
    const named = profiles.filter((p) => p.linkedinUrl && p.linkedinUrl.includes("linkedin.com/in/") && nameMatches(person.name, p));
    const confirmedProfiles = named.filter((p) => confirms(p, schoolRe, companies).ok);
    const attemptId = newId("claim");
    insertClaim.run(
      attemptId,
      person.id,
      "linkedin_search_attempt",
      JSON.stringify({ query, returned: profiles.length, nameMatches: named.length, confirmed: confirmedProfiles.length }),
      `Apify LinkedIn search for ${person.name}: ${query}. ${profiles.length} profile(s) returned, ${named.length} name match(es), ${confirmedProfiles.length} confirmed.`,
      SOURCE_ID,
      "https://apify.com/harvestapi/linkedin-profile-search",
      nowIso(),
      "corroborated"
    );

    if (confirmedProfiles.length === 1) {
      const profile = confirmedProfiles[0];
      const url = profile.linkedinUrl!.replace(/\/$/, "");
      const why = confirms(profile, schoolRe, companies).why;
      const aliases = JSON.parse((readAliases.get(person.id) as { aliases_json: string }).aliases_json || "[]") as string[];
      if (!aliases.some((a) => a.includes("linkedin.com/in/"))) {
        aliases.push(`linkedin:${url}`);
        writeAliases.run(JSON.stringify(aliases), person.id);
      }
      insertClaim.run(
        newId("claim"),
        person.id,
        "linkedin_alias_discovered",
        JSON.stringify({ linkedin: url, why }),
        `${person.name}: confirmed LinkedIn ${url} because ${why}. Query: ${query}.`,
        SOURCE_ID,
        url,
        nowIso(),
        "corroborated"
      );
      confirmed++;
      console.log(`  confirmed ${url} (${why})`);
    } else {
      const pool = confirmedProfiles.length > 1 ? confirmedProfiles : named;
      const reason = confirmedProfiles.length > 1 ? "more than one profile matched the school or company" : "name matched; school and company did not";
      for (const profile of pool.slice(0, MAX_FULL_PROFILES)) {
        const url = profile.linkedinUrl!.replace(/\/$/, "");
        insertClaim.run(
          newId("claim"),
          person.id,
          "linkedin_candidate",
          JSON.stringify({ linkedin: url, reason, headline: profile.headline ?? null }),
          `Unverified LinkedIn candidate for ${person.name}: ${url}. ${reason}. Not stored as a confirmed link.`,
          SOURCE_ID,
          url,
          nowIso(),
          "unverified"
        );
        candidates++;
      }
      console.log(`  ${pool.length} unverified candidate(s): ${reason}`);
    }
    await sleep(DELAY_MS);
  }
  console.log(`Done this invocation. Confirmed ${confirmed}. Unverified candidate rows ${candidates}. Re-run the same command to continue.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
