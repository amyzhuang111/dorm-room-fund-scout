// Local LinkedIn lookup for people with no confirmed linkedin.com/in URL.
// Runs on the owner's Windows laptop. Does not write to the database.
//
// Actor: apify/google-search-scraper (official Apify Store actor, no
// LinkedIn cookies or login). Each person is one Google query:
//   site:linkedin.com/in "Full Name" "School" "Company"
// maxPagesPerQuery is 1 and every paid add-on is off. Pricing checked
// 2026-09-26 against the actor rate card that started 2026-08-20:
//   Free   $0.0045 / page + $0.001 actor start
//   Bronze $0.0025 / page + $0.001 actor start
//   Gold   $0.0018 / page + $0.001 actor start  (the published "from $1.80 / 1,000 pages")
// Queries are sent 10 per run, 2 runs at a time, so 1,000 lookups are
// about $4.60 on Free and $1.90 on Gold. Confirm the live price before a
// large run: https://apify.com/apify/google-search-scraper
//
// PowerShell, from the repo root:
//   npm run enrich:apify-linkedin -- --dry-run --campus penn --limit 20
//   npm run enrich:apify-linkedin -- --campus penn --limit 20 --yes
//
// --dry-run prints the queue and the estimate and does not call Apify.
// A live run stops after the estimate until --yes. People already present
// in data/imports/apify_linkedin_results.jsonl are skipped, so re-running
// the same command resumes. --mock writes synthetic results and does not
// call Apify (for a local check of the output file).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ApifyApiError, ApifyClient } from "apify-client";
import type Database from "better-sqlite3";
import { getDb, nowIso } from "../../lib/db/client";
import {
  ACTOR_ID,
  ACTOR_PAGE,
  ACTOR_START_USD,
  BATCH_SIZE,
  CONCURRENCY,
  OUTPUT_RELATIVE,
  PAGE_USD,
  type CandidateInput,
  type LookupPerson,
  buildResultLine,
  buildSearchQuery,
  campusFlagHelp,
  estimateRun,
  formatUsd,
  loadQueue,
  readDoneIds,
  resolveCampusFlag,
} from "./linkedin-match";

type Queued = { person: LookupPerson; query: string };
export type SearchFn = (batch: Queued[]) => Promise<Map<string, CandidateInput[]>>;

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

function normQuery(query: string): string {
  return query.replace(/\s+/g, " ").trim().toLowerCase();
}

function usage(): string {
  return [
    "Usage: npm run enrich:apify-linkedin -- [options]",
    "  --dry-run       Print the queue and Apify estimate. Do not call Apify.",
    "  --yes           Required to spend Apify credit after the estimate.",
    "  --limit N       Only take the first N people still missing from the output file.",
    "  --campus penn   Restrict to one school (penn, berkeley, stanford, mit, ...).",
    "  --out PATH      Output JSONL. Default: data/imports/apify_linkedin_results.jsonl",
    "  --mock          Write synthetic results. Does not call Apify.",
  ].join("\n");
}

function parseArgs(argv: string[]): {
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

function printEstimate(lookups: number) {
  const estimate = estimateRun(lookups);
  console.log(`Actor: ${ACTOR_ID}`);
  console.log("No LinkedIn cookies or login. One Google result page per person. Add-ons off.");
  console.log(`Batches of ${estimate.batchSize}, ${CONCURRENCY} batches at a time (${estimate.runs} actor run(s) for this invocation).`);
  console.log("Price checked 2026-09-26 (actor rate card started 2026-08-20):");
  const start = `$${ACTOR_START_USD.toFixed(3)}`;
  console.log(`  Free   ${formatUsd(PAGE_USD.free * 1000)} / 1,000 pages + ${start} per run → about ${formatUsd(estimate.perThousandFree)} / 1,000 lookups`);
  console.log(`  Bronze ${formatUsd(PAGE_USD.bronze * 1000)} / 1,000 pages + ${start} per run → about ${formatUsd(estimate.perThousandBronze)} / 1,000 lookups`);
  console.log(`  Gold   ${formatUsd(PAGE_USD.gold * 1000)} / 1,000 pages + ${start} per run → about ${formatUsd(estimate.perThousandGold)} / 1,000 lookups`);
  console.log(`This run, Free-plan estimate (use this if you are unsure): ${formatUsd(estimate.free)}`);
  console.log(`This run, Gold-plan estimate: ${formatUsd(estimate.gold)}`);
  console.log(`A page is still charged when Google returns nobody. Confirm ${ACTOR_PAGE} before a large run.`);
}

function collectOrganic(items: unknown[]): Map<string, CandidateInput[]> {
  const grouped = new Map<string, CandidateInput[]>();
  const add = (term: string, row: Record<string, unknown>) => {
    if (row.type === "paid") return;
    const url = typeof row.url === "string" ? row.url : "";
    if (!url) return;
    const title = typeof row.title === "string" ? row.title : "";
    const snippet =
      typeof row.description === "string" ? row.description : typeof row.snippet === "string" ? row.snippet : "";
    const key = normQuery(term);
    const list = grouped.get(key) ?? [];
    list.push({ url, title, snippet });
    grouped.set(key, list);
  };
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const searchQuery = rec.searchQuery;
    const term =
      searchQuery && typeof searchQuery === "object" && typeof (searchQuery as { term?: unknown }).term === "string"
        ? (searchQuery as { term: string }).term
        : "";
    if (Array.isArray(rec.organicResults)) {
      for (const row of rec.organicResults) {
        if (row && typeof row === "object") add(term, row as Record<string, unknown>);
      }
      continue;
    }
    if (typeof rec.url === "string") add(term, rec);
  }
  return grouped;
}

