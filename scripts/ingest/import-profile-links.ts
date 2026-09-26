// Import public profile links (GitHub, Scholar, websites, X, Substack,
// Hugging Face, Devpost, and other source pages) onto people already in
// the database.
//
//   npx tsx scripts/ingest/import-profile-links.ts --dry-run
//   npx tsx scripts/ingest/import-profile-links.ts data/exports/profiles-backfill-2026-09-26.json
//
// Confirmed icon links become an alias plus a corroborated profile_link
// claim. Unverified links become a profile_link claim only, so they never
// look confirmed. "other" pages are claims only. LinkedIn aliases and
// linkedin_candidate claims are left untouched.

import fs from "node:fs";
import path from "node:path";
import { getDb, newId, nowIso } from "../../lib/db/client";
import { isIconType, linkKey } from "../../lib/domain/profile-links";

const SOURCE_ID = "src_scout_web_search";
const SEARCH_URL = "https://html.duckduckgo.com/html/";
const DEFAULT_FILE = "data/exports/profiles-backfill-2026-09-26.json";

const SCOUT_FILES: { sourceFile: string; filePath: string }[] = [
  { sourceFile: "scouted.json", filePath: "data/exports/playbook-scouted-2026-09-25.json" },
  { sourceFile: "scouted2.json", filePath: "data/exports/playbook-scouted-2026-09-26.json" },
  { sourceFile: "scouted3.json", filePath: "data/exports/playbook-scouted-2026-09-26-pass3.json" },
  { sourceFile: "scouted4.json", filePath: "data/exports/playbook-scouted-2026-09-26-pass4.json" },
];

const ICON_TYPES = ["github", "scholar", "website", "twitter", "substack", "huggingface", "devpost", "other"] as const;

interface ProfileLink {
  type?: string;
  url?: string;
  status?: string;
  evidence_excerpt?: string | null;
  evidence_url?: string | null;
}

interface BackfillRow {
  person_name?: string;
  source_file?: string;
  person_id_or_key?: string;
  links?: ProfileLink[];
}

interface ScoutHit {
  id: string;
  name: string;
  aliases: string[];
  campusId: string | null;
  projects: string[];
  sourceFile: string;
  kind: "person" | "potential" | "update";
  repoEntityId: string | null;
}

interface PersonRec {
  id: string;
  name: string;
  aliases: string[];
  founderStatus: string | null;
  campuses: Set<string>;
  projects: string[];
  tokens: string[];
}

interface CorrectedUpdate {
  name: string;
  repoEntityId: string;
  projects: string[];
}

function normName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(inc|llc|ltd|corp|co)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^the /, "");
}

function tokensOf(name: string): string[] {
  return normName(name).split(" ").filter(Boolean);
}

function lastName(name: string): string {
  const parts = tokensOf(name);
  return parts[parts.length - 1] ?? "";
}

function containsSequence(haystack: string[], needle: string[]): boolean {
  if (needle.length === 0 || needle.length > haystack.length) return false;
  for (let i = 0; i <= haystack.length - needle.length; i++) {
    if (needle.every((token, j) => haystack[i + j] === token)) return true;
  }
  return false;
}

function namesOverlap(a: string, b: string): boolean {
  const x = normName(a);
  const y = normName(b);
  if (!x || !y) return false;
  if (x === y) return true;
  if (x.length >= 4 && y.length >= 4 && (x.includes(y) || y.includes(x))) return true;
  return false;
}

function projectNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const names: string[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const name = (item as { project_name?: string; name?: string }).project_name || (item as { name?: string }).name;
    if (typeof name === "string" && name.trim()) names.push(name.trim());
  }
  return names;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function loadScoutIndex(): Map<string, ScoutHit[]> {
  const index = new Map<string, ScoutHit[]>();
  function add(hit: ScoutHit) {
    const list = index.get(hit.id) ?? [];
    list.push(hit);
    index.set(hit.id, list);
  }
  for (const file of SCOUT_FILES) {
    const abs = path.resolve(file.filePath);
    if (!fs.existsSync(abs)) continue;
    const data = JSON.parse(fs.readFileSync(abs, "utf8")) as {
      people?: Record<string, unknown>[];
      potential_founders?: Record<string, unknown>[];
      updates?: Record<string, unknown>[];
    };
    for (const person of data.people ?? []) {
      const id = typeof person.id === "string" ? person.id : "";
      const name = typeof person.name === "string" ? person.name : "";
      if (!id || !name) continue;
      add({
        id,
        name,
        aliases: stringList(person.aliases_json),
        campusId: typeof person.campus_id === "string" ? person.campus_id : null,
        projects: projectNames(person.projects),
        sourceFile: file.sourceFile,
        kind: "person",
        repoEntityId: null,
      });
    }
    for (const person of data.potential_founders ?? []) {
      const id = typeof person.id === "string" ? person.id : "";
      const name = typeof person.name === "string" ? person.name : "";
      if (!id || !name) continue;
      add({
        id,
        name,
        aliases: stringList(person.aliases_json),
        campusId: typeof person.campus_id === "string" ? person.campus_id : null,
        projects: projectNames(person.projects),
        sourceFile: file.sourceFile,
        kind: "potential",
        repoEntityId: typeof person.repo_entity_id === "string" ? person.repo_entity_id : null,
      });
    }
    for (const update of data.updates ?? []) {
      if (update.entity_type !== "person") continue;
      const id = typeof update.repo_entity_id === "string" ? update.repo_entity_id : "";
      const name = typeof update.name === "string" ? update.name : "";
      if (!id || !name) continue;
      add({
        id,
        name,
        aliases: stringList(update.new_aliases),
        campusId: typeof update.campus_id === "string" ? update.campus_id : null,
        projects: projectNames(update.new_projects),
        sourceFile: file.sourceFile,
        kind: "update",
        repoEntityId: id,
      });
    }
  }
  return index;
}

function lookupScout(index: Map<string, ScoutHit[]>, row: BackfillRow): ScoutHit | null {
  const key = row.person_id_or_key?.trim();
  if (!key) return null;
  const hits = index.get(key) ?? [];
  const file = (row.source_file || "").trim();
  const inFile = file ? hits.filter((hit) => hit.sourceFile === file) : hits;
  if (inFile.length === 1) return inFile[0];
  if (inFile.length > 1) return inFile.find((hit) => hit.kind === "potential") ?? inFile[0];
  return null;
}

function loadCorrectedUpdates(): Map<string, CorrectedUpdate> {
  const byName = new Map<string, CorrectedUpdate>();
  const file = SCOUT_FILES.find((entry) => entry.sourceFile === "scouted4.json");
  if (!file) return byName;
  const data = JSON.parse(fs.readFileSync(path.resolve(file.filePath), "utf8")) as { updates?: Record<string, unknown>[] };
  for (const update of data.updates ?? []) {
    if (update.entity_type !== "person") continue;
    const name = typeof update.name === "string" ? update.name : "";
    const repoEntityId = typeof update.repo_entity_id === "string" ? update.repo_entity_id : "";
    if (!name || !repoEntityId) continue;
    const projects = projectNames(update.new_projects);
    for (const raw of stringList(update.existing_repo_roles)) {
      try {
        const parsed = JSON.parse(raw) as { project?: string };
        if (parsed.project) projects.push(parsed.project);
      } catch {
        projects.push(raw);
      }
    }
    byName.set(normName(name), { name, repoEntityId, projects });
  }
  return byName;
}

