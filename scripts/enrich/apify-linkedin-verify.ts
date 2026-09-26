// Verify unverified linkedin.com/in candidates by scraping those profile
// URLs. Does not search Google. Does not write the database; `import` does.
//
// Actor: harvestapi/linkedin-profile-scraper (no cookies, no login).
// Compared 2026-09-26:
//   harvestapi/linkedin-profile-scraper  $4.00 / 1,000 profile details
//     pay-per-event since 2025-07-04, no actor-start fee, no platform
//     usage charge. Modified 2026-09-22. About 74k users, 4.8/5, ~31M runs.
//   dev_fusion/Linkedin-Profile-Scraper  $10.00 / 1,000 results.
//     Free plans cannot call it from the API (10 profiles per run, UI only).
//   supreme_coder/linkedin-profile-scraper  $5.00 / 1,000 on the actor page
//     the same day ($6.00 on its pricing tab). Far fewer users.
// Email search is off, so the $10 / 1,000 email event is not used.
// Confirm the live price before a large run:
//   https://apify.com/harvestapi/linkedin-profile-scraper
//
// URLs are sent 40 per actor run. This actor bills per profile, not per
// run; batching still keeps a 40-URL check on one run instead of 40.
//
// PowerShell, from the repo root:
//   npm run enrich:apify-linkedin-verify -- --dry-run --campus penn --limit 20
//   npm run enrich:apify-linkedin-verify -- --campus penn --limit 20 --yes
//   npm run enrich:apify-linkedin-verify -- import --dry-run
//   npm run enrich:apify-linkedin-verify -- import
//
// --dry-run prints the queue and the estimate and does not call Apify.
// A live run stops after the estimate until --yes. People already present
// in data/imports/apify_linkedin_verify_results.jsonl are skipped, so
// re-running the same command resumes. --mock writes synthetic profiles
// and does not call Apify.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ApifyApiError, ApifyClient } from "apify-client";
import type Database from "better-sqlite3";
import { getDb, nowIso } from "../../lib/db/client";
import { campusFlagHelp, cleanSearchName, isOrganizationName, resolveCampusFlag } from "./linkedin-match";
import {
  ACTOR_ID,
  OUTPUT_RELATIVE,
  type ScrapedProfile,
  type VerifyPerson,
  actorInput,
  assignProfiles,
  buildResultLine,
  formatEstimate,
  importVerifiedLinkedIn,
  loadVerifyQueue,
  packBatches,
  readDonePersonIds,
} from "./linkedin-verify";

export type ScrapeFn = (urls: string[]) => Promise<unknown[]>;

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

function argValue(argv: string[], flag: string): string | null {
  const index = argv.indexOf(flag);
  if (index === -1) return null;
  const next = argv[index + 1];
  if (!next || next.startsWith("--")) return null;
  return next;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function usage(): string {
  return [
    "Usage: npm run enrich:apify-linkedin-verify -- [options]",
    "       npm run enrich:apify-linkedin-verify -- import [options]",
    "  --dry-run       Print the queue and Apify estimate. Do not call Apify.",
    "  --yes           Required to spend Apify credit after the estimate.",
    "  --limit N       Only take the first N people still missing from the output file.",
    "  --campus penn   Restrict to one school (penn, berkeley, stanford, mit, ...).",
    "  --out PATH      Output JSONL. Default: data/imports/apify_linkedin_verify_results.jsonl",
    "  --mock          Write synthetic profiles. Does not call Apify.",
    "  import          Apply a finished JSONL file to the database.",
    "  import --dry-run  Print the database changes and do not write.",
    "  import --file PATH  JSONL to import. Default: the output path above.",
  ].join("\n");
}

function parseVerifyArgs(argv: string[]): {
  dryRun: boolean;
  yes: boolean;
  mock: boolean;
  limit: number | null;
  campusId: string | null;
  outPath: string;
} {
  const known = new Set(["--dry-run", "--yes", "--mock", "--limit", "--campus", "--out", "--help", "-h"]);
  for (const arg of argv) {
    if (arg.startsWith("--") && !known.has(arg)) throw new Error(`Unknown flag ${arg}\n${usage()}`);
  }
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(usage());
    process.exit(0);
  }
  const limitRaw = argValue(argv, "--limit");
  let limit: number | null = null;
  if (argv.includes("--limit")) {
    if (!limitRaw || !/^\d+$/.test(limitRaw) || Number(limitRaw) < 1) {
      throw new Error("--limit needs a positive integer.");
    }
    limit = Number(limitRaw);
  }
  const campusRaw = argValue(argv, "--campus");
  let campusId: string | null = null;
  if (argv.includes("--campus")) {
    if (!campusRaw) throw new Error(`--campus needs a school. Choices: ${campusFlagHelp()}.`);
    campusId = resolveCampusFlag(campusRaw);
    if (!campusId) throw new Error(`Unknown campus "${campusRaw}". Choices: ${campusFlagHelp()}.`);
  }
  const outRaw = argValue(argv, "--out");
  return {
    dryRun: argv.includes("--dry-run"),
    yes: argv.includes("--yes"),
    mock: argv.includes("--mock"),
    limit,
    campusId,
    outPath: path.resolve(process.cwd(), outRaw || OUTPUT_RELATIVE),
  };
}

