// Verified LinkedIn profiles for former DRF student partners.
// Matches data/imports/drf_linkedin_verified.json onto data/imports/drf_alumni.json
// by name and school, then reloads the alumni table. Re-running writes the same rows.
//
//   npx tsx scripts/ingest/import-drf-linkedin-verified.ts
//
// A row is skipped when name and school do not pick exactly one alumni record,
// or when that profile slug is already stored on a different person. A slug on
// one other person with the same name is the same NYU alum, so the alumni row
// is linked to that person instead of leaving a duplicate. Confirmed rows keep
// the evidence note. A page cited in that note, other than the profile itself,
// is stored as linkedin_source_url.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { linkedinPersonSlug } from "../../lib/domain/dedupe";

const ALUMNI_PATH = path.join(process.cwd(), "data", "imports", "drf_alumni.json");
const VERIFIED_PATH = path.join(process.cwd(), "data", "imports", "drf_linkedin_verified.json");
const DB_PATH = path.join(process.cwd(), "data", "campus-universe.db");

export interface VerifiedLinkedIn {
  name: string;
  school: string;
  linkedin_url: string;
  evidence: string;
}

export interface ApplyMatch {
  id: string;
  name: string;
  url: string;
  changed: boolean;
}

export interface ApplySkip {
  name: string;
  school: string;
  reason: string;
}

export interface SlugPerson {
  id: string;
  name: string;
}

export interface ApplyRelink {
  alumniId: string;
  fromPersonId: string;
  toPersonId: string;
}

export interface ApplyVerifiedResult {
  alumni: Record<string, unknown>[];
  matched: ApplyMatch[];
  skipped: ApplySkip[];
  relinks: ApplyRelink[];
}