function loadPeople(db: ReturnType<typeof getDb>): { byId: Map<string, PersonRec>; byNorm: Map<string, PersonRec[]>; people: PersonRec[] } {
  const byId = new Map<string, PersonRec>();
  const byNorm = new Map<string, PersonRec[]>();
  const people: PersonRec[] = [];
  for (const row of db.prepare(`SELECT id, name, aliases_json, founder_status FROM people`).all() as {
    id: string;
    name: string;
    aliases_json: string;
    founder_status: string | null;
  }[]) {
    let aliases: string[] = [];
    try {
      const parsed = JSON.parse(row.aliases_json || "[]") as unknown;
      aliases = Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
    } catch {
      aliases = [];
    }
    const person: PersonRec = {
      id: row.id,
      name: row.name,
      aliases,
      founderStatus: row.founder_status,
      campuses: new Set(),
      projects: [],
      tokens: tokensOf(row.name),
    };
    byId.set(person.id, person);
    people.push(person);
    const list = byNorm.get(normName(person.name)) ?? [];
    list.push(person);
    byNorm.set(normName(person.name), list);
  }
  for (const row of db.prepare(`SELECT person_id, university_id FROM affiliations`).all() as { person_id: string; university_id: string }[]) {
    byId.get(row.person_id)?.campuses.add(row.university_id);
  }
  for (const row of db.prepare(`SELECT ppr.person_id as person_id, p.name as name FROM person_project_roles ppr JOIN projects p ON p.id = ppr.project_id`).all() as {
    person_id: string;
    name: string;
  }[]) {
    byId.get(row.person_id)?.projects.push(row.name);
  }
  return { byId, byNorm, people };
}

function scoreCandidate(person: PersonRec, scout: ScoutHit | null): number {
  let score = 0;
  if (scout?.campusId) {
    if (person.campuses.has(scout.campusId)) score += 10;
    else if (person.campuses.size > 0) score -= 4;
  }
  if (scout && scout.projects.length > 0) {
    const overlap = scout.projects.some((project) => person.projects.some((owned) => namesOverlap(project, owned)));
    if (overlap) score += 8;
    else if (person.projects.length > 0) score -= 2;
  }
  if (scout?.kind === "potential") {
    if (person.founderStatus === "potential") score += 6;
    else if (person.founderStatus === "founder") score -= 6;
  } else if (scout && person.founderStatus === "potential") {
    score -= 3;
  }
  return score;
}

function pickCandidate(candidates: PersonRec[], scout: ScoutHit | null): { person: PersonRec | null; reason: string } {
  const unique = [...new Map(candidates.map((person) => [person.id, person])).values()];
  if (unique.length === 0) return { person: null, reason: "no name match" };
  if (unique.length === 1) return { person: unique[0], reason: "unique name" };
  const ranked = unique
    .map((person) => ({ person, score: scoreCandidate(person, scout) }))
    .sort((a, b) => b.score - a.score || a.person.id.localeCompare(b.person.id));
  if (ranked[0].score > ranked[1].score && ranked[0].score > 0) {
    return { person: ranked[0].person, reason: `name plus campus or company (${ranked[0].score} vs ${ranked[1].score})` };
  }
  return {
    person: null,
    reason: `ambiguous: ${ranked
      .map((item) => `${item.person.name} ${item.person.id} status=${item.person.founderStatus ?? "unset"} campuses=${[...item.person.campuses].join("|") || "none"} score=${item.score}`)
      .join("; ")}`,
  };
}

function orderedSubset(haystack: string[], needle: string[]): boolean {
  if (needle.length < 2 || haystack.length <= needle.length) return false;
  if (haystack[0] !== needle[0] || haystack[haystack.length - 1] !== needle[needle.length - 1]) return false;
  let index = 0;
  for (const token of haystack) {
    if (token === needle[index]) index++;
    if (index === needle.length) return true;
  }
  return false;
}

const FIRST_NICKNAMES: Record<string, string[]> = { nick: ["nicholas"], nicholas: ["nick"] };

