// User-added startups, founders, and pipeline membership.
// The bundled SQLite file is read-only on Vercel, so this state lives in a
// hosted store (see lib/user-pipeline/store.ts) or in the browser.

import type { EnrollmentStatus } from "./founder-status";
import { ENROLLMENT_AS_OF_YEAR } from "./founder-status";
import { domainKey } from "./feedback";
import { matchCandidate } from "./candidate-filter";
import { matchesEnrollment, selectedEnrollment } from "./founder-status";
import { isSignalTier } from "./signal-tier";
import type { Queue } from "./queue";
import type { CandidateSummary, FounderRow, NamedFounder, UniversitySummary } from "./queries";
import { sameSchoolCofounderHits, scoreBonus, SAME_SCHOOL_FOUNDER_POINTS, SAME_SCHOOL_STARTUP_POINTS } from "./same-school";
import type { NetworkEdge, NetworkGraph, NetworkNode } from "./network";
import { undergradEnrollment } from "./campus-enrollment";
import { connectionSignal, perCapitaSignal, signalFields } from "./network-signal-size";
import { namedPersonPath } from "./person-href";

export const PIPELINE_STAGES = ["Sourced", "Contacted", "Meeting", "Diligence", "Passed", "Invested"] as const;
export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export const SOURCE_CHANNELS = [
  { id: "alum_referral", label: "Alum referral" },
  { id: "relationship", label: "Relationship" },
  { id: "open_application", label: "Open application" },
  { id: "event", label: "Event" },
  { id: "outbound", label: "Outbound" },
  { id: "other", label: "Other" },
] as const;
export type SourceChannel = (typeof SOURCE_CHANNELS)[number]["id"];

export function sourceChannel(value: unknown): SourceChannel | null {
  return typeof value === "string" && SOURCE_CHANNELS.some((channel) => channel.id === value) ? (value as SourceChannel) : null;
}

export function referrerText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/\s+/g, " ").trim();
  if (!text) return null;
  return text.slice(0, 120);
}

export interface UserFounder {
  id: string;
  name: string;
  linkedinUrl: string | null;
  classYear: string | null;
  role: string | null;
}

export interface UserCampus {
  id: string;
  name: string;
  createdAt: string;
}

export interface UserStartup {
  id: string;
  name: string;
  websiteUrl: string | null;
  campusId: string;
  campusName: string;
  founders: UserFounder[];
  fundingStage: string | null;
  description: string;
  verificationUrl: string;
  verificationNotes: string;
  stage: PipelineStage;
  sourcedVia: SourceChannel | null;
  referrer: string | null;
  createdAt: string;
  updatedAt: string;
}

/** An existing catalog person or startup starred into the pipeline. */
export interface PipelineLink {
  id: string;
  entityType: "project" | "person";
  entityId: string;
  name: string;
  campusName: string | null;
  websiteUrl: string | null;
  stage: PipelineStage;
  verificationUrl: string | null;
  verificationNotes: string | null;
  sourcedVia: SourceChannel | null;
  referrer: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UserPipelineState {
  version: 1;
  startups: UserStartup[];
  campuses: UserCampus[];
  links: PipelineLink[];
}

export const EMPTY_PIPELINE: UserPipelineState = { version: 1, startups: [], campuses: [], links: [] };

export interface StartupDraft {
  name: string;
  websiteUrl: string;
  campusId: string | null;
  campusName: string;
  campusIsNew: boolean;
  founders: { id?: string; name: string; linkedinUrl: string; classYear: string; role: string }[];
  fundingStage: string;
  description: string;
  verificationUrl: string;
  verificationNotes: string;
  stage: PipelineStage;
  sourcedVia: SourceChannel | null;
  referrer: string | null;
}

export interface ValidStartup {
  name: string;
  websiteUrl: string | null;
  campusId: string | null;
  campusName: string;
  campusIsNew: boolean;
  founders: { id?: string; name: string; linkedinUrl: string | null; classYear: string | null; role: string | null }[];
  fundingStage: string | null;
  description: string;
  verificationUrl: string;
  verificationNotes: string;
  stage: PipelineStage;
  sourcedVia: SourceChannel | null;
  referrer: string | null;
}

export interface DuplicateHit {
  id: string;
  kind: "startup" | "founder";
  name: string;
  campusName: string | null;
  websiteUrl: string | null;
  href: string;
  reason: string;
}

export interface CatalogRecord {
  id: string;
  kind: "startup" | "founder";
  name: string;
  campusName: string | null;
  websiteUrl: string | null;
  href: string;
}

const LEGAL = new Set(["incorporated", "inc", "llc", "ltd", "limited", "corp", "corporation", "co", "company", "plc", "gmbh", "pbc", "llp", "the"]);
const GENERIC_HOSTS = new Set([
  "github.com",
  "linkedin.com",
  "twitter.com",
  "x.com",
  "facebook.com",
  "instagram.com",
  "youtube.com",
  "youtu.be",
  "medium.com",
  "substack.com",
  "notion.site",
  "notion.so",
  "docs.google.com",
  "drive.google.com",
  "sites.google.com",
  "linktr.ee",
  "t.me",
  "discord.gg",
  "devpost.com",
]);

export function isUserStartupId(id: string): boolean {
  return id.startsWith("user_");
}

export function isUserFounderId(id: string): boolean {
  return id.startsWith("ufounder_");
}

export function isUserCampusId(id: string): boolean {
  return id.startsWith("ucampus_");
}

export function isUserAddedId(id: string): boolean {
  return isUserStartupId(id) || isUserFounderId(id) || isUserCampusId(id);
}

export function newUserId(prefix: "user" | "ufounder" | "ucampus" | "plink"): string {
  const raw = globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  return `${prefix}_${raw}`;
}

export function parseHttpUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 500) return null;
  const withProto = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withProto);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (!url.hostname || url.hostname === ".") return null;
  if (!url.hostname.includes(".") && url.hostname !== "localhost") return null;
  return url.toString();
}

