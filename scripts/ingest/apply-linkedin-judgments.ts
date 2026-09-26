// Apply judged LinkedIn profile URLs.
//
//   npx tsx scripts/ingest/apply-linkedin-judgments.ts data/exports/linkedin-judgments.json
//   npx tsx scripts/ingest/apply-linkedin-judgments.ts --dry-run data/exports/linkedin-judgments.json
//
// Each row is one judgment:
//   { person_id, full_name, status, linkedin_url, profile_title, evidence,
//     evidence_url, query, match_basis, source_id }
// status is "confirmed" | "unverified" | "not_found".
//
// Confirmed requires the profile title to contain the person's first and last
// name, plus a match_basis of school, company, role, or own_page. own_page
// means the URL was taken from a page that names this person (their club
// page, company team page, GitHub, Devpost, or personal site). Name-only
// rows stay unverified and do not get a linkedin: alias. not_found rows are
// recorded as a search attempt and do not invent a URL. A profile URL already
// stored on a different person is refused.

import fs from "node:fs";
import path from "node:path";
import { getDb, newId, nowIso } from "../../lib/db/client";
import { recomputePersonEnrollment } from "../../lib/domain/enrollment-store";

const DEFAULT_SOURCE = "src_linkedin_search_web";

interface Judgment {
  person_id?: string;
  full_name?: string;
  status?: string;
  linkedin_url?: string | null;
  profile_title?: string | null;
  evidence?: string | null;
  evidence_url?: string | null;
  query?: string | null;
  match_basis?: string | null;
  source_id?: string | null;
}

function norm(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function nameTokens(value: string): string[] {
  return norm(value)
    .split(" ")
    .filter((token) => token.length >= 2 && !["jr", "sr", "ii", "iii", "iv"].includes(token));
}

// First-name pairs accepted only when the company, role, or the person's own
// page already matches. School-only rows still need the recorded first name.
const FIRST_NAME_EQUIV: string[][] = [
  ["alex", "alexander"],
  ["andy", "andrew"],
  ["ben", "benjamin"],
  ["bill", "william"],
  ["bob", "robert"],
  ["charlie", "charles"],
  ["chris", "christopher"],
  ["dan", "daniel"],
  ["dave", "david"],
  ["greg", "gregory"],
  ["jeff", "jeffrey"],
  ["jenny", "jennifer"],
  ["joe", "joseph"],
  ["josh", "joshua"],
  ["kate", "katherine", "kathryn"],
  ["liz", "elizabeth"],
  ["matt", "matthew"],
  ["max", "maxwell"],
  ["mike", "michael"],
  ["nate", "nathan"],
  ["nick", "nicholas"],
  ["rob", "robert"],
  ["sam", "samuel"],
  ["steve", "steven"],
  ["tim", "timothy"],
  ["tom", "thomas"],
  ["tony", "anthony"],
  ["will", "william"],
  ["zach", "zachary"],
];

function firstNamesMatch(recorded: string, titleFirst: string, allowNickname: boolean): boolean {
  if (recorded === titleFirst) return true;
  if (!allowNickname) return false;
  return FIRST_NAME_EQUIV.some((group) => group.includes(recorded) && group.includes(titleFirst));
}

function titleHasName(title: string, fullName: string, allowNickname = false): boolean {
  const tokens = nameTokens(fullName);
  const titleTokens = nameTokens(title);
  if (tokens.length < 2 || titleTokens.length < 2) return false;
  const last = tokens[tokens.length - 1];
  if (!titleTokens.includes(last)) return false;
  return firstNamesMatch(tokens[0], titleTokens[0], allowNickname);
}

function profileUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = value.match(/https?:\/\/(?:[\w.-]+\.)?linkedin\.com\/in\/[A-Za-z0-9\-_%]+/i);
  if (!match) return null;
  const slug = decodeURIComponent(match[0].split("/in/")[1] ?? "").replace(/\/+$/, "");
  if (!slug || slug.length < 2) return null;
  return `https://www.linkedin.com/in/${slug}`;
}

