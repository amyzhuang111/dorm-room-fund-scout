// Verify unverified linkedin.com/in candidates by scraping those profile
// URLs. Does not search Google. Does not write the database; `import` does.
//
// Default actor: apimaestro/linkedin-profile-batch-scraper-no-cookies-required
// ($5.00 / 1,000 profiles, no cookies, profile URLs, no published free-plan
// block). harvestapi/linkedin-profile-scraper ($4.00 / 1,000) stays available
// with --actor for paid plans. See linkedin-actors.ts for the comparison.
//
// A free Apify account returns about 10 profiles a day from the default
// actor, then stops with a limit / upgrade / paid-plan message. When that
// happens after some profiles came back, those profiles are written
// (confirmed, rejected, or not_found) and every URL that did not come back
// stays unattempted so the next run retries it. Unreturned URLs are never
// marked rejected. A batch that returns zero items, including a limit
// message with an empty dataset, writes nothing.
//
// --max-profiles N caps how many unresolved profile URLs are sent. The
// daily free-plan run uses 10. URLs already in the output file are skipped.
// Once a person is confirmed, their remaining candidate URLs are skipped.
// Lines for the same person are merged in place: a re-run does not
// duplicate them or replace an earlier confirmed result.
//
// URLs are sent in batches (40 for the default actor). The actor bills per
// profile; batching still keeps that check on one run.
//
// PowerShell, from the repo root:
//   npm run enrich:apify-linkedin-verify -- --dry-run --campus penn,berkeley --max-profiles 10
//   npm run enrich:apify-linkedin-verify -- --campus penn,berkeley --max-profiles 10 --yes
//   npm run enrich:apify-linkedin-verify -- import --dry-run
//   npm run enrich:apify-linkedin-verify -- import
//
// --dry-run prints the queue and the estimate and does not call Apify.
// A live run stops after the estimate until --yes. Re-running the same
// command resumes from the output file. --mock writes synthetic profiles
// and does not call Apify.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ApifyApiError, ApifyClient } from "apify-client";
import type Database from "better-sqlite3";
import { getDb, nowIso } from "../../lib/db/client";
import {
  campusFlagHelp,
  cleanSearchName,
  isOrganizationName,
  normalizeLinkedIn,
  resolveCampusFlag,
} from "./linkedin-match";
import {
  ActorBatchError,
  type ActorDataset,
  explainPartialLimit,
  explainUnusableRun,
  mentionsPlanLimit,
  normalizeActorItems,
  resolveActor,
  type LinkedInActor,
} from "./linkedin-actors";
import {
  OUTPUT_RELATIVE,
  type ScrapedProfile,
  type VerifyPerson,
  type VerifyProgress,
  type VerifyResultLine,
  assignProfiles,
  buildResultLine,
  formatEstimate,
  formatRunSummary,
  importVerifiedLinkedIn,
  loadVerifyQueue,
  mergeVerifyResult,
  packBatches,
  readVerifyProgress,
  selectProfileUrls,
} from "./linkedin-verify";

export type ScrapeFn = (urls: string[]) => Promise<unknown[] | ActorDataset>;

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
    "  --limit N       Only take the first N people who still have an unresolved profile URL.",
    "  --max-profiles N",
    "                  Send at most N profile URLs this run. Default: no cap.",
    "                  Skips URLs already resolved in the output file. Once a person is",
    "                  confirmed, their remaining candidate URLs are skipped.",
    "                  Free-plan daily drip: --max-profiles 10.",
    "  --campus LIST   One school, a comma list, or repeat the flag.",
    "                  penn, berkeley, stanford, mit, ... Example: --campus penn,berkeley",
    "  --out PATH      Output JSONL. Default: data/imports/apify_linkedin_verify_results.jsonl",
    "  --actor ID      Profile actor. Default: apimaestro/linkedin-profile-batch-scraper-no-cookies-required.",
    "                  Paid plans: --actor harvestapi/linkedin-profile-scraper",
    "  --mock          Write synthetic profiles. Does not call Apify.",
    "  import          Apply a finished JSONL file to the database.",
    "  import --dry-run  Print the database changes and do not write.",
    "  import --file PATH  JSONL to import. Default: the output path above.",
  ].join("\n");
}