export function classYearNumber(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const text = raw.trim();
  const four = text.match(/\b(19|20)\d{2}\b/);
  if (four) {
    const year = Number(four[0]);
    if (year >= 1990 && year <= 2035) return year;
  }
  const two = text.match(/'(\d{2})\b/);
  if (two) {
    const n = Number(two[1]);
    const year = n >= 90 ? 1900 + n : 2000 + n;
    if (year >= 1990 && year <= 2035) return year;
  }
  return null;
}

export function enrollmentFromClassYear(raw: string | null | undefined): { status: EnrollmentStatus; label: string | null } {
  const year = classYearNumber(raw);
  if (year == null) return { status: "unknown", label: null };
  const label = `'${String(year).slice(2)}`;
  if (year > ENROLLMENT_AS_OF_YEAR) return { status: "current_student", label };
  if (year >= ENROLLMENT_AS_OF_YEAR - 3) return { status: "recent_grad", label };
  return { status: "older_alumni", label };
}

export function normalizeMatchName(name: string): string {
  const tokens = name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const stripped = tokens.filter((token) => !LEGAL.has(token));
  return (stripped.length ? stripped : tokens).join(" ");
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    let prev = i - 1;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = row[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + cost);
      prev = temp;
    }
  }
  return row[b.length];
}

function namesClose(a: string, b: string): "exact" | "similar" | null {
  if (!a || !b || a.length < 3 || b.length < 3) return null;
  if (a === b) return "exact";
  if (a.length >= 5 && b.length >= 5) {
    const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
    if (` ${longer} `.includes(` ${shorter} `)) return "similar";
  }
  const dist = levenshtein(a, b);
  const max = Math.max(a.length, b.length);
  if (max >= 5 && dist <= 2 && dist / max <= 0.34) return "similar";
  return null;
}

function comparableHost(url: string | null | undefined): string | null {
  const host = domainKey(url) ?? hostFromLoose(url);
  if (!host || GENERIC_HOSTS.has(host)) return null;
  return host;
}

