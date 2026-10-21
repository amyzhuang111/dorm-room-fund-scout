import type Database from "better-sqlite3";
import { nowIso } from "../db/client";
import { isOfficialProductHost, linkKind } from "./company-link";
import { preferSignalTier } from "./signal-tier";

export interface MergeGroup {
  entityType: "project" | "person";
  survivorId: string;
  survivorName: string;
  drop: { id: string; name: string }[];
  reason: string;
}

export interface AmbiguousPair {
  entityType: "project" | "person";
  leftId: string;
  leftName: string;
  rightId: string;
  rightName: string;
  detail: string;
}

export interface DedupePlan {
  startupMerges: MergeGroup[];
  peopleMerges: MergeGroup[];
  ambiguous: AmbiguousPair[];
}

const LEGAL = new Set(["incorporated", "inc", "llc", "ltd", "limited", "corp", "corporation", "co", "company", "plc", "gmbh", "pbc", "llp"]);

const PLATFORM_ROOTS = [
  "github.io",
  "vercel.app",
  "netlify.app",
  "herokuapp.com",
  "web.app",
  "firebaseapp.com",
  "squarespace.com",
  "wixsite.com",
  "carrd.co",
  "framer.app",
  "framer.website",
  "notion.site",
  "gitlab.io",
  "pages.dev",
  "workers.dev",
  "webflow.io",
  "base44.app",
  "godaddysites.com",
  "weebly.com",
  "mystrikingly.com",
  "fly.dev",
  "onrender.com",
  "azurewebsites.net",
];

const NON_IDENTITY_HOSTS = new Set([
  "linktr.ee",
  "bit.ly",
  "tinyurl.com",
  "t.co",
  "lnkd.in",
  "forms.gle",
  "docs.google.com",
  "sites.google.com",
  "drive.google.com",
  "notion.so",
  "medium.com",
  "substack.com",
  "youtube.com",
  "youtu.be",
  "twitter.com",
  "x.com",
  "facebook.com",
  "instagram.com",
  "tiktok.com",
  "linkedin.com",
  "github.com",
  "crunchbase.com",
  "ycombinator.com",
  "devpost.com",
  "wellfound.com",
  "angel.co",
  "producthunt.com",
  "wikipedia.org",
  "techcrunch.com",
  "pitchbook.com",
  "google.com",
  "apple.com",
  "apps.apple.com",
]);

const DESC_STOP = new Set([
  "about",
  "after",
  "also",
  "and",
  "are",
  "been",
  "being",
  "build",
  "builds",
  "building",
  "built",
  "company",
  "from",
  "have",
  "into",
  "more",
  "startup",
  "startups",
  "student",
  "students",
  "team",
  "that",
  "their",
  "them",
  "they",
  "this",
  "with",
  "which",
  "using",
  "used",
  "based",
  "across",
  "through",
  "where",
  "when",
  "your",
  "will",
  "make",
  "makes",
  "making",
  "product",
  "products",
  "platform",
  "system",
  "systems",
  "software",
  "technology",
  "technologies",
  "university",
  "founded",
  "founder",
  "founders",
  "penn",
  "berkeley",
  "stanford",
  "harvard",
]);

const BOILERPLATE = [
  /listed on berkeley skydeck/i,
  /sector\/product description not yet researched/i,
  /penn labs product, built by penn students/i,
  /founders not yet identified/i,
  /mostly faculty-founded spinouts/i,
];

type NameRel = "exact" | "abbrev" | "contains" | "similar" | "weak" | "different" | "empty";

const REL_RANK: Record<NameRel, number> = {
  exact: 5,
  abbrev: 4,
  contains: 3,
  similar: 2,
  weak: 1,
  different: 0,
  empty: 0,
};

interface Startup {
  id: string;
  name: string;
  names: string[];
  norm: string;
  kind: string;
  desc: string;
  websiteUrl: string | null;
  primaryLink: string | null;
  primaryLinkKind: string | null;
  sector: string | null;
  signalTier: string | null;
  signalTierBasis: string | null;
  portfolio: number;
  investable: number;
  webs: Set<string>;
  lis: Set<string>;
  founderIds: string[];
  memberIds: string[];
  campuses: Set<string>;
  factCount: number;
  claimCount: number;
  investorCount: number;
  richness: number;
}

interface Person {
  id: string;
  name: string;
  norm: string;
  aliases: string[];
  slugs: Set<string>;
  campuses: Set<string>;
  projects: Set<string>;
  claimCount: number;
  roleCount: number;
  enrollmentStatus: string | null;
  enrollmentLabel: string | null;
  enrollmentEvidence: string | null;
  enrollmentSourceUrl: string | null;
  enrollmentSourceId: string | null;
  enrollmentGradYear: number | null;
  signalTier: string | null;
  signalTierBasis: string | null;
  leftSchool: number;
  founderStatus: string | null;
  potentialSignal: string | null;
  richness: number;
}

export function normalizeCompanyName(name: string): string {
  const tokens = name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const stripped = tokens.filter((token) => token !== "the" && !LEGAL.has(token));
  const kept = stripped.length ? stripped : tokens.filter((token) => token !== "the");
  return kept.join(" ");
}

