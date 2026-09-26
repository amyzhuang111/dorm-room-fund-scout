// Import judged LinkedIn results for people from the playbook scout files.
//
//   npx tsx scripts/ingest/import-linkedin-backfill.ts --dry-run
//   npx tsx scripts/ingest/import-linkedin-backfill.ts data/exports/linkedin-backfill-2026-09-26.json
//
// Confirmed rows become a linkedin: alias plus a corroborated
// linkedin_alias_discovered claim. Unverified rows become a linkedin_candidate
// claim (verification_state unverified) and do not get a linkedin: alias.
// not_found rows are ignored. Scout ids are resolved through the scout export
// for that source_file, then matched to the database by name and company.
// Rushil Mathur (Oxford, not Harvard) is deleted. Hand-check caveats are
// stored on the LinkedIn evidence and as a person note.

import fs from "node:fs";
import path from "node:path";
import { getDb, newId, nowIso } from "../../lib/db/client";
import { recomputePersonEnrollment } from "../../lib/domain/enrollment-store";
import { preferSignalTier } from "../../lib/domain/signal-tier";

const SOURCE_ID = "src_scout_web_search";
const SEARCH_URL = "https://html.duckduckgo.com/html/";

const SCOUT_FILES: { sourceFile: string; filePath: string }[] = [
  { sourceFile: "scouted.json", filePath: "data/exports/playbook-scouted-2026-09-25.json" },
  { sourceFile: "scouted2.json", filePath: "data/exports/playbook-scouted-2026-09-26.json" },
  { sourceFile: "scouted3.json", filePath: "data/exports/playbook-scouted-2026-09-26-pass3.json" },
  { sourceFile: "scouted4.json", filePath: "data/exports/playbook-scouted-2026-09-26-pass4.json" },
];

const HAND_CHECK: { name: string; note: string }[] = [
  { name: "Janet Guo", note: "Hand-check: name-only match. Several Janet Guos exist, and the result does not show MIT or HackMIT." },
  { name: "Yue Fei", note: "Hand-check: name-only match. The profile was not tied to the scouted school or company." },
  { name: "Noor Badal Sharma", note: "Hand-check: name-only match. The profile was not tied to the scouted school or company." },
  { name: "Pratham Arora", note: "Hand-check: name-only match. The profile was not tied to the scouted school or company." },
  { name: "Yecheng (Jason) Ma", note: "Hand-check: name-only match. The profile was not tied to the scouted school or company." },
  { name: "J Yim", note: "Hand-check: name-only match. The profile was not tied to the scouted school or company." },
  { name: "Nathan Le", note: "Hand-check: name-only match. The profile was not tied to the scouted school or company." },
  { name: "Mohammed Soumaoro", note: "Hand-check: name-only match. The profile was not tied to the scouted school or company." },
  { name: "Benjamin Carnovale", note: "Hand-check: name-only match. The profile was not tied to the scouted school or company." },
  { name: "Dylan Nguyen", note: "Hand-check: name-only match. The profile was not tied to the scouted school or company." },
  { name: "John Shotton", note: "Hand-check: name-only match. The profile was not tied to the scouted school or company." },
  { name: "Malika Shukurova", note: "Hand-check: name-only match. The profile was not tied to the scouted school or company." },
  { name: "Aidan Smith", note: "Hand-check: profile shows Flapping Airplanes and ex-Neuralink, with no Innerphases mention." },
  { name: "Kristian Prifti", note: "Hand-check: confirmed identity, but the profile does not mention Skip Networking." },
  { name: "Eleftherios Lazarinis", note: "Hand-check: confirmed identity for Dossier, but the profile does not attribute the scouted project." },
  { name: "Ahmed Muharram", note: "Hand-check: confirmed identity for Dossier, but the profile does not attribute the scouted project." },
  { name: "Aneesh Pataballa", note: "Hand-check: SpoilSafe collaborator, not listed as a founder." },
  { name: "Nami Lindquist", note: "Hand-check: profile shows Sync Labs and ClaimGlide, with no Mindful mention." },
  { name: "Lauren Lee", note: "Hand-check: common name tied only through a search summary or post. Glance before outreach." },
  { name: "Dev Patel", note: "Hand-check: common name tied only through a search summary or post. Glance before outreach." },
  { name: "Mike Wu", note: "Hand-check: common name tied only through a search summary or post. Glance before outreach." },
  { name: "Jennifer Lin", note: "Hand-check: common name tied only through a search summary or post. Glance before outreach." },
  { name: "Pulak Mittal", note: "Hand-check: Emerald Exam signal is from 2013-14, so it is old." },
  { name: "Potluck Mittal", note: "Hand-check: Emerald Exam signal is from 2013-14, so it is old." },
];

