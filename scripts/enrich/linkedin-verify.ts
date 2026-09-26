// Rules for verifying unverified linkedin.com/in candidates against a
// scraped LinkedIn profile (education + name), and for importing that
// judgment into campus-universe.db.
//
// A candidate passes only when the scraped profile name matches the person
// and an education entry lists their campus (the same alias list the Google
// lookup uses: Penn, Wharton, Haas, …). Company text does not confirm.
//
// One passing candidate is confirmed and the other candidates are demoted.
// For a current student, a recent grad, or a potential founder, a profile
// whose matching education ended in 2023 or later (or is still in progress)
// is preferred when several candidates pass. Several that still pass are
// left unverified. None passing marks the candidates rejected and keeps
// the rows.

import fs from "node:fs";
import type Database from "better-sqlite3";
import { newId, nowIso } from "../../lib/db/client";
import { recomputePersonEnrollment } from "../../lib/domain/enrollment-store";
import {
  linkedInEducationFact,
  yearFromUnknown,
  type LinkedInEducationEntry,
} from "../../lib/domain/founder-status";
import {
  formatUsd,
  loadPerson,
  loadQueue,
  normalizeLinkedIn,
  personNameMatches,
  readDoneIds,
  type LookupPerson,
  type SchoolRef,
} from "./linkedin-match";

export const ACTOR_ID = "harvestapi/linkedin-profile-scraper";
export const ACTOR_PAGE = "https://apify.com/harvestapi/linkedin-profile-scraper";
export const OUTPUT_RELATIVE = "data/imports/apify_linkedin_verify_results.jsonl";
export const PROFILE_MODE = "Profile details no email ($4 per 1k)";
export const BATCH_SIZE = 40;

// Public actor pricingInfos, pay-per-event card startedAt 2025-07-04,
// read 2026-09-26. The primary event is "profile" at $0.004. Email search
// is a separate $0.01 event and is left off. There is no actor-start event,
// and the card says platform usage is not charged.
export const PROFILE_USD = 0.004;

// Same window as recent-grad enrollment (ENROLLMENT_AS_OF_YEAR 2026 minus 3).
export const PREFERRED_END_YEAR = 2023;

const SOURCE_ID = "src_apify_linkedin_verify";

export interface EducationInput {
  schoolName?: string;
  startDate?: unknown;
  endDate?: unknown;
  period?: string;
}

export interface ScrapedProfile {
  firstName?: string | null;
  lastName?: string | null;
  headline?: string | null;
  education?: EducationInput[] | null;
  profileTopEducation?: EducationInput[] | null;
  linkedinUrl?: string | null;
  publicIdentifier?: string | null;
  status?: number | null;
  query?: { publicIdentifier?: string | null } | null;
}

export interface VerifyPerson {
  id: string;
  name: string;
  campusId: string;
  school: string;
  schools: SchoolRef[];
  founderStatus: string | null;
  enrollmentStatus: string | null;
  urls: string[];
}

export interface JudgedUrl {
  url: string;
  returned: boolean;
  profileName: string | null;
  headline: string | null;
  matchedSchool: string | null;
  graduationYear: number | null;
  nameMatch: boolean;
  campusMatch: boolean;
  recent: boolean;
  passes: boolean;
}

export interface VerifyJudgment {
  urls: JudgedUrl[];
  selected: JudgedUrl | null;
  outcome: "confirmed" | "unverified" | "rejected";
  reason: string;
  headline: string | null;
  graduationYear: number | null;
}

export interface StoredProfile {
  url: string;
  profile: ScrapedProfile | null;
}

export interface VerifyResultLine {
  person_id: string;
  name: string;
  campus_id: string;
  school: string;
  enrollment_status: string | null;
  founder_status: string | null;
  outcome: VerifyJudgment["outcome"];
  outcome_reason: string;
  confirmed_url: string | null;
  headline: string | null;
  graduation_year: number | null;
  profiles: StoredProfile[];
  actor: string;
  verified_at: string;
  mock?: boolean;
}

