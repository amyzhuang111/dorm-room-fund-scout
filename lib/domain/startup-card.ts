// Directory-style startup card. Every value is a stored field. Follower
// counts, years of experience, and logo files are not in the database, so
// those stay empty. A missing logo may be shown as the website's favicon
// by the UI, with an initial-letter fallback.

import { getDb } from "../db/client";
import { survivorId } from "./entity-redirects";
import { ownWebsite } from "./company-link";
import { confirmedLinkedIn, readLinkedInCandidate } from "./person-link";
import { isBoilerplateDescription, sectorLabel } from "./sectors";
import { localCompanyLogoUrl } from "./local-logos";

export const STARTUP_LINK_KINDS = ["website", "linkedin", "x", "crunchbase", "facebook", "github", "productHunt"] as const;
export type StartupLinkKind = (typeof STARTUP_LINK_KINDS)[number];

export interface StartupCardLink {
  kind: StartupLinkKind;
  url: string;
}

export interface StartupCardFounder {
  id: string;
  name: string;
  role: string | null;
  /** Program membership and school, only when those rows exist. */
  program: string | null;
  school: string | null;
  linkedinUrl: string | null;
  /** confirmed is a saved linkedin.com/in alias. likely is a stored candidate the directory card also shows, labeled. */
  linkedinConfidence: "confirmed" | "likely" | null;
  /** Not stored. Left null rather than parsed out of a bio. */
  photoUrl: string | null;
  linkedinFollowers: number | null;
  yearsExperience: number | null;
}