function hostFromLoose(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const withProto = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    return new URL(withProto).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

export function findDuplicates(
  query: { name: string; websiteUrl: string | null; founderNames: string[] },
  records: CatalogRecord[],
  ignoreIds: string[] = []
): DuplicateHit[] {
  const skip = new Set(ignoreIds);
  const startupName = normalizeMatchName(query.name);
  const host = comparableHost(query.websiteUrl);
  const founderNames = query.founderNames.map(normalizeMatchName).filter((name) => name.length >= 3);
  const hits: DuplicateHit[] = [];
  const seen = new Set<string>();

  for (const record of records) {
    if (skip.has(record.id) || seen.has(record.id)) continue;
    const reasons: string[] = [];
    if (record.kind === "startup") {
      const closeness = namesClose(startupName, normalizeMatchName(record.name));
      if (closeness === "exact") reasons.push("Same startup name");
      else if (closeness === "similar") reasons.push("Similar startup name");
      const recordHost = comparableHost(record.websiteUrl);
      if (host && recordHost && host === recordHost) reasons.push("Same website domain");
    } else {
      for (const founder of founderNames) {
        const closeness = namesClose(founder, normalizeMatchName(record.name));
        if (closeness === "exact") reasons.push("Same founder name");
        else if (closeness === "similar") reasons.push("Similar founder name");
        if (closeness) break;
      }
    }
    if (reasons.length === 0) continue;
    seen.add(record.id);
    hits.push({ ...record, reason: reasons.join(" · ") });
  }

  const rank = (reason: string) => (reason.includes("domain") ? 0 : reason.startsWith("Same") ? 1 : 2);
  hits.sort((a, b) => rank(a.reason) - rank(b.reason) || a.name.localeCompare(b.name));
  return hits.slice(0, 8);
}

export function recordsFromState(state: UserPipelineState): CatalogRecord[] {
  const records: CatalogRecord[] = [];
  for (const startup of state.startups) {
    records.push({
      id: startup.id,
      kind: "startup",
      name: startup.name,
      campusName: startup.campusName,
      websiteUrl: startup.websiteUrl,
      href: `/startup/${startup.id}`,
    });
    for (const founder of startup.founders) {
      records.push({
        id: founder.id,
        kind: "founder",
        name: founder.name,
        campusName: startup.campusName,
        websiteUrl: founder.linkedinUrl,
        href: namedPersonPath(founder.id),
      });
    }
  }
  return records;
}

function isStage(value: unknown): value is PipelineStage {
  return typeof value === "string" && (PIPELINE_STAGES as readonly string[]).includes(value);
}

function isStartup(value: unknown): value is UserStartup {
  if (!value || typeof value !== "object") return false;
  const row = value as UserStartup;
  return typeof row.id === "string" && row.id.startsWith("user_") && typeof row.name === "string" && row.name.trim().length > 0 && typeof row.verificationUrl === "string" && !!parseHttpUrl(row.verificationUrl) && isStage(row.stage) && Array.isArray(row.founders);
}

function isCampus(value: unknown): value is UserCampus {
  if (!value || typeof value !== "object") return false;
  const row = value as UserCampus;
  return typeof row.id === "string" && row.id.startsWith("ucampus_") && typeof row.name === "string" && row.name.trim().length > 1;
}

function isLink(value: unknown): value is PipelineLink {
  if (!value || typeof value !== "object") return false;
  const row = value as PipelineLink;
  return typeof row.id === "string" && (row.entityType === "project" || row.entityType === "person") && typeof row.entityId === "string" && typeof row.name === "string" && isStage(row.stage);
}

function withSource<T extends { sourcedVia?: unknown; referrer?: unknown }>(row: T): T & { sourcedVia: SourceChannel | null; referrer: string | null } {
  return { ...row, sourcedVia: sourceChannel(row.sourcedVia), referrer: referrerText(row.referrer) };
}

export function parseState(input: unknown): UserPipelineState {
  if (!input || typeof input !== "object") return EMPTY_PIPELINE;
  const raw = input as Partial<UserPipelineState>;
  return {
    version: 1,
    campuses: (Array.isArray(raw.campuses) ? raw.campuses.filter(isCampus) : []).slice(0, 400),
    startups: (Array.isArray(raw.startups) ? raw.startups.filter(isStartup).map(withSource) : []).slice(0, 400),
    links: (Array.isArray(raw.links) ? raw.links.filter(isLink).map(withSource) : []).slice(0, 800),
  };
}

export function validateDraft(draft: StartupDraft): { ok: true; value: ValidStartup } | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const name = draft.name.trim().replace(/\s+/g, " ");
  if (name.length < 2) errors.name = "Enter the startup name.";
  else if (name.length > 160) errors.name = "Name is too long.";

  let websiteUrl: string | null = null;
  if (draft.websiteUrl.trim()) {
    websiteUrl = parseHttpUrl(draft.websiteUrl);
    if (!websiteUrl) errors.websiteUrl = "Enter a full website URL, like https://example.com.";
  }

  const campusName = draft.campusName.trim().replace(/\s+/g, " ");
  if (draft.campusIsNew) {
    if (campusName.length < 2) errors.campus = "Enter the university name.";
    else if (campusName.length > 160) errors.campus = "University name is too long.";
  } else if (!draft.campusId) {
    errors.campus = "Choose a campus, or add another university.";
  }

  const verificationUrl = parseHttpUrl(draft.verificationUrl);
  if (!verificationUrl) errors.verificationUrl = "A verification source URL is required.";

  const notes = draft.verificationNotes.trim();
  if (notes.length > 4000) errors.verificationNotes = "Notes are too long.";

  const description = draft.description.trim().replace(/\s+/g, " ");
  if (description.length > 280) errors.description = "Keep the description to one line (280 characters).";

  const funding = draft.fundingStage.trim();
  if (funding.length > 80) errors.fundingStage = "Funding note is too long.";

  if (!isStage(draft.stage)) errors.stage = "Choose a pipeline stage.";

  const founders: ValidStartup["founders"] = [];
  draft.founders.forEach((founder, index) => {
    const founderName = founder.name.trim().replace(/\s+/g, " ");
    const linkedinRaw = founder.linkedinUrl.trim();
    const yearRaw = founder.classYear.trim();
    const role = founder.role.trim();
    const blank = !founderName && !linkedinRaw && !yearRaw && !role;
    if (blank) return;
    if (founderName.length < 2) errors[`founder-${index}-name`] = "Enter this founder's name.";
    let linkedinUrl: string | null = null;
    if (linkedinRaw) {
      linkedinUrl = parseHttpUrl(linkedinRaw);
      if (!linkedinUrl) errors[`founder-${index}-linkedin`] = "Enter a full LinkedIn URL.";
    }
    if (yearRaw && classYearNumber(yearRaw) == null) errors[`founder-${index}-year`] = "Use a class year like 2027.";
    if (role.length > 80) errors[`founder-${index}-role`] = "Role is too long.";
    if (founderName.length >= 2) {
      founders.push({
        id: founder.id,
        name: founderName,
        linkedinUrl,
        classYear: yearRaw || null,
        role: role || null,
      });
    }
  });

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      name,
      websiteUrl,
      campusId: draft.campusIsNew ? null : draft.campusId,
      campusName,
      campusIsNew: draft.campusIsNew,
      founders,
      fundingStage: funding || null,
      description,
      verificationUrl: verificationUrl!,
      verificationNotes: notes,
      stage: draft.stage,
      sourcedVia: sourceChannel(draft.sourcedVia),
      referrer: referrerText(draft.referrer),
    },
  };
}