function nicknameFirst(haystack: string[], needle: string[]): boolean {
  if (needle.length < 2 || haystack.length < 2) return false;
  if (haystack[haystack.length - 1] !== needle[needle.length - 1]) return false;
  if (haystack[0] === needle[0]) return false;
  if (haystack.length !== needle.length) return false;
  const shorter = needle[0].length <= haystack[0].length ? needle[0] : haystack[0];
  const longer = needle[0].length <= haystack[0].length ? haystack[0] : needle[0];
  if (shorter.length >= 4 && longer.startsWith(shorter)) return true;
  return (FIRST_NICKNAMES[haystack[0]] ?? []).includes(needle[0]);
}

function candidatesForName(byNorm: Map<string, PersonRec[]>, people: PersonRec[], name: string): PersonRec[] {
  const exact = byNorm.get(normName(name)) ?? [];
  if (exact.length > 0) return exact;
  const mine = tokensOf(name);
  if (mine.length < 2) return [];
  const stripped = tokensOf(name.replace(/\([^)]*\)/g, " "));
  const keys = new Set<string>();
  if (stripped.length >= 2) keys.add(stripped.join(" "));
  const paren = [...name.matchAll(/\(([^)]+)\)/g)].map((match) => match[1]);
  const last = stripped[stripped.length - 1];
  for (const inner of paren) {
    const innerTokens = tokensOf(inner);
    if (innerTokens.length >= 2) keys.add(innerTokens.join(" "));
    if (last && innerTokens.length >= 1) {
      const withLast = tokensOf(`${inner} ${last}`);
      if (withLast.length >= 2) keys.add(withLast.join(" "));
    }
  }
  const fromKeys: PersonRec[] = [];
  for (const key of keys) fromKeys.push(...(byNorm.get(key) ?? []));
  if (fromKeys.length > 0) return fromKeys;
  const subset = people.filter((person) => orderedSubset(person.tokens, mine));
  if (subset.length > 0) return subset;
  const nick = people.filter((person) => nicknameFirst(person.tokens, mine));
  if (nick.length === 1) return nick;
  return people.filter((person) => {
    if (person.tokens.length < 2) return false;
    if (person.tokens.join(" ") === mine.join(" ")) return false;
    return containsSequence(person.tokens, mine) || containsSequence(mine, person.tokens);
  });
}

let correctedByName = new Map<string, CorrectedUpdate>();

function correctedPerson(row: BackfillRow, direct: PersonRec, byId: Map<string, PersonRec>): PersonRec | null {
  if ((row.source_file || "").trim() !== "scouted4.json") return null;
  const update = correctedByName.get(normName(row.person_name || direct.name));
  if (!update || update.repoEntityId === direct.id) return null;
  const target = byId.get(update.repoEntityId);
  if (!target || normName(target.name) !== normName(direct.name)) return null;
  if (update.projects.length === 0) return null;
  const targetHolds = update.projects.some((project) => target.projects.some((owned) => namesOverlap(project, owned)));
  const directHolds = update.projects.some((project) => direct.projects.some((owned) => namesOverlap(project, owned)));
  if (!targetHolds || directHolds) return null;
  return target;
}

function resolvePerson(
  row: BackfillRow,
  scout: ScoutHit | null,
  byId: Map<string, PersonRec>,
  byNorm: Map<string, PersonRec[]>,
  people: PersonRec[],
): { person: PersonRec | null; reason: string } {
  const key = row.person_id_or_key?.trim() ?? "";
  const direct = key ? byId.get(key) : undefined;
  if (direct) {
    const rowLast = lastName(row.person_name || scout?.name || "");
    if (rowLast && rowLast !== lastName(direct.name)) {
      return { person: null, reason: `person id ${key} is ${direct.name}, which does not match ${row.person_name}` };
    }
    const corrected = correctedPerson(row, direct, byId);
    if (corrected && corrected.id !== direct.id) {
      return { person: corrected, reason: `corrected scouted4 target ${corrected.id}` };
    }
    return { person: direct, reason: "person id" };
  }
  if (scout?.repoEntityId) {
    const updated = byId.get(scout.repoEntityId);
    if (updated && (!lastName(scout.name) || lastName(scout.name) === lastName(updated.name))) {
      return { person: updated, reason: "scout update id" };
    }
  }
  const names = [row.person_name || "", scout?.name || "", ...(scout?.aliases ?? [])].filter(Boolean);
  let candidates: PersonRec[] = [];
  for (const name of names) {
    candidates = candidatesForName(byNorm, people, name);
    if (candidates.length > 0) break;
  }
  return pickCandidate(candidates, scout);
}

