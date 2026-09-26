// Shared rules for the laptop LinkedIn lookup and its importer.
//
// A linkedin.com/in URL is confirmed only when the result title or snippet
// contains the person's name AND corroboration. Company or startup beats a
// student/undergrad signal (Student, Class of 202x, M&T, SEAS, C'2x, W'2x),
// which beats a bare school mention or a specific role. The single top-ranked
// candidate is confirmed when it strictly outranks the others. A name-only
// hit stays unverified. A bare school match on a senior-career profile stays
// unverified for student founders, recent-grad founders, and potential
// founders. Anything else is left blank. Generic roles (team member,
// contributor, …) do not confirm anyone. M&T is not put in the Google query:
// an unencoded & can split or truncate the actor request.

import fs from "node:fs";
import type Database from "better-sqlite3";

export const ACTOR_ID = "apify/google-search-scraper";
export const ACTOR_PAGE = "https://apify.com/apify/google-search-scraper";
export const OUTPUT_RELATIVE = "data/imports/apify_linkedin_results.jsonl";
export const BATCH_SIZE = 10;
export const CONCURRENCY = 2;
export const MAX_UNVERIFIED = 3;

// Actor pricingInfos entry startedAt 2026-08-20, read from the public actor
// API on 2026-09-26. search-page-scraped is the primary event. actor-start
// is charged once per run (FREE through GOLD are all $0.001). Add-ons are
// left off, so they are not included.
export const PAGE_USD = { free: 0.0045, bronze: 0.0025, silver: 0.00195, gold: 0.0018 } as const;
export const ACTOR_START_USD = 0.001;

// Same phrases go into title/snippet/slug checks. The Google query uses the
// short ones (two words or fewer) and never sends "&". Multi-word phrases are
// quoted; short aliases stay bare. M&T is a student-signal, not a query term.
const CAMPUS_SEARCH_ALIASES: Record<string, string[]> = {
  univ_penn: ["Penn", "UPenn", "Wharton", "University of Pennsylvania", "SEAS"],
  univ_berkeley: ["Berkeley", "UC Berkeley", "Haas", "Cal"],
  univ_stanford: ["Stanford", "Stanford University"],
  univ_mit: ["MIT", "Massachusetts Institute of Technology"],
  univ_harvard: ["Harvard", "Harvard University"],
  univ_waterloo: ["Waterloo", "University of Waterloo"],
  univ_cmu: ["CMU", "Carnegie Mellon", "Carnegie Mellon University"],
  univ_columbia: ["Columbia", "Columbia University"],
  univ_gatech: ["Georgia Tech", "Georgia Institute of Technology"],
  univ_michigan: ["Michigan", "UMich", "University of Michigan"],
  univ_princeton: ["Princeton", "Princeton University"],
};

const CAMPUS_FLAGS: Record<string, string> = {
  penn: "univ_penn",
  upenn: "univ_penn",
  univ_penn: "univ_penn",
  berkeley: "univ_berkeley",
  cal: "univ_berkeley",
  ucberkeley: "univ_berkeley",
  "uc berkeley": "univ_berkeley",
  univ_berkeley: "univ_berkeley",
  stanford: "univ_stanford",
  univ_stanford: "univ_stanford",
  mit: "univ_mit",
  univ_mit: "univ_mit",
  harvard: "univ_harvard",
  univ_harvard: "univ_harvard",
  waterloo: "univ_waterloo",
  univ_waterloo: "univ_waterloo",
  cmu: "univ_cmu",
  "carnegie mellon": "univ_cmu",
  univ_cmu: "univ_cmu",
  columbia: "univ_columbia",
  univ_columbia: "univ_columbia",
  gatech: "univ_gatech",
  "georgia tech": "univ_gatech",
  univ_gatech: "univ_gatech",
  michigan: "univ_michigan",
  umich: "univ_michigan",
  univ_michigan: "univ_michigan",
  princeton: "univ_princeton",
  univ_princeton: "univ_princeton",
};

const GENERIC_ROLES = new Set([
  "team member",
  "member",
  "contributor",
  "alumnus",
  "alumni",
  "participant",
  "student",
  "undergrad",
]);

export interface SchoolRef {
  universityId: string;
  name: string;
  aliases: string[];
  pattern: RegExp;
}

