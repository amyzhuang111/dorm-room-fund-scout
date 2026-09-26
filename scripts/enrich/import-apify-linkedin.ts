// Import data/imports/apify_linkedin_results.jsonl into campus-universe.db.
//
// The lookup script does not touch the database. This one does, using the
// same storage as the other LinkedIn importers:
//   confirmed  → linkedin:<url> alias + linkedin_alias_discovered claim
//                (verification_state corroborated)
//   unverified → linkedin_candidate claim (verification_state unverified),
//                no alias
//   otherwise  → no write
//
// A row is confirmed only when the candidate's name matches AND corroboration
// in the title or snippet outranks every other candidate. Company or startup
// beats a student signal, which beats a bare school mention or role. A tie
// stays unverified. A bare school match on a senior-career profile stays
// unverified for student founders, recent-grad founders, and potential
// founders. People who already have a confirmed linkedin.com/in URL are skipped.
//
// PowerShell, from the repo root:
//   npm run import:apify-linkedin -- --dry-run
//   npm run import:apify-linkedin

import fs from "node:fs";
import path from "node:path";
import type Database from "better-sqlite3";
import { getDb, newId, nowIso } from "../../lib/db/client";
import { recomputePersonEnrollment } from "../../lib/domain/enrollment-store";
import {
  ACTOR_PAGE,
  OUTPUT_RELATIVE,
  type LookupResultLine,
  confirmationWhy,
  judgePerson,
  linkedInCounts,
  loadPerson,
} from "./linkedin-match";

const SOURCE_ID = "src_apify_google_linkedin";

export interface ImportStats {
  beforeConfirmed: number;
  beforeUnverifiedOnly: number;
  afterConfirmed: number;
  afterUnverifiedOnly: number;
  confirmed: number;
  unverified: number;
  blank: number;
  skipped: number;
  dryRun: boolean;
}

function usage(): string {
  return [
    "Usage: npm run import:apify-linkedin -- [file] [options]",
    "  file            JSONL from the lookup. Default: data/imports/apify_linkedin_results.jsonl",
    "  --file PATH     Same as the positional path.",
    "  --dry-run       Print what would change. Do not write.",
  ].join("\n");
}