export interface VerifyImportStats {
  confirmed: number;
  demoted: number;
  rejected: number;
  leftUnverified: number;
  skipped: number;
  dryRun: boolean;
}

export function estimateVerify(profileCount: number, batchSize = BATCH_SIZE, runs?: number) {
  const packed = runs ?? (profileCount === 0 ? 0 : Math.ceil(profileCount / batchSize));
  return {
    profiles: profileCount,
    runs: packed,
    batchSize,
    usd: profileCount * PROFILE_USD,
    perThousand: 1000 * PROFILE_USD,
  };
}

export function actorInput(urls: string[]) {
  return {
    profileScraperMode: PROFILE_MODE,
    queries: urls,
  };
}

export function wantsRecentEducation(person: Pick<VerifyPerson, "founderStatus" | "enrollmentStatus">): boolean {
  if (person.founderStatus === "potential") return true;
  return person.enrollmentStatus === "current_student" || person.enrollmentStatus === "recent_grad";
}

function slugOf(url: string): string {
  const normalized = normalizeLinkedIn(url);
  if (!normalized) return "";
  return (normalized.split("/in/")[1] ?? "").toLowerCase();
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

function slimEducation(raw: unknown): EducationInput[] {
  if (!Array.isArray(raw)) return [];
  const out: EducationInput[] = [];
  for (const item of raw) {
    const rec = asRecord(item);
    if (!rec) continue;
    const schoolName =
      typeof rec.schoolName === "string" ? rec.schoolName : typeof rec.school === "string" ? rec.school : "";
    if (!schoolName.trim()) continue;
    out.push({
      schoolName: schoolName.trim(),
      startDate: rec.startDate,
      endDate: rec.endDate,
      period: typeof rec.period === "string" ? rec.period : undefined,
    });
  }
  return out;
}

export function slimProfile(raw: unknown): ScrapedProfile | null {
  const rec = asRecord(raw);
  if (!rec) return null;
  if (typeof rec.status === "number" && rec.status !== 200) return null;
  const query = asRecord(rec.query);
  const education = slimEducation(rec.education);
  const top = slimEducation(rec.profileTopEducation);
  return {
    firstName: typeof rec.firstName === "string" ? rec.firstName : null,
    lastName: typeof rec.lastName === "string" ? rec.lastName : null,
    headline: typeof rec.headline === "string" ? rec.headline : null,
    education,
    profileTopEducation: top,
    linkedinUrl: typeof rec.linkedinUrl === "string" ? rec.linkedinUrl : null,
    publicIdentifier: typeof rec.publicIdentifier === "string" ? rec.publicIdentifier : null,
    status: typeof rec.status === "number" ? rec.status : null,
    query: query && typeof query.publicIdentifier === "string" ? { publicIdentifier: query.publicIdentifier } : null,
  };
}

function profileSlugs(raw: unknown, slim: ScrapedProfile | null): string[] {
  const slugs: string[] = [];
  const rec = asRecord(raw);
  const query = rec ? asRecord(rec.query) : null;
  if (query && typeof query.publicIdentifier === "string" && query.publicIdentifier.trim()) {
    slugs.push(query.publicIdentifier.trim().toLowerCase());
  }
  if (slim?.publicIdentifier) slugs.push(slim.publicIdentifier.trim().toLowerCase());
  if (slim?.linkedinUrl) {
    const slug = slugOf(slim.linkedinUrl);
    if (slug) slugs.push(slug);
  }
  return slugs;
}

// Map each requested profile URL to the dataset item that echoes it.
// harvestapi puts the requested slug on query.publicIdentifier, which still
// matches when LinkedIn rewrites a vanity URL. A non-200 item is a miss.
export function assignProfiles(urls: string[], items: unknown[]): Map<string, ScrapedProfile | null> {
  const bySlug = new Map<string, ScrapedProfile | null>();
  for (const item of items) {
    const slim = slimProfile(item);
    for (const slug of profileSlugs(item, slim)) {
      if (!bySlug.has(slug)) bySlug.set(slug, slim);
    }
  }
  const out = new Map<string, ScrapedProfile | null>();
  for (const url of urls) {
    const normalized = normalizeLinkedIn(url);
    if (!normalized) continue;
    const slug = slugOf(normalized);
    out.set(normalized, slug ? (bySlug.get(slug) ?? null) : null);
  }
  return out;
}

function educationEntries(profile: ScrapedProfile): EducationInput[] {
  return [...(profile.education ?? []), ...(profile.profileTopEducation ?? [])];
}

function isOngoing(entry: EducationInput): boolean {
  if (yearFromUnknown(entry.endDate) != null) return false;
  if (typeof entry.endDate === "string" && /present|current/i.test(entry.endDate)) return true;
  if (entry.endDate && typeof entry.endDate === "object") {
    const text = (entry.endDate as { text?: unknown }).text;
    if (typeof text === "string" && /present|current/i.test(text)) return true;
  }
  return typeof entry.period === "string" && /present|current/i.test(entry.period);
}

function profileDisplayName(profile: ScrapedProfile): string {
  return [profile.firstName, profile.lastName]
    .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
    .join(" ")
    .trim();
}

function campusEntries(person: Pick<VerifyPerson, "schools">, profile: ScrapedProfile): EducationInput[] {
  return educationEntries(profile).filter((entry) => {
    const school = entry.schoolName?.trim() ?? "";
    if (!school) return false;
    return person.schools.some((ref) => ref.pattern.test(school));
  });
}

function judgeOne(
  person: Pick<VerifyPerson, "name" | "schools">,
  url: string,
  profile: ScrapedProfile | null
): JudgedUrl {
  if (!profile) {
    return {
      url,
      returned: false,
      profileName: null,
      headline: null,
      matchedSchool: null,
      graduationYear: null,
      nameMatch: false,
      campusMatch: false,
      recent: false,
      passes: false,
    };
  }
  const profileName = profileDisplayName(profile);
  const nameMatch = profileName.length > 0 && personNameMatches(person.name, profileName);
  const matched = campusEntries(person, profile);
  const years = matched
    .map((entry) => yearFromUnknown(entry.endDate))
    .filter((year): year is number => year != null);
  const recentYears = years.filter((year) => year >= PREFERRED_END_YEAR);
  const ongoing = matched.some((entry) => isOngoing(entry));
  const graduationYear =
    recentYears.length > 0 ? Math.max(...recentYears) : ongoing ? null : years.length > 0 ? Math.max(...years) : null;
  const recent = matched.some((entry) => {
    const end = yearFromUnknown(entry.endDate);
    return (end != null && end >= PREFERRED_END_YEAR) || isOngoing(entry);
  });
  const campusMatch = matched.length > 0;
  return {
    url,
    returned: true,
    profileName: profileName || null,
    headline: profile.headline?.trim() || null,
    matchedSchool: matched[0]?.schoolName?.trim() || null,
    graduationYear,
    nameMatch,
    campusMatch,
    recent,
    passes: nameMatch && campusMatch,
  };
}

export function judgeProfiles(
  person: Pick<VerifyPerson, "name" | "schools" | "founderStatus" | "enrollmentStatus">,
  urls: string[],
  profiles: Map<string, ScrapedProfile | null>
): VerifyJudgment {
  const seen = new Set<string>();
  const judged: JudgedUrl[] = [];
  for (const raw of urls) {
    const url = normalizeLinkedIn(raw);
    if (!url || seen.has(url.toLowerCase())) continue;
    seen.add(url.toLowerCase());
    judged.push(judgeOne(person, url, profiles.get(url) ?? null));
  }
  const passing = judged.filter((item) => item.passes);
  const prefer = wantsRecentEducation(person);
  const recent = passing.filter((item) => item.recent);
  let selected: JudgedUrl | null = null;
  let outcome: VerifyJudgment["outcome"];
  let reason: string;
  if (passing.length === 0) {
    outcome = "rejected";
    reason = judged.some((item) => item.returned)
      ? "no scraped profile matched the name and the campus"
      : "the actor returned no profile";
  } else if (prefer && recent.length === 1) {
    selected = recent[0];
    outcome = "confirmed";
    const year = selected.graduationYear;
    reason =
      year != null && year >= PREFERRED_END_YEAR
        ? `the profile names the person and lists the campus, and the education end year is ${year}`
        : "the profile names the person and lists the campus, and that education is still in progress";
  } else if (passing.length === 1) {
    selected = passing[0];
    outcome = "confirmed";
    reason = "the profile names the person and lists the campus";
  } else if (prefer && recent.length > 1) {
    outcome = "unverified";
    reason = `${recent.length} profiles matched the name and the campus with an education end year of ${PREFERRED_END_YEAR} or later`;
  } else {
    outcome = "unverified";
    reason = `${passing.length} profiles matched the name and the campus`;
  }
  return {
    urls: judged,
    selected,
    outcome,
    reason,
    headline: selected?.headline ?? null,
    graduationYear: selected?.graduationYear ?? null,
  };
}

export function packBatches(groups: string[][], batchSize = BATCH_SIZE): string[][] {
  const batches: string[][] = [];
  let current: string[] = [];
  for (const group of groups) {
    const unique = [...new Set(group)];
    if (unique.length === 0) continue;
    if (current.length > 0 && current.length + unique.length > batchSize) {
      batches.push(current);
      current = [];
    }
    current.push(...unique);
    if (current.length >= batchSize) {
      batches.push(current);
      current = [];
    }
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

export function loadVerifyQueue(db: Database.Database, campusId: string | null): VerifyPerson[] {
  return loadQueue(db, campusId)
    .filter((person) => person.existingUnverified.some((url) => normalizeLinkedIn(url)))
    .map((person) => toVerifyPerson(person));
}

function toVerifyPerson(person: LookupPerson): VerifyPerson {
  const urls: string[] = [];
  const seen = new Set<string>();
  for (const raw of person.existingUnverified) {
    const url = normalizeLinkedIn(raw);
    if (!url || seen.has(url.toLowerCase())) continue;
    seen.add(url.toLowerCase());
    urls.push(url);
  }
  return {
    id: person.id,
    name: person.name,
    campusId: person.campusId,
    school: person.school,
    schools: person.schools,
    founderStatus: person.founderStatus,
    enrollmentStatus: person.enrollmentStatus,
    urls,
  };
}

export function buildResultLine(
  person: VerifyPerson,
  profiles: Map<string, ScrapedProfile | null>,
  verifiedAt: string
): VerifyResultLine {
  const judgment = judgeProfiles(person, person.urls, profiles);
  return {
    person_id: person.id,
    name: person.name,
    campus_id: person.campusId,
    school: person.school,
    enrollment_status: person.enrollmentStatus,
    founder_status: person.founderStatus,
    outcome: judgment.outcome,
    outcome_reason: judgment.reason,
    confirmed_url: judgment.selected?.url ?? null,
    headline: judgment.headline,
    graduation_year: judgment.graduationYear,
    profiles: person.urls.map((url) => ({ url, profile: profiles.get(url) ?? null })),
    actor: ACTOR_ID,
    verified_at: verifiedAt,
  };
}

export function readDonePersonIds(filePath: string): Set<string> {
  return readDoneIds(filePath);
}

function storedMap(line: VerifyResultLine): Map<string, ScrapedProfile | null> {
  const map = new Map<string, ScrapedProfile | null>();
  for (const item of line.profiles) {
    const url = normalizeLinkedIn(item.url);
    if (!url) continue;
    map.set(url, item.profile);
  }
  return map;
}

export function readVerifyLines(text: string): VerifyResultLine[] {
  const lines: VerifyResultLine[] = [];
  const rawLines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  for (let index = 0; index < rawLines.length; index++) {
    const trimmed = rawLines[index].trim();
    if (!trimmed) continue;
    let parsed: Partial<VerifyResultLine>;
    try {
      parsed = JSON.parse(trimmed) as Partial<VerifyResultLine>;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Malformed JSONL at line ${index + 1}: ${message}`);
    }
    if (!parsed.person_id || typeof parsed.person_id !== "string") {
      throw new Error(`JSONL line ${index + 1} is missing person_id.`);
    }
    const profiles = Array.isArray(parsed.profiles) ? parsed.profiles : [];
    lines.push({
      person_id: parsed.person_id,
      name: typeof parsed.name === "string" ? parsed.name : "",
      campus_id: typeof parsed.campus_id === "string" ? parsed.campus_id : "",
      school: typeof parsed.school === "string" ? parsed.school : "",
      enrollment_status: typeof parsed.enrollment_status === "string" ? parsed.enrollment_status : null,
      founder_status: typeof parsed.founder_status === "string" ? parsed.founder_status : null,
      outcome: parsed.outcome ?? "rejected",
      outcome_reason: typeof parsed.outcome_reason === "string" ? parsed.outcome_reason : "",
      confirmed_url: typeof parsed.confirmed_url === "string" ? parsed.confirmed_url : null,
      headline: typeof parsed.headline === "string" ? parsed.headline : null,
      graduation_year: typeof parsed.graduation_year === "number" ? parsed.graduation_year : null,
      profiles: profiles
        .filter((item) => item && typeof item.url === "string")
        .map((item) => ({ url: item.url, profile: item.profile ?? null })),
      actor: typeof parsed.actor === "string" ? parsed.actor : ACTOR_ID,
      verified_at: typeof parsed.verified_at === "string" ? parsed.verified_at : "",
      mock: parsed.mock === true,
    });
  }
  return lines;
}

interface CandidateClaim {
  id: string;
  source_url: string;
  value_json: string;
  verification_state: string;
}

function claimUrl(row: CandidateClaim): string | null {
  const fromSource = normalizeLinkedIn(row.source_url);
  if (fromSource) return fromSource;
  try {
    const value = JSON.parse(row.value_json) as { linkedin?: unknown };
    if (typeof value.linkedin === "string") return normalizeLinkedIn(value.linkedin);
  } catch {
    return null;
  }
  return null;
}

function ensureSource(db: Database.Database) {
  db.prepare(
    `INSERT INTO sources (id, name, family, url, campuses_json, priority, ingestion_mode, status, last_attempt_at)
     VALUES (?, 'LinkedIn profile verify (Apify harvestapi)', 'code_host', ?, '[]', 2, 'api', 'available', ?)
     ON CONFLICT(id) DO UPDATE SET last_attempt_at = excluded.last_attempt_at, status = 'available'`
  ).run(SOURCE_ID, ACTOR_PAGE, nowIso());
}

function educationFact(person: VerifyPerson, profile: ScrapedProfile | null) {
  if (!profile) return null;
  return linkedInEducationFact(educationEntries(profile) as LinkedInEducationEntry[], (school) =>
    person.schools.some((ref) => ref.pattern.test(school))
  );
}

export function importVerifiedLinkedIn(db: Database.Database, filePath: string, dryRun: boolean): VerifyImportStats {
  if (!fs.existsSync(filePath)) throw new Error(`Result file not found: ${filePath}`);
  const lines = readVerifyLines(fs.readFileSync(filePath, "utf8"));
  if (!dryRun) ensureSource(db);

  const readPerson = db.prepare(
    `SELECT id, name, aliases_json, founder_status, enrollment_status FROM people WHERE id = ?`
  );
  const writeAliases = db.prepare(`UPDATE people SET aliases_json = ? WHERE id = ?`);
  const readClaims = db.prepare(
    `SELECT id, source_url, value_json, verification_state FROM claims
     WHERE entity_type = 'person' AND entity_id = ? AND claim_type = 'linkedin_candidate'`
  );
  const updateClaim = db.prepare(
    `UPDATE claims SET verification_state = ?, value_json = ?, excerpt = ?, retrieved_at = ?, source_id = ? WHERE id = ?`
  );
  const insertClaim = db.prepare(
    `INSERT INTO claims (id, entity_type, entity_id, claim_type, value_json, excerpt, source_id, source_url, retrieved_at, label, verification_state)
     VALUES (?, 'person', ?, ?, ?, ?, ?, ?, ?, 'observed_fact', ?)`
  );

  let confirmed = 0;
  let demoted = 0;
  let rejected = 0;
  let leftUnverified = 0;
  let skipped = 0;
  const seen = new Set<string>();
  const now = nowIso();

  const apply = db.transaction((line: VerifyResultLine) => {
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
    const row = readPerson.get(line.person_id) as
      | {
          id: string;
          name: string;
          aliases_json: string;
          founder_status: string | null;
          enrollment_status: string | null;
        }
      | undefined;
    if (!row) {
      console.log(`Skipping ${line.person_id}: no person with that id.`);
      skipped++;
      return;
    }
    if ((row.aliases_json ?? "").includes("linkedin.com/in/")) {
      console.log(`Skipping ${row.name}: confirmed linkedin.com/in URL already stored.`);
      skipped++;
      return;
    }
    const hydrated = loadPerson(db, row.id);
    const person = hydrated
      ? toVerifyPerson(hydrated)
      : {
          id: row.id,
          name: row.name,
          campusId: line.campus_id,
          school: line.school,
          schools: [] as SchoolRef[],
          founderStatus: row.founder_status,
          enrollmentStatus: row.enrollment_status,
          urls: line.profiles.map((item) => item.url),
        };
    const profiles = storedMap(line);
    const urls = [...profiles.keys()];
    const judgment = judgeProfiles(person, urls, profiles);
    const claims = readClaims.all(row.id) as CandidateClaim[];
    const claimByUrl = new Map<string, CandidateClaim>();
    for (const claim of claims) {
      const url = claimUrl(claim);
      if (url && !claimByUrl.has(url.toLowerCase())) claimByUrl.set(url.toLowerCase(), claim);
    }

    const writeCandidate = (item: JudgedUrl, state: string, decision: string, reason: string) => {
      const claim = claimByUrl.get(item.url.toLowerCase());
      if (!claim) {
        console.log(`No linkedin_candidate row for ${row.name} ${item.url}. Left the alias decision as the record.`);
        return false;
      }
      const value = {
        linkedin: item.url,
        reason,
        decision,
        headline: item.headline,
        graduation_year: item.graduationYear,
        matched_school: item.matchedSchool,
        name_match: item.nameMatch,
        campus_match: item.campusMatch,
        actor: ACTOR_ID,
      };
      const excerpt = `${row.name}: ${decision} LinkedIn candidate ${item.url}. ${reason}.${
        item.headline ? ` Headline: ${item.headline}.` : ""
      }${item.graduationYear ? ` Graduation year: ${item.graduationYear}.` : ""}`;
      console.log(`${dryRun ? "Would mark" : "Marked"} ${row.name} ${item.url} ${decision}.`);
      if (!dryRun) updateClaim.run(state, JSON.stringify(value), excerpt.slice(0, 500), now, SOURCE_ID, claim.id);
      return true;
    };

    if (judgment.outcome === "confirmed" && judgment.selected) {
      const selected = judgment.selected;
      const aliases = JSON.parse(row.aliases_json || "[]") as string[];
      console.log(
        `${dryRun ? "Would confirm" : "Confirmed"} ${row.name} ${selected.url} (${judgment.reason})${
          selected.headline ? ` Headline: ${selected.headline}.` : ""
        }${judgment.graduationYear ? ` Graduation year: ${judgment.graduationYear}.` : ""}`
      );
      if (!dryRun) {
        if (!aliases.some((alias) => alias.includes("linkedin.com/in/"))) {
          aliases.push(`linkedin:${selected.url}`);
          writeAliases.run(JSON.stringify(aliases), row.id);
        }
        insertClaim.run(
          newId("claim"),
          row.id,
          "linkedin_alias_discovered",
          JSON.stringify({
            linkedin: selected.url,
            why: judgment.reason,
            headline: selected.headline,
            graduation_year: judgment.graduationYear,
            matched_school: selected.matchedSchool,
          }),
          `${row.name}: confirmed LinkedIn ${selected.url} because ${judgment.reason}.${
            selected.headline ? ` Headline: ${selected.headline}.` : ""
          }${judgment.graduationYear ? ` Graduation year: ${judgment.graduationYear}.` : ""}`,
          SOURCE_ID,
          selected.url,
          now,
          "corroborated"
        );
        const stored = profiles.get(selected.url) ?? null;
        const education = educationFact(person, stored);
        if (education) {
          const when = education.endYear
            ? `ended ${education.endYear}`
            : `started ${education.startYear ?? "an unstated year"}, no end date on the profile`;
          insertClaim.run(
            newId("claim"),
            row.id,
            "linkedin_education",
            JSON.stringify(education),
            `Confirmed LinkedIn education for ${row.name} at ${education.school}: ${when}.`,
            SOURCE_ID,
            selected.url,
            now,
            "corroborated"
          );
        }
        recomputePersonEnrollment(db, row.id);
      }
      writeCandidate(selected, "corroborated", "confirmed", judgment.reason);
      for (const item of judgment.urls) {
        if (item.url === selected.url) continue;
        if (writeCandidate(item, "demoted", "demoted", "another candidate was confirmed")) demoted++;
      }
      confirmed++;
      return;
    }

    if (judgment.outcome === "unverified") {
      console.log(`${dryRun ? "Would leave" : "Left"} ${row.name} unverified (${judgment.reason}).`);
      for (const item of judgment.urls) writeCandidate(item, "unverified", "unverified", judgment.reason);
      leftUnverified++;
      return;
    }

    console.log(`${dryRun ? "Would reject" : "Rejected"} ${row.name} (${judgment.reason}). The candidate rows are kept.`);
    for (const item of judgment.urls) writeCandidate(item, "rejected", "rejected", judgment.reason);
    rejected++;
  });

  for (const line of lines) apply(line);
  if (!dryRun) db.pragma("wal_checkpoint(TRUNCATE)");
  console.log(
    `${dryRun ? "Dry run. " : ""}Confirmed ${confirmed}. Demoted ${demoted}. Rejected ${rejected}. Left unverified ${leftUnverified}. Skipped ${skipped}.`
  );
  return { confirmed, demoted, rejected, leftUnverified, skipped, dryRun };
}

export function formatEstimate(profileCount: number, runs?: number): string {
  const estimate = estimateVerify(profileCount, BATCH_SIZE, runs);
  return [
    `Actor: ${ACTOR_ID}`,
    "No LinkedIn cookies or login. Profile details only; email search is off.",
    `Up to ${estimate.batchSize} profile URLs per actor run (${estimate.runs} run(s) for this invocation).`,
    "Price checked 2026-09-26 (pay-per-event card started 2025-07-04):",
    `  ${formatUsd(estimate.perThousand)} / 1,000 profiles. No actor-start fee. Platform usage is not charged.`,
    `This run: ${estimate.profiles} profile URL(s), estimate ${formatUsd(estimate.usd)}.`,
    `Confirm ${ACTOR_PAGE} before a large run.`,
  ].join("\n");
}