function nowIso(): string {
  return new Date().toISOString();
}

function campusFor(state: UserPipelineState, draft: ValidStartup, knownName: string): { state: UserPipelineState; campusId: string; campusName: string } {
  if (!draft.campusIsNew && draft.campusId) {
    return { state, campusId: draft.campusId, campusName: knownName || draft.campusName };
  }
  const existing = state.campuses.find((campus) => campus.name.toLowerCase() === draft.campusName.toLowerCase());
  if (existing) return { state, campusId: existing.id, campusName: existing.name };
  const campus: UserCampus = { id: newUserId("ucampus"), name: draft.campusName, createdAt: nowIso() };
  return { state: { ...state, campuses: [...state.campuses, campus] }, campusId: campus.id, campusName: campus.name };
}

export function upsertStartup(state: UserPipelineState, draft: ValidStartup, campusLabel: string, existingId?: string): UserPipelineState {
  const placed = campusFor(state, draft, campusLabel);
  const previous = existingId ? placed.state.startups.find((startup) => startup.id === existingId) : undefined;
  const id = previous?.id ?? newUserId("user");
  const founders: UserFounder[] = draft.founders.map((founder, index) => ({
    id: (founder.id && previous?.founders.some((row) => row.id === founder.id) ? founder.id : previous?.founders[index]?.id) ?? newUserId("ufounder"),
    name: founder.name,
    linkedinUrl: founder.linkedinUrl,
    classYear: founder.classYear,
    role: founder.role,
  }));
  const startup: UserStartup = {
    id,
    name: draft.name,
    websiteUrl: draft.websiteUrl,
    campusId: placed.campusId,
    campusName: placed.campusName,
    founders,
    fundingStage: draft.fundingStage,
    description: draft.description,
    verificationUrl: draft.verificationUrl,
    verificationNotes: draft.verificationNotes,
    stage: draft.stage,
    sourcedVia: draft.sourcedVia,
    referrer: draft.referrer,
    createdAt: previous?.createdAt ?? nowIso(),
    updatedAt: nowIso(),
  };
  const startups = previous ? placed.state.startups.map((row) => (row.id === id ? startup : row)) : [...placed.state.startups, startup];
  return pruneCampuses({ ...placed.state, startups });
}

export function deleteStartup(state: UserPipelineState, id: string): UserPipelineState {
  const startup = state.startups.find((row) => row.id === id);
  if (!startup) return state;
  const founderIds = new Set(startup.founders.map((founder) => founder.id));
  return pruneCampuses({
    ...state,
    startups: state.startups.filter((row) => row.id !== id),
    links: state.links.filter((link) => link.entityId !== id && !founderIds.has(link.entityId)),
  });
}

export function setStartupStage(state: UserPipelineState, id: string, stage: PipelineStage): UserPipelineState {
  return {
    ...state,
    startups: state.startups.map((startup) => (startup.id === id ? { ...startup, stage, updatedAt: nowIso() } : startup)),
  };
}

function liveReferrer(value: string | null): string | null {
  if (value == null) return null;
  return value.slice(0, 120);
}

export function setStartupSource(state: UserPipelineState, id: string, sourcedVia: SourceChannel | null, referrer: string | null): UserPipelineState {
  return {
    ...state,
    startups: state.startups.map((startup) =>
      startup.id === id ? { ...startup, sourcedVia: sourceChannel(sourcedVia), referrer: liveReferrer(referrer), updatedAt: nowIso() } : startup
    ),
  };
}