function isLinkedIn(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    return host === "linkedin.com" || host.endsWith(".linkedin.com");
  } catch {
    return url.toLowerCase().includes("linkedin.com");
  }
}

function githubParts(raw: string): { handle: string; rest: string } | null {
  let pathname = raw;
  if (raw.startsWith("http://") || raw.startsWith("https://")) {
    try {
      const parsed = new URL(raw);
      if (parsed.hostname.toLowerCase().replace(/^www\./, "") !== "github.com") return null;
      pathname = parsed.pathname;
    } catch {
      return null;
    }
  }
  const parts = pathname.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);
  if (!parts[0]) return null;
  return { handle: parts[0].toLowerCase(), rest: parts.slice(1).join("/").toLowerCase() };
}

function aliasCovers(alias: string, type: string, url: string): boolean {
  const prefix = type === "website" ? "site:" : `${type}:`;
  if (!alias.startsWith(prefix)) return false;
  const stored = alias.slice(prefix.length);
  if (type === "github") {
    const left = githubParts(stored);
    const right = githubParts(url);
    return !!left && !!right && left.handle === right.handle && left.rest === right.rest;
  }
  if (!stored.startsWith("http://") && !stored.startsWith("https://")) return false;
  return linkKey(type, stored) === linkKey(type, url);
}

function aliasValue(type: string, url: string): string | null {
  if (type === "website") return `site:${url}`;
  if (type === "github" || type === "devpost" || type === "scholar" || type === "twitter" || type === "substack" || type === "huggingface") {
    return `${type}:${url}`;
  }
  return null;
}

function linkedinFingerprint(db: ReturnType<typeof getDb>): string {
  const aliases = db.prepare(`SELECT id, aliases_json FROM people ORDER BY id`).all() as { id: string; aliases_json: string }[];
  const claims = db
    .prepare(`SELECT entity_id, source_url, verification_state FROM claims WHERE claim_type IN ('linkedin_alias_discovered', 'linkedin_candidate', 'linkedin_search_attempt') ORDER BY entity_id, source_url`)
    .all() as { entity_id: string; source_url: string; verification_state: string }[];
  const aliasBits: string[] = [];
  for (const row of aliases) {
    let parsed: string[] = [];
    try {
      const value = JSON.parse(row.aliases_json || "[]") as unknown;
      parsed = Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
    } catch {
      parsed = [];
    }
    for (const alias of parsed) {
      if (alias.startsWith("linkedin:") || alias === "linkedin_checked") aliasBits.push(`${row.id}|${alias}`);
    }
  }
  return `${aliasBits.join("\n")}\n--\n${claims.map((row) => `${row.entity_id}|${row.source_url}|${row.verification_state}`).join("\n")}`;
}

function bump(map: Record<string, { confirmed: number; unverified: number }>, type: string, status: "confirmed" | "unverified") {
  const bucket = map[type] ?? { confirmed: 0, unverified: 0 };
  bucket[status] += 1;
  map[type] = bucket;
}