function clean(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

export function normalizeMatchText(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFKC")
    .replace(/[\u2018\u2019\u201B\u2032`]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function isUnknownSchool(value: string | null | undefined): boolean {
  const text = normalizeMatchText(value).replace(/[()]/g, "").trim();
  return text === "" || text === "unknown" || text === "school unknown";
}

export function normalizeVerifiedLinkedIn(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const match = raw.trim().match(/https?:\/\/(?:[\w.-]+\.)?linkedin\.com\/in\/([^/?#\s"'<>]+)/i);
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

export function evidenceSourceUrl(evidence: string): string | null {
  const matches = evidence.match(/https:\/\/[^\s<>"']+/g) ?? [];
  for (let raw of matches) {
    raw = raw.replace(/[),.;]+$/g, "");
    if (/linkedin\.com\/in\//i.test(raw)) continue;
    try {
      const url = new URL(raw);
      if (url.protocol !== "https:") continue;
    } catch {
      continue;
    }
    return raw;
  }
  return null;
}

export function evidenceNote(name: string, evidence: string): string {
  const text = evidence.replace(/\s+/g, " ").trim();
  if (text.length >= 40) return text;
  const sentence = `${name}: ${text}${text.endsWith(".") ? "" : "."}`;
  if (sentence.length >= 40) return sentence;
  return `${sentence} This note is the check that confirmed the profile.`;
}

function same(left: unknown, right: unknown): boolean {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

function schoolLabel(row: Record<string, unknown>): string {
  return clean(row.school_label);
}

function matchRow(alumni: Record<string, unknown>[], input: VerifiedLinkedIn): { row: Record<string, unknown> } | { reason: string } {
  const name = normalizeMatchText(input.name);
  const nameHits = alumni.filter((row) => normalizeMatchText(clean(row.name)) === name);
  if (nameHits.length === 0) return { reason: "no alumni row with this name" };
  if (isUnknownSchool(input.school)) {
    if (nameHits.length === 1 && isUnknownSchool(schoolLabel(nameHits[0]))) return { row: nameHits[0] };
    return { reason: "school is unknown and the name is not a single alumni row without a school" };
  }
  const school = normalizeMatchText(input.school);
  const schoolHits = nameHits.filter((row) => normalizeMatchText(schoolLabel(row)) === school);
  if (schoolHits.length === 1) return { row: schoolHits[0] };
  if (schoolHits.length === 0) return { reason: "name matched but the school did not" };
  return { reason: "name and school match more than one alumni row" };
}

function mergeProofs(existing: unknown, urls: string[]): string[] {
  const prior = Array.isArray(existing) ? existing.filter((url): url is string => typeof url === "string" && url.startsWith("https://")) : [];
  return [...new Set([...prior, ...urls])];
}

export function isNyuSchool(school: string | null | undefined, universityId: string | null | undefined): boolean {
  if (universityId === "univ_nyu") return true;
  const text = normalizeMatchText(school);
  return /\bnyu\b/.test(text) || text.includes("new york university");
}

export function applyVerifiedLinkedIn(
  alumni: Record<string, unknown>[],
  inputs: VerifiedLinkedIn[],
  taken: Map<string, Set<string>>,
  personByAlumni: Map<string, string>,
  people: Map<string, SlugPerson> = new Map()
): ApplyVerifiedResult {
  const next = alumni.map((row) => ({ ...row }));
  const byId = new Map(next.map((row) => [clean(row.id), row]));
  const slugCounts = new Map<string, number>();
  for (const input of inputs) {
    const slug = linkedinPersonSlug(normalizeVerifiedLinkedIn(input.linkedin_url));
    if (!slug) continue;
    slugCounts.set(slug, (slugCounts.get(slug) ?? 0) + 1);
  }

  const matched: ApplyMatch[] = [];
  const skipped: ApplySkip[] = [];
  const relinks: ApplyRelink[] = [];
  const usedIds = new Set<string>();

  for (const input of inputs) {
    const label = { name: clean(input.name) || "(missing name)", school: clean(input.school) || "(school unknown)" };
    const url = normalizeVerifiedLinkedIn(input.linkedin_url);
    const slug = linkedinPersonSlug(url);
    if (!url || !slug) {
      skipped.push({ ...label, reason: "LinkedIn URL is not a /in/ profile" });
      continue;
    }
    if ((slugCounts.get(slug) ?? 0) > 1) {
      skipped.push({ ...label, reason: `slug /in/${slug} is repeated in this import` });
      continue;
    }
    const found = matchRow(next, input);
    if ("reason" in found) {
      skipped.push({ ...label, reason: found.reason });
      continue;
    }
    const id = clean(found.row.id);
    if (!id || usedIds.has(id)) {
      skipped.push({ ...label, reason: "matched alumni row was already used by another verified profile" });
      continue;
    }
    const personId = personByAlumni.get(id) ?? "";
    const owners = taken.get(slug);
    const allowed = new Set([`alum:${id}`, personId ? `person:${personId}` : ""]);
    const other = [...(owners ?? [])].filter((owner) => owner && !allowed.has(owner));
    const alumniName = clean(found.row.name) || label.name;
    const samePersonId = sameNamePerson(other, people, alumniName);
    const linkExisting = !!samePersonId && isNyuSchool(schoolLabel(found.row) || input.school, clean(found.row.university_id));
    if (other.length > 0 && !linkExisting) {
      skipped.push({ ...label, reason: `slug /in/${slug} is already stored on ${other.join(", ")}` });
      continue;
    }
    const row = byId.get(id);
    if (!row) {
      skipped.push({ ...label, reason: "matched id is not in the alumni file" });
      continue;
    }
    const evidence = clean(input.evidence);
    if (evidence.length < 8) {
      skipped.push({ ...label, reason: "evidence note is missing" });
      continue;
    }
    const source = evidenceSourceUrl(evidence);
    const note = evidenceNote(label.name, evidence);
    const proofs = mergeProofs(row.proof_urls, source ? [source, url] : [url]);
    let changed = false;
    if (!same(row.linkedin_url, url)) {
      row.linkedin_url = url;
      changed = true;
    }
    if (!same(row.linkedin_confidence, "confirmed")) {
      row.linkedin_confidence = "confirmed";
      changed = true;
    }
    if (source && !same(row.linkedin_source_url, source)) {
      row.linkedin_source_url = source;
      changed = true;
    }
    if (!same(row.verification_note, note)) {
      row.verification_note = note;
      changed = true;
    }
    if (!same(row.proof_urls ?? [], proofs)) {
      row.proof_urls = proofs;
      changed = true;
    }
    const ownersForSlug = taken.get(slug) ?? new Set<string>();
    ownersForSlug.add(`alum:${id}`);
    if (personId) ownersForSlug.add(`person:${personId}`);
    if (samePersonId) ownersForSlug.add(`person:${samePersonId}`);
    taken.set(slug, ownersForSlug);
    usedIds.add(id);
    if (samePersonId && personId && personId !== samePersonId) {
      relinks.push({ alumniId: id, fromPersonId: personId, toPersonId: samePersonId });
    }
    matched.push({ id, name: clean(row.name) || label.name, url, changed });
  }

  return { alumni: next, matched, skipped, relinks };
}

function sameNamePerson(other: string[], people: Map<string, SlugPerson>, alumniName: string): string | null {
  const personIds = other.filter((owner) => owner.startsWith("person:")).map((owner) => owner.slice("person:".length));
  if (personIds.length !== 1 || other.length !== 1) return null;
  const person = people.get(personIds[0]);
  if (!person || normalizeMatchText(person.name) !== normalizeMatchText(alumniName)) return null;
  return person.id;
}

function aliasList(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw || "[]") as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function loadTaken(alumni: Record<string, unknown>[]): { taken: Map<string, Set<string>>; personByAlumni: Map<string, string>; people: Map<string, SlugPerson> } {
  const taken = new Map<string, Set<string>>();
  const add = (slug: string | null, owner: string) => {
    if (!slug) return;
    const owners = taken.get(slug) ?? new Set<string>();
    owners.add(owner);
    taken.set(slug, owners);
  };
  for (const row of alumni) {
    add(linkedinPersonSlug(clean(row.linkedin_url)), `alum:${clean(row.id)}`);
  }
  const personByAlumni = new Map<string, string>();
  const people = new Map<string, SlugPerson>();
  if (!fs.existsSync(DB_PATH)) return { taken, personByAlumni, people };
  const db = new Database(DB_PATH, { readonly: true, fileMustExist: true });
  try {
    const rows = db.prepare(`SELECT id, name, aliases_json FROM people`).all() as { id: string; name: string; aliases_json: string }[];
    for (const person of rows) {
      people.set(person.id, { id: person.id, name: person.name });
      for (const alias of aliasList(person.aliases_json)) {
        add(linkedinPersonSlug(alias), `person:${person.id}`);
      }
    }
    const alumniRows = db.prepare(`SELECT id, person_id FROM drf_alumni`).all() as { id: string; person_id: string }[];
    for (const row of alumniRows) {
      if (row.person_id) personByAlumni.set(row.id, row.person_id);
    }
  } finally {
    db.close();
  }
  return { taken, personByAlumni, people };
}

function applyRelinks(relinks: ApplyRelink[]) {
  if (relinks.length === 0 || !fs.existsSync(DB_PATH)) return;
  const db = new Database(DB_PATH);
  try {
    const update = db.prepare(`UPDATE drf_alumni SET person_id = ? WHERE id = ? AND person_id = ?`);
    const tx = db.transaction(() => {
      for (const link of relinks) {
        if (!link.fromPersonId.startsWith("person_drf_") || link.fromPersonId === link.toPersonId) continue;
        const target = db.prepare(`SELECT id FROM people WHERE id = ?`).get(link.toPersonId) as { id: string } | undefined;
        if (!target) continue;
        const occupied = db.prepare(`SELECT id FROM drf_alumni WHERE person_id = ? AND id != ?`).get(link.toPersonId, link.alumniId) as { id: string } | undefined;
        if (occupied) {
          console.warn(`${link.alumniId}: ${link.toPersonId} is already linked to ${occupied.id}; person link left unchanged`);
          continue;
        }
        update.run(link.toPersonId, link.alumniId, link.fromPersonId);
        console.log(`linked ${link.alumniId} from ${link.fromPersonId} to ${link.toPersonId}`);
      }
    });
    tx();
  } finally {
    db.close();
  }
}

function countRows(db: Database.Database, sql: string, ...args: string[]): number {
  return (db.prepare(sql).get(...args) as { n: number }).n;
}

function dropEmptyStubs(relinks: ApplyRelink[]) {
  if (relinks.length === 0 || !fs.existsSync(DB_PATH)) return;
  const db = new Database(DB_PATH);
  try {
    const tx = db.transaction(() => {
      for (const link of relinks) {
        const id = link.fromPersonId;
        if (!id.startsWith("person_drf_")) continue;
        const refs = [
          countRows(db, `SELECT COUNT(*) AS n FROM drf_alumni WHERE person_id = ?`, id),
          countRows(db, `SELECT COUNT(*) AS n FROM affiliations WHERE person_id = ?`, id),
          countRows(db, `SELECT COUNT(*) AS n FROM person_project_roles WHERE person_id = ?`, id),
          countRows(db, `SELECT COUNT(*) AS n FROM possible_companies WHERE person_id = ?`, id),
          countRows(db, `SELECT COUNT(*) AS n FROM precollege_signals WHERE person_id = ?`, id),
          countRows(db, `SELECT COUNT(*) AS n FROM program_signals WHERE person_id = ?`, id),
          countRows(db, `SELECT COUNT(*) AS n FROM news_mentions WHERE person_id = ?`, id),
          countRows(db, `SELECT COUNT(*) AS n FROM claims WHERE entity_id = ?`, id),
          countRows(db, `SELECT COUNT(*) AS n FROM relationships WHERE source_entity_id = ? OR target_entity_id = ?`, id, id),
          countRows(db, `SELECT COUNT(*) AS n FROM notes WHERE entity_id = ?`, id),
        ];
        if (refs.some((n) => n > 0)) {
          console.warn(`${id}: still referenced after the alumni link moved; duplicate person kept`);
          continue;
        }
        db.prepare(`DELETE FROM people WHERE id = ?`).run(id);
        console.log(`removed duplicate person ${id}`);
      }
    });
    tx();
  } finally {
    db.close();
  }
}

function readVerified(filePath: string): VerifiedLinkedIn[] {
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
  if (!Array.isArray(parsed)) throw new Error("verified LinkedIn file must be a list");
  return parsed.map((item, index) => {
    if (!item || typeof item !== "object") throw new Error(`verified row ${index + 1} is not an object`);
    const row = item as Record<string, unknown>;
    return {
      name: clean(row.name),
      school: clean(row.school),
      linkedin_url: clean(row.linkedin_url),
      evidence: clean(row.evidence),
    };
  });
}

function main() {
  const alumni = JSON.parse(fs.readFileSync(ALUMNI_PATH, "utf8")) as Record<string, unknown>[];
  const inputs = readVerified(VERIFIED_PATH);
  if (!Array.isArray(alumni)) throw new Error("alumni file must be a list");
  const { taken, personByAlumni, people } = loadTaken(alumni);
  const applied = applyVerifiedLinkedIn(alumni, inputs, taken, personByAlumni, people);
  const next = JSON.stringify(applied.alumni, null, 2) + "\n";
  const prev = fs.readFileSync(ALUMNI_PATH, "utf8");
  if (next !== prev) fs.writeFileSync(ALUMNI_PATH, next);
  const updated = applied.matched.filter((row) => row.changed).length;
  const confirmed = applied.alumni.filter((row) => row.linkedin_confidence === "confirmed").length;
  console.log(
    `verified linkedin: matched ${applied.matched.length} (updated ${updated}, already current ${applied.matched.length - updated}); skipped ${applied.skipped.length}; linkedin confirmed: ${confirmed}`
  );
  for (const row of applied.matched) console.log(`matched ${row.id} ${row.name} ${row.url}${row.changed ? "" : " (unchanged)"}`);
  for (const row of applied.skipped) console.log(`skipped ${row.name} | ${row.school} | ${row.reason}`);
  applyRelinks(applied.relinks);

  const tsx = path.join(process.cwd(), "node_modules", ".bin", "tsx");
  const child = spawnSync(tsx, ["scripts/ingest/import-drf-alumni.ts"], { stdio: "inherit", cwd: process.cwd() });
  if (child.status !== 0) process.exit(child.status ?? 1);
  dropEmptyStubs(applied.relinks);
}

const isEntry = /import-drf-linkedin-verified\.(ts|js)$/.test(process.argv[1] ?? "");
if (isEntry) main();