async function listDatasetItems(client: ApifyClient, datasetId: string): Promise<unknown[]> {
  const items: unknown[] = [];
  let offset = 0;
  for (;;) {
    const page = await client.dataset(datasetId).listItems({ limit: 1000, offset, clean: true });
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

async function callActor(token: string, batch: Queued[]): Promise<Map<string, CandidateInput[]>> {
  const client = new ApifyClient({ token });
  const queries = batch.map((item) => item.query).join("\n");
  const input = {
    queries,
    maxPagesPerQuery: 1,
    countryCode: "us",
    languageCode: "en",
    mobileResults: false,
    saveHtml: false,
    saveHtmlToKeyValueStore: false,
    includeIcons: false,
    includeUnfilteredResults: false,
    focusOnPaidAds: false,
    maximumLeadsEnrichmentRecords: 0,
  };
  const cap = Math.max(0.5, batch.length * 0.02 + 0.05);
  const run = await client.actor(ACTOR_ID).call(input, { waitSecs: 180, timeout: 300, maxTotalChargeUsd: cap, log: null });
  if (run.status !== "SUCCEEDED") {
    throw new Error(`Apify run ${run.id} ended ${run.status}${run.statusMessage ? `: ${run.statusMessage}` : ""}`);
  }
  if (!run.defaultDatasetId) throw new Error(`Apify run ${run.id} succeeded without a dataset.`);
  const items = await listDatasetItems(client, run.defaultDatasetId);
  const grouped = collectOrganic(items);
  if (batch.length === 1 && grouped.size === 1 && !grouped.has(normQuery(batch[0].query))) {
    const only = [...grouped.values()][0];
    grouped.set(normQuery(batch[0].query), only);
  }
  return grouped;
}

async function searchLive(token: string, batch: Queued[]): Promise<Map<string, CandidateInput[]>> {
  const waits = [5000, 15000, 30000];
  let last: unknown;
  for (let attempt = 0; attempt <= waits.length; attempt++) {
    try {
      return await callActor(token, batch);
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

function mockSearch(batch: Queued[]): Promise<Map<string, CandidateInput[]>> {
  const grouped = new Map<string, CandidateInput[]>();
  for (const item of batch) {
    const slug = item.person.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "mock";
    grouped.set(normQuery(item.query), [
      {
        url: `https://www.linkedin.com/in/${slug}`,
        title: `${item.person.name} - ${item.person.school || "LinkedIn"} | LinkedIn`,
        snippet: [item.person.name, item.person.school, item.person.companies[0]].filter(Boolean).join(". "),
      },
    ]);
  }
  return Promise.resolve(grouped);
}

let writeTail: Promise<void> = Promise.resolve();

function appendLine(filePath: string, line: string): Promise<void> {
  writeTail = writeTail.then(() => {
    fs.appendFileSync(filePath, `${line}\n`, "utf8");
  });
  return writeTail;
}

export async function runLookup(options: {
  db: Database.Database;
  campusId: string | null;
  limit: number | null;
  dryRun: boolean;
  yes: boolean;
  mock: boolean;
  outPath: string;
  hasToken: boolean;
  search?: SearchFn;
}): Promise<number> {
  const queue = loadQueue(options.db, options.campusId);
  const done = readDoneIds(options.outPath);
  const pending = queue.filter((person) => !done.has(person.id));
  const selected = options.limit == null ? pending : pending.slice(0, options.limit);
  const work: Queued[] = selected.map((person) => ({ person, query: buildSearchQuery(person, options.campusId) }));

  console.log("LinkedIn lookup. People with no confirmed linkedin.com/in URL (unverified candidates are included).");
  console.log("Order: Penn, then Berkeley, then everyone else.");
  if (options.campusId) console.log(`Campus filter: ${options.campusId}`);
  console.log(`Missing confirmed LinkedIn: ${queue.length}`);
  console.log(`Already in ${options.outPath}: ${queue.filter((person) => done.has(person.id)).length}`);
  console.log(`This run: ${work.length}`);
  const byCampus = new Map<string, number>();
  for (const item of work) byCampus.set(item.person.campusId || "(no campus)", (byCampus.get(item.person.campusId || "(no campus)") ?? 0) + 1);
  for (const [campus, count] of [...byCampus.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${campus}: ${count}`);
  for (const item of work.slice(0, 5)) console.log(`  query  ${item.person.name} — ${item.query}`);
  if (work.length > 5) console.log(`  … ${work.length - 5} more`);
  if (work.length === 0) {
    console.log("Nothing to search.");
    return 0;
  }
  printEstimate(work.length);
  if (options.dryRun) {
    console.log("Dry run. Nothing was sent to Apify and the output file was not changed.");
    return 0;
  }
  if (options.mock) {
    console.log("Mock mode. No Apify call. Synthetic results will be written.");
  } else if (!options.yes) {
    console.log("Pass --yes to start. Nothing was sent to Apify.");
    return 0;
  } else if (!options.search && !options.hasToken) {
    console.log("APIFY_API_TOKEN is not set. Put it in .env.local at the repo root and re-run. Nothing was sent to Apify.");
    return 1;
  }

  fs.mkdirSync(path.dirname(options.outPath), { recursive: true });
  const search = options.search ?? (options.mock ? mockSearch : (batch: Queued[]) => searchLive(process.env.APIFY_API_TOKEN ?? "", batch));
  const batches: Queued[][] = [];
  for (let index = 0; index < work.length; index += BATCH_SIZE) batches.push(work.slice(index, index + BATCH_SIZE));

  let cursor = 0;
  let written = 0;
  let failed = 0;
  let fatal: unknown = null;
  const total = work.length;

  async function searchResilient(batch: Queued[]): Promise<Map<string, CandidateInput[]>> {
    try {
      return await search(batch);
    } catch (error) {
      if (isAuthError(error) || batch.length === 1) throw error;
      console.log(`Batch of ${batch.length} failed (${errorMessage(error)}). Splitting it.`);
      const mid = Math.ceil(batch.length / 2);
      const left = await searchResilient(batch.slice(0, mid));
      const right = await searchResilient(batch.slice(mid));
      const merged = new Map(left);
      for (const [key, value] of right) merged.set(key, value);
      return merged;
    }
  }

  async function worker() {
    for (;;) {
      if (fatal) return;
      const index = cursor++;
      if (index >= batches.length) return;
      const batch = batches[index];
      let grouped: Map<string, CandidateInput[]>;
      try {
        grouped = await searchResilient(batch);
      } catch (error) {
        if (isAuthError(error)) {
          fatal = error;
          console.log(`Stopped: Apify rejected the token (${errorMessage(error)}).`);
          return;
        }
        for (const item of batch) {
          failed++;
          console.log(`  failed ${item.person.name}: ${errorMessage(error)}. Not written, so a re-run will retry.`);
        }
        continue;
      }
      for (const item of batch) {
        const organic = grouped.get(normQuery(item.query)) ?? [];
        if (organic.length === 0 && !grouped.has(normQuery(item.query))) {
          console.log(`  warning: Apify did not echo the query for ${item.person.name}. Stored as no results.`);
        }
        const line = buildResultLine(item.person, item.query, organic, nowIso());
        if (options.mock) line.mock = true;
        await appendLine(options.outPath, JSON.stringify(line));
        written++;
        const nameHits = line.candidates.filter((candidate) => candidate.signals.name_match).length;
        const strong = line.candidates.filter((candidate) => candidate.signals.decision === "confirmed").length;
        console.log(
          `[${written + failed}/${total}] ${item.person.name} — ${line.candidates.length} linkedin.com/in result(s), ${nameHits} name match(es), ${strong} corroborated. Outcome ${line.outcome}.`
        );
      }
      await sleep(1000);
    }
  }

  const workers = Math.min(CONCURRENCY, batches.length);
  await Promise.all(Array.from({ length: workers }, () => worker()));
  await writeTail;
  console.log(`Wrote ${written} line(s) to ${options.outPath}. Failed ${failed}. Re-run the same command to continue.`);
  return fatal ? 1 : 0;
}

async function main() {
  loadEnvLocal();
  const args = parseArgs(process.argv.slice(2));
  const code = await runLookup({
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
  return base === "apify-linkedin-lookup.ts" || base === "apify-linkedin-lookup.js";
}

if (invokedDirectly()) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