export interface LookupPerson {
  id: string;
  name: string;
  campusId: string;
  school: string;
  schools: SchoolRef[];
  companies: string[];
  roles: string[];
  evidence: string[];
  existingUnverified: string[];
  confirmedLinkedIn: boolean;
  founderStatus: string | null;
  enrollmentStatus: string | null;
}

export interface CandidateInput {
  url: string;
  title: string;
  snippet: string;
}

export interface MatchSignals {
  name_match: boolean;
  school_match: boolean;
  company_match: boolean;
  role_match: boolean;
  matched_company: string | null;
  matched_role: string | null;
  decision: "confirmed" | "unverified" | "reject";
}

export interface JudgedCandidate extends CandidateInput {
  signals: MatchSignals;
}

export interface Judgment {
  candidates: JudgedCandidate[];
  confirmed: JudgedCandidate[];
  unverified: JudgedCandidate[];
  outcome: "confirmed" | "unverified" | "blank";
  reason: string;
}

export interface LookupResultLine {
  person_id: string;
  name: string;
  campus_id: string;
  school: string;
  companies: string[];
  roles: string[];
  evidence: string[];
  existing_unverified: string[];
  query: string;
  candidates: JudgedCandidate[];
  outcome: Judgment["outcome"];
  outcome_reason: string;
  actor: string;
  searched_at: string;
  mock?: boolean;
}

export function resolveCampusFlag(raw: string): string | null {
  const direct = raw.trim().toLowerCase();
  if (CAMPUS_FLAGS[direct]) return CAMPUS_FLAGS[direct];
  const spaced = direct.replace(/_/g, " ").replace(/\s+/g, " ");
  return CAMPUS_FLAGS[spaced] ?? null;
}

export function campusFlagHelp(): string {
  return "penn, berkeley, stanford, mit, harvard, waterloo, cmu, columbia, gatech, michigan, princeton";
}

export function estimateRun(lookups: number, batchSize = BATCH_SIZE) {
  const runs = lookups === 0 ? 0 : Math.ceil(lookups / batchSize);
  const total = (page: number) => lookups * page + runs * ACTOR_START_USD;
  const perThousandRuns = Math.ceil(1000 / batchSize);
  const perThousand = (page: number) => 1000 * page + perThousandRuns * ACTOR_START_USD;
  return {
    lookups,
    runs,
    batchSize,
    free: total(PAGE_USD.free),
    bronze: total(PAGE_USD.bronze),
    silver: total(PAGE_USD.silver),
    gold: total(PAGE_USD.gold),
    perThousandFree: perThousand(PAGE_USD.free),
    perThousandBronze: perThousand(PAGE_USD.bronze),
    perThousandSilver: perThousand(PAGE_USD.silver),
    perThousandGold: perThousand(PAGE_USD.gold),
  };
}

export function formatUsd(amount: number): string {
  if (amount === 0) return "$0.00";
  const rounded = Math.round(amount * 10000) / 10000;
  if (rounded >= 0.01) return `$${rounded.toFixed(2)}`;
  return `$${rounded.toFixed(4)}`;
}