function slugOf(url: string): string {
  return url.split("/in/")[1]?.toLowerCase() ?? "";
}

function main() {
  const dry = process.argv.includes("--dry-run");
  const filePath = process.argv.slice(2).find((arg) => !arg.startsWith("--"));
  if (!filePath) {
    console.error("Usage: npx tsx scripts/ingest/apply-linkedin-judgments.ts [--dry-run] <judgments.json>");
    process.exit(1);
  }
  const rows = JSON.parse(fs.readFileSync(path.resolve(filePath), "utf8")) as Judgment[];
  if (!Array.isArray(rows)) throw new Error("Judgment file must be a JSON array.");

  const db = getDb();
  const taken = new Map<string, string>();
  const existing = db.prepare(`SELECT id, aliases_json FROM people`).all() as { id: string; aliases_json: string }[];
  for (const person of existing) {
    const match = person.aliases_json.match(/linkedin\.com\/in\/([A-Za-z0-9\-_%]+)/i);
    if (match) taken.set(decodeURIComponent(match[1]).toLowerCase(), person.id);
  }

  const now = nowIso();
  db.prepare(
    `INSERT INTO sources (id, name, family, url, campuses_json, priority, ingestion_mode, status, last_attempt_at)
     VALUES (?, 'LinkedIn people search (public web)', 'code_host', 'https://html.duckduckgo.com/html/', '[]', 2, 'html_scrape', 'available', ?)
     ON CONFLICT(id) DO UPDATE SET last_attempt_at = excluded.last_attempt_at`
  ).run(DEFAULT_SOURCE, now);

  const readPerson = db.prepare(`SELECT id, name, aliases_json FROM people WHERE id = ?`);
  const writeAliases = db.prepare(`UPDATE people SET aliases_json = ? WHERE id = ?`);
  const insertClaim = db.prepare(
    `INSERT INTO claims (id, entity_type, entity_id, claim_type, value_json, excerpt, source_id, source_url, retrieved_at, label, verification_state)
     VALUES (?, 'person', ?, ?, ?, ?, ?, ?, ?, 'observed_fact', ?)`
  );
  const hasCandidate = db.prepare(
    `SELECT 1 as ok FROM claims WHERE entity_id = ? AND claim_type = 'linkedin_candidate' AND source_url = ? LIMIT 1`
  );
  const hasAttempt = db.prepare(
    `SELECT 1 as ok FROM claims WHERE entity_id = ? AND claim_type = 'linkedin_web_search_attempt' LIMIT 1`
  );

  let confirmed = 0;
  let upgraded = 0;
  let unverified = 0;
  let notFound = 0;
  let skipped = 0;

  const tx = db.transaction(() => {
    for (const row of rows) {
      const personId = row.person_id?.trim();
      if (!personId) {
        skipped++;
        continue;
      }
      const person = readPerson.get(personId) as { id: string; name: string; aliases_json: string } | undefined;
      if (!person) {
        console.log(`skip missing person ${personId} (${row.full_name ?? ""})`);
        skipped++;
        continue;
      }
      const status = row.status?.trim();
      const sourceId = row.source_id?.trim() || DEFAULT_SOURCE;
      const evidence = (row.evidence ?? "").trim();
      const query = (row.query ?? "").trim();

      if (status === "not_found") {
        if (!hasAttempt.get(person.id)) {
          if (!dry) {
            insertClaim.run(
              newId("claim"),
              person.id,
              "linkedin_web_search_attempt",
              JSON.stringify({ query, engines: ["web_search"], hits: 0, linkedinUrls: 0, confirmed: 0 }),
              `Public-web LinkedIn search for ${person.name}: ${query || "(no query)"}. No profile stored.`,
              sourceId,
              "https://html.duckduckgo.com/html/",
              now,
              "corroborated"
            );
          }
          notFound++;
          console.log(`not found ${person.name}`);
        } else {
          skipped++;
        }
        continue;
      }

      const url = profileUrl(row.linkedin_url);
      if ((status !== "confirmed" && status !== "unverified") || !url) {
        console.log(`skip ${person.name}: status ${status ?? "missing"} without a linkedin.com/in URL`);
        skipped++;
        continue;
      }
      const basis = (row.match_basis ?? "").trim();
      const title = (row.profile_title ?? "").trim();
      const allowNickname = status === "confirmed" && ["company", "role", "own_page"].includes(basis);
      if (!titleHasName(title, person.name, allowNickname)) {
        console.log(`skip ${person.name}: profile title "${title}" does not contain their first and last name`);
        skipped++;
        continue;
      }
      const owner = taken.get(slugOf(url));
      if (owner && owner !== person.id) {
        console.log(`skip ${person.name}: ${url} is already stored on ${owner}`);
        skipped++;
        continue;
      }
      const alreadyConfirmed = person.aliases_json.includes("linkedin.com/in/");
      if (alreadyConfirmed) {
        console.log(`skip ${person.name}: confirmed LinkedIn already stored`);
        skipped++;
        continue;
      }

      if (status === "confirmed") {
        if (!["school", "company", "role", "own_page"].includes(basis)) {
          console.log(`skip ${person.name}: confirmed row missing match_basis`);
          skipped++;
          continue;
        }
        if (evidence.length < 12) {
          console.log(`skip ${person.name}: confirmed row missing evidence`);
          skipped++;
          continue;
        }
        const aliases = JSON.parse(person.aliases_json || "[]") as string[];
        if (!aliases.some((alias) => alias.includes("linkedin.com/in/"))) aliases.push(`linkedin:${url}`);
        const wasUnverified = Boolean(
          db
            .prepare(
              `SELECT 1 as ok FROM claims WHERE entity_id = ? AND claim_type = 'linkedin_candidate' AND verification_state = 'unverified' LIMIT 1`
            )
            .get(person.id)
        );
        const why =
          basis === "own_page"
            ? `the page ${row.evidence_url || url} names ${person.name} and links this profile`
            : `the profile title is "${title}" and the ${basis} matches the record`;
        const sourceUrl = (row.evidence_url || url).trim();
        if (!dry) {
          writeAliases.run(JSON.stringify(aliases), person.id);
          insertClaim.run(
            newId("claim"),
            person.id,
            "linkedin_alias_discovered",
            JSON.stringify({ linkedin: url, why: evidence, query, match_basis: basis, profile_title: title }),
            `${person.name}: confirmed LinkedIn ${url} because ${why}. Evidence: ${evidence.slice(0, 500)}${query ? ` Query: ${query}.` : ""}`,
            sourceId,
            sourceUrl.startsWith("http") ? sourceUrl : url,
            now,
            "corroborated"
          );
          recomputePersonEnrollment(db, person.id);
        }
        taken.set(slugOf(url), person.id);
        person.aliases_json = JSON.stringify(aliases);
        confirmed++;
        if (wasUnverified) upgraded++;
        console.log(`${dry ? "would confirm" : "confirmed"} ${person.name} ${url}${wasUnverified ? " (upgraded)" : ""}`);
        continue;
      }

      if (hasCandidate.get(person.id, url)) {
        console.log(`skip ${person.name}: unverified candidate already stored`);
        skipped++;
        continue;
      }
      if (!dry) {
        insertClaim.run(
          newId("claim"),
          person.id,
          "linkedin_candidate",
          JSON.stringify({ linkedin: url, reason: "name matched; school and company did not", query, profile_title: title }),
          `Unverified LinkedIn candidate for ${person.name}: ${url}. name matched; school and company did not. Evidence: ${evidence.slice(0, 300)}`,
          sourceId,
          url,
          now,
          "unverified"
        );
      }
      unverified++;
      console.log(`${dry ? "would store unverified" : "unverified"} ${person.name} ${url}`);
    }
  });
  tx();
  if (!dry) db.pragma("wal_checkpoint(TRUNCATE)");
  console.log(
    `${dry ? "Dry run. " : ""}Confirmed ${confirmed} (${upgraded} upgraded from unverified). Unverified ${unverified}. Not found ${notFound}. Skipped ${skipped}.`
  );
}

main();