function argValues(argv: string[], flag: string): string[] {
  const values: string[] = [];
  for (let index = 0; index < argv.length; index++) {
    if (argv[index] !== flag) continue;
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      values.push("");
      continue;
    }
    values.push(next);
    index++;
  }
  return values;
}

export function parseVerifyArgs(argv: string[]): {
  dryRun: boolean;
  yes: boolean;
  mock: boolean;
  limit: number | null;
  maxProfiles: number | null;
  campusId: string | string[] | null;
  outPath: string;
  actorId: string;
} {
  const known = new Set([
    "--dry-run",
    "--yes",
    "--mock",
    "--limit",
    "--max-profiles",
    "--campus",
    "--out",
    "--actor",
    "--help",
    "-h",
  ]);
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
  const maxRaw = argValue(argv, "--max-profiles");
  let maxProfiles: number | null = null;
  if (argv.includes("--max-profiles")) {
    if (!maxRaw || !/^\d+$/.test(maxRaw) || Number(maxRaw) < 1) {
      throw new Error("--max-profiles needs a positive integer.");
    }
    maxProfiles = Number(maxRaw);
  }
  const campusTokens = argValues(argv, "--campus").flatMap((value) =>
    value.split(",").map((part) => part.trim())
  );
  if (argv.includes("--campus") && (campusTokens.length === 0 || campusTokens.some((token) => token === ""))) {
    throw new Error(`--campus needs a school. Choices: ${campusFlagHelp()}.`);
  }
  const campusIds: string[] = [];
  for (const token of campusTokens) {
    const resolved = resolveCampusFlag(token);
    if (!resolved) throw new Error(`Unknown campus "${token}". Choices: ${campusFlagHelp()}.`);
    if (!campusIds.includes(resolved)) campusIds.push(resolved);
  }
  const outRaw = argValue(argv, "--out");
  const actorRaw = argValue(argv, "--actor");
  if (argv.includes("--actor") && !actorRaw) throw new Error("--actor needs an actor id. See --help.");
  const actor = resolveActor(actorRaw);
  return {
    dryRun: argv.includes("--dry-run"),
    yes: argv.includes("--yes"),
    mock: argv.includes("--mock"),
    limit,
    maxProfiles,
    campusId: campusIds.length === 0 ? null : campusIds.length === 1 ? campusIds[0] : campusIds,
    outPath: path.resolve(process.cwd(), outRaw || OUTPUT_RELATIVE),
    actorId: actor.id,
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

async function readRunLog(client: ApifyClient, runId: string): Promise<string> {
  try {
    return (await client.run(runId).log().get()) ?? "";
  } catch (error) {
    console.log(`  Could not read the Apify run log (${errorMessage(error)}).`);
    return "";
  }
}

async function callActor(token: string, urls: string[], actor: LinkedInActor): Promise<ActorDataset> {
  const client = new ApifyClient({ token });
  const cap = Math.max(0.05, urls.length * actor.usdPerProfile * 2);
  const run = await client.actor(actor.id).call(actor.buildInput(urls), {
    waitSecs: 300,
    timeout: 600,
    maxTotalChargeUsd: cap,
    log: null,
  });
  const log = await readRunLog(client, run.id);
  const statusMessage = run.statusMessage ?? "";
  let items: unknown[] = [];
  if (run.defaultDatasetId) {
    try {
      items = await listDatasetItems(client, run.defaultDatasetId);
    } catch (error) {
      if (run.status === "SUCCEEDED") throw error;
      console.log(`  Could not read the Apify dataset (${errorMessage(error)}).`);
    }
  }
  if (run.status !== "SUCCEEDED") {
    const ended = `Apify run ${run.id} ended ${run.status}${statusMessage ? `: ${statusMessage}` : ""}`;
    if (mentionsPlanLimit(`${ended}\n${statusMessage}\n${log}`)) {
      return { items, statusMessage: statusMessage || ended, log };
    }
    throw new Error(ended);
  }
  if (!run.defaultDatasetId) throw new Error(`Apify run ${run.id} succeeded without a dataset.`);
  return { items, statusMessage, log };
}

async function scrapeLive(token: string, urls: string[], actor: LinkedInActor): Promise<ActorDataset> {
  const waits = [5000, 15000, 30000];
  let last: unknown;
  for (let attempt = 0; attempt <= waits.length; attempt++) {
    try {
      return await callActor(token, urls, actor);
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

function urlKey(url: string): string | null {
  const normalized = normalizeLinkedIn(url);
  return normalized ? normalized.toLowerCase() : null;
}

function scopeCounts(people: VerifyPerson[], progress: VerifyProgress) {
  let totalUrls = 0;
  let resolvedUrls = 0;
  let urlsRemaining = 0;
  let confirmedLeftoverUrls = 0;
  let peopleConfirmed = 0;
  for (const person of people) {
    const confirmed = progress.confirmedPersonIds.has(person.id);
    if (confirmed) peopleConfirmed++;
    for (const url of person.urls) {
      totalUrls++;
      const key = urlKey(url);
      if (key && progress.resolvedUrls.has(key)) resolvedUrls++;
      else if (confirmed) confirmedLeftoverUrls++;
      else urlsRemaining++;
    }
  }
  return { totalUrls, resolvedUrls, urlsRemaining, confirmedLeftoverUrls, peopleConfirmed };
}

function upsertResultLine(filePath: string, line: VerifyResultLine) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const text = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
  const kept: string[] = [];
  let placed = false;
  const serialized = JSON.stringify(line);
  for (const raw of text.split(/\r?\n/)) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    let samePerson = false;
    try {
      const parsed = JSON.parse(trimmed) as { person_id?: unknown };
      samePerson = parsed.person_id === line.person_id;
    } catch {
      samePerson = false;
    }
    if (samePerson) {
      if (!placed) {
        kept.push(serialized);
        placed = true;
      }
      continue;
    }
    kept.push(trimmed);
  }
  if (!placed) kept.push(serialized);
  const tmp = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${kept.join("\n")}\n`, "utf8");
  try {
    fs.renameSync(tmp, filePath);
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    if (code !== "EEXIST" && code !== "EPERM") throw error;
    fs.rmSync(filePath, { force: true });
    fs.renameSync(tmp, filePath);
  }
}

export async function runVerify(options: {
  db: Database.Database;
  campusId: string | string[] | null;
  limit: number | null;
  maxProfiles?: number | null;
  dryRun: boolean;
  yes: boolean;
  mock: boolean;
  outPath: string;
  hasToken: boolean;
  actorId?: string;
  scrape?: ScrapeFn;
}): Promise<number> {
  const maxProfiles = options.maxProfiles ?? null;
  const queue = loadVerifyQueue(options.db, options.campusId);
  const progress = readVerifyProgress(options.outPath);
  const resolvedAtStart = new Set(progress.resolvedUrls);
  const outcomesThisRun = new Map<string, VerifyResultLine["outcome"]>();
  let scrapedThisRun = 0;
  let stoppedForDailyLimit = false;
  let batchFailed = false;
  let authFailed = false;

  console.log("LinkedIn verify. People with no confirmed linkedin.com/in URL and at least one unverified candidate.");
  console.log("Order: founders, then potential founders, within Penn, then Berkeley, then everyone else.");
  if (Array.isArray(options.campusId)) console.log(`Campus filter: ${options.campusId.join(", ")}`);
  else if (options.campusId) console.log(`Campus filter: ${options.campusId}`);
  console.log(`With an unverified candidate: ${queue.length}`);
  const handleSkipped = queue.filter((person) => cleanSearchName(person.name) === null);
  const orgSkipped = queue.filter((person) => cleanSearchName(person.name) !== null && isOrganizationName(person.name));
  const named = queue.filter((person) => cleanSearchName(person.name) !== null && !isOrganizationName(person.name));
  const already = scopeCounts(named, progress);
  const confirmedLabel = already.peopleConfirmed === 1 ? "person" : "people";
  console.log(
    `Already resolved in ${options.outPath}: ${already.resolvedUrls} URL(s), ${already.peopleConfirmed} ${confirmedLabel} confirmed.`
  );
  console.log(
    `Skipped ${handleSkipped.length} ${handleSkipped.length === 1 ? "person" : "people"} whose name is only a handle (no first and last name).`
  );
  console.log(
    `Skipped ${orgSkipped.length} non-person ${orgSkipped.length === 1 ? "name" : "names"} (Venture, Collaboration, Lab, Team, Inc, Club, and similar).`
  );
  const selected = selectProfileUrls(named, progress.resolvedUrls, progress.confirmedPersonIds, options.limit, maxProfiles);
  const urlCount = selected.reduce((sum, person) => sum + person.urls.length, 0);
  console.log(
    `This run: ${selected.length} people, ${urlCount} profile URL(s).${
      maxProfiles == null ? "" : ` Cap: ${maxProfiles} profile URL(s).`
    }`
  );
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

  const printSummary = () => {
    const scope = scopeCounts(named, progress);
    let confirmed = 0;
    let rejected = 0;
    let notFound = 0;
    let unverified = 0;
    for (const outcome of outcomesThisRun.values()) {
      if (outcome === "confirmed") confirmed++;
      else if (outcome === "rejected") rejected++;
      else if (outcome === "not_found") notFound++;
      else if (outcome === "unverified") unverified++;
    }
    console.log(
      formatRunSummary({
        scraped: scrapedThisRun,
        confirmed,
        rejected,
        notFound,
        unverified,
        resolvedUrls: scope.resolvedUrls,
        totalUrls: scope.totalUrls,
        peopleConfirmed: scope.peopleConfirmed,
        urlsRemaining: scope.urlsRemaining,
        confirmedLeftoverUrls: scope.confirmedLeftoverUrls,
        stoppedForDailyLimit,
      })
    );
  };

  if (selected.length === 0) {
    console.log("Nothing to verify.");
    printSummary();
    return 0;
  }
  const actor = resolveActor(options.actorId);
  const batches = packBatches(
    selected.map((person) => person.urls),
    actor.batchSize
  );
  console.log(formatEstimate(urlCount, batches.length, actor.id));
  if (options.dryRun) {
    console.log("Dry run. Nothing was sent to Apify and the output file was not changed.");
    printSummary();
    return 0;
  }
  if (options.mock) {
    console.log("Mock mode. No Apify call. Synthetic profiles will be written.");
  } else if (!options.yes) {
    console.log("Pass --yes to start. Nothing was sent to Apify.");
    printSummary();
    return 0;
  } else if (!options.scrape && !options.hasToken) {
    console.log("APIFY_API_TOKEN is not set. Put it in .env.local at the repo root and re-run. Nothing was sent to Apify.");
    printSummary();
    return 1;
  }

  const scrape =
    options.scrape ??
    (options.mock ? mockScrape(selected) : (urls: string[]) => scrapeLive(process.env.APIFY_API_TOKEN ?? "", urls, actor));
  const profiles = new Map<string, ScrapedProfile | null>();

  function readPayload(raw: unknown[] | ActorDataset): ActorDataset {
    if (Array.isArray(raw)) return { items: raw };
    return {
      items: Array.isArray(raw.items) ? raw.items : [],
      statusMessage: raw.statusMessage,
      log: raw.log,
    };
  }

  function stillOpen(urls: string[]): string[] {
    const open: string[] = [];
    const seen = new Set<string>();
    for (const url of urls) {
      if (seen.has(url)) continue;
      seen.add(url);
      const key = urlKey(url);
      if (key && resolvedAtStart.has(key)) continue;
      const owner = selected.find((person) => person.urls.includes(url));
      if (owner && progress.confirmedPersonIds.has(owner.id)) continue;
      open.push(url);
    }
    return open;
  }

  async function scrapeResilient(urls: string[]) {
    try {
      const payload = readPayload(await scrape(urls));
      const failure = explainUnusableRun(payload);
      if (failure) throw new ActorBatchError(failure.message, failure.planLimit);
      const items = normalizeActorItems(payload.items, urls);
      const assigned = assignProfiles(urls, items);
      for (const [url, profile] of assigned) {
        if (!profiles.has(url)) scrapedThisRun++;
        profiles.set(url, profile);
      }
      if (mentionsPlanLimit(`${payload.statusMessage ?? ""}\n${payload.log ?? ""}`)) {
        stoppedForDailyLimit = true;
        throw new ActorBatchError(explainPartialLimit(payload), true);
      }
    } catch (error) {
      if (isAuthError(error)) throw error;
      if (error instanceof ActorBatchError) {
        if (error.planLimit) {
          stoppedForDailyLimit = true;
          throw error;
        }
        batchFailed = true;
        console.log(error.message);
        return;
      }
      if (urls.length === 1) {
        batchFailed = true;
        console.log(`  failed ${urls[0]}: ${errorMessage(error)}. Not written, so a re-run will retry.`);
        return;
      }
      console.log(`Batch of ${urls.length} failed (${errorMessage(error)}). Splitting it.`);
      const mid = Math.ceil(urls.length / 2);
      await scrapeResilient(urls.slice(0, mid));
      await scrapeResilient(urls.slice(mid));
    }
  }

  function writeReturned(batchUrls: string[]) {
    const inBatch = new Set(batchUrls);
    for (const person of selected) {
      if (progress.confirmedPersonIds.has(person.id)) continue;
      if (!person.urls.some((url) => inBatch.has(url))) continue;
      const fresh = person.urls.filter((url) => {
        const normalized = normalizeLinkedIn(url);
        const key = urlKey(url);
        return Boolean(normalized && key && profiles.has(normalized) && !resolvedAtStart.has(key));
      });
      if (fresh.length === 0) continue;
      const incoming = buildResultLine(person, profiles, nowIso(), actor.id, fresh);
      if (options.mock) incoming.mock = true;
      const existing = progress.linesByPerson.get(person.id) ?? null;
      const merged = mergeVerifyResult(person, existing, incoming);
      if (merged === existing) continue;
      upsertResultLine(options.outPath, merged);
      progress.linesByPerson.set(person.id, merged);
      if (merged.outcome === "confirmed") progress.confirmedPersonIds.add(person.id);
      for (const item of merged.profiles) {
        const key = urlKey(item.url);
        if (!key) continue;
        progress.resolvedUrls.add(key);
        resolvedAtStart.add(key);
      }
      outcomesThisRun.set(person.id, merged.outcome);
      console.log(
        `[${outcomesThisRun.size}/${selected.length}] ${person.name} — ${merged.outcome}. ${merged.outcome_reason}${
          merged.headline ? ` Headline: ${merged.headline}.` : ""
        }${merged.graduation_year ? ` Graduation year: ${merged.graduation_year}.` : ""}`
      );
    }
  }

  for (const urls of batches) {
    const unique = stillOpen(urls);
    if (unique.length === 0) continue;
    let stop = false;
    try {
      await scrapeResilient(unique);
    } catch (error) {
      stop = true;
      if (error instanceof ActorBatchError && error.planLimit) {
        console.log(error.message);
        console.log("Stopped. Later batches were not started.");
      } else if (isAuthError(error)) {
        authFailed = true;
        console.log(`Stopped: Apify rejected the token (${errorMessage(error)}).`);
      } else {
        authFailed = true;
        console.log(`Stopped: ${errorMessage(error)}`);
      }
    }
    writeReturned(unique);
    if (stop || stoppedForDailyLimit) break;
    if (!options.scrape && !options.mock) await sleep(1000);
  }
  printSummary();
  if (authFailed) return 1;
  if (outcomesThisRun.size === 0 && (stoppedForDailyLimit || batchFailed)) return 1;
  return 0;
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
    maxProfiles: args.maxProfiles,
    dryRun: args.dryRun,
    yes: args.yes,
    mock: args.mock,
    outPath: args.outPath,
    hasToken: Boolean(process.env.APIFY_API_TOKEN),
    actorId: args.actorId,
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