function escapeReg(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function campusSearchAliases(universityId: string, officialName: string, extra: string[] = []): string[] {
  const listed = CAMPUS_SEARCH_ALIASES[universityId];
  if (listed) return [...listed];
  const bits = [officialName, ...extra].map((part) => part.trim()).filter((part) => part.length >= 3);
  return [...new Set(bits)];
}

function patternFromAliases(aliases: string[]): RegExp {
  const bits = aliases.map((alias) => alias.trim()).filter(Boolean);
  if (bits.length === 0) return /$^/;
  const body = bits
    .map((alias) => {
      const escaped = escapeReg(alias).replace(/\\&/g, "\\s*&\\s*");
      return `\\b${escaped}\\b`;
    })
    .join("|");
  return new RegExp(body, "i");
}

function splitNameTokens(raw: string): string[] {
  const chunks = raw
    .replace(/[_./]+/g, " ")
    .split(/\s+/)
    .flatMap((token) => token.split(/-+/))
    .map((token) => token.replace(/\d+/g, ""))
    .flatMap((token) => token.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2").split(/\s+/))
    .map((token) => token.replace(/[^A-Za-z']/g, ""))
    .filter((token) => token.replace(/'/g, "").length >= 2);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const token of chunks) {
    const key = token.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const letters = token.replace(/'/g, "");
    const display = letters === letters.toLowerCase() ? letters.charAt(0).toUpperCase() + letters.slice(1) : token;
    out.push(display);
  }
  return out;
}

// Display name used in the Google query. Null when the record is only a
// GitHub-style handle (no separate first and last name).
export function cleanSearchName(raw: string): string | null {
  const tokens = splitNameTokens(raw);
  if (tokens.length < 2) return null;
  return tokens.slice(0, 6).join(" ");
}

// Google drops queries past about 32 words. Stay well under that, and never
// send "&": the actor treats it as a query-string separator and can truncate
// or split the line.
const MAX_QUERY_WORDS = 20;
const QUERY_ALIAS_MAX_WORDS = 2;

const ORG_NAME_TOKENS = new Set([
  "venture",
  "ventures",
  "collaboration",
  "lab",
  "labs",
  "team",
  "teams",
  "inc",
  "incorporated",
  "club",
  "clubs",
  "llc",
  "corp",
  "corporation",
]);

function queryWords(value: string): number {
  return value.split(/\s+/).filter(Boolean).length;
}

function sanitizeQueryTerm(value: string): string {
  return value
    .replace(/\s*&\s*/g, " and ")
    .replace(/[\r\n"]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function quoteTerm(value: string): string {
  const clean = sanitizeQueryTerm(value);
  if (!clean || clean.includes("&")) return "";
  return /\s/.test(clean) ? `"${clean}"` : clean;
}

// Organization-like display names ("Blank New Venture Collaboration") are not
// people. A token such as Venture, Collaboration, Lab, Team, Inc, or Club skips
// the record.
export function isOrganizationName(raw: string): boolean {
  const tokens = splitNameTokens(raw).map((token) => token.toLowerCase());
  return tokens.some((token) => ORG_NAME_TOKENS.has(token));
}

export function buildSearchQuery(person: LookupPerson, preferredCampusId: string | null): string {
  const queryName = cleanSearchName(person.name);
  if (!queryName || isOrganizationName(person.name)) return "";
  const preferred = preferredCampusId ? person.schools.find((school) => school.universityId === preferredCampusId) : undefined;
  const school = preferred ?? person.schools[0];
  const parts = ["site:linkedin.com/in", `"${queryName}"`];
  let used = 1 + queryWords(queryName);
  const company = person.companies.find((name) => name.trim().length >= 4);
  const orTerms: string[] = [];
  if (company) {
    const quoted = quoteTerm(company.split(/\s+/).slice(0, 4).join(" "));
    if (quoted) {
      orTerms.push(quoted);
      used += queryWords(quoted);
    }
  }
  const aliases = (school ? school.aliases : [])
    .map((alias) => sanitizeQueryTerm(alias))
    .filter((alias) => alias && !alias.includes("&") && queryWords(alias) <= QUERY_ALIAS_MAX_WORDS);
  for (const alias of aliases) {
    const quoted = quoteTerm(alias);
    if (!quoted) continue;
    const addition = queryWords(quoted) + 1;
    if (used + addition > MAX_QUERY_WORDS) continue;
    orTerms.push(quoted);
    used += addition;
  }
  if (orTerms.length > 0) parts.push(`(${orTerms.join(" OR ")})`);
  return parts.join(" ");
}

function nameIn(text: string, name: string): boolean {
  const cleaned = cleanSearchName(name) ?? "";
  const tokens = cleaned
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.replace(/[^a-z'-]/g, ""))
    .filter((token) => token.length > 1);
  if (tokens.length < 2) return false;
  const first = tokens[0];
  const last = tokens[tokens.length - 1];
  const gap = "(?:[^a-z0-9]+)";
  const pattern = new RegExp(
    `\\b${escapeReg(first)}\\b${gap}\\b${escapeReg(last)}\\b|\\b${escapeReg(last)}\\b${gap}\\b${escapeReg(first)}\\b`,
    "i"
  );
  return pattern.test(text);
}

function phraseIn(text: string, phrase: string): boolean {
  const norm = phrase.trim().toLowerCase();
  if (norm.length < 4) return false;
  const pattern = new RegExp(`(?:^|[^a-z0-9])${escapeReg(norm)}(?:$|[^a-z0-9])`, "i");
  return pattern.test(text);
}

function rolePhrases(role: string): string[] {
  const normalized = role.replace(/_/g, " ").replace(/\s+/g, " ").trim();
  if (!normalized) return [];
  const phrases: string[] = [];
  if (!GENERIC_ROLES.has(normalized.toLowerCase()) && normalized.length >= 4) phrases.push(normalized);
  const parts = normalized.split(/\s+[—–-]\s+/);
  if (parts.length > 1) {
    const suffix = parts.slice(1).join(" - ").trim();
    if (suffix.length >= 4 && !GENERIC_ROLES.has(suffix.toLowerCase())) phrases.push(suffix);
  }
  return phrases;
}

export function normalizeLinkedIn(raw: string): string | null {
  const match = raw.match(/https?:\/\/(?:[\w.-]+\.)?linkedin\.com\/in\/([A-Za-z0-9\-_%]+)/i);
  if (!match) return null;
  let slug = match[1];
  try {
    slug = decodeURIComponent(slug);
  } catch {
    // keep the raw slug
  }
  slug = slug.replace(/[^A-Za-z0-9\-_%]/g, "");
  if (!slug) return null;
  return `https://www.linkedin.com/in/${slug}`;
}

export function confirmationWhy(signals: MatchSignals): string {
  const bits: string[] = [];
  if (signals.school_match) bits.push("the school");
  if (signals.matched_company) bits.push(signals.matched_company);
  if (signals.matched_role) bits.push(`the role ${signals.matched_role}`);
  return `the result names the person and ${bits.join(" and ")}`;
}

function linkedInSlug(url: string): string {
  const normalized = normalizeLinkedIn(url);
  if (!normalized) return "";
  return (normalized.split("/in/")[1] ?? "").toLowerCase();
}

function aliasInSlug(aliases: string[], slug: string): boolean {
  if (!slug) return false;
  const segments = new Set(slug.split(/[-_]/).filter(Boolean));
  const flat = slug.replace(/[-_]/g, "");
  for (const alias of aliases) {
    const compact = alias.toLowerCase().replace(/&/g, "").replace(/[^a-z0-9]/g, "");
    if (compact.length < 3) continue;
    if (segments.has(compact)) return true;
    if (compact.length >= 4 && flat.includes(compact)) return true;
    if (alias.toLowerCase() === "m&t" && /(?:^|[-_])m[-_]?t(?:$|[-_])/.test(slug)) return true;
  }
  return false;
}

function companyInSlug(company: string, slug: string): boolean {
  const compact = company.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (compact.length < 4 || !slug) return false;
  return slug.replace(/[-_]/g, "").includes(compact);
}

function profileText(candidate: CandidateInput): string {
  return `${candidate.title ?? ""}\n${candidate.snippet ?? ""}`.replace(/[’‘ʼ]/g, "'");
}

// School-specific tokens imply this campus. Generic "Student" / "Class of 202x"
// counts only together with a school match, so a student at another university
// does not outrank a bare mention of the right school.
function studentCorroboration(text: string, schoolMatch: boolean): boolean {
  const normalized = text.replace(/[’‘ʼ]/g, "'");
  if (/\bM\s*&\s*T\b/.test(normalized)) return true;
  if (/\bSEAS\b/.test(normalized)) return true;
  if (/\b[CW]'2\d\b/.test(normalized)) return true;
  if (!schoolMatch) return false;
  if (/\bstudents?\b/i.test(normalized)) return true;
  if (/\bundergrads?\b/i.test(normalized) || /\bundergraduate\b/i.test(normalized)) return true;
  if (/\bclass of 202\d\b/i.test(normalized)) return true;
  return false;
}

function seniorCareer(text: string): boolean {
  if (/\b(?:senior|managing|executive)\s+director\b/i.test(text)) return true;
  if (/\bdirector\b/i.test(text)) return true;
  if (/\bvice\s+president\b/i.test(text)) return true;
  if (/\b(?:svp|vp)\b/i.test(text)) return true;
  if (/\bpartner\b/i.test(text)) return true;
  if (/\bmba\s+alum/i.test(text)) return true;
  if (/\balum(?:ni|na|nus)?\b/i.test(text)) return true;
  return false;
}

function isEarlyFounder(person: { founderStatus?: string | null; enrollmentStatus?: string | null; roles: string[] }): boolean {
  if ((person.founderStatus ?? "").toLowerCase() === "potential") return true;
  const founder =
    (person.founderStatus ?? "").toLowerCase() === "founder" || person.roles.some((role) => role.toLowerCase() === "founder");
  const enrollment = (person.enrollmentStatus ?? "").toLowerCase();
  return founder && (enrollment === "current_student" || enrollment === "recent_grad");
}

function corroborationRank(companyMatch: boolean, studentMatch: boolean, schoolMatch: boolean, roleMatch: boolean): number {
  if (companyMatch) return 3;
  if (studentMatch) return 2;
  if (schoolMatch || roleMatch) return 1;
  return 0;
}

export function judgePerson(
  person: Pick<LookupPerson, "name" | "schools" | "companies" | "roles"> & {
    founderStatus?: string | null;
    enrollmentStatus?: string | null;
  },
  candidates: CandidateInput[]
): Judgment {
  const seen = new Set<string>();
  const judged: JudgedCandidate[] = [];
  for (const candidate of candidates) {
    const url = normalizeLinkedIn(candidate.url);
    if (!url || seen.has(url.toLowerCase())) continue;
    seen.add(url.toLowerCase());
    const title = candidate.title ?? "";
    const snippet = candidate.snippet ?? "";
    const text = `${title}\n${snippet}`;
    const slug = linkedInSlug(url);
    const nameMatch = nameIn(`${text}\n${slug.replace(/[-_]/g, " ")}`, person.name);
    const schoolMatch = person.schools.some(
      (school) => school.pattern.test(text) || aliasInSlug(school.aliases, slug)
    );
    let matchedCompany: string | null = null;
    for (const company of person.companies) {
      const needle = company.replace(/\s+/g, " ").trim();
      if (needle.length < 4) continue;
      if (text.toLowerCase().includes(needle.toLowerCase()) || companyInSlug(needle, slug)) {
        matchedCompany = company;
        break;
      }
    }
    let matchedRole: string | null = null;
    for (const role of person.roles) {
      const hit = rolePhrases(role).find((phrase) => phraseIn(text, phrase) || companyInSlug(phrase, slug));
      if (hit) {
        matchedRole = hit;
        break;
      }
    }
    const companyMatch = matchedCompany !== null;
    const roleMatch = matchedRole !== null;
    const studentMatch = nameMatch && studentCorroboration(text, schoolMatch);
    const bareSchoolOnly = schoolMatch && !companyMatch && !roleMatch && !studentMatch;
    const blockedSenior = nameMatch && bareSchoolOnly && isEarlyFounder(person) && seniorCareer(text);
    const corroborated = nameMatch && (schoolMatch || companyMatch || roleMatch || studentMatch) && !blockedSenior;
    const decision: MatchSignals["decision"] = corroborated ? "confirmed" : nameMatch ? "unverified" : "reject";
    judged.push({
      url,
      title,
      snippet,
      signals: {
        name_match: nameMatch,
        school_match: schoolMatch,
        company_match: companyMatch,
        role_match: roleMatch,
        matched_company: matchedCompany,
        matched_role: matchedRole,
        decision,
      },
    });
  }

  const strong = judged.filter((candidate) => candidate.signals.decision === "confirmed");
  const ranks = strong.map((candidate) => {
    const text = profileText(candidate);
    const studentMatch = studentCorroboration(text, candidate.signals.school_match);
    return corroborationRank(candidate.signals.company_match, studentMatch, candidate.signals.school_match, candidate.signals.role_match);
  });
  const best = ranks.length > 0 ? Math.max(...ranks) : 0;
  const winners = strong.filter((_, index) => ranks[index] === best);
  if (winners.length === 1) {
    const others = strong.length - 1;
    return {
      candidates: judged,
      confirmed: winners,
      unverified: [],
      outcome: "confirmed",
      reason:
        others > 0
          ? `${confirmationWhy(winners[0].signals)}; it outranked the other matches`
          : confirmationWhy(winners[0].signals),
    };
  }
  if (strong.length > 1) {
    return {
      candidates: judged,
      confirmed: [],
      unverified: strong,
      outcome: "unverified",
      reason: "more than one profile matched at the same strength",
    };
  }
  const seniorBlocked = judged.some((candidate) => {
    if (!candidate.signals.name_match || !candidate.signals.school_match) return false;
    if (candidate.signals.company_match || candidate.signals.role_match) return false;
    if (studentCorroboration(profileText(candidate), true)) return false;
    return isEarlyFounder(person) && seniorCareer(profileText(candidate));
  });
  if (seniorBlocked) {
    const nameHits = judged.filter((candidate) => candidate.signals.decision === "unverified").slice(0, MAX_UNVERIFIED);
    return {
      candidates: judged,
      confirmed: [],
      unverified: nameHits,
      outcome: "unverified",
      reason: "bare school match on a senior-career profile; left unverified",
    };
  }
  const nameOnly = judged.filter((candidate) => candidate.signals.decision === "unverified").slice(0, MAX_UNVERIFIED);
  if (nameOnly.length > 0) {
    return {
      candidates: judged,
      confirmed: [],
      unverified: nameOnly,
      outcome: "unverified",
      reason: "name matched; school, company, and role did not",
    };
  }
  return {
    candidates: judged,
    confirmed: [],
    unverified: [],
    outcome: "blank",
    reason: judged.length === 0 ? "no linkedin.com/in result" : "name did not match",
  };
}

export function buildResultLine(person: LookupPerson, query: string, organic: CandidateInput[], searchedAt: string): LookupResultLine {
  const judgment = judgePerson(person, organic);
  return {
    person_id: person.id,
    name: person.name,
    campus_id: person.campusId,
    school: person.school,
    companies: person.companies,
    roles: person.roles,
    evidence: person.evidence,
    existing_unverified: person.existingUnverified,
    query,
    candidates: judgment.candidates,
    outcome: judgment.outcome,
    outcome_reason: judgment.reason,
    actor: ACTOR_ID,
    searched_at: searchedAt,
  };
}

export function parseDoneIds(text: string): Set<string> {
  const ids = new Set<string>();
  for (const line of text.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const row = JSON.parse(trimmed) as { person_id?: unknown };
      if (typeof row.person_id === "string" && row.person_id) ids.add(row.person_id);
    } catch {
      // a torn final line should not block the rest of the file
    }
  }
  return ids;
}

export function readDoneIds(filePath: string): Set<string> {
  if (!fs.existsSync(filePath)) return new Set();
  return parseDoneIds(fs.readFileSync(filePath, "utf8"));
}

interface AffiliationRow {
  person_id: string;
  university_id: string;
  name: string;
  aliases_json: string;
}

interface RoleRow {
  person_id: string;
  name: string;
  kind: string;
  role: string | null;
}

interface EvidenceRow {
  entity_id: string;
  excerpt: string;
  retrieved_at: string;
}

interface CandidateRow {
  entity_id: string;
  value_json: string;
}

function campusRank(universityId: string): number {
  if (universityId === "univ_penn") return 0;
  if (universityId === "univ_berkeley") return 1;
  return 2;
}

function founderRank(person: Pick<LookupPerson, "founderStatus" | "roles">): number {
  if (person.founderStatus === "founder" || person.roles.some((role) => role.toLowerCase() === "founder")) return 0;
  if (person.founderStatus === "potential") return 1;
  return 2;
}

function parseAliases(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function clipEvidence(excerpt: string): string {
  return excerpt.replace(/\s+/g, " ").trim().slice(0, 240);
}

function assemble(
  rows: { id: string; name: string; confirmed: boolean; founderStatus: string | null; enrollmentStatus: string | null }[],
  affiliations: AffiliationRow[],
  roles: RoleRow[],
  evidence: EvidenceRow[],
  unverified: CandidateRow[],
  preferredCampusId: string | null
): LookupPerson[] {
  const schoolsByPerson = new Map<string, SchoolRef[]>();
  for (const row of affiliations) {
    const list = schoolsByPerson.get(row.person_id) ?? [];
    if (list.some((school) => school.universityId === row.university_id)) {
      schoolsByPerson.set(row.person_id, list);
      continue;
    }
    const aliases = campusSearchAliases(row.university_id, row.name, parseAliases(row.aliases_json));
    list.push({
      universityId: row.university_id,
      name: row.name,
      aliases,
      pattern: patternFromAliases(aliases),
    });
    schoolsByPerson.set(row.person_id, list);
  }
  for (const list of schoolsByPerson.values()) {
    list.sort((a, b) => campusRank(a.universityId) - campusRank(b.universityId) || a.universityId.localeCompare(b.universityId));
  }

  const companiesByPerson = new Map<string, string[]>();
  const rolesByPerson = new Map<string, string[]>();
  for (const row of roles) {
    const role = (row.role ?? "").trim();
    if (role) {
      const list = rolesByPerson.get(row.person_id) ?? [];
      if (!list.some((item) => item.toLowerCase() === role.toLowerCase())) list.push(role);
      rolesByPerson.set(row.person_id, list);
    }
    if (row.kind === "company" || role.toLowerCase() === "founder") {
      const list = companiesByPerson.get(row.person_id) ?? [];
      const name = row.name.trim();
      if (name && !list.some((item) => item.toLowerCase() === name.toLowerCase())) {
        if (role.toLowerCase() === "founder") list.unshift(name);
        else list.push(name);
      }
      companiesByPerson.set(row.person_id, list);
    }
  }

  const evidenceByPerson = new Map<string, string[]>();
  for (const row of evidence) {
    const list = evidenceByPerson.get(row.entity_id) ?? [];
    if (list.length >= 3) continue;
    const clipped = clipEvidence(row.excerpt ?? "");
    if (!clipped) continue;
    list.push(clipped);
    evidenceByPerson.set(row.entity_id, list);
  }

  const unverifiedByPerson = new Map<string, string[]>();
  for (const row of unverified) {
    try {
      const value = JSON.parse(row.value_json) as { linkedin?: unknown };
      if (typeof value.linkedin !== "string" || !value.linkedin.includes("linkedin.com/in/")) continue;
      const list = unverifiedByPerson.get(row.entity_id) ?? [];
      list.push(value.linkedin);
      unverifiedByPerson.set(row.entity_id, list);
    } catch {
      // skip a malformed claim
    }
  }

  const people: LookupPerson[] = [];
  for (const row of rows) {
    const schools = schoolsByPerson.get(row.id) ?? [];
    const preferred = preferredCampusId ? schools.find((school) => school.universityId === preferredCampusId) : undefined;
    const primary = preferred ?? schools[0];
    people.push({
      id: row.id,
      name: row.name,
      campusId: primary?.universityId ?? "",
      school: primary?.name ?? "",
      schools,
      companies: companiesByPerson.get(row.id) ?? [],
      roles: rolesByPerson.get(row.id) ?? [],
      evidence: evidenceByPerson.get(row.id) ?? [],
      existingUnverified: unverifiedByPerson.get(row.id) ?? [],
      confirmedLinkedIn: row.confirmed,
      founderStatus: row.founderStatus,
      enrollmentStatus: row.enrollmentStatus,
    });
  }
  people.sort(
    (a, b) =>
      campusRank(a.campusId) - campusRank(b.campusId) ||
      a.campusId.localeCompare(b.campusId) ||
      founderRank(a) - founderRank(b) ||
      a.name.localeCompare(b.name)
  );
  return people;
}

const PEOPLE_SQL = `SELECT pe.id as id, pe.name as name, pe.founder_status as founder_status,
            pe.enrollment_status as enrollment_status,
            CASE WHEN pe.aliases_json LIKE '%linkedin.com/in/%' THEN 1 ELSE 0 END as confirmed
     FROM people pe`;

export function loadQueue(db: Database.Database, campusId: string | null): LookupPerson[] {
  const params: string[] = [];
  let sql = `${PEOPLE_SQL} WHERE pe.aliases_json NOT LIKE '%linkedin.com/in/%'`;
  if (campusId) {
    sql += ` AND EXISTS (SELECT 1 FROM affiliations a WHERE a.person_id = pe.id AND a.university_id = ?)`;
    params.push(campusId);
  }
  const rows = db.prepare(sql).all(...params) as {
    id: string;
    name: string;
    confirmed: number;
    founder_status: string | null;
    enrollment_status: string | null;
  }[];
  return hydrate(
    db,
    rows.map((row) => ({
      id: row.id,
      name: row.name,
      confirmed: row.confirmed === 1,
      founderStatus: row.founder_status,
      enrollmentStatus: row.enrollment_status,
    })),
    campusId
  );
}

export function loadPerson(db: Database.Database, personId: string): LookupPerson | null {
  const row = db.prepare(`${PEOPLE_SQL} WHERE pe.id = ?`).get(personId) as
    | { id: string; name: string; confirmed: number; founder_status: string | null; enrollment_status: string | null }
    | undefined;
  if (!row) return null;
  return (
    hydrate(
      db,
      [
        {
          id: row.id,
          name: row.name,
          confirmed: row.confirmed === 1,
          founderStatus: row.founder_status,
          enrollmentStatus: row.enrollment_status,
        },
      ],
      null
    )[0] ?? null
  );
}

function queryChunks<T>(db: Database.Database, sql: (placeholders: string) => string, ids: string[]): T[] {
  const out: T[] = [];
  for (let index = 0; index < ids.length; index += 400) {
    const group = ids.slice(index, index + 400);
    const placeholders = group.map(() => "?").join(", ");
    out.push(...(db.prepare(sql(placeholders)).all(...group) as T[]));
  }
  return out;
}

function hydrate(
  db: Database.Database,
  rows: { id: string; name: string; confirmed: boolean; founderStatus: string | null; enrollmentStatus: string | null }[],
  preferredCampusId: string | null
): LookupPerson[] {
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);
  const affiliations = queryChunks<AffiliationRow>(
    db,
    (placeholders) =>
      `SELECT a.person_id as person_id, a.university_id as university_id, u.name as name, u.aliases_json as aliases_json
       FROM affiliations a JOIN universities u ON u.id = a.university_id
       WHERE a.person_id IN (${placeholders})`,
    ids
  );
  const roleRows = queryChunks<RoleRow>(
    db,
    (placeholders) =>
      `SELECT ppr.person_id as person_id, p.name as name, p.kind as kind, ppr.role as role
       FROM person_project_roles ppr JOIN projects p ON p.id = ppr.project_id
       WHERE ppr.person_id IN (${placeholders})`,
    ids
  );
  const evidence = queryChunks<EvidenceRow>(
    db,
    (placeholders) =>
      `SELECT entity_id, excerpt, retrieved_at FROM claims
       WHERE entity_type = 'person'
         AND entity_id IN (${placeholders})
         AND claim_type NOT IN ('linkedin_candidate', 'linkedin_search_attempt', 'linkedin_web_search_attempt', 'linkedin_alias_discovered')
       ORDER BY retrieved_at DESC`,
    ids
  );
  evidence.sort((a, b) => (b.retrieved_at ?? "").localeCompare(a.retrieved_at ?? ""));
  const unverified = queryChunks<CandidateRow>(
    db,
    (placeholders) =>
      `SELECT entity_id, value_json FROM claims
       WHERE entity_type = 'person' AND claim_type = 'linkedin_candidate' AND verification_state = 'unverified'
         AND entity_id IN (${placeholders})`,
    ids
  );
  return assemble(rows, affiliations, roleRows, evidence, unverified, preferredCampusId);
}

export function linkedInCounts(db: Database.Database): { confirmed: number; unverifiedOnly: number } {
  const confirmed = (
    db.prepare(`SELECT COUNT(*) as c FROM people WHERE aliases_json LIKE '%linkedin.com/in/%'`).get() as { c: number }
  ).c;
  const unverifiedOnly = (
    db
      .prepare(
        `SELECT COUNT(DISTINCT entity_id) as c FROM claims
         WHERE entity_type = 'person' AND claim_type = 'linkedin_candidate' AND verification_state = 'unverified'
           AND entity_id NOT IN (SELECT id FROM people WHERE aliases_json LIKE '%linkedin.com/in/%')`
      )
      .get() as { c: number }
  ).c;
  return { confirmed, unverifiedOnly };
}