function parseArgs(argv: string[]): { filePath: string; dryRun: boolean } {
  const positional: string[] = [];
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      console.log(usage());
      process.exit(0);
    }
    if (arg === "--dry-run") continue;
    if (arg === "--file") {
      const next = argv[index + 1];
      if (!next || next.startsWith("--")) throw new Error("--file needs a path.");
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

export function readResultLines(text: string): LookupResultLine[] {
  const lines: LookupResultLine[] = [];
  const rawLines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  for (let index = 0; index < rawLines.length; index++) {
    const trimmed = rawLines[index].trim();
    if (!trimmed) continue;
    let parsed: Partial<LookupResultLine>;
    try {
      parsed = JSON.parse(trimmed) as Partial<LookupResultLine>;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Malformed JSONL at line ${index + 1}: ${message}`);
    }
    if (!parsed.person_id || typeof parsed.person_id !== "string") {
      throw new Error(`JSONL line ${index + 1} is missing person_id.`);
    }
    const candidates = Array.isArray(parsed.candidates) ? parsed.candidates : [];
    lines.push({
      person_id: parsed.person_id,
      name: typeof parsed.name === "string" ? parsed.name : "",
      campus_id: typeof parsed.campus_id === "string" ? parsed.campus_id : "",
      school: typeof parsed.school === "string" ? parsed.school : "",
      companies: Array.isArray(parsed.companies) ? parsed.companies.filter((item): item is string => typeof item === "string") : [],
      roles: Array.isArray(parsed.roles) ? parsed.roles.filter((item): item is string => typeof item === "string") : [],
      evidence: Array.isArray(parsed.evidence) ? parsed.evidence.filter((item): item is string => typeof item === "string") : [],
      existing_unverified: [],
      query: typeof parsed.query === "string" ? parsed.query : "",
      candidates: candidates
        .filter((candidate) => candidate && typeof candidate.url === "string")
        .map((candidate) => ({
          url: candidate.url,
          title: typeof candidate.title === "string" ? candidate.title : "",
          snippet: typeof candidate.snippet === "string" ? candidate.snippet : "",
          signals: candidate.signals ?? {
            name_match: false,
            school_match: false,
            company_match: false,
            role_match: false,
            matched_company: null,
            matched_role: null,
            decision: "reject" as const,
          },
        })),
      outcome: parsed.outcome ?? "blank",
      outcome_reason: typeof parsed.outcome_reason === "string" ? parsed.outcome_reason : "",
      actor: typeof parsed.actor === "string" ? parsed.actor : "",
      searched_at: typeof parsed.searched_at === "string" ? parsed.searched_at : "",
      mock: parsed.mock === true,
    });
  }
  return lines;
}

function ensureSource(db: Database.Database) {
  db.prepare(
    `INSERT INTO sources (id, name, family, url, campuses_json, priority, ingestion_mode, status, last_attempt_at)
     VALUES (?, 'LinkedIn people search (Apify Google Search)', 'code_host', ?, '[]', 2, 'api', 'available', ?)
     ON CONFLICT(id) DO UPDATE SET last_attempt_at = excluded.last_attempt_at, status = 'available'`
  ).run(SOURCE_ID, ACTOR_PAGE, nowIso());
}

export function importApifyLinkedIn(db: Database.Database, filePath: string, dryRun: boolean): ImportStats {
  if (!fs.existsSync(filePath)) throw new Error(`Result file not found: ${filePath}`);
  const lines = readResultLines(fs.readFileSync(filePath, "utf8"));
  const before = linkedInCounts(db);
  const people = (count: number) => (count === 1 ? "1 person" : `${count} people`);
  console.log(`Before: ${before.confirmed} confirmed LinkedIn, ${people(before.unverifiedOnly)} with only an unverified candidate.`);
  if (!dryRun) ensureSource(db);

  const insertClaim = db.prepare(
    `INSERT INTO claims (id, entity_type, entity_id, claim_type, value_json, excerpt, source_id, source_url, retrieved_at, label, verification_state)
     VALUES (?, 'person', ?, ?, ?, ?, ?, ?, ?, 'observed_fact', ?)`
  );
  const readAliases = db.prepare(`SELECT aliases_json FROM people WHERE id = ?`);
  const writeAliases = db.prepare(`UPDATE people SET aliases_json = ? WHERE id = ?`);
  const existingCandidate = db.prepare(
    `SELECT 1 as ok FROM claims WHERE entity_type = 'person' AND entity_id = ? AND claim_type = 'linkedin_candidate' AND source_url = ? LIMIT 1`
  );

  let confirmed = 0;
  let unverified = 0;
  let blank = 0;
  let skipped = 0;
  const seen = new Set<string>();
  const now = nowIso();

  const apply = db.transaction((line: LookupResultLine) => {
    if (seen.has(line.person_id)) {
      console.log(`Skipping ${line.name || line.person_id}: duplicate person_id in the file.`);
      skipped++;
      return;
    }
    seen.add(line.person_id);
    if (line.mock) {
      console.log(`Skipping ${line.name || line.person_id}: mock result. Not imported.`);
      skipped++;
      return;
    }
    const person = loadPerson(db, line.person_id);
    if (!person) {
      console.log(`Skipping ${line.person_id}: no person with that id.`);
      skipped++;
      return;
    }
    if (person.confirmedLinkedIn) {
      console.log(`Skipping ${person.name}: confirmed linkedin.com/in URL already stored.`);
      skipped++;
      return;
    }
    const judgment = judgePerson(person, line.candidates);
    if (judgment.outcome === "blank") {
      console.log(`Left ${person.name} blank (${judgment.reason}).`);
      blank++;
      return;
    }
    if (judgment.outcome === "confirmed") {
      const candidate = judgment.confirmed[0];
      const why = confirmationWhy(candidate.signals);
      const evidence = `${candidate.title} ${candidate.snippet}`.trim();
      console.log(`${dryRun ? "Would confirm" : "Confirmed"} ${person.name} ${candidate.url} (${why})`);
      if (!dryRun) {
        const current = (readAliases.get(person.id) as { aliases_json: string } | undefined)?.aliases_json ?? "[]";
        const aliases = JSON.parse(current || "[]") as string[];
        if (!aliases.some((alias) => alias.includes("linkedin.com/in/"))) {
          aliases.push(`linkedin:${candidate.url}`);
          writeAliases.run(JSON.stringify(aliases), person.id);
        }
        insertClaim.run(
          newId("claim"),
          person.id,
          "linkedin_alias_discovered",
          JSON.stringify({ linkedin: candidate.url, why, query: line.query, title: candidate.title, snippet: candidate.snippet }),
          `${person.name}: confirmed LinkedIn ${candidate.url} because ${why}. Evidence: ${evidence.slice(0, 500)} Query: ${line.query}.`,
          SOURCE_ID,
          candidate.url,
          now,
          "corroborated"
        );
        recomputePersonEnrollment(db, person.id);
      }
      confirmed++;
      return;
    }
    let stored = 0;
    for (const candidate of judgment.unverified) {
      const already = existingCandidate.get(person.id, candidate.url) as { ok: number } | undefined;
      if (already) {
        console.log(`Skipping unverified candidate ${candidate.url} for ${person.name}: already stored.`);
        continue;
      }
      const evidence = `${candidate.title} ${candidate.snippet}`.trim();
      console.log(`${dryRun ? "Would store unverified" : "Unverified"} ${person.name} ${candidate.url} (${judgment.reason})`);
      if (!dryRun) {
        insertClaim.run(
          newId("claim"),
          person.id,
          "linkedin_candidate",
          JSON.stringify({
            linkedin: candidate.url,
            reason: judgment.reason,
            query: line.query,
            title: candidate.title,
            snippet: candidate.snippet,
          }),
          `Unverified LinkedIn candidate for ${person.name}: ${candidate.url}. ${judgment.reason}. Evidence: ${evidence.slice(0, 300)}`,
          SOURCE_ID,
          candidate.url,
          now,
          "unverified"
        );
      }
      stored++;
    }
    if (stored === 0) skipped++;
    else unverified += stored;
  });

  for (const line of lines) apply(line);
  if (!dryRun) db.pragma("wal_checkpoint(TRUNCATE)");
  const after = linkedInCounts(db);
  console.log(`After:  ${after.confirmed} confirmed LinkedIn, ${people(after.unverifiedOnly)} with only an unverified candidate.`);
  console.log(
    `${dryRun ? "Dry run. " : ""}Confirmed ${confirmed}. Unverified candidate rows ${unverified}. Left blank ${blank}. Skipped ${skipped}.`
  );
  return {
    beforeConfirmed: before.confirmed,
    beforeUnverifiedOnly: before.unverifiedOnly,
    afterConfirmed: after.confirmed,
    afterUnverifiedOnly: after.unverifiedOnly,
    confirmed,
    unverified,
    blank,
    skipped,
    dryRun,
  };
}

function invokedDirectly(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  const base = path.basename(entry);
  return base === "import-apify-linkedin.ts" || base === "import-apify-linkedin.js";
}

if (invokedDirectly()) {
  try {
    const args = parseArgs(process.argv.slice(2));
    importApifyLinkedIn(getDb(), args.filePath, args.dryRun);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