function main() {
  const args = process.argv.slice(2);
  const dry = args.includes("--dry-run");
  const fileArg = args.find((arg) => !arg.startsWith("--")) ?? DEFAULT_FILE;
  const rows = JSON.parse(fs.readFileSync(path.resolve(fileArg), "utf8")) as BackfillRow[];
  if (!Array.isArray(rows)) throw new Error("Profile backfill file is not an array");

  const db = getDb();
  const scout = loadScoutIndex();
  correctedByName = loadCorrectedUpdates();
  const loaded = loadPeople(db);
  const beforeLinkedIn = linkedinFingerprint(db);
  const existingClaims = new Set<string>();
  for (const row of db.prepare(`SELECT entity_id, value_json FROM claims WHERE entity_type = 'person' AND claim_type = 'profile_link'`).all() as {
    entity_id: string;
    value_json: string;
  }[]) {
    try {
      const value = JSON.parse(row.value_json) as { type?: string; url?: string };
      if (value.type && value.url) existingClaims.add(`${row.entity_id}|${linkKey(value.type, value.url)}`);
    } catch {
      // skip a malformed claim
    }
  }

  const written: Record<string, { confirmed: number; unverified: number }> = {};
  const aliasesAdded: Record<string, number> = {};
  let duplicate = 0;
  let keptConfirmed = 0;
  let skippedLinkedIn = 0;
  let skippedBad = 0;
  let emptyRecords = 0;
  const unmatched: string[] = [];
  const ambiguous: string[] = [];
  const spot: string[] = [];

  const insertClaim = db.prepare(
    `INSERT INTO claims (id, entity_type, entity_id, claim_type, value_json, excerpt, source_id, source_url, retrieved_at, label, verification_state)
     VALUES (?, 'person', ?, 'profile_link', ?, ?, ?, ?, ?, 'observed_fact', ?)`,
  );
  const writeAliases = db.prepare(`UPDATE people SET aliases_json = ? WHERE id = ?`);

  const tx = db.transaction(() => {
    const now = nowIso();
    const source = db.prepare(`SELECT id FROM sources WHERE id = ?`).get(SOURCE_ID) as { id: string } | undefined;
    if (!dry) {
      if (source) db.prepare(`UPDATE sources SET last_success_at = ? WHERE id = ?`).run(now, SOURCE_ID);
      else {
        db.prepare(
          `INSERT INTO sources (id, name, family, url, campuses_json, priority, ingestion_mode, status, last_attempt_at, last_success_at)
           VALUES (?, 'Scout web search', 'code_host', ?, '[]', 2, 'manual', 'available', ?, ?)`,
        ).run(SOURCE_ID, SEARCH_URL, now, now);
      }
    }

    for (const row of rows) {
      const links = Array.isArray(row.links) ? row.links : [];
      const resolved = resolvePerson(row, lookupScout(scout, row), loaded.byId, loaded.byNorm, loaded.people);
      const label = `${row.person_name || "unnamed"} ${row.person_id_or_key || ""} (${row.source_file || "no file"})`;
      if (normName(row.person_name || "") === "david lee" || normName(row.person_name || "") === "eric cao") {
        spot.push(
          `${label} -> ${resolved.person ? `${resolved.person.name} ${resolved.person.id} [${[...resolved.person.campuses].join(",")}]` : "UNRESOLVED"} via ${resolved.reason}; links ${links.length}`,
        );
      }
      if (links.length === 0) {
        emptyRecords++;
        continue;
      }
      if (!resolved.person) {
        const line = `${label}: ${resolved.reason}`;
        if (resolved.reason.startsWith("ambiguous")) ambiguous.push(line);
        else unmatched.push(line);
        continue;
      }
      const person = resolved.person;
      for (const link of links) {
        const type = (link.type || "").trim().toLowerCase();
        const url = (link.url || "").trim();
        const status = link.status === "confirmed" ? "confirmed" : link.status === "unverified" ? "unverified" : "";
        if (!url.startsWith("http://") && !url.startsWith("https://")) {
          skippedBad++;
          continue;
        }
        if (isLinkedIn(url)) {
          skippedLinkedIn++;
          continue;
        }
        if (!status || (!isIconType(type) && type !== "other") || !(ICON_TYPES as readonly string[]).includes(type)) {
          skippedBad++;
          continue;
        }
        const key = `${person.id}|${linkKey(type, url)}`;
        const confirmedAlready = person.aliases.some((alias) => aliasCovers(alias, type, url));
        if (status === "unverified" && confirmedAlready) {
          keptConfirmed++;
          continue;
        }
        if (existingClaims.has(key) && (status === "unverified" || confirmedAlready || type === "other")) {
          duplicate++;
          continue;
        }
        const excerpt = (link.evidence_excerpt || "").trim() || `${type} profile: ${url}`;
        const evidenceUrl = (link.evidence_url || "").trim();
        const sourceUrl = evidenceUrl.startsWith("http://") || evidenceUrl.startsWith("https://") ? evidenceUrl : url;
        const alias = status === "confirmed" && isIconType(type) ? aliasValue(type, url) : null;
        const needsAlias = !!alias && !confirmedAlready;
        if (existingClaims.has(key) && !needsAlias) {
          duplicate++;
          continue;
        }
        if (!dry) {
          if (!existingClaims.has(key)) {
            insertClaim.run(
              newId("claim"),
              person.id,
              JSON.stringify({ type, url, status }),
              excerpt.slice(0, 1200),
              SOURCE_ID,
              sourceUrl,
              now,
              status === "confirmed" ? "corroborated" : "unverified",
            );
          }
          if (needsAlias && alias) {
            const next = [...person.aliases, alias];
            writeAliases.run(JSON.stringify(next), person.id);
            person.aliases = next;
            aliasesAdded[type] = (aliasesAdded[type] ?? 0) + 1;
          }
        } else if (needsAlias) {
          person.aliases = [...person.aliases, alias!];
          aliasesAdded[type] = (aliasesAdded[type] ?? 0) + 1;
        }
        if (!existingClaims.has(key)) {
          existingClaims.add(key);
          bump(written, type, status);
        }
      }
    }
  });

  tx();
  if (!dry) db.pragma("wal_checkpoint(TRUNCATE)");
  const afterLinkedIn = dry ? beforeLinkedIn : linkedinFingerprint(db);

  console.log(dry ? "Dry run. No rows written." : "Wrote profile links.");
  console.log(`Records ${rows.length}. Empty link lists ${emptyRecords}.`);
  console.log("Links written by type:");
  for (const type of ICON_TYPES) {
    const bucket = written[type] ?? { confirmed: 0, unverified: 0 };
    console.log(`  ${type}: confirmed ${bucket.confirmed}, unverified ${bucket.unverified}, total ${bucket.confirmed + bucket.unverified}; aliases added ${aliasesAdded[type] ?? 0}`);
  }
  const totals = Object.values(written).reduce((sum, bucket) => ({ confirmed: sum.confirmed + bucket.confirmed, unverified: sum.unverified + bucket.unverified }), {
    confirmed: 0,
    unverified: 0,
  });
  console.log(`Total claims written ${totals.confirmed + totals.unverified} (confirmed ${totals.confirmed}, unverified ${totals.unverified}).`);
  console.log(`Duplicate skips ${duplicate}. Unverified left off because a confirmed alias exists ${keptConfirmed}. LinkedIn URLs skipped ${skippedLinkedIn}. Bad links skipped ${skippedBad}.`);
  console.log(`LinkedIn data unchanged: ${beforeLinkedIn === afterLinkedIn}`);
  console.log(`\nSpot checks (${spot.length}):`);
  for (const line of spot) console.log(`  ${line}`);
  console.log(`\nUnmatched (${unmatched.length}):`);
  for (const line of unmatched) console.log(`  ${line}`);
  console.log(`\nAmbiguous (${ambiguous.length}):`);
  for (const line of ambiguous) console.log(`  ${line}`);
}

main();