export interface StartupCard {
  id: string;
  name: string;
  /** Product site used for the website button and a favicon. Null when we have no own-domain site. */
  websiteUrl: string | null;
  /** Local cached mark under /company-logos, or null. Never a hotlinked favicon. */
  logoUrl: string | null;
  subtitle: string | null;
  sector: string | null;
  links: StartupCardLink[];
  description: string | null;
  region: string | null;
  teamSize: string | null;
  status: "Active" | "Acquired" | "Inactive" | null;
  campuses: string[];
  verifiedOn: string | null;
  verifiedSource: string | null;
  founders: StartupCardFounder[];
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function canonicalPersonLinkedIn(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const match = raw.match(/https?:\/\/(?:[\w.-]+\.)?linkedin\.com\/in\/([^/?#\s"'<>]+)/i);
  if (!match) return null;
  let slug = match[1].replace(/\/+$/, "");
  try {
    slug = decodeURIComponent(slug);
  } catch {
    // keep the raw slug
  }
  slug = slug.replace(/\/+$/, "");
  if (slug.length < 2 || slug.length > 100) return null;
  if (!/^[\p{L}\p{N}\-_%]+$/u.test(slug)) return null;
  return `https://www.linkedin.com/in/${slug}`;
}

export function formatVerifiedDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const month = MONTHS[Number(match[2]) - 1];
  if (!month) return null;
  return `${month} ${Number(match[3])}, ${match[1]}`;
}

export function verificationSourceLabel(note: string | null | undefined): string | null {
  if (!note) return null;
  const text = note.replace(/\s+/g, " ").trim();
  if (!text) return null;
  if (/^No company website/i.test(text) || /^Website was fetched and did not/i.test(text)) return null;
  if (/^(Named on|Website cleared\.)/i.test(text)) {
    const url = text.match(/https?:\/\/[^\s)]+/);
    if (!url) return null;
    try {
      return new URL(url[0]).hostname.replace(/^www\./, "");
    } catch {
      return null;
    }
  }
  if (/^YC company page/i.test(text)) return "YC company page";
  if (/^Live website/i.test(text) || /^The company site/i.test(text)) return "company website";
  const clause = text.split("(")[0].trim().replace(/\.$/, "");
  if (clause.length > 0 && clause.length <= 72) return clause;
  return null;
}

export function startupStatusLabel(raw: string | null | undefined): StartupCard["status"] {
  if (!raw) return null;
  const value = raw.trim().toLowerCase();
  if (value === "active" || value === "public") return "Active";
  if (value === "acquired") return "Acquired";
  if (value === "inactive" || value === "dead" || value === "shut down" || value === "shutdown") return "Inactive";
  return null;
}

export function founderRoleLabel(role: string | null | undefined): string | null {
  if (!role) return null;
  const cleaned = role.replaceAll("_", " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return null;
  return cleaned
    .split(/(\s+|\/|-)/)
    .map((part) => {
      if (!/[a-z]/i.test(part)) return part;
      if (["ceo", "cto", "coo", "cfo", "cpo"].includes(part.toLowerCase())) return part.toUpperCase();
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join("");
}

function seasonBatch(batch: string | null): string | null {
  if (!batch) return null;
  const match = batch.trim().match(/^(winter|summer|fall|spring)\s+(\d{4})$/i);
  if (!match) return null;
  const season = match[1].toLowerCase();
  return `${season.charAt(0).toUpperCase()}${season.slice(1)} ${match[2]}`;
}

/** Batch or program, then the stored place. A program name with no batch or year is left off. */
export function startupSubtitle(batch: string | null, program: string | null, location: string | null): string | null {
  const place = location?.trim() || null;
  const season = seasonBatch(batch);
  const token = batch?.trim() || null;
  const org = program?.trim() || null;
  let head: string | null = null;
  if (season) head = season;
  else if (token && org) head = `${org} ${token}`.replace(/\s+/g, " ").trim();
  else if (token) head = token;
  const parts = [head, place].filter((part): part is string => !!part);
  return parts.length ? parts.join(" · ") : null;
}

function hostOf(url: string): { host: string; path: string } | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return {
      host: parsed.hostname.toLowerCase().replace(/^www\./, ""),
      path: parsed.pathname.toLowerCase(),
    };
  } catch {
    return null;
  }
}

/** Classifies a URL by its hostname. A lookalike host such as olferatx.com is not X. */
export function classifyCompanyLink(url: string): StartupLinkKind | null {
  const parsed = hostOf(url);
  if (!parsed) return null;
  const { host, path } = parsed;
  if (host === "linkedin.com" || host.endsWith(".linkedin.com")) {
    return path.includes("/company/") ? "linkedin" : null;
  }
  if (host === "x.com" || host === "twitter.com" || host === "mobile.twitter.com") return "x";
  if (host === "crunchbase.com" || host.endsWith(".crunchbase.com")) return "crunchbase";
  if (host === "facebook.com" || host === "fb.com" || host.endsWith(".facebook.com")) return "facebook";
  if (host === "github.com") return "github";
  if (host === "producthunt.com") return "productHunt";
  return "website";
}

export function assembleStartupLinks(urls: (string | null | undefined)[]): StartupCardLink[] {
  const found = new Map<StartupLinkKind, string>();
  for (const raw of urls) {
    if (!raw || !raw.startsWith("http")) continue;
    const kind = classifyCompanyLink(raw);
    if (!kind || found.has(kind)) continue;
    if (kind === "website") {
      const site = ownWebsite(raw);
      if (!site) continue;
      found.set("website", site);
      continue;
    }
    found.set(kind, raw);
  }
  return STARTUP_LINK_KINDS.filter((kind) => found.has(kind)).map((kind) => ({ kind, url: found.get(kind)! }));
}

function textOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readJson(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

interface BatchChoice {
  batch: string | null;
  program: string | null;
}

function chooseBatch(choices: BatchChoice[]): BatchChoice {
  const season = choices.find((choice) => seasonBatch(choice.batch));
  if (season) return season;
  const token = choices.find((choice) => choice.batch);
  if (token) return token;
  return { batch: null, program: null };
}

export function getStartupCard(id: string): StartupCard | null {
  const db = getDb();
  const resolved = survivorId("project", id) ?? id;
  const project = db
    .prepare(
      `SELECT id, name, kind, sector, description, website_url, primary_link, verification_status, last_verified_at, verification_note
       FROM projects WHERE id = ?`
    )
    .get(resolved) as
    | {
        id: string;
        name: string;
        kind: string;
        sector: string | null;
        description: string | null;
        website_url: string | null;
        primary_link: string | null;
        verification_status: string | null;
        last_verified_at: string | null;
        verification_note: string | null;
      }
    | undefined;
  if (!project || project.kind !== "company") return null;

  const facts = db
    .prepare(`SELECT fact_key, value_text, detail_json FROM company_facts WHERE project_id = ? ORDER BY rowid`)
    .all(project.id) as { fact_key: string; value_text: string; detail_json: string }[];
  const factText = (key: string) => facts.find((row) => row.fact_key === key)?.value_text?.trim() || null;

  const claims = db
    .prepare(
      `SELECT claim_type, value_json FROM claims
       WHERE entity_type = 'project' AND entity_id = ? AND claim_type IN ('accelerator_membership', 'website')`
    )
    .all(project.id) as { claim_type: string; value_json: string }[];

  const batches: BatchChoice[] = [];
  let membershipLocation: string | null = null;
  let membershipStatus: string | null = null;
  const linkUrls: (string | null)[] = [project.website_url, project.primary_link];

  for (const fact of facts) {
    if (fact.fact_key === "website" || fact.fact_key === "company_linkedin") linkUrls.push(fact.value_text);
    if (fact.fact_key === "investor") {
      const detail = readJson(fact.detail_json);
      const batch = textOrNull(detail.batch);
      if (batch) batches.push({ batch, program: fact.value_text.trim() || null });
    }
  }
  for (const claim of claims) {
    const value = readJson(claim.value_json);
    const website = textOrNull(value.website);
    if (website) linkUrls.push(website);
    if (claim.claim_type !== "accelerator_membership") continue;
    const batch = textOrNull(value.batch);
    if (batch) batches.push({ batch, program: textOrNull(value.org) });
    if (!membershipLocation) membershipLocation = textOrNull(value.location);
    if (!membershipStatus) membershipStatus = textOrNull(value.status);
  }

  const chosen = chooseBatch(batches);
  const region = factText("hq") || membershipLocation;
  const descriptionFact = factText("description");
  const description =
    (descriptionFact && !isBoilerplateDescription(descriptionFact) ? descriptionFact : null) ||
    (project.description && !isBoilerplateDescription(project.description) ? project.description.trim() : null);

  const tag = db
    .prepare(`SELECT tag FROM project_sector_tags WHERE project_id = ? ORDER BY is_primary DESC, rowid LIMIT 1`)
    .get(project.id) as { tag: string } | undefined;
  const sectorRaw = (tag?.tag || project.sector || "").trim();
  const sector = sectorRaw ? sectorLabel(sectorRaw) : null;

  const campusRows = db
    .prepare(
      `SELECT DISTINCT u.name AS name
       FROM relationships r
       JOIN universities u ON u.id = r.target_entity_id
       WHERE r.source_entity_id = ? AND r.source_entity_type = 'project'
         AND r.target_entity_type = 'university' AND r.relationship_type = 'affiliated_with'
       ORDER BY u.name`
    )
    .all(project.id) as { name: string }[];
  let campuses = campusRows.map((row) => row.name);
  if (campuses.length === 0) {
    const schools = db
      .prepare(
        `SELECT DISTINCT u.name AS name
         FROM person_project_roles ppr
         JOIN affiliations a ON a.person_id = ppr.person_id
         JOIN universities u ON u.id = a.university_id
         WHERE ppr.project_id = ? AND ppr.role LIKE '%founder%'
         ORDER BY u.name`
      )
      .all(project.id) as { name: string }[];
    campuses = schools.map((row) => row.name);
  }

  const people = db
    .prepare(
      `SELECT pe.id, pe.name, pe.aliases_json, ppr.role
       FROM person_project_roles ppr
       JOIN people pe ON pe.id = ppr.person_id
       WHERE ppr.project_id = ? AND ppr.role LIKE '%founder%'
       ORDER BY pe.name`
    )
    .all(project.id) as { id: string; name: string; aliases_json: string; role: string | null }[];

  const founders: StartupCardFounder[] = people.map((person) => {
    const school = db
      .prepare(
        `SELECT u.name AS name FROM affiliations a
         JOIN universities u ON u.id = a.university_id
         WHERE a.person_id = ? ORDER BY a.rowid LIMIT 1`
      )
      .get(person.id) as { name: string } | undefined;
    const program = db
      .prepare(
        `SELECT label FROM program_signals
         WHERE person_id = ? AND match_status IN ('confirmed', 'likely')
         ORDER BY CASE match_status WHEN 'confirmed' THEN 0 ELSE 1 END, IFNULL(year, 0) DESC, label
         LIMIT 1`
      )
      .get(person.id) as { label: string } | undefined;
    const confirmed = canonicalPersonLinkedIn(confirmedLinkedIn(person.aliases_json));
    let linkedinUrl = confirmed;
    let linkedinConfidence: "confirmed" | "likely" | null = confirmed ? "confirmed" : null;
    if (!linkedinUrl) {
      const candidateRow = db
        .prepare(
          `SELECT value_json, verification_state FROM claims
           WHERE entity_type = 'person' AND entity_id = ? AND claim_type = 'linkedin_candidate' AND verification_state = 'likely'
           ORDER BY rowid LIMIT 1`
        )
        .get(person.id) as { value_json: string; verification_state: string } | undefined;
      const candidate = candidateRow ? readLinkedInCandidate(candidateRow.value_json, candidateRow.verification_state) : null;
      const likely = candidate?.confidence === "likely" ? canonicalPersonLinkedIn(candidate.url) : null;
      if (likely) {
        linkedinUrl = likely;
        linkedinConfidence = "likely";
      }
    }
    return {
      id: person.id,
      name: person.name,
      role: founderRoleLabel(person.role),
      program: program?.label?.trim() || null,
      school: school?.name ?? null,
      linkedinUrl,
      linkedinConfidence,
      photoUrl: null,
      linkedinFollowers: null,
      yearsExperience: null,
    };
  });

  const links = assembleStartupLinks(linkUrls);
  const confirmed = project.verification_status === "confirmed";
  return {
    id: project.id,
    name: project.name,
    websiteUrl: links.find((link) => link.kind === "website")?.url ?? null,
    logoUrl: localCompanyLogoUrl(project.id),
    subtitle: startupSubtitle(chosen.batch, chosen.program, region),
    sector,
    links,
    description,
    region,
    teamSize: factText("team_size"),
    status: startupStatusLabel(factText("operating_status") || membershipStatus),
    campuses,
    verifiedOn: confirmed ? formatVerifiedDate(project.last_verified_at) : null,
    verifiedSource: confirmed ? verificationSourceLabel(project.verification_note) : null,
    founders,
  };
}