export function normalizePersonName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function parseAliases(json: string | null): string[] {
  try {
    const parsed = JSON.parse(json || "[]") as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function linkedinPersonSlug(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const match = raw.match(/linkedin\.com\/in\/([A-Za-z0-9_%-]+)/i);
  if (!match) return null;
  const slug = safeDecode(match[1]).toLowerCase().replace(/[-_]+$/g, "");
  if (slug.length < 2) return null;
  return slug;
}

export function linkedinCompanySlug(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const match = raw.match(/linkedin\.com\/company\/([A-Za-z0-9_%-]+)/i);
  if (!match) return null;
  const slug = safeDecode(match[1]).toLowerCase().replace(/[-_]+$/g, "");
  if (!slug || slug === "unavailable" || slug === "admin") return null;
  return slug;
}

function confirmedPersonSlugs(aliases: string[]): string[] {
  const slugs: string[] = [];
  for (const alias of aliases) {
    if (!alias.startsWith("linkedin:")) continue;
    const slug = linkedinPersonSlug(alias.slice("linkedin:".length));
    if (slug) slugs.push(slug);
  }
  return slugs;
}

function hostOf(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed.startsWith("http")) return null;
  try {
    const host = new URL(trimmed).hostname.toLowerCase().replace(/^www\./, "");
    return host || null;
  } catch {
    return null;
  }
}

function blockedHost(host: string): boolean {
  if (host.endsWith(".edu")) return true;
  if (NON_IDENTITY_HOSTS.has(host)) return true;
  for (const blocked of NON_IDENTITY_HOSTS) {
    if (host.endsWith(`.${blocked}`)) return true;
  }
  return false;
}

function platformRoot(host: string): string | null {
  for (const root of PLATFORM_ROOTS) {
    if (host === root || host.endsWith(`.${root}`)) return root;
  }
  return null;
}

/** Company-site identity. Org hubs and link shorteners are not identities. */
export function websiteIdentity(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const host = hostOf(trimmed);
  if (!host || blockedHost(host)) return null;
  const platform = platformRoot(host);
  if (platform) {
    if (host === platform) {
      let path = "";
      try {
        path = new URL(trimmed).pathname.split("/").filter(Boolean)[0] ?? "";
      } catch {
        path = "";
      }
      return path ? `${host}/${path.toLowerCase()}` : null;
    }
    return host;
  }
  if (!isOfficialProductHost(trimmed)) return null;
  return host;
}

function nameRelation(a: string, b: string): NameRel {
  const na = normalizeCompanyName(a);
  const nb = normalizeCompanyName(b);
  if (!na || !nb) return "empty";
  if (na === nb) return "exact";
  const ta = new Set(na.split(" "));
  const tb = new Set(nb.split(" "));
  const shorter = ta.size <= tb.size ? ta : tb;
  if ([...ta].every((token) => tb.has(token)) || [...tb].every((token) => ta.has(token))) {
    const extra = Math.abs(ta.size - tb.size);
    const shortLen = [...shorter].reduce((sum, token) => sum + token.length, 0);
    // A one-token name has to be distinctive. "A" or "AI" must not contain every "… AI" company.
    if (extra > 0 && extra <= 2 && (shorter.size > 1 || shortLen >= 5)) return "contains";
  }
  if (isAbbrev(na, nb)) return "abbrev";
  const inter = [...ta].filter((token) => tb.has(token)).length;
  const union = new Set([...ta, ...tb]).size;
  if (!inter) return "different";
  const jaccard = union ? inter / union : 0;
  if (jaccard >= 0.5) return "similar";
  return "weak";
}

function isAbbrev(na: string, nb: string): boolean {
  const compact = (value: string) => value.replace(/ /g, "");
  const [short, long] = compact(na).length <= compact(nb).length ? [na, nb] : [nb, na];
  if (short.includes(" ") || short.length < 3 || short.length > 10) return false;
  const longTokens = long.split(" ").filter((token) => token.length > 2);
  if (longTokens.length < 2) return false;
  const initials = longTokens.map((token) => token[0]).join("");
  if (short === initials) return true;
  if (!short.startsWith(initials) || short.length > initials.length + 3) return false;
  const rest = short.slice(initials.length);
  if (rest.length < 2) return false;
  return longTokens.some((token) => token.startsWith(rest));
}

function bestRelation(a: Startup, b: Startup): NameRel {
  let best: NameRel = "different";
  for (const left of a.names) {
    for (const right of b.names) {
      const rel = nameRelation(left, right);
      if (REL_RANK[rel] > REL_RANK[best]) best = rel;
    }
  }
  return best;
}

function usableDescription(text: string | null | undefined): string {
  const cleaned = (text ?? "").replace(/\s+/g, " ").trim();
  if (cleaned.length < 40) return "";
  if (BOILERPLATE.some((re) => re.test(cleaned))) return "";
  return cleaned;
}

function contentWords(text: string): Set<string> {
  const words = text.toLowerCase().match(/[a-z]{5,}/g) ?? [];
  return new Set(words.filter((word) => !DESC_STOP.has(word)));
}

function sharedContentWords(a: string, b: string): number {
  const left = contentWords(usableDescription(a));
  const right = contentWords(usableDescription(b));
  let n = 0;
  for (const word of left) if (right.has(word)) n += 1;
  return n;
}

function descriptionSimilarity(a: string, b: string): number {
  const left = contentWords(usableDescription(a));
  const right = contentWords(usableDescription(b));
  if (left.size < 3 || right.size < 3) return 0;
  let inter = 0;
  for (const word of left) if (right.has(word)) inter += 1;
  const union = new Set([...left, ...right]).size;
  return union ? inter / union : 0;
}

function mentionsName(text: string, name: string): boolean {
  const norm = normalizeCompanyName(name);
  if (norm.length < 4) return false;
  const hay = ` ${normalizeCompanyName(text)} `;
  return hay.includes(` ${norm} `);
}

function domainsRelated(a: string, b: string): boolean {
  const stem = (host: string) => {
    const parts = host.split(".");
    return parts.length > 1 ? parts.slice(0, -1).join("") : host;
  };
  const sa = stem(a);
  const sb = stem(b);
  if (sa.length < 6 || sb.length < 6) return false;
  return sa.includes(sb) || sb.includes(sa);
}

function setsOverlap<T>(a: Set<T>, b: Set<T>): boolean {
  for (const item of a) if (b.has(item)) return true;
  return false;
}

function isFounderRole(role: string | null): boolean {
  return (role ?? "").toLowerCase().includes("founder");
}

function roleRank(role: string | null): number {
  const value = (role ?? "").toLowerCase();
  if (value.includes("founder")) return 0;
  if (value.includes("lead")) return 1;
  if (value.includes("contributor")) return 2;
  return 3;
}

class UnionFind {
  private parent = new Map<string, string>();

  add(id: string) {
    if (!this.parent.has(id)) this.parent.set(id, id);
  }

  find(id: string): string {
    this.add(id);
    let current = id;
    while (this.parent.get(current) !== current) {
      const next = this.parent.get(current)!;
      this.parent.set(current, this.parent.get(next)!);
      current = next;
    }
    return current;
  }

  union(a: string, b: string) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

function loadGraph(db: Database.Database): { startups: Startup[]; people: Person[]; founderOf: UnionFind } {
  const projectRows = db.prepare(`SELECT * FROM projects`).all() as Record<string, unknown>[];
  const peopleRows = db.prepare(`SELECT * FROM people`).all() as Record<string, unknown>[];
  const facts = db.prepare(`SELECT project_id, fact_key, value_text FROM company_facts`).all() as {
    project_id: string;
    fact_key: string;
    value_text: string;
  }[];
  const roles = db.prepare(`SELECT person_id, project_id, role FROM person_project_roles`).all() as {
    person_id: string;
    project_id: string;
    role: string | null;
  }[];
  const affs = db.prepare(`SELECT person_id, university_id FROM affiliations`).all() as {
    person_id: string;
    university_id: string;
  }[];
  const campusRels = db
    .prepare(
      `SELECT source_entity_id, target_entity_id FROM relationships
       WHERE source_entity_type = 'project' AND target_entity_type = 'university' AND relationship_type = 'affiliated_with'`,
    )
    .all() as { source_entity_id: string; target_entity_id: string }[];
  const claimCounts = new Map<string, number>();
  for (const row of db.prepare(`SELECT entity_id, COUNT(*) AS c FROM claims GROUP BY entity_id`).all() as { entity_id: string; c: number }[]) {
    claimCounts.set(row.entity_id, row.c);
  }

  const factsBy = new Map<string, { fact_key: string; value_text: string }[]>();
  for (const fact of facts) {
    const list = factsBy.get(fact.project_id) ?? [];
    list.push(fact);
    factsBy.set(fact.project_id, list);
  }
  const campusByPerson = new Map<string, Set<string>>();
  for (const aff of affs) {
    const set = campusByPerson.get(aff.person_id) ?? new Set<string>();
    set.add(aff.university_id);
    campusByPerson.set(aff.person_id, set);
  }
  const rolesByProject = new Map<string, { person_id: string; role: string | null }[]>();
  const projectsByPerson = new Map<string, Set<string>>();
  for (const role of roles) {
    const list = rolesByProject.get(role.project_id) ?? [];
    list.push(role);
    rolesByProject.set(role.project_id, list);
    const owned = projectsByPerson.get(role.person_id) ?? new Set<string>();
    owned.add(role.project_id);
    projectsByPerson.set(role.person_id, owned);
  }

  const people: Person[] = peopleRows.map((row) => {
    const aliases = parseAliases(String(row.aliases_json ?? "[]"));
    const slugs = new Set(confirmedPersonSlugs(aliases));
    const id = String(row.id);
    const claimCount = claimCounts.get(id) ?? 0;
    const roleCount = projectsByPerson.get(id)?.size ?? 0;
    const gradYear = row.enrollment_grad_year == null ? null : Number(row.enrollment_grad_year);
    let richness = claimCount + aliases.length * 2 + roleCount * 2;
    if (slugs.size) richness += 25;
    if (gradYear) richness += 8;
    if (row.enrollment_evidence) richness += 4;
    if (row.enrollment_source_url) richness += 2;
    if (row.founder_status === "founder") richness += 3;
    return {
      id,
      name: String(row.name ?? ""),
      norm: normalizePersonName(String(row.name ?? "")),
      aliases,
      slugs,
      campuses: campusByPerson.get(id) ?? new Set<string>(),
      projects: projectsByPerson.get(id) ?? new Set<string>(),
      claimCount,
      roleCount,
      enrollmentStatus: (row.enrollment_status as string | null) ?? null,
      enrollmentLabel: (row.enrollment_label as string | null) ?? null,
      enrollmentEvidence: (row.enrollment_evidence as string | null) ?? null,
      enrollmentSourceUrl: (row.enrollment_source_url as string | null) ?? null,
      enrollmentSourceId: (row.enrollment_source_id as string | null) ?? null,
      enrollmentGradYear: gradYear,
      signalTier: (row.signal_tier as string | null) ?? null,
      signalTierBasis: (row.signal_tier_basis as string | null) ?? null,
      leftSchool: Number(row.left_school ?? 0),
      founderStatus: (row.founder_status as string | null) ?? null,
      potentialSignal: (row.potential_signal as string | null) ?? null,
      richness,
    };
  });

  const founderOf = new UnionFind();
  const bySlug = new Map<string, string[]>();
  for (const person of people) {
    founderOf.add(person.id);
    for (const slug of person.slugs) {
      const list = bySlug.get(slug) ?? [];
      list.push(person.id);
      bySlug.set(slug, list);
    }
  }
  for (const ids of bySlug.values()) {
    for (let i = 1; i < ids.length; i += 1) founderOf.union(ids[0], ids[i]);
  }

  const startups: Startup[] = projectRows.map((row) => {
    const id = String(row.id);
    const name = String(row.name ?? "");
    const aliases = parseAliases(String(row.aliases_json ?? "[]"));
    const names = [name, ...aliases.filter((alias) => !alias.includes(":") && !alias.includes("://"))];
    const projectFacts = factsBy.get(id) ?? [];
    const webs = new Set<string>();
    const lis = new Set<string>();
    let investorCount = 0;
    for (const fact of projectFacts) {
      if (fact.fact_key === "website") {
        const ident = websiteIdentity(fact.value_text);
        if (ident) webs.add(ident);
      } else if (fact.fact_key === "company_linkedin") {
        const slug = linkedinCompanySlug(fact.value_text);
        if (slug) lis.add(slug);
      } else if (fact.fact_key === "investor") investorCount += 1;
    }
    const websiteUrl = (row.website_url as string | null) ?? null;
    const site = websiteIdentity(websiteUrl);
    if (site) webs.add(site);
    const linked = linkedinCompanySlug(websiteUrl) ?? linkedinCompanySlug((row.primary_link as string | null) ?? null);
    if (linked) lis.add(linked);
    const members = rolesByProject.get(id) ?? [];
    const founderIds = members.filter((member) => isFounderRole(member.role)).map((member) => member.person_id);
    const memberIds = members.map((member) => member.person_id);
    const campuses = new Set<string>();
    for (const rel of campusRels) if (rel.source_entity_id === id) campuses.add(rel.target_entity_id);
    const campusPeople = String(row.kind) === "company" ? founderIds : memberIds;
    for (const personId of campusPeople) {
      for (const campus of campusByPerson.get(personId) ?? []) campuses.add(campus);
    }
    const desc = String(row.description ?? "");
    const claimCount = claimCounts.get(id) ?? 0;
    let richness = Math.min(desc.length, 500) / 10 + projectFacts.length * 2 + claimCount + founderIds.length * 3 + investorCount * 2;
    if (webs.size) richness += 20;
    if (lis.size) richness += 15;
    if (websiteUrl && websiteIdentity(websiteUrl)) richness += 5;
    if (row.signal_tier) richness += 4;
    if (row.kind === "company") richness += 8;
    return {
      id,
      name,
      names,
      norm: normalizeCompanyName(name),
      kind: String(row.kind ?? "project"),
      desc,
      websiteUrl,
      primaryLink: (row.primary_link as string | null) ?? null,
      primaryLinkKind: (row.primary_link_kind as string | null) ?? null,
      sector: (row.sector as string | null) ?? null,
      signalTier: (row.signal_tier as string | null) ?? null,
      signalTierBasis: (row.signal_tier_basis as string | null) ?? null,
      portfolio: Number(row.is_portfolio_reference ?? 0),
      investable: Number(row.is_investable_candidate ?? 1),
      webs,
      lis,
      founderIds,
      memberIds,
      campuses,
      factCount: projectFacts.length,
      claimCount,
      investorCount,
      richness,
    };
  });

  stripHubDomains(startups);
  return { startups, people, founderOf };
}

function stripHubDomains(startups: Startup[]) {
  const byWeb = new Map<string, Startup[]>();
  for (const startup of startups) {
    for (const web of startup.webs) {
      const list = byWeb.get(web) ?? [];
      list.push(startup);
      byWeb.set(web, list);
    }
  }
  for (const [web, list] of byWeb) {
    const names = new Set(list.map((startup) => startup.norm).filter(Boolean));
    if (names.size >= 3) {
      for (const startup of list) startup.webs.delete(web);
    }
  }
}

function identityIds(startup: Startup): string[] {
  return startup.kind === "company" ? startup.founderIds : startup.memberIds;
}

function sharesFounder(a: Startup, b: Startup, founders: UnionFind): boolean {
  const left = new Set(identityIds(a).map((id) => founders.find(id)));
  for (const id of identityIds(b)) {
    if (left.has(founders.find(id))) return true;
  }
  return false;
}

interface PairDecision {
  decision: "merge" | "ambiguous" | "skip";
  reason: string;
}

function decideStartups(a: Startup, b: Startup, founders: UnionFind): PairDecision {
  const rel = bestRelation(a, b);
  const sameWeb = setsOverlap(a.webs, b.webs);
  const webConflict = a.webs.size > 0 && b.webs.size > 0 && !sameWeb;
  const relatedWeb =
    webConflict && [...a.webs].some((left) => [...b.webs].some((right) => domainsRelated(left, right)));
  const sameLi = setsOverlap(a.lis, b.lis);
  const liConflict = a.lis.size > 0 && b.lis.size > 0 && !sameLi;
  const founder = sharesFounder(a, b, founders);
  const sameCampus = setsOverlap(a.campuses, b.campuses);
  const words = sharedContentWords(a.desc, b.desc);
  const sim = descriptionSimilarity(a.desc, b.desc);
  const mentioned = mentionsName(a.desc, b.name) || mentionsName(b.desc, a.name);
  const bothProjects = a.kind === "project" && b.kind === "project";
  const usableA = usableDescription(a.desc);
  const usableB = usableDescription(b.desc);
  const unrelatedWeb = webConflict && !relatedWeb;

  if (bothProjects && (rel === "similar" || rel === "weak" || rel === "different") && !sameWeb && !sameLi) {
    return { decision: "skip", reason: "" };
  }

  const why: string[] = [];
  let merge = false;
  const closeName = rel === "exact" || rel === "contains" || rel === "abbrev" || rel === "similar";
  if (sameLi && !liConflict && closeName && !unrelatedWeb) {
    merge = true;
    why.push("same LinkedIn company URL");
  }
  if (sameWeb && !liConflict && (rel === "exact" || rel === "contains" || rel === "similar" || rel === "abbrev")) {
    merge = true;
    why.push("same website");
  }
  if (sameWeb && founder && !liConflict) {
    merge = true;
    why.push("same website and shared founder");
  }
  if (sameWeb && mentioned && !liConflict) {
    merge = true;
    why.push("same website and one description names the other");
  }
  if (sameWeb && sameCampus && !liConflict && !usableA && !usableB) {
    merge = true;
    why.push("same website and no conflicting product description");
  }
  if (rel === "exact" && founder && !liConflict && !unrelatedWeb) {
    merge = true;
    why.push("same normalized name and shared founder");
  }
  if (rel === "exact" && sameCampus && sim >= 0.34 && !liConflict && !webConflict) {
    merge = true;
    why.push("same name, campus, and description");
  }
  if ((rel === "contains" || rel === "abbrev") && founder && !liConflict && !unrelatedWeb) {
    merge = true;
    why.push("name variant and shared founder");
  }
  if ((rel === "contains" || rel === "abbrev" || rel === "similar") && sameCampus && words >= 3 && !liConflict && !webConflict && !bothProjects) {
    merge = true;
    why.push("name variant, same campus, and overlapping description");
  }
  if (bothProjects && !sameWeb && !sameLi) merge = false;
  if (liConflict) merge = false;
  if (merge) return { decision: "merge", reason: [...new Set(why)].join("; ") };

  const worth =
    rel === "exact" ||
    sameLi ||
    sameWeb ||
    ((rel === "contains" || rel === "abbrev") && (sameCampus || founder || sameWeb));
  if (!worth) return { decision: "skip", reason: "" };
  return { decision: "ambiguous", reason: ambiguousStartupReason({ rel, sameWeb, webConflict, relatedWeb, sameLi, liConflict, founder, sameCampus, bothProjects }) };
}

function ambiguousStartupReason(flags: {
  rel: NameRel;
  sameWeb: boolean;
  webConflict: boolean;
  relatedWeb: boolean;
  sameLi: boolean;
  liConflict: boolean;
  founder: boolean;
  sameCampus: boolean;
  bothProjects: boolean;
}): string {
  if (flags.liConflict) return "LinkedIn company URLs disagree";
  if (flags.webConflict && !flags.relatedWeb && flags.rel === "exact") return "same name with unrelated websites";
  if (flags.webConflict && !flags.relatedWeb) return "unrelated websites";
  if (flags.webConflict && flags.relatedWeb && !flags.founder) return "related domains but no shared founder";
  if (flags.rel === "exact" && flags.bothProjects) return "same project name without a shared company website";
  if (flags.rel === "exact" && !flags.sameCampus) return "same name on different campuses, with no shared website, LinkedIn, or founder";
  if (flags.rel === "exact") return "same name without a shared founder, website, or overlapping description";
  if ((flags.rel === "contains" || flags.rel === "abbrev") && flags.sameCampus) return "name variant on the same campus without a shared founder, website, or product description";
  if (flags.sameWeb && flags.rel === "different") return "shared website but the names look like different products";
  if (flags.sameLi) return "shared LinkedIn company URL but the names disagree";
  return "partial overlap, not enough to merge";
}

function personNameCompatible(a: string, b: string): boolean {
  const rel = nameRelation(a, b);
  return rel === "exact" || rel === "contains" || rel === "abbrev";
}

export function planDedupe(db: Database.Database): DedupePlan {
  const { startups, people, founderOf } = loadGraph(db);
  const byId = new Map(startups.map((startup) => [startup.id, startup]));
  const peopleById = new Map(people.map((person) => [person.id, person]));

  const pairKey = (a: string, b: string) => (a < b ? `${a}\0${b}` : `${b}\0${a}`);
  const seen = new Set<string>();
  const startupEdges: { a: string; b: string; reason: string }[] = [];
  const ambiguous: AmbiguousPair[] = [];

  const consider = (left: Startup, right: Startup) => {
    if (left.id === right.id) return;
    const key = pairKey(left.id, right.id);
    if (seen.has(key)) return;
    seen.add(key);
    const decision = decideStartups(left, right, founderOf);
    if (decision.decision === "merge") startupEdges.push({ a: left.id, b: right.id, reason: decision.reason });
    else if (decision.decision === "ambiguous") {
      const [a, b] = left.name.localeCompare(right.name) <= 0 ? [left, right] : [right, left];
      ambiguous.push({
        entityType: "project",
        leftId: a.id,
        leftName: a.name,
        rightId: b.id,
        rightName: b.name,
        detail: decision.reason,
      });
    }
  };

  const buckets = new Map<string, string[]>();
  const addBucket = (key: string, id: string) => {
    const list = buckets.get(key) ?? [];
    list.push(id);
    buckets.set(key, list);
  };
  for (const startup of startups) {
    if (startup.norm) addBucket(`name:${startup.norm}`, startup.id);
    for (const web of startup.webs) addBucket(`web:${web}`, startup.id);
    for (const slug of startup.lis) addBucket(`li:${slug}`, startup.id);
    for (const personId of identityIds(startup)) addBucket(`founder:${founderOf.find(personId)}`, startup.id);
  }
  for (const ids of buckets.values()) {
    const unique = [...new Set(ids)];
    if (unique.length < 2 || unique.length > 80) continue;
    for (let i = 0; i < unique.length; i += 1) {
      for (let j = i + 1; j < unique.length; j += 1) consider(byId.get(unique[i])!, byId.get(unique[j])!);
    }
  }
  const byCampus = new Map<string, Startup[]>();
  for (const startup of startups) {
    for (const campus of startup.campuses) {
      const list = byCampus.get(campus) ?? [];
      list.push(startup);
      byCampus.set(campus, list);
    }
  }
  for (const list of byCampus.values()) {
    if (list.length > 2500) continue;
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        const rel = bestRelation(list[i], list[j]);
        if (rel === "contains" || rel === "abbrev") consider(list[i], list[j]);
      }
    }
  }

  const startupUf = new UnionFind();
  for (const startup of startups) startupUf.add(startup.id);
  for (const edge of startupEdges) startupUf.union(edge.a, edge.b);
  const startupGroups = clusterGroups(startupUf, startups.map((startup) => startup.id));

  const startupMerges: MergeGroup[] = [];
  const mergedStartup = new Set<string>();
  for (const members of startupGroups) {
    if (members.length < 2) continue;
    const rows = members.map((id) => byId.get(id)!).filter(Boolean);
    if (rows.length > 4) {
      for (let i = 0; i < rows.length; i += 1) {
        for (let j = i + 1; j < rows.length; j += 1) {
          ambiguous.push({
            entityType: "project",
            leftId: rows[i].id,
            leftName: rows[i].name,
            rightId: rows[j].id,
            rightName: rows[j].name,
            detail: "part of a large cluster; left unmerged rather than collapse distinct records",
          });
        }
      }
      continue;
    }
    const companies = rows.filter((row) => row.kind === "company");
    const pool = companies.length ? companies : rows;
    const survivor = [...pool].sort((a, b) => b.richness - a.richness || b.desc.length - a.desc.length || a.id.localeCompare(b.id))[0];
    const reasons = startupEdges
      .filter((edge) => startupUf.find(edge.a) === startupUf.find(survivor.id))
      .map((edge) => edge.reason);
    for (const row of rows) mergedStartup.add(row.id);
    startupMerges.push({
      entityType: "project",
      survivorId: survivor.id,
      survivorName: survivor.name,
      drop: rows.filter((row) => row.id !== survivor.id).map((row) => ({ id: row.id, name: row.name })),
      reason: [...new Set(reasons)].join("; ") || "strong identity overlap",
    });
  }

  const clusterOf = (projectId: string) => {
    if (!mergedStartup.has(projectId)) return projectId;
    return startupUf.find(projectId);
  };
  const sharesStartup = (a: Person, b: Person) => {
    const clusters = new Set([...a.projects].map(clusterOf));
    for (const projectId of b.projects) if (clusters.has(clusterOf(projectId))) return true;
    return false;
  };

  const peopleUf = new UnionFind();
  for (const person of people) peopleUf.add(person.id);
  const peopleEdges: { a: string; b: string; reason: string }[] = [];
  const peopleSeen = new Set<string>();
  const considerPeople = (a: Person, b: Person) => {
    if (a.id === b.id) return;
    const key = pairKey(a.id, b.id);
    if (peopleSeen.has(key)) return;
    peopleSeen.add(key);
    const sameSlug = setsOverlap(a.slugs, b.slugs);
    const slugConflict = a.slugs.size > 0 && b.slugs.size > 0 && !sameSlug;
    const sameName = a.norm.length > 0 && a.norm === b.norm;
    const sameCampus = setsOverlap(a.campuses, b.campuses);
    const sameStartup = sharesStartup(a, b);
    if (sameSlug && personNameCompatible(a.name, b.name)) {
      peopleEdges.push({ a: a.id, b: b.id, reason: "same LinkedIn profile URL" });
      peopleUf.union(a.id, b.id);
      return;
    }
    if (sameSlug && !personNameCompatible(a.name, b.name)) {
      ambiguous.push({
        entityType: "person",
        leftId: a.id,
        leftName: a.name,
        rightId: b.id,
        rightName: b.name,
        detail: "same LinkedIn profile URL but the names do not match",
      });
      return;
    }
    if (sameName && sameCampus && sameStartup && slugConflict) {
      ambiguous.push({
        entityType: "person",
        leftId: a.id,
        leftName: a.name,
        rightId: b.id,
        rightName: b.name,
        detail: "same name, campus, and startup, but confirmed LinkedIn URLs disagree",
      });
      return;
    }
    if (sameName && sameCampus && sameStartup && !slugConflict) {
      peopleEdges.push({ a: a.id, b: b.id, reason: "same name, campus, and startup" });
      peopleUf.union(a.id, b.id);
    }
  };

  const peopleBuckets = new Map<string, Person[]>();
  const addPerson = (key: string, person: Person) => {
    const list = peopleBuckets.get(key) ?? [];
    list.push(person);
    peopleBuckets.set(key, list);
  };
  for (const person of people) {
    if (person.norm) addPerson(`name:${person.norm}`, person);
    for (const slug of person.slugs) addPerson(`li:${slug}`, person);
  }
  for (const list of peopleBuckets.values()) {
    const unique = [...new Map(list.map((person) => [person.id, person])).values()];
    if (unique.length < 2 || unique.length > 20) continue;
    for (let i = 0; i < unique.length; i += 1) {
      for (let j = i + 1; j < unique.length; j += 1) considerPeople(unique[i], unique[j]);
    }
  }

  const peopleMerges: MergeGroup[] = [];
  const mergedPeople = new Set<string>();
  for (const members of clusterGroups(peopleUf, people.map((person) => person.id))) {
    if (members.length < 2) continue;
    if (members.length > 4) {
      for (let i = 0; i < members.length; i += 1) {
        for (let j = i + 1; j < members.length; j += 1) {
          const a = peopleById.get(members[i])!;
          const b = peopleById.get(members[j])!;
          ambiguous.push({
            entityType: "person",
            leftId: a.id,
            leftName: a.name,
            rightId: b.id,
            rightName: b.name,
            detail: "part of a large same-name cluster; left unmerged",
          });
        }
      }
      continue;
    }
    const rows = members.map((id) => peopleById.get(id)!);
    const survivor = [...rows].sort((a, b) => b.richness - a.richness || a.id.localeCompare(b.id))[0];
    const reasons = peopleEdges.filter((edge) => peopleUf.find(edge.a) === peopleUf.find(survivor.id)).map((edge) => edge.reason);
    for (const row of rows) mergedPeople.add(row.id);
    peopleMerges.push({
      entityType: "person",
      survivorId: survivor.id,
      survivorName: survivor.name,
      drop: rows.filter((row) => row.id !== survivor.id).map((row) => ({ id: row.id, name: row.name })),
      reason: [...new Set(reasons)].join("; ") || "same person",
    });
  }

  noteUnverifiedLinkedIn(db, people, mergedPeople, ambiguous);

  const ambiguousSeen = new Set<string>();
  const ambiguousUnique = ambiguous.filter((pair) => {
    if (pair.entityType === "project" && mergedStartup.has(pair.leftId) && mergedStartup.has(pair.rightId) && startupUf.find(pair.leftId) === startupUf.find(pair.rightId)) {
      return false;
    }
    const key = `${pair.entityType}:${pairKey(pair.leftId, pair.rightId)}`;
    if (ambiguousSeen.has(key)) return false;
    ambiguousSeen.add(key);
    return true;
  });
  ambiguousUnique.sort((a, b) => a.entityType.localeCompare(b.entityType) || a.leftName.localeCompare(b.leftName) || a.rightName.localeCompare(b.rightName) || a.leftId.localeCompare(b.leftId));
  startupMerges.sort((a, b) => a.survivorName.localeCompare(b.survivorName) || a.survivorId.localeCompare(b.survivorId));
  peopleMerges.sort((a, b) => a.survivorName.localeCompare(b.survivorName) || a.survivorId.localeCompare(b.survivorId));
  return { startupMerges, peopleMerges, ambiguous: ambiguousUnique };
}