interface BackfillRow {
  person_name?: string;
  source_file?: string;
  person_id_or_key?: string;
  linkedin_url?: string | null;
  status?: string;
  evidence_excerpt?: string | null;
  evidence_url?: string | null;
  searched?: boolean;
  hackathon_only?: boolean;
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
  potentialSignal: string | null;
  signalTier: string | null;
  signalBasis: string | null;
  enrollmentStatus: string | null;
  enrollmentLabel: string | null;
  campuses: Set<string>;
  projects: string[];
  roles: string[];
  tokens: string[];
}

interface CorrectedUpdate {
  name: string;
  repoEntityId: string;
  founderStatus: string | null;
  potentialSignal: string | null;
  signalTier: string | null;
  signalBasis: string | null;
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

function cleanUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const match = url.match(/https?:\/\/[^\s)]+/);
  return match ? match[0] : null;
}

function linkedInUrl(url: string | null | undefined): string | null {
  const clean = cleanUrl(url);
  if (!clean || !clean.includes("linkedin.com/in/")) return null;
  try {
    const parsed = new URL(clean);
    const slug = parsed.pathname.split("/in/")[1]?.split("/")[0];
    if (!slug) return null;
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    const storedHost = host === "linkedin.com" ? "www.linkedin.com" : parsed.hostname.toLowerCase();
    return `https://${storedHost}/in/${decodeURIComponent(slug)}`;
  } catch {
    return null;
  }
}

function linkedInSlug(url: string | null | undefined): string | null {
  const canonical = linkedInUrl(url);
  if (!canonical) return null;
  return canonical.split("/in/")[1]?.toLowerCase() ?? null;
}

function caveatFor(name: string): string | null {
  const key = normName(name);
  for (const item of HAND_CHECK) {
    if (normName(item.name) === key) return item.note;
  }
  return null;
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
    if (!fs.existsSync(abs)) {
      console.log(`Scout file missing: ${file.filePath}`);
      continue;
    }
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
  if (inFile.length > 1) {
    const potential = inFile.find((hit) => hit.kind === "potential");
    return potential ?? inFile[0];
  }
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
    byName.set(normName(name), {
      name,
      repoEntityId,
      founderStatus: typeof update.founder_status === "string" ? update.founder_status : null,
      potentialSignal: typeof update.potential_signal === "string" ? update.potential_signal : null,
      signalTier: typeof update.signal_tier === "string" ? update.signal_tier : null,
      signalBasis: typeof update.signal_tier_basis === "string" ? update.signal_tier_basis : null,
      projects,
    });
  }
  return byName;
}

