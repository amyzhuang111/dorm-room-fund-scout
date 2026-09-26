// Input and output adapters for the LinkedIn profile-details actors the
// verify script can call. Each adapter builds that actor's input and turns
// its dataset items into the harvestapi-shaped records assignProfiles
// already matches on (school name, end year, headline, full name).
//
// Default, checked 2026-09-26:
//   apimaestro/linkedin-profile-batch-scraper-no-cookies-required
//   https://apify.com/apimaestro/linkedin-profile-batch-scraper-no-cookies-required
//   Profile Details Batch Scraper. No cookies. `usernames` takes profile
//   URLs. The README Limitations section states only "Maximum 1000 profiles
//   per batch" — it does not add a free-plan, upgrade, or paid-plan gate,
//   and the API examples run it with an Apify token. Actor API notice is
//   NONE. Pay-per-event card started 2026-01-21: primary event
//   apify-default-dataset-item, title "profile", eventPriceUsd 0.005.
//   Store headline: $5.00 / 1,000 profiles. Platform usage is not charged.
//   No actor-start event on that card. includeEmail is left false.
//
// Not the default:
//   dev_fusion/Linkedin-Profile-Scraper — $10.00 / 1,000. README "Free Plan
//     Users": "Execution Method: UI only (cannot run via API or CLI)".
//   anchor/linkedin-profile-enrichment — from $6.00 / 1,000, and the FAQ
//     limits a free plan to 10 runs per month and 5 URLs per crawl. The
//     pricing model also charges platform usage.
//   supreme_coder/linkedin-profile-scraper — $5.00 / 1,000 profiles
//     (pricingInfos profile event 0.005, started 2026-08-24) plus a
//     $0.00005 actor start. No cookies, accepts profile URLs, and the
//     README never says free plans are blocked. It also never says they
//     are allowed, so it was not the one with an explicit limitations list.
//   harvestapi/linkedin-profile-scraper — $4.00 / 1,000, no cookies. A
//     free-plan run can finish SUCCEEDED with zero items. Observed log:
//     "Free users are limited to 50 runs. Please upgrade to a paid plan to
//     run more." Status message: "free user run limit exceeded". Kept as
//     --actor harvestapi/linkedin-profile-scraper for paid plans.
//   apimaestro/linkedin-profile-detail — same author and $5.00 / 1,000, no
//     cookies, one profile URL per run, no free-plan section in the README.
//     Available with --actor. The batch actor is the default because one
//     run takes the URL list.

import { normalizeLinkedIn } from "./linkedin-match";

export const DEFAULT_ACTOR_ID = "apimaestro/linkedin-profile-batch-scraper-no-cookies-required";
export const HARVESTAPI_ACTOR_ID = "harvestapi/linkedin-profile-scraper";
export const APIMAESTRO_DETAIL_ACTOR_ID = "apimaestro/linkedin-profile-detail";

export const PROFILE_MODE = "Profile details no email ($4 per 1k)";

export interface LinkedInActor {
  id: string;
  page: string;
  /** Published price for one profile-details result, email search left off. */
  usdPerProfile: number;
  pricePerThousandLabel: string;
  /** Checked date for the price note below. */
  priceCheckedOn: string;
  priceNote: string;
  batchSize: number;
  buildInput: (urls: string[]) => Record<string, unknown>;
}

const APIMAESTRO_PRICE_NOTE = [
  "Price checked 2026-09-26.",
  "Pay-per-event card started 2026-01-21: $5.00 / 1,000 profiles (eventPriceUsd 0.005).",
  "No actor-start fee. Platform usage is not charged. Email search is off.",
  "README limitations: 1,000 profiles per batch. No free-plan block is published.",
].join(" ");

export const LINKEDIN_ACTORS: LinkedInActor[] = [
  {
    id: DEFAULT_ACTOR_ID,
    page: `https://apify.com/${DEFAULT_ACTOR_ID}`,
    usdPerProfile: 0.005,
    pricePerThousandLabel: "$5.00 / 1,000 profiles",
    priceCheckedOn: "2026-09-26",
    priceNote: APIMAESTRO_PRICE_NOTE,
    batchSize: 40,
    buildInput: (urls) => ({ usernames: urls, includeEmail: false }),
  },
  {
    id: APIMAESTRO_DETAIL_ACTOR_ID,
    page: `https://apify.com/${APIMAESTRO_DETAIL_ACTOR_ID}`,
    usdPerProfile: 0.005,
    pricePerThousandLabel: "$5.00 / 1,000 profile details",
    priceCheckedOn: "2026-09-26",
    priceNote: [
      "Price checked 2026-09-26.",
      "Pay-per-event card started 2026-06-09: $5.00 / 1,000 profile details (eventPriceUsd 0.005).",
      "No actor-start fee. Platform usage is not charged. Email search is off.",
      "One profile URL per run. The README does not publish a free-plan block.",
    ].join(" "),
    batchSize: 1,
    buildInput: (urls) => ({ username: urls[0] ?? "", includeEmail: false }),
  },
  {
    id: HARVESTAPI_ACTOR_ID,
    page: `https://apify.com/${HARVESTAPI_ACTOR_ID}`,
    usdPerProfile: 0.004,
    pricePerThousandLabel: "$4.00 / 1,000 profiles",
    priceCheckedOn: "2026-09-26",
    priceNote: [
      "Price checked 2026-09-26 (pay-per-event card started 2025-07-04).",
      "$4.00 / 1,000 profile details. No actor-start fee. Platform usage is not charged. Email search is off.",
      "Free plans can hit a 50-run cap and still finish SUCCEEDED with zero items. Use this actor on a paid plan.",
    ].join(" "),
    batchSize: 40,
    buildInput: (urls) => ({ profileScraperMode: PROFILE_MODE, queries: urls }),
  },
];