function parseImportArgs(argv: string[]): { filePath: string; dryRun: boolean } {
  const positional: string[] = [];
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      console.log(usage());
      process.exit(0);
    }
    if (arg === "--dry-run") continue;
    if (arg === "--file" || arg === "--out") {
      const next = argv[index + 1];
      if (!next || next.startsWith("--")) throw new Error(`${arg} needs a path.`);
      positional.push(next);
      index++;
      continue;
    }
    if (arg.startsWith("--")) throw new Error(`Unknown flag ${arg}\n${usage()}`);
    positional.push(arg);
  }
  if (positional.length > 1) throw new Error("Pass one JSONL file.");
  return {
    dryRun: argv.includes("--dry-run"),
    filePath: path.resolve(process.cwd(), positional[0] || OUTPUT_RELATIVE),
  };
}

async function listDatasetItems(client: ApifyClient, datasetId: string): Promise<unknown[]> {
  const items: unknown[] = [];
  let offset = 0;
  for (;;) {
    const page = await client.dataset(datasetId).listItems({ limit: 1000, offset, clean: false });
    items.push(...page.items);
    if (page.items.length === 0 || offset + page.count >= page.total) break;
    offset += page.count;
  }
  return items;
}

function isAuthError(error: unknown): boolean {
  return error instanceof ApifyApiError && (error.statusCode === 401 || error.statusCode === 403);
}