export function starEntity(
  state: UserPipelineState,
  input: {
    entityType: "project" | "person";
    entityId: string;
    name: string;
    campusName: string | null;
    websiteUrl: string | null;
    verificationUrl?: string | null;
    verificationNotes?: string | null;
    stage?: PipelineStage;
    sourcedVia?: SourceChannel | null;
    referrer?: string | null;
  }
): UserPipelineState {
  const existing = state.links.find((link) => link.entityType === input.entityType && link.entityId === input.entityId);
  if (existing) {
    return {
      ...state,
      links: state.links.map((link) =>
        link.id === existing.id
          ? {
              ...link,
              name: input.name || link.name,
              campusName: input.campusName ?? link.campusName,
              websiteUrl: input.websiteUrl ?? link.websiteUrl,
              verificationUrl: input.verificationUrl ?? link.verificationUrl,
              verificationNotes: input.verificationNotes ?? link.verificationNotes,
              stage: input.stage ?? link.stage,
              sourcedVia: input.sourcedVia !== undefined ? sourceChannel(input.sourcedVia) : link.sourcedVia,
              referrer: input.referrer !== undefined ? liveReferrer(input.referrer) : link.referrer,
              updatedAt: nowIso(),
            }
          : link
      ),
    };
  }
  const link: PipelineLink = {
    id: newUserId("plink"),
    entityType: input.entityType,
    entityId: input.entityId,
    name: input.name,
    campusName: input.campusName,
    websiteUrl: input.websiteUrl,
    stage: input.stage ?? "Sourced",
    verificationUrl: input.verificationUrl ?? null,
    verificationNotes: input.verificationNotes ?? null,
    sourcedVia: sourceChannel(input.sourcedVia),
    referrer: liveReferrer(input.referrer ?? null),
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  return { ...state, links: [...state.links, link] };
}

export function unstarEntity(state: UserPipelineState, entityType: "project" | "person", entityId: string): UserPipelineState {
  return { ...state, links: state.links.filter((link) => !(link.entityType === entityType && link.entityId === entityId)) };
}

export function setLinkStage(state: UserPipelineState, id: string, stage: PipelineStage): UserPipelineState {
  return { ...state, links: state.links.map((link) => (link.id === id ? { ...link, stage, updatedAt: nowIso() } : link)) };
}

export function setLinkSource(state: UserPipelineState, id: string, sourcedVia: SourceChannel | null, referrer: string | null): UserPipelineState {
  return {
    ...state,
    links: state.links.map((link) => (link.id === id ? { ...link, sourcedVia: sourceChannel(sourcedVia), referrer: liveReferrer(referrer), updatedAt: nowIso() } : link)),
  };
}

export function removeLink(state: UserPipelineState, id: string): UserPipelineState {
  return { ...state, links: state.links.filter((link) => link.id !== id) };
}

function pruneCampuses(state: UserPipelineState): UserPipelineState {
  const used = new Set(state.startups.map((startup) => startup.campusId));
  return { ...state, campuses: state.campuses.filter((campus) => used.has(campus.id)) };
}

export function mergePipelineStates(remote: UserPipelineState, local: UserPipelineState): UserPipelineState {
  const campuses = new Map(remote.campuses.map((campus) => [campus.id, campus]));
  for (const campus of local.campuses) if (!campuses.has(campus.id)) campuses.set(campus.id, campus);
  const startups = new Map(remote.startups.map((startup) => [startup.id, startup]));
  for (const startup of local.startups) if (!startups.has(startup.id)) startups.set(startup.id, startup);
  const links = new Map(remote.links.map((link) => [`${link.entityType}:${link.entityId}`, link]));
  for (const link of local.links) {
    const key = `${link.entityType}:${link.entityId}`;
    if (!links.has(key)) links.set(key, link);
  }
  return pruneCampuses({ version: 1, campuses: [...campuses.values()], startups: [...startups.values()], links: [...links.values()] });
}

function namedFounder(startup: UserStartup, founder: UserFounder): NamedFounder {
  const enrollment = enrollmentFromClassYear(founder.classYear);
  return {
    name: founder.name,
    personId: founder.id,
    linkedinUrl: founder.linkedinUrl,
    linkedinCandidates: [],
    link: founder.linkedinUrl ? { url: founder.linkedinUrl, label: "LinkedIn", kind: "linkedin" } : null,
    profileLinks: [],
    otherLinks: [],
    founderStatus: "founder",
    role: founder.role,
    enrollmentStatus: enrollment.status,
    enrollmentLabel: enrollment.label,
    enrollmentBasis: founder.classYear ? "verified" : null,
    leftSchool: false,
    school: startup.campusName,
    program: null,
  };
}

function userSameSchool(startup: UserStartup): { hit: boolean; people: Set<string> } {
  const hits = sameSchoolCofounderHits(
    startup.founders.map((founder) => ({
      projectId: startup.id,
      personId: founder.id,
      universityId: startup.campusId,
      gradYear: classYearNumber(founder.classYear),
      startYear: null,
      endYear: null,
    }))
  );
  return { hit: hits.length > 0, people: new Set(hits.flatMap((item) => item.personIds)) };
}

export function startupToCandidate(startup: UserStartup): CandidateSummary & { userAdded: true; verificationUrl: string; fundingStage: string | null } {
  const founders = startup.founders.map((founder) => namedFounder(startup, founder));
  const same = userSameSchool(startup);
  const boosts = founders.map((founder) => (founder.enrollmentStatus === "current_student" ? 2 : founder.enrollmentStatus === "recent_grad" ? 1 : 0));
  return {
    id: startup.id,
    name: startup.name,
    sector: null,
    description: startup.description || null,
    websiteUrl: startup.websiteUrl,
    primaryLink: startup.verificationUrl,
    primaryLinkKind: "verification",
    founders: founders.map((founder) => founder.name),
    founderLinks: founders,
    founderIds: founders.map((founder) => founder.personId),
    universities: [startup.campusName],
    universityIds: [startup.campusId],
    sectorTags: [],
    sourceIds: [],
    overallGate: "needs_verification",
    gateOutcomes: [
      {
        gate: "user_added",
        result: "needs_verification",
        rationale: "Added by a user with a verification source. Screening gates have not been run.",
      },
    ],
    queue: "exploration",
    qualityScore: null,
    coverage: null,
    strongestSignalKey: null,
    openQuestion: null,
    latestSignalNote: startup.description || "User-added startup.",
    recordedPlace: null,
    enrollmentBoost: boosts.length ? Math.max(...boosts) : 0,
    signalTier: null,
    verificationStatus: null,
    lastVerifiedAt: startup.updatedAt,
    verificationNote: startup.verificationNotes || null,
    signalTierBasis: null,
    sameSchoolCofounders: same.hit,
    sameSchoolBonus: scoreBonus(null, SAME_SCHOOL_STARTUP_POINTS, same.hit).applied,
    userAdded: true,
    verificationUrl: startup.verificationUrl,
    fundingStage: startup.fundingStage,
  };
}

export function startupToFounders(startup: UserStartup): (FounderRow & { userAdded: true; verificationUrl: string })[] {
  const same = userSameSchool(startup);
  return startup.founders.map((founder) => {
    const enrollment = enrollmentFromClassYear(founder.classYear);
    const year = classYearNumber(founder.classYear);
    return {
      id: founder.id,
      name: founder.name,
      status: enrollment.status === "current_student" ? "student" : enrollment.status === "unknown" ? "unknown" : "alumni",
      universityId: startup.campusId,
      universityName: startup.campusName,
      projects: [
        {
          id: startup.id,
          name: startup.name,
          kind: "company",
          role: founder.role || "founder",
          websiteUrl: startup.websiteUrl,
          primaryLink: startup.verificationUrl,
          primaryLinkKind: "verification",
          signalTier: null,
        },
      ],
      signalTier: null,
      signalTierBasis: null,
      founderStatus: "founder",
      potentialSignal: null,
      signalEvidence: {
        excerpt: startup.description || `${founder.name} is listed on ${startup.name}.`,
        sourceUrl: startup.verificationUrl,
        sourceName: "Verified by user",
        unverified: false,
      },
      linkedCompany: { id: startup.id, name: startup.name },
      possibleCompany: null,
      linkedinUrl: founder.linkedinUrl,
      linkedinCandidates: [],
      link: founder.linkedinUrl ? { url: founder.linkedinUrl, label: "LinkedIn", kind: "linkedin" } : null,
      profileLinks: [],
      otherLinks: [],
      education: year ? [{ excerpt: `Class of ${year}`, sourceUrl: startup.verificationUrl }] : [],
      enrollmentStatus: enrollment.status,
      enrollmentLabel: enrollment.label,
      enrollmentBasis: founder.classYear ? "verified" : null,
      leftSchool: false,
      enrollmentEvidence: founder.classYear,
      enrollmentSourceUrl: startup.verificationUrl,
      verificationStatus: null,
      lastVerifiedAt: startup.updatedAt,
      verificationNote: startup.verificationNotes || null,
      websiteUrl: null,
      sectorTags: [],
      sourceIds: [],
      personIds: [founder.id],
      strongestEvidence: startup.description || null,
      reviewNotes: startup.verificationNotes ? [startup.verificationNotes] : [],
      campuses: [{ universityId: startup.campusId, universityName: startup.campusName, status: null }],
      hotspots: [],
      promoted: true,
      promotionReasonLabel: "User-added",
      founderSignal: { founderSignal: null, coverage: 0, dimensions: [] },
      sameSchoolCofounders: same.people.has(founder.id),
      sameSchoolBonus: scoreBonus(null, SAME_SCHOOL_FOUNDER_POINTS, same.people.has(founder.id)).applied,
      precollegeSignals: [],
      programSignals: [],
      userAdded: true,
      verificationUrl: startup.verificationUrl,
    };
  });
}

function userCampusSummary(campus: UserCampus, startups: UserStartup[]): UniversitySummary {
  const mine = startups.filter((startup) => startup.campusId === campus.id);
  const founders = mine.reduce((sum, startup) => sum + startup.founders.length, 0);
  return {
    id: campus.id,
    name: campus.name,
    country: null,
    lat: null,
    lon: null,
    coordSource: null,
    candidateProjectCount: mine.length,
    companyCount: mine.length,
    founderCount: founders,
    resolvedPersonCount: founders,
    sourcesConfigured: 0,
    lastCheckedAt: null,
    coverage: "not_scanned",
    pitchbook: null,
    hitRate: null,
  };
}

export function mergeCatalog(
  input: { universities: UniversitySummary[]; candidates: CandidateSummary[]; founders: FounderRow[] },
  state: UserPipelineState
): { universities: UniversitySummary[]; candidates: CandidateSummary[]; founders: FounderRow[] } {
  const extraCandidates = state.startups.map(startupToCandidate);
  const extraFounders = state.startups.flatMap(startupToFounders);
  const candidateIds = new Set(input.candidates.map((candidate) => candidate.id));
  const founderIds = new Set(input.founders.map((founder) => founder.id));
  const candidates = [...input.candidates, ...extraCandidates.filter((candidate) => !candidateIds.has(candidate.id))];
  const founders = [...input.founders, ...extraFounders.filter((founder) => !founderIds.has(founder.id))];

  const byId = new Map(input.universities.map((university) => [university.id, { ...university }]));
  for (const startup of state.startups) {
    const existing = byId.get(startup.campusId);
    if (!existing) continue;
    existing.companyCount += 1;
    existing.candidateProjectCount += 1;
    existing.founderCount += startup.founders.length;
    existing.resolvedPersonCount += startup.founders.length;
  }
  for (const campus of state.campuses) {
    if (!byId.has(campus.id)) byId.set(campus.id, userCampusSummary(campus, state.startups));
  }
  const universities = [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  return { universities, candidates, founders };
}

export function userCompanyMatches(candidate: CandidateSummary, current: Record<string, string | undefined>): boolean {
  if (!isUserStartupId(candidate.id)) return false;
  if (isSignalTier(current.tier)) return false;
  if (
    !matchCandidate(candidate, {
      universityId: current.university,
      queue: current.queue as Queue | undefined,
      sector: current.sector,
      search: current.q,
    })
  ) {
    return false;
  }
  const selected = selectedEnrollment(current.enroll);
  const known = candidate.founderLinks.filter((founder) => founder.enrollmentStatus && founder.enrollmentStatus !== "unknown");
  if (known.length === 0) return true;
  return known.some((founder) => matchesEnrollment(founder.enrollmentStatus, selected));
}

export function userFounderPassesEnrollment(founder: { id: string; enrollmentStatus?: string | null }, selected: EnrollmentStatus[]): boolean {
  if (!isUserFounderId(founder.id)) return matchesEnrollment(founder.enrollmentStatus, selected);
  if (!founder.enrollmentStatus || founder.enrollmentStatus === "unknown") return true;
  return matchesEnrollment(founder.enrollmentStatus, selected);
}

export interface UserMapMarker {
  id: string;
  name: string;
  lon: number;
  lat: number;
}

export function userMapMarkers(state: UserPipelineState, universities: { id: string; lat: number | null; lon: number | null }[]): UserMapMarker[] {
  const coords = new Map(universities.filter((university) => university.lat != null && university.lon != null).map((university) => [university.id, university]));
  const placed = new Map<string, number>();
  const markers: UserMapMarker[] = [];
  for (const startup of state.startups) {
    const campus = coords.get(startup.campusId);
    if (!campus || campus.lat == null || campus.lon == null) continue;
    const index = placed.get(startup.campusId) ?? 0;
    placed.set(startup.campusId, index + 1);
    markers.push({
      id: startup.id,
      name: startup.name,
      lon: campus.lon + 0.42 + index * 0.28,
      lat: campus.lat + 0.18,
    });
  }
  return markers;
}

interface LooseMapNode {
  id: string;
  type: string;
  label: string;
  x: number;
  y: number;
  r: number;
  campus: string | null;
  campuses?: string[];
  sector: string | null;
  tier: string | null;
  stage: string | null;
  enroll: string | null;
  year: number | null;
  founder: boolean;
  degree: number;
  potential: boolean;
  signalCount: number;
  signalWeight: number;
  signalDenominator: number;
  signalRatio: number;
  signalScore: number;
}

interface LooseMapGraph {
  nodes: LooseMapNode[];
  edges: { source: string; target: string; type: string }[];
  counts: { people: number; startups: number; campuses: number; investors: number; programs: number; organizations: number };
}

export function attachUserMapNodes<T extends LooseMapGraph>(graph: T, state: UserPipelineState): T {
  if (state.startups.length === 0) return graph;
  const nodes = graph.nodes.map((node) => ({ ...node }));
  const edges = graph.edges.map((edge) => ({ ...edge }));
  const have = new Set(nodes.map((node) => node.id));
  let addedStartups = 0;
  let addedPeople = 0;
  let addedCampuses = 0;

  for (const startup of state.startups) {
    let campus = nodes.find((node) => node.type === "campus" && (node.id === startup.campusId || node.campus === startup.campusId));
    if (!campus && !have.has(startup.campusId)) {
      campus = {
        id: startup.campusId,
        type: "campus",
        label: startup.campusName,
        x: 80 + addedCampuses * 30,
        y: -40,
        r: 4,
        campus: startup.campusId,
        campuses: [startup.campusId],
        sector: null,
        tier: null,
        stage: null,
        enroll: null,
        year: null,
        founder: false,
        degree: 1,
        potential: false,
        ...signalFields(perCapitaSignal(0, 0, undergradEnrollment(startup.campusId), 0)),
      };
      nodes.push(campus);
      have.add(campus.id);
      addedCampuses += 1;
    }
    const origin = campus ?? nodes.find((node) => node.type === "campus");
    const angle = addedStartups * 0.9;
    const sx = (origin?.x ?? 0) + Math.cos(angle) * 18;
    const sy = (origin?.y ?? 0) + Math.sin(angle) * 18;
    if (!have.has(startup.id)) {
      nodes.push({
        id: startup.id,
        type: "startup",
        label: startup.name,
        x: sx,
        y: sy,
        r: 3,
        campus: startup.campusId,
        campuses: [startup.campusId],
        sector: null,
        tier: null,
        stage: null,
        enroll: null,
        year: null,
        founder: false,
        degree: 1 + startup.founders.length,
        potential: false,
        ...signalFields(connectionSignal(1 + startup.founders.length, 20)),
      });
      have.add(startup.id);
      addedStartups += 1;
      if (campus) edges.push({ source: startup.id, target: campus.id, type: "at_campus" });
    }
    startup.founders.forEach((founder, index) => {
      if (have.has(founder.id)) return;
      const enrollment = enrollmentFromClassYear(founder.classYear);
      nodes.push({
        id: founder.id,
        type: "person",
        label: founder.name,
        x: sx + 8,
        y: sy + 8 + index * 6,
        r: 2.2,
        campus: startup.campusId,
        campuses: [startup.campusId],
        sector: null,
        tier: null,
        stage: null,
        enroll: enrollment.status === "unknown" ? null : enrollment.status,
        year: classYearNumber(founder.classYear),
        founder: true,
        degree: 2,
        potential: false,
        ...signalFields(connectionSignal(2, 12)),
      });
      have.add(founder.id);
      addedPeople += 1;
      edges.push({ source: founder.id, target: startup.id, type: "founded" });
      if (campus) edges.push({ source: founder.id, target: campus.id, type: "studied_at" });
    });
  }

  return {
    ...graph,
    nodes,
    edges,
    counts: {
      ...graph.counts,
      people: graph.counts.people + addedPeople,
      startups: graph.counts.startups + addedStartups,
      campuses: graph.counts.campuses + addedCampuses,
    },
  };
}

export function attachUserScoutNetwork(graph: NetworkGraph, state: UserPipelineState, universityId?: string): NetworkGraph {
  const startups = state.startups.filter((startup) => !universityId || startup.campusId === universityId);
  if (startups.length === 0) return graph;
  const nodes: NetworkNode[] = graph.nodes.map((node) => ({ ...node }));
  const edges: NetworkEdge[] = graph.edges.map((edge) => ({ ...edge }));
  const have = new Set(nodes.map((node) => node.id));
  startups.forEach((startup, index) => {
    if (have.has(startup.id)) return;
    const campus = nodes.find((node) => node.type === "university" && node.id === startup.campusId);
    const origin = campus ?? nodes.find((node) => node.type === "university");
    const ox = origin?.x ?? 240;
    const oy = origin?.y ?? 180;
    const angle = (index / Math.max(startups.length, 1)) * Math.PI * 2;
    const sx = ox + Math.cos(angle) * 78;
    const sy = oy + Math.sin(angle) * 78;
    let campusId = campus?.id ?? null;
    if (!campusId && !have.has(startup.campusId)) {
      nodes.push({
        id: startup.campusId,
        type: "university",
        label: startup.campusName,
        sublabel: "User-added",
        x: ox + 110,
        y: oy,
      });
      have.add(startup.campusId);
      campusId = startup.campusId;
    }
    nodes.push({
      id: startup.id,
      type: "project",
      label: startup.name,
      sublabel: "User-added",
      x: sx,
      y: sy,
      linkUrl: startup.websiteUrl ?? undefined,
      linkLabel: "Website",
      linkKind: "website",
    });
    have.add(startup.id);
    if (campusId) {
      edges.push({ source: startup.id, target: campusId, relationshipType: "affiliated_with", verificationState: "user_added" });
    }
    startup.founders.forEach((founder, founderIndex) => {
      if (have.has(founder.id)) return;
      nodes.push({
        id: founder.id,
        type: "person",
        label: founder.name,
        sublabel: "User-added",
        x: sx + 28,
        y: sy + 16 + founderIndex * 18,
        linkUrl: founder.linkedinUrl ?? undefined,
        linkLabel: founder.linkedinUrl ? "LinkedIn" : undefined,
        linkKind: founder.linkedinUrl ? "linkedin" : undefined,
      });
      have.add(founder.id);
      edges.push({ source: founder.id, target: startup.id, relationshipType: "founded", verificationState: "user_added" });
    });
  });
  const legend = graph.legend.some((item) => item.label === "User-added") ? graph.legend : [...graph.legend, { type: "project" as const, label: "User-added" }];
  return { ...graph, nodes, edges, legend };
}