function loadPeople(db: ReturnType<typeof getDb>): {
  byId: Map<string, PersonRec>;
  byNorm: Map<string, PersonRec[]>;
  slugOwners: Map<string, string[]>;
} {
  const byId = new Map<string, PersonRec>();
  const byNorm = new Map<string, PersonRec[]>();
  const slugOwners = new Map<string, string[]>();
  for (const row of db.prepare(
    `SELECT id, name, aliases_json, founder_status, potential_signal, signal_tier, signal_tier_basis, enrollment_status, enrollment_label FROM people`
  ).all() as {
    id: string;
    name: string;
    aliases_json: string;
    founder_status: string | null;
    potential_signal: string | null;
    signal_tier: string | null;
    signal_tier_basis: string | null;
    enrollment_status: string | null;
    enrollment_label: string | null;
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
      potentialSignal: row.potential_signal,
      signalTier: row.signal_tier,
      signalBasis: row.signal_tier_basis,
      enrollmentStatus: row.enrollment_status,
      enrollmentLabel: row.enrollment_label,
      campuses: new Set(),
      projects: [],
      roles: [],
      tokens: tokensOf(row.name),
    };
    byId.set(person.id, person);
    const key = normName(person.name);
    const list = byNorm.get(key) ?? [];
    list.push(person);
    byNorm.set(key, list);
    for (const alias of aliases) {
      const slug = linkedInSlug(alias);
      if (!slug) continue;
      const owners = slugOwners.get(slug) ?? [];
      owners.push(person.id);
      slugOwners.set(slug, owners);
    }
  }
  for (const row of db.prepare(`SELECT person_id, university_id FROM affiliations`).all() as { person_id: string; university_id: string }[]) {
    byId.get(row.person_id)?.campuses.add(row.university_id);
  }
  for (const row of db.prepare(`SELECT ppr.person_id as person_id, p.name as name, ppr.role as role FROM person_project_roles ppr JOIN projects p ON p.id = ppr.project_id`).all() as {
    person_id: string;
    name: string;
    role: string | null;
  }[]) {
    const person = byId.get(row.person_id);
    if (!person) continue;
    person.projects.push(row.name);
    if (row.role) person.roles.push(row.role);
  }
  for (const row of db.prepare(`SELECT person_id, role FROM affiliations WHERE role IS NOT NULL`).all() as { person_id: string; role: string }[]) {
    byId.get(row.person_id)?.roles.push(row.role);
  }
  return { byId, byNorm, slugOwners };
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
  const detail = ranked
    .map((item) => `${item.person.name} ${item.person.id} status=${item.person.founderStatus ?? "unset"} campuses=${[...item.person.campuses].join("|") || "none"} score=${item.score}`)
    .join("; ");
  return { person: null, reason: `ambiguous: ${detail}` };
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
  for (const key of keys) {
    fromKeys.push(...(byNorm.get(key) ?? []));
  }
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

const FIRST_NICKNAMES: Record<string, string[]> = {
  nick: ["nicholas"],
  nicholas: ["nick"],
};

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
  people: PersonRec[]
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
      return { person: corrected, reason: `corrected scouted4 target ${corrected.id} (backfill id ${direct.id} does not hold the project)` };
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

function hasConfirmedLinkedIn(person: PersonRec): boolean {
  return person.aliases.some((alias) => alias.includes("linkedin.com/in/"));
}

function campusCounts(db: ReturnType<typeof getDb>): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of db
    .prepare(
      `SELECT a.university_id as campus, COUNT(DISTINCT pe.id) as n
       FROM people pe JOIN affiliations a ON a.person_id = pe.id
       WHERE pe.aliases_json LIKE '%linkedin.com/in/%'
       GROUP BY a.university_id`
    )
    .all() as { campus: string; n: number }[]) {
    counts[row.campus] = row.n;
  }
  const none = db
    .prepare(
      `SELECT COUNT(*) as n FROM people pe
       WHERE pe.aliases_json LIKE '%linkedin.com/in/%'
         AND NOT EXISTS (SELECT 1 FROM affiliations a WHERE a.person_id = pe.id)`
    )
    .get() as { n: number };
  counts.no_campus = none.n;
  const all = db.prepare(`SELECT COUNT(*) as n FROM people WHERE aliases_json LIKE '%linkedin.com/in/%'`).get() as { n: number };
  counts.overall = all.n;
  return counts;
}