function noteUnverifiedLinkedIn(db: Database.Database, people: Person[], merged: Set<string>, ambiguous: AmbiguousPair[]) {
  const bySlug = new Map<string, Person>();
  for (const person of people) {
    for (const slug of person.slugs) if (!bySlug.has(slug)) bySlug.set(slug, person);
  }
  const rows = db
    .prepare(
      `SELECT entity_id, value_json FROM claims
       WHERE entity_type = 'person' AND claim_type = 'linkedin_candidate' AND verification_state = 'unverified'`,
    )
    .all() as { entity_id: string; value_json: string }[];
  const peopleById = new Map(people.map((person) => [person.id, person]));
  const seen = new Set<string>();
  for (const row of rows) {
    let url = "";
    try {
      url = String((JSON.parse(row.value_json) as { linkedin?: string }).linkedin ?? "");
    } catch {
      continue;
    }
    const slug = linkedinPersonSlug(url);
    if (!slug) continue;
    const confirmed = bySlug.get(slug);
    const candidate = peopleById.get(row.entity_id);
    if (!confirmed || !candidate || confirmed.id === candidate.id) continue;
    if (confirmed.norm !== candidate.norm || !confirmed.norm) continue;
    if (!setsOverlap(confirmed.campuses, candidate.campuses)) continue;
    if (merged.has(confirmed.id) && merged.has(candidate.id)) continue;
    const key = confirmed.id < candidate.id ? `${confirmed.id}:${candidate.id}` : `${candidate.id}:${confirmed.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    ambiguous.push({
      entityType: "person",
      leftId: confirmed.id,
      leftName: confirmed.name,
      rightId: candidate.id,
      rightName: candidate.name,
      detail: "same name and campus, and an unverified LinkedIn candidate points at the other's confirmed profile; startups differ, so they were not merged",
    });
  }
}

function clusterGroups(uf: UnionFind, ids: string[]): string[][] {
  const groups = new Map<string, string[]>();
  for (const id of ids) {
    const root = uf.find(id);
    const list = groups.get(root) ?? [];
    list.push(id);
    groups.set(root, list);
  }
  return [...groups.values()];
}

export function mergedAwayCounts(plan: DedupePlan): { startups: number; people: number } {
  return {
    startups: plan.startupMerges.reduce((sum, group) => sum + group.drop.length, 0),
    people: plan.peopleMerges.reduce((sum, group) => sum + group.drop.length, 0),
  };
}

export function formatDedupePlan(plan: DedupePlan): string {
  const lines: string[] = [];
  const counts = mergedAwayCounts(plan);
  lines.push(`Proposed startup rows to merge away: ${counts.startups} across ${plan.startupMerges.length} companies`);
  for (const group of plan.startupMerges) {
    lines.push(`MERGE startup → ${group.survivorName} (${group.survivorId})`);
    for (const drop of group.drop) lines.push(`  drop ${drop.name} (${drop.id})`);
    lines.push(`  why: ${group.reason}`);
  }
  lines.push(`Proposed people to merge away: ${counts.people} across ${plan.peopleMerges.length} people`);
  for (const group of plan.peopleMerges) {
    lines.push(`MERGE person → ${group.survivorName} (${group.survivorId})`);
    for (const drop of group.drop) lines.push(`  drop ${drop.name} (${drop.id})`);
    lines.push(`  why: ${group.reason}`);
  }
  lines.push(`Ambiguous pairs left unmerged: ${plan.ambiguous.length}`);
  for (const pair of plan.ambiguous) {
    lines.push(`AMBIGUOUS ${pair.entityType}: ${pair.leftName} (${pair.leftId})  |  ${pair.rightName} (${pair.rightId})`);
    lines.push(`  ${pair.detail}`);
  }
  return lines.join("\n");
}

export function applyDedupe(db: Database.Database, plan: DedupePlan): void {
  db.pragma("foreign_keys = ON");
  const run = db.transaction(() => {
    for (const group of plan.peopleMerges) {
      for (const drop of group.drop) absorbPerson(db, group.survivorId, drop.id, `${group.reason} Merged duplicate person "${drop.name}".`);
    }
    for (const group of plan.startupMerges) {
      for (const drop of group.drop) absorbProject(db, group.survivorId, drop.id, `${group.reason} Merged duplicate startup "${drop.name}".`);
    }
  });
  run();
}

function absorbPerson(db: Database.Database, survivorId: string, dropId: string, reason: string) {
  if (survivorId === dropId) return;
  const survivor = db.prepare(`SELECT * FROM people WHERE id = ?`).get(survivorId) as Record<string, unknown> | undefined;
  const dropped = db.prepare(`SELECT * FROM people WHERE id = ?`).get(dropId) as Record<string, unknown> | undefined;
  if (!survivor || !dropped) return;

  const aliases = uniqueStrings([
    ...parseAliases(String(survivor.aliases_json ?? "[]")),
    ...parseAliases(String(dropped.aliases_json ?? "[]")),
    String(dropped.name ?? ""),
  ]);
  const enrollment = pickEnrollment(survivor, dropped);
  const tier = preferSignalTier(survivor.signal_tier as string | null, dropped.signal_tier as string | null);
  const basis =
    tier && tier === dropped.signal_tier && tier !== survivor.signal_tier
      ? (dropped.signal_tier_basis as string | null)
      : (survivor.signal_tier_basis as string | null);
  const founderStatus = pickFounderStatus(survivor.founder_status as string | null, dropped.founder_status as string | null);
  db.prepare(
    `UPDATE people SET aliases_json = ?, enrollment_status = ?, enrollment_label = ?, enrollment_evidence = ?,
      enrollment_source_url = ?, enrollment_source_id = ?, enrollment_grad_year = ?, signal_tier = ?, signal_tier_basis = ?,
      left_school = ?, founder_status = ?, potential_signal = ? WHERE id = ?`,
  ).run(
    JSON.stringify(aliases.filter((alias) => alias !== survivor.name)),
    enrollment.status,
    enrollment.label,
    enrollment.evidence,
    enrollment.sourceUrl,
    enrollment.sourceId,
    enrollment.gradYear,
    tier,
    basis,
    Math.max(Number(survivor.left_school ?? 0), Number(dropped.left_school ?? 0)),
    founderStatus,
    (survivor.potential_signal as string | null) || (dropped.potential_signal as string | null),
    survivorId,
  );

  moveAffiliations(db, dropId, survivorId);
  movePersonRoles(db, dropId, survivorId);
  db.prepare(`UPDATE claims SET entity_id = ? WHERE entity_type = 'person' AND entity_id = ?`).run(survivorId, dropId);
  const droppedSignals = db.prepare(`SELECT id, signal_type, year, source_url FROM precollege_signals WHERE person_id = ?`).all(dropId) as {
    id: string;
    signal_type: string;
    year: number | null;
    source_url: string;
  }[];
  for (const signal of droppedSignals) {
    const clash = db
      .prepare(
        `SELECT id FROM precollege_signals WHERE person_id = ? AND signal_type = ? AND IFNULL(year, 0) = IFNULL(?, 0) AND source_url = ?`
      )
      .get(survivorId, signal.signal_type, signal.year, signal.source_url) as { id: string } | undefined;
    if (clash) db.prepare(`DELETE FROM precollege_signals WHERE id = ?`).run(signal.id);
    else db.prepare(`UPDATE precollege_signals SET person_id = ? WHERE id = ?`).run(survivorId, signal.id);
  }
  const droppedPrograms = db.prepare(`SELECT id, signal_type, year, source_url FROM program_signals WHERE person_id = ?`).all(dropId) as {
    id: string;
    signal_type: string;
    year: number | null;
    source_url: string;
  }[];
  for (const signal of droppedPrograms) {
    const clash = db
      .prepare(
        `SELECT id FROM program_signals WHERE person_id = ? AND signal_type = ? AND IFNULL(year, 0) = IFNULL(?, 0) AND source_url = ?`
      )
      .get(survivorId, signal.signal_type, signal.year, signal.source_url) as { id: string } | undefined;
    if (clash) db.prepare(`DELETE FROM program_signals WHERE id = ?`).run(signal.id);
    else db.prepare(`UPDATE program_signals SET person_id = ? WHERE id = ?`).run(survivorId, signal.id);
  }
  retargetRelationships(db, "person", dropId, survivorId);
  db.prepare(`UPDATE notes SET entity_id = ? WHERE entity_id = ?`).run(survivorId, dropId);
  db.prepare(`UPDATE possible_companies SET person_id = ? WHERE person_id = ?`).run(survivorId, dropId);
  rememberRedirect(db, dropId, "person", survivorId, reason);
  db.prepare(`DELETE FROM people WHERE id = ?`).run(dropId);
}

export function mergeRecordedPair(
  db: Database.Database,
  entityType: "person" | "project",
  survivorId: string,
  dropId: string,
  reason: string,
): boolean {
  if (survivorId === dropId) return false;
  const table = entityType === "person" ? "people" : "projects";
  const survivor = db.prepare(`SELECT id FROM ${table} WHERE id = ?`).get(survivorId);
  const dropped = db.prepare(`SELECT id FROM ${table} WHERE id = ?`).get(dropId);
  if (!survivor || !dropped) return false;
  const run = db.transaction(() => {
    if (entityType === "person") absorbPerson(db, survivorId, dropId, reason);
    else absorbProject(db, survivorId, dropId, reason);
  });
  run();
  return true;
}

function pickFounderStatus(a: string | null, b: string | null): string | null {
  if (a === "founder" || b === "founder") return "founder";
  if (a === "potential" || b === "potential") return "potential";
  return a || b || null;
}

function pickEnrollment(survivor: Record<string, unknown>, dropped: Record<string, unknown>) {
  const sYear = survivor.enrollment_grad_year == null ? null : Number(survivor.enrollment_grad_year);
  const dYear = dropped.enrollment_grad_year == null ? null : Number(dropped.enrollment_grad_year);
  if (sYear && dYear && sYear !== dYear) {
    return {
      status: (survivor.enrollment_status as string | null) ?? null,
      label: (survivor.enrollment_label as string | null) ?? null,
      evidence: (survivor.enrollment_evidence as string | null) ?? null,
      sourceUrl: (survivor.enrollment_source_url as string | null) ?? null,
      sourceId: (survivor.enrollment_source_id as string | null) ?? null,
      gradYear: sYear,
    };
  }
  const source = !sYear && dYear ? dropped : survivor;
  const fill = source === survivor ? dropped : survivor;
  return {
    status: (source.enrollment_status as string | null) || (fill.enrollment_status as string | null),
    label: (source.enrollment_label as string | null) || (fill.enrollment_label as string | null),
    evidence: (source.enrollment_evidence as string | null) || (fill.enrollment_evidence as string | null),
    sourceUrl: (source.enrollment_source_url as string | null) || (fill.enrollment_source_url as string | null),
    sourceId: (source.enrollment_source_id as string | null) || (fill.enrollment_source_id as string | null),
    gradYear: (source.enrollment_grad_year as number | null) ?? (fill.enrollment_grad_year as number | null) ?? null,
  };
}

function moveAffiliations(db: Database.Database, from: string, to: string) {
  const rows = db.prepare(`SELECT * FROM affiliations WHERE person_id = ?`).all(from) as Record<string, unknown>[];
  for (const row of rows) {
    const existing = db
      .prepare(`SELECT * FROM affiliations WHERE person_id = ? AND university_id = ? AND id != ?`)
      .get(to, row.university_id, row.id) as Record<string, unknown> | undefined;
    if (!existing) {
      db.prepare(`UPDATE affiliations SET person_id = ? WHERE id = ?`).run(to, row.id);
      continue;
    }
    const sameRole = (existing.role ?? null) === (row.role ?? null) || !existing.role || !row.role;
    if (!sameRole) {
      db.prepare(`UPDATE affiliations SET person_id = ? WHERE id = ?`).run(to, row.id);
      continue;
    }
    if ((!existing.status || existing.status === "unverified") && row.status && row.status !== "unverified") {
      db.prepare(`UPDATE affiliations SET status = ?, role = COALESCE(role, ?), claim_id = COALESCE(claim_id, ?) WHERE id = ?`).run(
        row.status,
        row.role,
        row.claim_id,
        existing.id,
      );
    } else if (!existing.claim_id && row.claim_id) {
      db.prepare(`UPDATE affiliations SET claim_id = ? WHERE id = ?`).run(row.claim_id, existing.id);
    }
    db.prepare(`DELETE FROM affiliations WHERE id = ?`).run(row.id);
  }
}

function movePersonRoles(db: Database.Database, fromPerson: string, toPerson: string) {
  const rows = db.prepare(`SELECT * FROM person_project_roles WHERE person_id = ?`).all(fromPerson) as Record<string, unknown>[];
  for (const row of rows) {
    const existing = db
      .prepare(`SELECT * FROM person_project_roles WHERE person_id = ? AND project_id = ? AND id != ?`)
      .get(toPerson, row.project_id, row.id) as Record<string, unknown> | undefined;
    if (!existing) {
      db.prepare(`UPDATE person_project_roles SET person_id = ? WHERE id = ?`).run(toPerson, row.id);
      continue;
    }
    if (roleRank(row.role as string | null) < roleRank(existing.role as string | null)) {
      db.prepare(`UPDATE person_project_roles SET role = ? WHERE id = ?`).run(row.role, existing.id);
    }
    if (!existing.claim_id && row.claim_id) {
      db.prepare(`UPDATE person_project_roles SET claim_id = ? WHERE id = ?`).run(row.claim_id, existing.id);
    }
    db.prepare(`DELETE FROM person_project_roles WHERE id = ?`).run(row.id);
  }
}

function absorbProject(db: Database.Database, survivorId: string, dropId: string, reason: string) {
  if (survivorId === dropId) return;
  const survivor = db.prepare(`SELECT * FROM projects WHERE id = ?`).get(survivorId) as Record<string, unknown> | undefined;
  const dropped = db.prepare(`SELECT * FROM projects WHERE id = ?`).get(dropId) as Record<string, unknown> | undefined;
  if (!survivor || !dropped) return;

  const aliases = uniqueStrings([
    ...parseAliases(String(survivor.aliases_json ?? "[]")),
    ...parseAliases(String(dropped.aliases_json ?? "[]")),
    String(dropped.name ?? ""),
  ]).filter((alias) => alias !== survivor.name);
  const description = pickDescription(String(survivor.description ?? ""), String(dropped.description ?? ""));
  const website = pickWebsite((survivor.website_url as string | null) ?? null, (dropped.website_url as string | null) ?? null);
  let primary = (survivor.primary_link as string | null) || null;
  let primaryKind = (survivor.primary_link_kind as string | null) || null;
  if (!primary) {
    primary = (dropped.primary_link as string | null) || null;
    primaryKind = (dropped.primary_link_kind as string | null) || (primary ? linkKind(primary).kind : null);
  }
  if (!primary && dropped.website_url && dropped.website_url !== website) {
    primary = String(dropped.website_url);
    primaryKind = linkKind(primary).kind;
  }
  const tier = preferSignalTier(survivor.signal_tier as string | null, dropped.signal_tier as string | null);
  const basis =
    tier && tier === dropped.signal_tier && tier !== survivor.signal_tier
      ? (dropped.signal_tier_basis as string | null)
      : (survivor.signal_tier_basis as string | null);
  const kind = survivor.kind === "company" || dropped.kind === "company" ? "company" : survivor.kind;
  db.prepare(
    `UPDATE projects SET aliases_json = ?, kind = ?, sector = ?, description = ?, website_url = ?, primary_link = ?,
      primary_link_kind = ?, is_portfolio_reference = ?, is_investable_candidate = ?, signal_tier = ?, signal_tier_basis = ?,
      updated_at = ? WHERE id = ?`,
  ).run(
    JSON.stringify(aliases),
    kind,
    (survivor.sector as string | null) || (dropped.sector as string | null),
    description,
    website,
    primary,
    primaryKind,
    Math.max(Number(survivor.is_portfolio_reference ?? 0), Number(dropped.is_portfolio_reference ?? 0)),
    Math.max(Number(survivor.is_investable_candidate ?? 0), Number(dropped.is_investable_candidate ?? 0)),
    tier,
    basis,
    nowIso(),
    survivorId,
  );

  moveProjectRoles(db, dropId, survivorId);
  moveSectorTags(db, dropId, survivorId);
  moveFacts(db, dropId, survivorId);
  moveFunding(db, dropId, survivorId);
  db.prepare(`UPDATE signals SET project_id = ? WHERE project_id = ?`).run(survivorId, dropId);
  db.prepare(`UPDATE portfolio_memberships SET project_id = ? WHERE project_id = ?`).run(survivorId, dropId);
  db.prepare(`UPDATE assessments SET project_id = ? WHERE project_id = ?`).run(survivorId, dropId);
  db.prepare(`UPDATE possible_companies SET confirmed_project_id = ? WHERE confirmed_project_id = ?`).run(survivorId, dropId);
  moveGates(db, dropId, survivorId);
  movePipeline(db, dropId, survivorId);
  db.prepare(`UPDATE claims SET entity_id = ? WHERE entity_type = 'project' AND entity_id = ?`).run(survivorId, dropId);
  retargetRelationships(db, "project", dropId, survivorId);
  db.prepare(`UPDATE notes SET entity_id = ? WHERE entity_id = ?`).run(survivorId, dropId);
  rememberRedirect(db, dropId, "project", survivorId, reason);
  db.prepare(`DELETE FROM projects WHERE id = ?`).run(dropId);
}

function pickDescription(survivor: string, dropped: string): string {
  const s = survivor.trim();
  const d = dropped.trim();
  if (!s) return d;
  if (!d) return s;
  const su = usableDescription(s);
  const du = usableDescription(d);
  if (!su && du) return d;
  if (su && !du) return s;
  if (du.length > su.length + 40) return d;
  return s;
}

function pickWebsite(survivor: string | null, dropped: string | null): string | null {
  const s = survivor?.trim() || null;
  const d = dropped?.trim() || null;
  if (s && websiteIdentity(s)) return s;
  if (d && websiteIdentity(d)) return d;
  return s || d;
}

function moveProjectRoles(db: Database.Database, from: string, to: string) {
  const rows = db.prepare(`SELECT * FROM person_project_roles WHERE project_id = ?`).all(from) as Record<string, unknown>[];
  for (const row of rows) {
    const existing = db
      .prepare(`SELECT * FROM person_project_roles WHERE person_id = ? AND project_id = ? AND id != ?`)
      .get(row.person_id, to, row.id) as Record<string, unknown> | undefined;
    if (!existing) {
      db.prepare(`UPDATE person_project_roles SET project_id = ? WHERE id = ?`).run(to, row.id);
      continue;
    }
    if (roleRank(row.role as string | null) < roleRank(existing.role as string | null)) {
      db.prepare(`UPDATE person_project_roles SET role = ? WHERE id = ?`).run(row.role, existing.id);
    }
    if (!existing.claim_id && row.claim_id) {
      db.prepare(`UPDATE person_project_roles SET claim_id = ? WHERE id = ?`).run(row.claim_id, existing.id);
    }
    db.prepare(`DELETE FROM person_project_roles WHERE id = ?`).run(row.id);
  }
}

function moveSectorTags(db: Database.Database, from: string, to: string) {
  const rows = db.prepare(`SELECT * FROM project_sector_tags WHERE project_id = ?`).all(from) as Record<string, unknown>[];
  for (const row of rows) {
    const existing = db.prepare(`SELECT * FROM project_sector_tags WHERE project_id = ? AND tag = ?`).get(to, row.tag) as Record<string, unknown> | undefined;
    if (!existing) {
      db.prepare(`UPDATE project_sector_tags SET project_id = ? WHERE id = ?`).run(to, row.id);
      continue;
    }
    const excerpt = String(existing.excerpt ?? "");
    const extra = String(row.excerpt ?? "");
    if (extra && !excerpt.includes(extra)) {
      db.prepare(`UPDATE project_sector_tags SET excerpt = ? WHERE id = ?`).run(`${excerpt}\n${extra}`.trim().slice(0, 2000), existing.id);
    }
    if (!existing.source_url && row.source_url) {
      db.prepare(`UPDATE project_sector_tags SET source_url = ? WHERE id = ?`).run(row.source_url, existing.id);
    }
    db.prepare(`DELETE FROM project_sector_tags WHERE id = ?`).run(row.id);
  }
}

function moveFacts(db: Database.Database, from: string, to: string) {
  db.prepare(`UPDATE company_facts SET project_id = ? WHERE project_id = ?`).run(to, from);
  const rows = db.prepare(`SELECT id, fact_key, value_text, source_url FROM company_facts WHERE project_id = ? ORDER BY rowid`).all(to) as {
    id: string;
    fact_key: string;
    value_text: string;
    source_url: string;
  }[];
  const seen = new Set<string>();
  for (const row of rows) {
    const key = `${row.fact_key}\0${row.value_text.trim().toLowerCase()}\0${row.source_url}`;
    if (seen.has(key)) db.prepare(`DELETE FROM company_facts WHERE id = ?`).run(row.id);
    else seen.add(key);
  }
}

function moveFunding(db: Database.Database, from: string, to: string) {
  const rows = db.prepare(`SELECT * FROM funding_events WHERE project_id = ?`).all(from) as Record<string, unknown>[];
  for (const row of rows) {
    const clash = db.prepare(`SELECT id FROM funding_events WHERE dedupe_key = ? AND id != ?`).get(row.dedupe_key, row.id) as { id: string } | undefined;
    if (clash) {
      db.prepare(`DELETE FROM funding_events WHERE id = ?`).run(row.id);
      continue;
    }
    db.prepare(`UPDATE funding_events SET project_id = ? WHERE id = ?`).run(to, row.id);
  }
  const kept = db.prepare(`SELECT * FROM funding_events WHERE project_id = ? ORDER BY rowid`).all(to) as Record<string, unknown>[];
  const seen = new Set<string>();
  for (const row of kept) {
    if (row.amount == null && !row.event_date && !row.instrument) continue;
    const key = `${row.amount ?? ""}\0${row.currency ?? ""}\0${row.instrument ?? ""}\0${row.event_date ?? ""}`;
    if (seen.has(key)) db.prepare(`DELETE FROM funding_events WHERE id = ?`).run(row.id);
    else seen.add(key);
  }
}

function moveGates(db: Database.Database, from: string, to: string) {
  const rows = db.prepare(`SELECT * FROM gate_results WHERE project_id = ?`).all(from) as Record<string, unknown>[];
  for (const row of rows) {
    const existing = db.prepare(`SELECT * FROM gate_results WHERE project_id = ? AND gate_name = ?`).get(to, row.gate_name) as Record<string, unknown> | undefined;
    if (!existing) {
      db.prepare(`UPDATE gate_results SET project_id = ? WHERE id = ?`).run(to, row.id);
      continue;
    }
    const rationale = String(existing.rationale ?? "");
    const extra = String(row.rationale ?? "");
    if (extra && !rationale.includes(extra)) {
      db.prepare(`UPDATE gate_results SET rationale = ? WHERE id = ?`).run(`${rationale}\n\nAlso recorded: ${extra}`.slice(0, 4000), existing.id);
    }
    db.prepare(`DELETE FROM gate_results WHERE id = ?`).run(row.id);
  }
}

function movePipeline(db: Database.Database, from: string, to: string) {
  const dropped = db.prepare(`SELECT * FROM pipeline_entries WHERE project_id = ?`).get(from) as Record<string, unknown> | undefined;
  if (!dropped) return;
  const kept = db.prepare(`SELECT * FROM pipeline_entries WHERE project_id = ?`).get(to) as Record<string, unknown> | undefined;
  if (!kept) {
    db.prepare(`UPDATE pipeline_entries SET project_id = ? WHERE id = ?`).run(to, dropped.id);
    return;
  }
  const join = (a: unknown, b: unknown) => {
    const left = String(a ?? "").trim();
    const right = String(b ?? "").trim();
    if (!left) return right || null;
    if (!right || left.includes(right)) return left;
    return `${left}\n\n${right}`;
  };
  db.prepare(`UPDATE pipeline_entries SET next_action = ?, due_date = ?, notes = ?, pass_reason = ?, updated_at = ? WHERE id = ?`).run(
    (kept.next_action as string | null) || (dropped.next_action as string | null),
    (kept.due_date as string | null) || (dropped.due_date as string | null),
    join(kept.notes, dropped.notes),
    join(kept.pass_reason, dropped.pass_reason),
    nowIso(),
    kept.id,
  );
  db.prepare(`DELETE FROM pipeline_entries WHERE id = ?`).run(dropped.id);
}

function retargetRelationships(db: Database.Database, entityType: string, from: string, to: string) {
  for (const side of ["source", "target"] as const) {
    const rows = db
      .prepare(`SELECT * FROM relationships WHERE ${side}_entity_type = ? AND ${side}_entity_id = ?`)
      .all(entityType, from) as Record<string, unknown>[];
    for (const row of rows) {
      const sourceType = side === "source" ? entityType : row.source_entity_type;
      const sourceId = side === "source" ? to : row.source_entity_id;
      const targetType = side === "target" ? entityType : row.target_entity_type;
      const targetId = side === "target" ? to : row.target_entity_id;
      const existing = db
        .prepare(
          `SELECT id, evidence_claim_ids_json FROM relationships
           WHERE source_entity_type = ? AND source_entity_id = ? AND target_entity_type = ? AND target_entity_id = ? AND relationship_type = ? AND id != ?`,
        )
        .get(sourceType, sourceId, targetType, targetId, row.relationship_type, row.id) as { id: string; evidence_claim_ids_json: string } | undefined;
      if (!existing) {
        db.prepare(`UPDATE relationships SET ${side}_entity_id = ? WHERE id = ?`).run(to, row.id);
        continue;
      }
      const evidence = uniqueStrings([...parseAliases(existing.evidence_claim_ids_json), ...parseAliases(String(row.evidence_claim_ids_json ?? "[]"))]);
      db.prepare(`UPDATE relationships SET evidence_claim_ids_json = ? WHERE id = ?`).run(JSON.stringify(evidence), existing.id);
      db.prepare(`DELETE FROM relationships WHERE id = ?`).run(row.id);
    }
  }
}

function rememberRedirect(db: Database.Database, oldId: string, entityType: "project" | "person", survivorId: string, reason: string) {
  db.prepare(`UPDATE entity_redirects SET survivor_id = ? WHERE survivor_id = ?`).run(survivorId, oldId);
  db.prepare(
    `INSERT INTO entity_redirects (old_id, entity_type, survivor_id, reason, merged_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(old_id) DO UPDATE SET survivor_id = excluded.survivor_id, entity_type = excluded.entity_type, reason = excluded.reason, merged_at = excluded.merged_at`,
  ).run(oldId, entityType, survivorId, reason.slice(0, 1000), nowIso());
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

export function tableCounts(db: Database.Database): { projects: number; companies: number; people: number } {
  const one = (sql: string) => Number((db.prepare(sql).get() as { c: number }).c);
  return {
    projects: one(`SELECT COUNT(*) AS c FROM projects`),
    companies: one(`SELECT COUNT(*) AS c FROM projects WHERE kind = 'company'`),
    people: one(`SELECT COUNT(*) AS c FROM people`),
  };
}