function isRetryable(error: unknown): boolean {
  if (error instanceof ApifyApiError) return error.statusCode === 429 || error.statusCode === 408 || error.statusCode >= 500;
  const message = error instanceof Error ? error.message : String(error);
  return /rate limit|too many requests|timed out|ETIMEDOUT|ECONNRESET|socket hang up/i.test(message);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function callActor(token: string, urls: string[]): Promise<unknown[]> {
  const client = new ApifyClient({ token });
  const cap = Math.max(0.05, urls.length * 0.004 * 2);
  const run = await client.actor(ACTOR_ID).call(actorInput(urls), {
    waitSecs: 300,
    timeout: 600,
    maxTotalChargeUsd: cap,
    log: null,
  });
  if (run.status !== "SUCCEEDED") {
    throw new Error(`Apify run ${run.id} ended ${run.status}${run.statusMessage ? `: ${run.statusMessage}` : ""}`);
  }
  if (!run.defaultDatasetId) throw new Error(`Apify run ${run.id} succeeded without a dataset.`);
  return listDatasetItems(client, run.defaultDatasetId);
}

async function scrapeLive(token: string, urls: string[]): Promise<unknown[]> {
  const waits = [5000, 15000, 30000];
  let last: unknown;
  for (let attempt = 0; attempt <= waits.length; attempt++) {
    try {
      return await callActor(token, urls);
    } catch (error) {
      last = error;
      if (isAuthError(error) || attempt === waits.length || !isRetryable(error)) break;
      const wait = waits[attempt];
      console.log(`  rate limit or transient error (${errorMessage(error)}). Retrying in ${wait / 1000}s.`);
      await sleep(wait);
    }
  }
  throw last;
}

function mockScrape(people: VerifyPerson[]): ScrapeFn {
  const byUrl = new Map<string, VerifyPerson>();
  for (const person of people) {
    for (const url of person.urls) byUrl.set(url, person);
  }
  return async (urls: string[]) =>
    urls.map((url) => {
      const person = byUrl.get(url);
      const slug = url.split("/in/")[1] ?? "";
      const parts = (person?.name ?? "").split(/\s+/).filter(Boolean);
      return {
        status: 200,
        query: { publicIdentifier: slug },
        publicIdentifier: slug,
        linkedinUrl: url,
        firstName: parts[0] ?? "",
        lastName: parts.slice(1).join(" "),
        headline: "Mock headline",
        education: [
          {
            schoolName: person?.schools[0]?.name || person?.school || "",
            endDate: { year: 2025, text: "2025" },
          },
        ],
      };
    });
}

let writeTail: Promise<void> = Promise.resolve();

function appendLine(filePath: string, line: string): Promise<void> {
  writeTail = writeTail.then(() => {
    fs.appendFileSync(filePath, `${line}\n`, "utf8");
  });
  return writeTail;
}

export async function runVerify(options: {
  db: Database.Database;
  campusId: string | null;
  limit: number | null;
  dryRun: boolean;
  yes: boolean;
  mock: boolean;
  outPath: string;
  hasToken: boolean;
  scrape?: ScrapeFn;
}): Promise<number> {
  const queue = loadVerifyQueue(options.db, options.campusId);
  const done = readDonePersonIds(options.outPath);
  console.log("LinkedIn verify. People with no confirmed linkedin.com/in URL and at least one unverified candidate.");
  console.log("Order: founders, then potential founders, within Penn, then Berkeley, then everyone else.");
  if (options.campusId) console.log(`Campus filter: ${options.campusId}`);
  console.log(`With an unverified candidate: ${queue.length}`);
  const pending = queue.filter((person) => !done.has(person.id));
  console.log(`Already in ${options.outPath}: ${queue.length - pending.length}`);
  const handleSkipped = pending.filter((person) => cleanSearchName(person.name) === null);
  const orgSkipped = pending.filter((person) => cleanSearchName(person.name) !== null && isOrganizationName(person.name));
  const searchable = pending.filter((person) => cleanSearchName(person.name) !== null && !isOrganizationName(person.name));
  console.log(
    `Skipped ${handleSkipped.length} ${handleSkipped.length === 1 ? "person" : "people"} whose name is only a handle (no first and last name).`
  );
  console.log(
    `Skipped ${orgSkipped.length} non-person ${orgSkipped.length === 1 ? "name" : "names"} (Venture, Collaboration, Lab, Team, Inc, Club, and similar).`
  );
  const selected = options.limit == null ? searchable : searchable.slice(0, options.limit);
  console.log(`This run: ${selected.length} people, ${selected.reduce((sum, person) => sum + person.urls.length, 0)} profile URL(s).`);
  const byCampus = new Map<string, number>();
  for (const person of selected) {
    const key = person.campusId || "(no campus)";
    byCampus.set(key, (byCampus.get(key) ?? 0) + 1);
  }
  for (const [campus, count] of [...byCampus.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${campus}: ${count}`);
  for (const person of selected.slice(0, 10)) {
    console.log(`  ${person.name} — ${person.urls.length} candidate URL(s)`);
  }
  if (selected.length > 10) console.log(`  … ${selected.length - 10} more`);
  if (selected.length === 0) {
    console.log("Nothing to verify.");
    return 0;
  }
  const urlCount = selected.reduce((sum, person) => sum + person.urls.length, 0);
  const batches = packBatches(selected.map((person) => person.urls));
  console.log(formatEstimate(urlCount, batches.length));
  if (options.dryRun) {
    console.log("Dry run. Nothing was sent to Apify and the output file was not changed.");
    return 0;
  }
  if (options.mock) {
    console.log("Mock mode. No Apify call. Synthetic profiles will be written.");
  } else if (!options.yes) {
    console.log("Pass --yes to start. Nothing was sent to Apify.");
    return 0;
  } else if (!options.scrape && !options.hasToken) {
    console.log("APIFY_API_TOKEN is not set. Put it in .env.local at the repo root and re-run. Nothing was sent to Apify.");
    return 1;
  }

  fs.mkdirSync(path.dirname(options.outPath), { recursive: true });
  const scrape =
    options.scrape ?? (options.mock ? mockScrape(selected) : (urls: string[]) => scrapeLive(process.env.APIFY_API_TOKEN ?? "", urls));
  const profiles = new Map<string, ScrapedProfile | null>();
  const failed = new Set<string>();
  let fatal: unknown = null;

  async function scrapeResilient(urls: string[]) {
    try {
      const items = await scrape(urls);
      const assigned = assignProfiles(urls, items);
      for (const [url, profile] of assigned) profiles.set(url, profile);
    } catch (error) {
      if (isAuthError(error)) throw error;
      if (urls.length === 1) {
        failed.add(urls[0]);
        console.log(`  failed ${urls[0]}: ${errorMessage(error)}. Not written, so a re-run will retry.`);
        return;
      }
      console.log(`Batch of ${urls.length} failed (${errorMessage(error)}). Splitting it.`);
      const mid = Math.ceil(urls.length / 2);
      await scrapeResilient(urls.slice(0, mid));
      await scrapeResilient(urls.slice(mid));
    }
  }

  let written = 0;
  let skippedPeople = 0;
  for (const urls of batches) {
    if (fatal) break;
    const unique = [...new Set(urls)];
    try {
      await scrapeResilient(unique);
    } catch (error) {
      fatal = error;
      console.log(`Stopped: Apify rejected the token (${errorMessage(error)}).`);
      break;
    }
    const ready = selected.filter(
      (person) =>
        person.urls.some((url) => unique.includes(url)) &&
        person.urls.every((url) => profiles.has(url) || failed.has(url)) &&
        person.urls.every((url) => !failed.has(url))
    );
    for (const person of ready) {
      if (done.has(person.id)) continue;
      const line = buildResultLine(person, profiles, nowIso());
      if (options.mock) line.mock = true;
      await appendLine(options.outPath, JSON.stringify(line));
      done.add(person.id);
      written++;
      console.log(
        `[${written}/${selected.length}] ${person.name} — ${line.outcome}. ${line.outcome_reason}${
          line.headline ? ` Headline: ${line.headline}.` : ""
        }${line.graduation_year ? ` Graduation year: ${line.graduation_year}.` : ""}`
      );
    }
    const blocked = selected.filter((person) => person.urls.some((url) => unique.includes(url)) && person.urls.some((url) => failed.has(url)));
    skippedPeople += blocked.length;
    if (!options.scrape && !options.mock) await sleep(1000);
  }
  await writeTail;
  console.log(`Wrote ${written} line(s) to ${options.outPath}. Failed ${skippedPeople}. Re-run the same command to continue.`);
  return fatal ? 1 : 0;
}

async function main() {
  loadEnvLocal();
  const argv = process.argv.slice(2);
  if (argv[0] === "import") {
    const args = parseImportArgs(argv.slice(1));
    importVerifiedLinkedIn(getDb(), args.filePath, args.dryRun);
    return;
  }
  const args = parseVerifyArgs(argv);
  const code = await runVerify({
    db: getDb(),
    campusId: args.campusId,
    limit: args.limit,
    dryRun: args.dryRun,
    yes: args.yes,
    mock: args.mock,
    outPath: args.outPath,
    hasToken: Boolean(process.env.APIFY_API_TOKEN),
  });
  if (code !== 0) process.exit(code);
}

function invokedDirectly(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  const base = path.basename(entry);
  return base === "apify-linkedin-verify.ts" || base === "apify-linkedin-verify.js";
}

if (invokedDirectly()) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