function deletePerson(db: ReturnType<typeof getDb>, id: string) {
  const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`).all() as { name: string }[];
  for (const table of tables) {
    if (!/^[A-Za-z0-9_]+$/.test(table.name) || table.name === "people") continue;
    const cols = db.prepare(`PRAGMA table_info(${table.name})`).all() as { name: string }[];
    if (!cols.some((col) => col.name === "person_id")) continue;
    db.prepare(`DELETE FROM ${table.name} WHERE person_id = ?`).run(id);
  }
  db.prepare(`DELETE FROM claims WHERE entity_type = 'person' AND entity_id = ?`).run(id);
  db.prepare(`DELETE FROM notes WHERE entity_type = 'person' AND entity_id = ?`).run(id);
  db.prepare(`DELETE FROM relationships WHERE source_entity_type = 'person' AND source_entity_id = ?`).run(id);
  db.prepare(`DELETE FROM relationships WHERE target_entity_type = 'person' AND target_entity_id = ?`).run(id);
  db.prepare(`DELETE FROM people WHERE id = ?`).run(id);
}

function ensureSource(db: ReturnType<typeof getDb>, now: string) {
  const existing = db.prepare(`SELECT id FROM sources WHERE id = ?`).get(SOURCE_ID) as { id: string } | undefined;
  if (existing) {
    db.prepare(`UPDATE sources SET last_success_at = ? WHERE id = ?`).run(now, SOURCE_ID);
    return;
  }
  db.prepare(
    `INSERT INTO sources (id, name, family, url, campuses_json, priority, ingestion_mode, status, last_attempt_at, last_success_at)
     VALUES (?, 'Scout web search', 'code_host', ?, '[]', 2, 'manual', 'available', ?, ?)`
  ).run(SOURCE_ID, SEARCH_URL, now, now);
}

function main() {
  const dry = process.argv.includes("--dry-run");
  const fileArg = process.argv.find((arg) => arg.endsWith(".json"));
  const filePath = path.resolve(fileArg || "data/exports/linkedin-backfill-2026-09-26.json");
  const rows = JSON.parse(fs.readFileSync(filePath, "utf8")) as BackfillRow[];
  if (!Array.isArray(rows)) throw new Error(`Import file must be a JSON array: ${filePath}`);

  const db = getDb();
  const before = campusCounts(db);
  correctedByName = loadCorrectedUpdates();
  const index = loadScoutIndex();
  const loaded = loadPeople(db);
  const people = [...loaded.byId.values()];
  const now = nowIso();

  const rushils = people.filter((person) => normName(person.name) === "rushil mathur");
  console.log(
    `Rushil Mathur rows: ${rushils.map((person) => `${person.id} status=${person.founderStatus ?? "unset"} campuses=${[...person.campuses].join("|") || "none"}`).join("; ") || "none"}`
  );

  let confirmed = 0;
  let unverified = 0;
  let notFound = 0;
  let notSearched = 0;
  let skipped = 0;
  let notes = 0;
  let rushilDeleted = 0;
  const unmatched: string[] = [];
  const ambiguous: string[] = [];
  const already: string[] = [];
  const slugBlocked: string[] = [];
  const enrollmentChanges: string[] = [];
  const hand: string[] = [];

  const insertClaim = db.prepare(
    `INSERT INTO claims (id, entity_type, entity_id, claim_type, value_json, excerpt, source_id, source_url, retrieved_at, label, verification_state)
     VALUES (?, 'person', ?, ?, ?, ?, ?, ?, ?, 'observed_fact', ?)`
  );
  const writeAliases = db.prepare(`UPDATE people SET aliases_json = ? WHERE id = ?`);
  const insertNote = db.prepare(`INSERT INTO notes (id, entity_type, entity_id, body, author, created_at) VALUES (?, 'person', ?, ?, 'amy', ?)`);
  const noteExists = db.prepare(`SELECT 1 as ok FROM notes WHERE entity_type = 'person' AND entity_id = ? AND body = ? LIMIT 1`);

  const tx = db.transaction(() => {
    const retargets: string[] = [];
    for (const update of correctedByName.values()) {
      if (update.founderStatus !== "potential" || !update.potentialSignal) continue;
      const target = loaded.byId.get(update.repoEntityId);
      if (!target) {
        retargets.push(`missing target ${update.name} ${update.repoEntityId}`);
        continue;
      }
      const holders = [...loaded.byId.values()].filter(
        (person) =>
          person.id !== target.id &&
          normName(person.name) === normName(update.name) &&
          person.founderStatus === "potential" &&
          person.potentialSignal === update.potentialSignal
      );
      if (holders.length === 0) continue;
      for (const holder of holders) {
        retargets.push(`clear potential on ${holder.name} ${holder.id}; corrected target ${target.name} ${target.id}`);
        if (dry) continue;
        db.prepare(`UPDATE people SET founder_status = NULL, potential_signal = NULL WHERE id = ?`).run(holder.id);
        if (holder.signalTier === update.signalTier && holder.signalBasis === update.signalBasis) {
          db.prepare(`UPDATE people SET signal_tier = NULL, signal_tier_basis = NULL WHERE id = ?`).run(holder.id);
          holder.signalTier = null;
          holder.signalBasis = null;
        }
        holder.founderStatus = null;
        holder.potentialSignal = null;
      }
      if (!dry && target.founderStatus == null) {
        const tier = preferSignalTier(target.signalTier, update.signalTier);
        db.prepare(`UPDATE people SET founder_status = 'potential', potential_signal = ?, signal_tier = ?, signal_tier_basis = ? WHERE id = ?`).run(
          update.potentialSignal,
          tier,
          tier === update.signalTier ? update.signalBasis : target.signalBasis,
          target.id
        );
        target.founderStatus = "potential";
        target.potentialSignal = update.potentialSignal;
        target.signalTier = tier;
      }
    }
    if (retargets.length) {
      console.log("Potential retargets:");
      for (const line of retargets) console.log(`  ${line}`);
    }

    if (!dry) {
      if (rushils.length === 1 && rushils[0].founderStatus === "potential") {
        deletePerson(db, rushils[0].id);
        loaded.byId.delete(rushils[0].id);
        rushilDeleted = 1;
        console.log(`Deleted Rushil Mathur ${rushils[0].id}.`);
      } else if (rushils.length > 0) {
        throw new Error(`Refusing to delete Rushil Mathur: ${rushils.length} rows, statuses ${rushils.map((p) => p.founderStatus).join(",")}`);
      }
      ensureSource(db, now);
    }

    const seen = new Set<string>();
    for (const row of rows) {
      const status = (row.status || "").trim();
      if (status === "not_found" || !status) {
        if (row.searched === false) notSearched++;
        else notFound++;
        continue;
      }
      if (normName(row.person_name || "") === "rushil mathur") {
        skipped++;
        console.log("Skipping Rushil Mathur LinkedIn: removed because he is at Oxford, not Harvard.");
        continue;
      }
      const scout = lookupScout(index, row);
      const resolved = resolvePerson(row, scout, loaded.byId, loaded.byNorm, people);
      const label = `${row.person_name} [${row.source_file} ${row.person_id_or_key}]`;
      if (resolved.reason.startsWith("corrected")) console.log(`  ${label} -> ${resolved.person?.id} ${resolved.reason}`);
      if (!resolved.person) {
        skipped++;
        if (resolved.reason.startsWith("ambiguous")) ambiguous.push(`${label}: ${resolved.reason}`);
        else unmatched.push(`${label}: ${resolved.reason}${scout ? ` scout=${scout.name} ${scout.kind} ${scout.campusId ?? "no-campus"}` : " scout missing"}`);
        continue;
      }
      const person = resolved.person;
      if (person.id === rushils[0]?.id) {
        skipped++;
        continue;
      }
      const caveat = caveatFor(row.person_name || "") || caveatFor(scout?.name || "") || caveatFor(person.name);
      const url = linkedInUrl(row.linkedin_url);
      if ((status !== "confirmed" && status !== "unverified") || !url) {
        skipped++;
        unmatched.push(`${label}: status ${status} without a linkedin.com/in URL`);
        continue;
      }
      const slug = linkedInSlug(url);
      if (caveat) hand.push(`${person.name} ${person.id} ${status} ${url} :: ${caveat}`);
      if (seen.has(person.id)) {
        skipped++;
        already.push(`${person.name}: another backfill row was already applied`);
        continue;
      }
      seen.add(person.id);
      const owners = (slug ? loaded.slugOwners.get(slug) ?? [] : []).filter((id) => id !== person.id);
      if (hasConfirmedLinkedIn(person)) {
        skipped++;
        already.push(`${person.name} ${person.id}: confirmed LinkedIn already stored (${resolved.reason})`);
        if (!dry && caveat) notes += storeNote(person.id, caveat, row.evidence_excerpt);
        continue;
      }
      if (owners.length > 0) {
        skipped++;
        slugBlocked.push(`${person.name} ${person.id}: ${url} already belongs to ${owners.join(", ")}`);
        if (!dry && caveat) {
          notes += storeNote(person.id, `${caveat} The URL was not attached because it already belongs to another person.`, row.evidence_excerpt);
        }
        continue;
      }
      const evidence = (row.evidence_excerpt || "").trim();
      const noteSuffix = caveat ? ` Note: ${caveat}` : "";
      if (status === "confirmed") {
        if (!dry) {
          const beforeEnroll = db.prepare(`SELECT enrollment_status, enrollment_label FROM people WHERE id = ?`).get(person.id) as {
            enrollment_status: string | null;
            enrollment_label: string | null;
          };
          const aliases = [...person.aliases];
          if (!aliases.some((alias) => linkedInSlug(alias) === slug)) aliases.push(`linkedin:${url}`);
          if (!aliases.includes("linkedin_checked")) aliases.push("linkedin_checked");
          writeAliases.run(JSON.stringify(aliases), person.id);
          person.aliases = aliases;
          if (slug) {
            const list = loaded.slugOwners.get(slug) ?? [];
            list.push(person.id);
            loaded.slugOwners.set(slug, list);
          }
          insertClaim.run(
            newId("claim"),
            person.id,
            "linkedin_alias_discovered",
            JSON.stringify({ linkedin: url, why: evidence, caveat }),
            `${person.name}: confirmed LinkedIn ${url} because the search result names them with their school or company. Evidence: ${evidence.slice(0, 500)}.${noteSuffix}`,
            SOURCE_ID,
            url,
            now,
            "corroborated"
          );
          const decision = recomputePersonEnrollment(db, person.id);
          if ((beforeEnroll.enrollment_status ?? "unknown") !== decision.status || (beforeEnroll.enrollment_label ?? "") !== (decision.label ?? "")) {
            enrollmentChanges.push(
              `${person.name}: ${beforeEnroll.enrollment_status ?? "unknown"} ${beforeEnroll.enrollment_label ?? ""} -> ${decision.status} ${decision.label ?? ""}`
            );
          }
          if (caveat) notes += storeNote(person.id, caveat, evidence);
        }
        confirmed++;
        continue;
      }
      if (!dry) {
        const existing = db
          .prepare(`SELECT 1 as ok FROM claims WHERE entity_id = ? AND claim_type = 'linkedin_candidate' AND source_url = ? LIMIT 1`)
          .get(person.id, url) as { ok: number } | undefined;
        if (!existing) {
          insertClaim.run(
            newId("claim"),
            person.id,
            "linkedin_candidate",
            JSON.stringify({ linkedin: url, reason: "name matched; school and company did not", caveat }),
            `Unverified LinkedIn candidate for ${person.name}: ${url}. name matched; school and company did not. Evidence: ${evidence.slice(0, 300)}.${noteSuffix}`,
            SOURCE_ID,
            url,
            now,
            "unverified"
          );
        }
        if (caveat) notes += storeNote(person.id, caveat, evidence);
      }
      unverified++;
    }

    function storeNote(personId: string, caveat: string, evidence: string | null | undefined): number {
      const body = evidence?.trim() ? `${caveat} Evidence: ${evidence.trim().slice(0, 500)}` : caveat;
      const existing = noteExists.get(personId, body) as { ok: number } | undefined;
      if (existing) return 0;
      insertNote.run(newId("note"), personId, body, now);
      return 1;
    }
  });

  if (dry) {
    console.log("Dry run. No rows written.");
  }
  tx();
  if (!dry) db.pragma("wal_checkpoint(TRUNCATE)");

  const after = dry ? before : campusCounts(db);
  console.log(`\nConfirmed aliases ${confirmed}. Unverified candidates ${unverified}. Not found ignored ${notFound}. Unsearched ignored ${notSearched}. Skipped ${skipped}. Notes ${notes}. Rushil deleted ${rushilDeleted}.`);
  console.log(`\nUnmatched (${unmatched.length}):`);
  for (const line of unmatched) console.log(`  ${line}`);
  console.log(`\nAmbiguous (${ambiguous.length}):`);
  for (const line of ambiguous) console.log(`  ${line}`);
  console.log(`\nAlready confirmed (${already.length}):`);
  for (const line of already) console.log(`  ${line}`);
  console.log(`\nSlug owned by someone else (${slugBlocked.length}):`);
  for (const line of slugBlocked) console.log(`  ${line}`);
  console.log(`\nHand-check (${hand.length}):`);
  for (const line of hand) console.log(`  ${line}`);
  console.log(`\nEnrollment changes (${enrollmentChanges.length}):`);
  for (const line of enrollmentChanges) console.log(`  ${line}`);
  console.log("\nConfirmed LinkedIn before:", JSON.stringify(before));
  console.log("Confirmed LinkedIn after:", JSON.stringify(after));
}

main();