export function resolveActor(id?: string | null): LinkedInActor {
  const raw = (id ?? "").trim();
  if (!raw) return LINKEDIN_ACTORS[0];
  const normalized = raw.replaceAll("~", "/");
  const found = LINKEDIN_ACTORS.find((actor) => actor.id === normalized);
  if (!found) {
    throw new Error(`Unknown actor "${raw}". Choices: ${LINKEDIN_ACTORS.map((actor) => actor.id).join(", ")}.`);
  }
  return found;
}

export function actorInput(urls: string[], actorId?: string): Record<string, unknown> {
  return resolveActor(actorId).buildInput(urls);
}

/** statusMessage or log text that means the run did not really return profiles. */
export function mentionsPlanLimit(text: string): boolean {
  return /\blimits?\b|\blimited\b|\bupgrade\b|\bpaid plan\b/i.test(text);
}

export interface ActorDataset {
  items: unknown[];
  statusMessage?: string | null;
  log?: string | null;
}

export class ActorBatchError extends Error {
  readonly planLimit: boolean;

  constructor(message: string, planLimit: boolean) {
    super(message);
    this.name = "ActorBatchError";
    this.planLimit = planLimit;
  }
}

export function explainUnusableRun(input: ActorDataset): { message: string; planLimit: boolean } | null {
  const statusMessage = (input.statusMessage ?? "").trim();
  const log = input.log ?? "";
  const planLimit = mentionsPlanLimit(`${statusMessage}\n${log}`);
  if (!planLimit && input.items.length > 0) return null;
  const lines = [
    planLimit
      ? "This batch failed because the actor status message or log mentions a limit, an upgrade, or a paid plan."
      : "This batch failed because the actor returned zero items.",
    "Nothing from this batch was written, so a re-run will retry these people.",
    `Status message: ${statusMessage || "(none)"}`,
  ];
  const matched = log
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && mentionsPlanLimit(line));
  for (const line of matched.slice(0, 6)) lines.push(`Log: ${line}`);
  return { message: lines.join("\n"), planLimit };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function firstString(rec: Record<string, unknown> | null, keys: string[]): string {
  if (!rec) return "";
  for (const key of keys) {
    const value = rec[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function slugFromKey(key: string): string {
  const trimmed = key.trim();
  if (!trimmed) return "";
  const asUrl = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : trimmed.includes("linkedin.com/in/")
      ? `https://${trimmed.replace(/^\/\//, "")}`
      : "";
  if (asUrl) {
    const normalized = normalizeLinkedIn(asUrl);
    return normalized ? (normalized.split("/in/")[1] ?? "").toLowerCase() : "";
  }
  return trimmed.replace(/^@/, "").split(/[/?#]/)[0]?.toLowerCase() ?? "";
}

function endFromPeriod(period: string): unknown {
  if (/present|current/i.test(period)) return { text: "Present" };
  const years = [...period.matchAll(/\b(?:19|20)\d{2}\b/g)].map((match) => Number(match[0]));
  if (years.length === 0) return { text: period };
  return { year: years[years.length - 1], text: period };
}

function mapEducation(raw: unknown): { schoolName: string; startDate?: unknown; endDate?: unknown; period?: string }[] {
  if (!Array.isArray(raw)) return [];
  const out: { schoolName: string; startDate?: unknown; endDate?: unknown; period?: string }[] = [];
  for (const item of raw) {
    const rec = asRecord(item);
    if (!rec) continue;
    const schoolName = firstString(rec, ["schoolName", "school_name", "school", "title", "institution", "university"]);
    if (!schoolName) continue;
    const period = firstString(rec, ["period", "duration", "caption", "date_range", "dateRange", "dates"]) || undefined;
    const startDate = rec.startDate ?? rec.start_date ?? rec.start;
    let endDate = rec.endDate ?? rec.end_date ?? rec.end;
    if (endDate == null && period) endDate = endFromPeriod(period);
    out.push({
      schoolName,
      startDate: startDate ?? undefined,
      endDate: endDate ?? undefined,
      period,
    });
  }
  return out;
}

function mapName(rec: Record<string, unknown>, basic: Record<string, unknown> | null): { firstName: string | null; lastName: string | null } {
  const first = firstString(basic, ["first_name", "firstName"]) || firstString(rec, ["first_name", "firstName"]);
  const last = firstString(basic, ["last_name", "lastName"]) || firstString(rec, ["last_name", "lastName"]);
  if (first && last) return { firstName: first, lastName: last };
  const full =
    firstString(basic, ["fullname", "full_name", "fullName", "name"]) ||
    firstString(rec, ["fullname", "full_name", "fullName", "name"]);
  if (!full) return { firstName: first || null, lastName: last || null };
  const parts = full.split(/\s+/).filter(Boolean);
  return { firstName: parts[0] ?? null, lastName: parts.slice(1).join(" ") || null };
}

function isApimaestroProfile(rec: Record<string, unknown>): boolean {
  if (asRecord(rec.basic_info) || asRecord(rec.basicInfo)) return true;
  if (!Array.isArray(rec.education)) return false;
  return rec.education.some((entry) => {
    const row = asRecord(entry);
    if (!row || typeof row.schoolName === "string") return false;
    return typeof row.school === "string" || typeof row.school_name === "string";
  });
}

function isEnvelope(rec: Record<string, unknown>): boolean {
  if (asRecord(rec.results)) return true;
  return Array.isArray(rec.failedUsernames);
}

function notFoundItem(key: string): Record<string, unknown> {
  const slug = slugFromKey(key);
  const linkedinUrl = normalizeLinkedIn(key) ?? (slug ? `https://www.linkedin.com/in/${slug}` : null);
  return {
    status: 404,
    query: { publicIdentifier: slug },
    publicIdentifier: slug,
    linkedinUrl,
  };
}

function toHarvest(rec: Record<string, unknown>, key: string): Record<string, unknown> {
  const basic = asRecord(rec.basic_info) ?? asRecord(rec.basicInfo);
  const name = mapName(rec, basic);
  const ownSlug =
    slugFromKey(firstString(basic, ["public_identifier", "publicIdentifier", "profile_url", "profileUrl", "linkedinUrl"])) ||
    slugFromKey(firstString(rec, ["public_identifier", "publicIdentifier", "profile_url", "profileUrl", "linkedinUrl"]));
  const requested = slugFromKey(key);
  const slug = requested || ownSlug;
  const linkedinUrl =
    normalizeLinkedIn(firstString(basic, ["profile_url", "profileUrl", "linkedinUrl"])) ||
    normalizeLinkedIn(firstString(rec, ["profile_url", "profileUrl", "linkedinUrl"])) ||
    (slug ? `https://www.linkedin.com/in/${slug}` : null);
  const education = mapEducation(rec.education ?? basic?.education);
  return {
    status: 200,
    query: { publicIdentifier: slug },
    publicIdentifier: ownSlug || slug,
    linkedinUrl,
    firstName: name.firstName,
    lastName: name.lastName,
    headline: firstString(basic, ["headline"]) || firstString(rec, ["headline"]) || null,
    education,
  };
}

function expandEnvelope(rec: Record<string, unknown>): unknown[] {
  const out: unknown[] = [];
  const results = asRecord(rec.results) ?? {};
  for (const [key, value] of Object.entries(results)) {
    const profile = asRecord(value);
    if (!profile || isExplicitMiss(profile)) {
      out.push(notFoundItem(key));
      continue;
    }
    out.push(toHarvest(profile, key));
  }
  if (Array.isArray(rec.failedUsernames)) {
    for (const entry of rec.failedUsernames) {
      if (typeof entry === "string" && entry.trim()) out.push(notFoundItem(entry));
      else {
        const row = asRecord(entry);
        const key = firstString(row, ["url", "username", "publicIdentifier", "public_identifier"]);
        if (key) out.push(notFoundItem(key));
      }
    }
  }
  return out;
}

function isExplicitMiss(rec: Record<string, unknown>): boolean {
  if (typeof rec.status === "number" && rec.status !== 200) return true;
  if (rec.status === "not_found" || rec.status === "NOT_FOUND") return true;
  const error = firstString(rec, ["error", "message", "errorMessage"]);
  if (!error) return false;
  return /not found|404|no profile|does not exist|could not find|couldn't find/i.test(error);
}

/**
 * Turn one actor's dataset items into records assignProfiles understands.
 * harvestapi items already have that shape and pass through. An explicit
 * not-found URL becomes a status 404 item. Requested URLs that the actor
 * never mentioned stay absent, so they are retried instead of rejected.
 */
export function normalizeActorItems(items: unknown[], requestedUrls: string[] = []): unknown[] {
  const out: unknown[] = [];
  for (const item of items) {
    const rec = asRecord(item);
    if (!rec) continue;
    if (isEnvelope(rec)) {
      out.push(...expandEnvelope(rec));
      continue;
    }
    if (isApimaestroProfile(rec)) {
      const key = requestedUrls.length === 1 ? requestedUrls[0] : "";
      out.push(toHarvest(rec, key));
      continue;
    }
    out.push(item);
  }
  return out;
}
