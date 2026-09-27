// Who can intro a tracked startup or founder to a DRF alum.
// Every path is a stored overlap: school years, a club or batch, a company
// or co-founder, a recorded investment, or a metro both sides name.
// A graduation year is a four-year window ending that year. A missing year,
// place, or batch is skipped — it is never filled in.

import fs from "node:fs";
import { databasePath, getDb } from "../db/client";
import type { DrfAlumRow } from "./drf-alumni";
import { yearsLabel } from "./drf-alumni";
import { loadIntroGraph, type IntroGraph, type IntroOrg } from "./intro-graph";
import { metroOf } from "./network-analysis-model";
import { viaLabel } from "./warm-paths";

export type IntroStrength = "strong" | "medium" | "weak";

export interface IntroPath {
  alumPersonId: string;
  alumName: string;
  role: string | null;
  firm: string | null;
  school: string | null;
  linkedinUrl: string | null;
  linkedinConfidence: "confirmed" | "likely" | null;
  strength: IntroStrength;
  reason: string;
  throughFounder: string | null;
  evidenceUrl: string | null;
}

export interface IntroTarget {
  id: string;
  kind: "project" | "person";
  name: string;
  campusName: string | null;
  websiteUrl: string | null;
}

export interface IntroPanel {
  target: IntroTarget | null;
  paths: IntroPath[];
}

export interface AlumStartup {
  id: string;
  name: string;
  relation: "Founded" | "Works at";
}

export interface AlumReferral {
  id: string;
  personId: string;
  name: string;
  school: string | null;
  years: string | null;
  role: string | null;
  firm: string | null;
  location: string | null;
  linkedinUrl: string | null;
  linkedinConfidence: "confirmed" | "likely" | null;
  sourceUrl: string;
  firmSourceUrl: string | null;
  startups: AlumStartup[];
  canRefer: boolean;
  reach: number;
  weakReach: number;
  samples: { startupId: string; startupName: string; strength: IntroStrength; reason: string }[];
}

export interface IntroCoverage {
  alumni: number;
  alumniWithLinkedIn: number;
  trackedStartups: number;
  startupsWithPath: number;
  startupsWithWarmPath: number;
  alumniWhoCanRefer: number;
}

interface YearSpan {
  start: number;
  end: number;
}

interface BatchHit {
  key: string;
  label: string;
  sourceUrl: string | null;
}

interface Candidate {
  alum: DrfAlumRow;
  score: number;
  strength: IntroStrength;
  reason: string;
  evidenceUrl: string | null;
  throughFounder: string | null;
}

interface ReferralIndex {
  graph: IntroGraph;
  alumByPerson: Map<string, DrfAlumRow>;
  classYear: Map<string, number>;
  alumSpansByCampus: Map<string, { alum: DrfAlumRow; span: YearSpan }[]>;
  membersByProgram: Map<string, { personId: string; sourceUrl: string | null }[]>;
  batchesByPerson: Map<string, BatchHit[]>;
  batchesByProject: Map<string, BatchHit[]>;
  peopleByBatch: Map<string, string[]>;
  projectsByBatch: Map<string, { projectId: string; label: string; sourceUrl: string | null }[]>;
  metroByPerson: Map<string, { id: string; label: string }>;
  metroByProject: Map<string, { id: string; label: string; sourceUrl: string }>;
  alumniByMetro: Map<string, DrfAlumRow[]>;
  foundedByPerson: Map<string, Set<string>>;
  backersByProject: Map<string, { alum: DrfAlumRow; url: string }[]>;
  personLinks: Map<string, Candidate[]>;
  projectPaths: Map<string, IntroPath[]>;
  /** Best path from each alum to each startup they can refer. Includes weak metro paths. */
  reachByAlum: Map<string, Map<string, Candidate>>;
  alumni: AlumReferral[];
  coverage: IntroCoverage;
}

const TIGHT = 80;
const PATH_LIMIT = 6;
const SAMPLE_LIMIT = 5;

const SEASON: Record<string, string> = { winter: "W", summer: "S", fall: "F", spring: "X" };

let cache: { stamp: string; index: ReferralIndex } | null = null;

export function yearOverlap(left: YearSpan, right: YearSpan): YearSpan | null {
  const start = Math.max(left.start, right.start);
  const end = Math.min(left.end, right.end);
  if (start > end) return null;
  return { start, end };
}

function shortYear(raw: string): string | null {
  if (/^\d{4}$/.test(raw)) return raw.slice(2);
  if (/^\d{2}$/.test(raw)) return raw;
  return null;
}

/** Batch tokens that are written out in a stored excerpt. */
export function batchKeysFromExcerpt(text: string): { key: string; label: string }[] {
  const found = new Map<string, string>();
  const add = (key: string, label: string) => {
    if (!found.has(key)) found.set(key, label);
  };
  for (const match of text.matchAll(/\bYC\s+([WSFX])(\d{2}|\d{4})\b/gi)) {
    const year = shortYear(match[2]);
    if (!year) continue;
    const season = match[1].toUpperCase();
    add(`yc:${season}${year}`, `YC ${season}${year}`);
  }
  const yc = /y combinator/i.exec(text);
  if (yc) {
    const window = text.slice(Math.max(0, yc.index - 80), yc.index + 80);
    for (const match of window.matchAll(/\b(Winter|Summer|Fall|Spring)\s+(20\d{2})\b/gi)) {
      const season = SEASON[match[1].toLowerCase()];
      if (!season) continue;
      const year = match[2].slice(2);
      add(`yc:${season}${year}`, `YC ${season}${year}`);
    }
  }
  for (const match of text.matchAll(/\bFree Ventures\s+([FS])(20\d{2})\b/gi)) {
    add(`fv:${match[1].toUpperCase()}${match[2]}`, `Free Ventures ${match[1].toUpperCase()}${match[2]}`);
  }
  for (const match of text.matchAll(/\bThiel Fellowship\s+(20\d{2})\b/gi)) {
    add(`thiel:${match[1]}`, `Thiel Fellowship ${match[1]}`);
  }
  return [...found].map(([key, label]) => ({ key, label }));
}

export function batchReason(key: string, label: string): string {
  if (key.startsWith("thiel:")) return `Same ${label}`;
  return `Same ${label} batch`;
}

/** Plain-language overlap. A class year is stated only when both stored years match and sit inside the overlap. */
export function samePlaceReason(label: string, alumYear: number | null, otherYear: number | null, overlap: YearSpan | null): string {
  if (
    overlap &&
    alumYear != null &&
    otherYear != null &&
    alumYear === otherYear &&
    alumYear >= overlap.start &&
    alumYear <= overlap.end
  ) {
    return `Same ${label} class, ${alumYear}`;
  }
  if (overlap) {
    const years = overlap.start === overlap.end ? String(overlap.start) : `${overlap.start}–${overlap.end}`;
    return `Same ${label}, overlapping years ${years}`;
  }
  return `Same ${label}`;
}

function normName(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function better(next: Candidate, prev: Candidate): boolean {
  if (next.score !== prev.score) return next.score > prev.score;
  return next.reason.length < prev.reason.length;
}

function consider(best: Map<string, Candidate>, candidate: Candidate) {
  if (!candidate.alum.personId) return;
  const prev = best.get(candidate.alum.personId);
  if (!prev || better(candidate, prev)) best.set(candidate.alum.personId, candidate);
}

function programTier(org: IntroOrg): IntroStrength {
  if (org.cohort || (org.members > 0 && org.members <= TIGHT)) return "strong";
  return "medium";
}

function programScore(org: IntroOrg, sameClass: boolean): number {
  const tight = programTier(org) === "strong";
  if (tight && sameClass) return 90;
  if (tight) return 88;
  if (sameClass) return 70;
  return 60;
}

function classYearOf(index: ReferralIndex, personId: string): number | null {
  const alum = index.alumByPerson.get(personId);
  if (alum?.classYear) return alum.classYear;
  return index.classYear.get(personId) ?? null;
}

function overlapWithAlum(index: ReferralIndex, personId: string, alum: DrfAlumRow): { label: string; overlap: YearSpan } | null {
  const left = index.graph.schoolYears.get(personId) ?? [];
  const right = index.graph.schoolYears.get(alum.personId) ?? [];
  let best: { label: string; overlap: YearSpan } | null = null;
  for (const a of left) {
    for (const b of right) {
      if (a.universityId !== b.universityId) continue;
      const overlap = yearOverlap(a, b);
      if (!overlap) continue;
      const span = overlap.end - overlap.start;
      if (!best || span > best.overlap.end - best.overlap.start) {
        const org = index.graph.orgs.get(a.universityId);
        best = { label: org?.campusShort || org?.name || a.universityId, overlap };
      }
    }
  }
  return best;
}

function yearSpan(alum: DrfAlumRow): YearSpan | null {
  const start = alum.yearStart ?? alum.yearEnd ?? alum.classYear;
  const end = alum.yearEnd ?? alum.yearStart ?? alum.classYear;
  if (start == null || end == null) return null;
  return { start: Math.min(start, end), end: Math.max(start, end) };
}

function pushBatch(map: Map<string, BatchHit[]>, id: string, hit: BatchHit) {
  const list = map.get(id) ?? [];
  if (list.some((item) => item.key === hit.key)) return;
  list.push(hit);
  map.set(id, list);
}

function loadIndex(): ReferralIndex {
  let stamp = "missing";
  try {
    const stat = fs.statSync(databasePath());
    stamp = `${stat.mtimeMs}:${stat.size}`;
  } catch {
    stamp = "missing";
  }
  if (cache?.stamp === stamp) return cache.index;
  const index = assembleReferralIndex();
  cache = { stamp, index };
  return index;
}

function assembleReferralIndex(): ReferralIndex {
  const graph = loadIntroGraph();
  const db = getDb();
  const alumByPerson = new Map(graph.alumni.map((alum) => [alum.personId, alum]));
  const classYear = new Map<string, number>();
  for (const row of db.prepare(`SELECT id, enrollment_grad_year FROM people WHERE enrollment_grad_year IS NOT NULL`).all() as {
    id: string;
    enrollment_grad_year: number;
  }[]) {
    classYear.set(row.id, row.enrollment_grad_year);
  }

  const alumSpansByCampus = new Map<string, { alum: DrfAlumRow; span: YearSpan }[]>();
  for (const alum of graph.alumni) {
    for (const span of graph.schoolYears.get(alum.personId) ?? []) {
      const list = alumSpansByCampus.get(span.universityId) ?? [];
      list.push({ alum, span });
      alumSpansByCampus.set(span.universityId, list);
    }
  }

  const membersByProgram = new Map<string, { personId: string; sourceUrl: string | null }[]>();
  for (const [orgId, members] of graph.peopleByOrg) {
    const org = graph.orgs.get(orgId);
    if (!org || org.kind !== "program") continue;
    membersByProgram.set(orgId, members.map((member) => ({ personId: member.personId, sourceUrl: member.sourceUrl })));
  }
  const programRels = db.prepare(
    `SELECT r.source_entity_id AS person_id, r.target_entity_id AS project_id, p.website_url
     FROM relationships r
     JOIN projects p ON p.id = r.target_entity_id
     WHERE r.relationship_type IN ('part_of_program', 'participated_in_program')
       AND r.source_entity_type = 'person'`
  ).all() as { person_id: string; project_id: string; website_url: string | null }[];
  for (const row of programRels) {
    const org = graph.orgs.get(row.project_id);
    if (!org || org.kind === "company") continue;
    const list = membersByProgram.get(row.project_id) ?? [];
    if (!list.some((member) => member.personId === row.person_id)) {
      list.push({ personId: row.person_id, sourceUrl: row.website_url });
      membersByProgram.set(row.project_id, list);
    }
  }

  const batchesByPerson = new Map<string, BatchHit[]>();
  const batchesByProject = new Map<string, BatchHit[]>();
  const claimRows = db.prepare(
    `SELECT entity_type, entity_id, excerpt, source_url FROM claims
     WHERE claim_type = 'program_membership'
       AND (excerpt LIKE '%YC %' OR excerpt LIKE '%Y Combinator%' OR excerpt LIKE '%Free Ventures%' OR excerpt LIKE '%Thiel Fellowship%')`
  ).all() as { entity_type: string; entity_id: string; excerpt: string; source_url: string }[];
  for (const row of claimRows) {
    for (const hit of batchKeysFromExcerpt(row.excerpt)) {
      const batch = { ...hit, sourceUrl: row.source_url };
      if (row.entity_type === "project") pushBatch(batchesByProject, row.entity_id, batch);
      if (row.entity_type === "person") pushBatch(batchesByPerson, row.entity_id, batch);
    }
  }
  for (const [personId, memberships] of graph.orgsByPerson) {
    for (const membership of memberships) {
      for (const hit of batchesByProject.get(membership.orgId) ?? []) pushBatch(batchesByPerson, personId, hit);
    }
  }
  const peopleByBatch = new Map<string, string[]>();
  for (const [personId, hits] of batchesByPerson) {
    for (const hit of hits) {
      const list = peopleByBatch.get(hit.key) ?? [];
      if (!list.includes(personId)) list.push(personId);
      peopleByBatch.set(hit.key, list);
    }
  }
  const projectsByBatch = new Map<string, { projectId: string; label: string; sourceUrl: string | null }[]>();
  for (const [projectId, hits] of batchesByProject) {
    for (const hit of hits) {
      const list = projectsByBatch.get(hit.key) ?? [];
      if (!list.some((item) => item.projectId === projectId)) list.push({ projectId, label: hit.label, sourceUrl: hit.sourceUrl });
      projectsByBatch.set(hit.key, list);
    }
  }

  const metroByPerson = new Map<string, { id: string; label: string }>();
  const alumniByMetro = new Map<string, DrfAlumRow[]>();
  for (const alum of graph.alumni) {
    if (!alum.location) continue;
    const metro = metroOf(alum.location);
    if (!metro) continue;
    metroByPerson.set(alum.personId, { id: metro.id, label: metro.label });
    const list = alumniByMetro.get(metro.id) ?? [];
    list.push(alum);
    alumniByMetro.set(metro.id, list);
  }
  const hqRows = db.prepare(`SELECT project_id, value_text, source_url FROM company_facts WHERE fact_key = 'hq'`).all() as {
    project_id: string;
    value_text: string;
    source_url: string;
  }[];
  const hqByProject = new Map<string, { id: string; label: string; sourceUrl: string }[]>();
  for (const row of hqRows) {
    const metro = metroOf(row.value_text);
    if (!metro) continue;
    const list = hqByProject.get(row.project_id) ?? [];
    if (!list.some((item) => item.id === metro.id)) list.push({ id: metro.id, label: metro.label, sourceUrl: row.source_url });
    hqByProject.set(row.project_id, list);
  }
  const metroByProject = new Map<string, { id: string; label: string; sourceUrl: string }>();
  for (const [projectId, metros] of hqByProject) {
    if (metros.length === 1) metroByProject.set(projectId, metros[0]);
  }

  const foundedByPerson = new Map<string, Set<string>>();
  for (const [personId, startups] of graph.startupsByPerson) {
    const set = new Set<string>();
    for (const startupId of startups) {
      if (graph.orgs.get(startupId)?.kind === "company") set.add(startupId);
    }
    if (set.size) foundedByPerson.set(personId, set);
  }

  const index: ReferralIndex = {
    graph,
    alumByPerson,
    classYear,
    alumSpansByCampus,
    membersByProgram,
    batchesByPerson,
    batchesByProject,
    peopleByBatch,
    projectsByBatch,
    metroByPerson,
    metroByProject,
    alumniByMetro,
    foundedByPerson,
    backersByProject: new Map(),
    personLinks: new Map(),
    projectPaths: new Map(),
    reachByAlum: new Map(),
    alumni: [],
    coverage: {
      alumni: graph.alumni.length,
      alumniWithLinkedIn: graph.alumni.filter((alum) => alum.linkedinUrl).length,
      trackedStartups: 0,
      startupsWithPath: 0,
      startupsWithWarmPath: 0,
      alumniWhoCanRefer: 0,
    },
  };

  const tracked = new Set<string>();
  for (const startups of foundedByPerson.values()) {
    for (const startupId of startups) tracked.add(startupId);
  }
  index.coverage.trackedStartups = tracked.size;

  for (const alum of graph.alumni) {
    if (!alum.investorId || !alum.currentFirm) continue;
    for (const item of graph.portfolioByInvestor.get(alum.investorId) ?? []) {
      const list = index.backersByProject.get(item.projectId) ?? [];
      if (!list.some((row) => row.alum.personId === alum.personId)) list.push({ alum, url: item.sourceUrl });
      index.backersByProject.set(item.projectId, list);
    }
  }

  const rolesByPerson = new Map<string, AlumStartup[]>();
  for (const row of db.prepare(
    `SELECT ppr.person_id, ppr.role, p.id, p.name
     FROM person_project_roles ppr
     JOIN projects p ON p.id = ppr.project_id
     JOIN drf_alumni a ON a.person_id = ppr.person_id
     WHERE p.kind = 'company'`
  ).all() as { person_id: string; role: string | null; id: string; name: string }[]) {
    const list = rolesByPerson.get(row.person_id) ?? [];
    if (list.some((item) => item.id === row.id)) continue;
    const founder = (row.role ?? "").toLowerCase().includes("founder");
    list.push({ id: row.id, name: row.name, relation: founder ? "Founded" : "Works at" });
    rolesByPerson.set(row.person_id, list);
  }
  const companyByNorm = new Map<string, string | null>();
  for (const org of graph.orgs.values()) {
    if (org.kind !== "company") continue;
    const key = normName(org.name);
    if (!key) continue;
    if (!companyByNorm.has(key)) companyByNorm.set(key, org.id);
    else if (companyByNorm.get(key) !== org.id) companyByNorm.set(key, null);
  }

  const byAlum = new Map<string, Map<string, Candidate>>();
  const remember = (startupId: string, candidate: Candidate) => {
    if (index.foundedByPerson.get(candidate.alum.personId)?.has(startupId)) return;
    const startups = byAlum.get(candidate.alum.personId) ?? new Map<string, Candidate>();
    const prev = startups.get(startupId);
    if (!prev || better(candidate, prev)) startups.set(startupId, candidate);
    byAlum.set(candidate.alum.personId, startups);
  };

  for (const startupId of tracked) {
    const ranked = rankProject(index, startupId);
    index.projectPaths.set(startupId, ranked.slice(0, PATH_LIMIT).map((candidate) => toPath(candidate, candidate.throughFounder)));
    if (ranked.length) index.coverage.startupsWithPath += 1;
    if (ranked.some((candidate) => candidate.strength !== "weak")) index.coverage.startupsWithWarmPath += 1;
    for (const candidate of ranked) remember(startupId, candidate);
  }

  index.reachByAlum = byAlum;
  index.alumni = graph.alumni.map((alum) => alumReferral(index, alum, byAlum.get(alum.personId) ?? new Map(), rolesByPerson, companyByNorm));
  index.coverage.alumniWhoCanRefer = index.alumni.filter((alum) => alum.canRefer).length;
  return index;
}

function alumStartups(alum: DrfAlumRow, roles: Map<string, AlumStartup[]>, companyByNorm: Map<string, string | null>, orgs: IntroGraph["orgs"]): AlumStartup[] {
  const rows = [...(roles.get(alum.personId) ?? [])];
  const seen = new Set(rows.map((row) => row.id));
  if (alum.currentFirm) {
    const id = companyByNorm.get(normName(alum.currentFirm));
    const match = id ? orgs.get(id) : undefined;
    if (match && match.kind === "company" && !seen.has(match.id)) rows.push({ id: match.id, name: match.name, relation: "Works at" });
  }
  return rows.sort((a, b) => a.relation.localeCompare(b.relation) || a.name.localeCompare(b.name));
}

function alumReferral(
  index: ReferralIndex,
  alum: DrfAlumRow,
  startups: Map<string, Candidate>,
  roles: Map<string, AlumStartup[]>,
  companyByNorm: Map<string, string | null>
): AlumReferral {
  const ranked = [...startups.entries()].sort((a, b) => b[1].score - a[1].score || a[1].reason.localeCompare(b[1].reason));
  const reach = ranked.filter(([, candidate]) => candidate.strength !== "weak").length;
  const weakReach = ranked.filter(([, candidate]) => candidate.strength === "weak").length;
  return {
    id: alum.id,
    personId: alum.personId,
    name: alum.name,
    school: alum.schoolLabel,
    years: yearsLabel(alum),
    role: alum.currentRole,
    firm: alum.currentFirm,
    location: alum.location,
    linkedinUrl: alum.linkedinUrl,
    linkedinConfidence: alum.linkedinConfidence,
    sourceUrl: alum.sourceUrl,
    firmSourceUrl: alum.firmSourceUrl,
    startups: alumStartups(alum, roles, companyByNorm, index.graph.orgs),
    canRefer: reach > 0,
    reach,
    weakReach,
    samples: ranked.slice(0, SAMPLE_LIMIT).map(([startupId, candidate]) => ({
      startupId,
      startupName: index.graph.orgs.get(startupId)?.name ?? startupId,
      strength: candidate.strength,
      reason: candidate.reason,
    })),
  };
}

function linksForPerson(index: ReferralIndex, personId: string): Candidate[] {
  const cached = index.personLinks.get(personId);
  if (cached) return cached;
  const best = new Map<string, Candidate>();
  const person = index.graph.people.get(personId);
  if (!person) {
    index.personLinks.set(personId, []);
    return [];
  }

  for (const link of index.graph.cofounders.get(personId) ?? []) {
    const alum = index.alumByPerson.get(link.personId);
    if (!alum || alum.personId === personId) continue;
    consider(best, {
      alum,
      score: 100,
      strength: "strong",
      reason: "Co-founder",
      evidenceUrl: link.sourceUrl,
      throughFounder: null,
    });
  }

  for (const membership of index.graph.orgsByPerson.get(personId) ?? []) {
    const org = index.graph.orgs.get(membership.orgId);
    if (!org || org.kind !== "company") continue;
    for (const member of index.graph.peopleByOrg.get(org.id) ?? []) {
      const alum = index.alumByPerson.get(member.personId);
      if (!alum || alum.personId === personId) continue;
      consider(best, {
        alum,
        score: 86,
        strength: "strong",
        reason: `Same company, ${org.name}`,
        evidenceUrl: member.sourceUrl ?? membership.sourceUrl ?? org.sourceUrl,
        throughFounder: null,
      });
    }
  }

  for (const membership of index.graph.orgsByPerson.get(personId) ?? []) {
    const org = index.graph.orgs.get(membership.orgId);
    if (!org || org.kind !== "program") continue;
    for (const member of index.membersByProgram.get(org.id) ?? []) {
      const alum = index.alumByPerson.get(member.personId);
      if (!alum || alum.personId === personId) continue;
      const shared = overlapWithAlum(index, personId, alum);
      const alumYear = classYearOf(index, alum.personId);
      const otherYear = classYearOf(index, personId);
      const sameClass = alumYear != null && alumYear === otherYear;
      const overlap = shared?.overlap ?? (sameClass && alumYear != null ? { start: alumYear, end: alumYear } : null);
      const label = viaLabel(org);
      consider(best, {
        alum,
        score: programScore(org, sameClass),
        strength: programTier(org),
        reason: samePlaceReason(label, alumYear, otherYear, overlap),
        evidenceUrl: member.sourceUrl ?? membership.sourceUrl ?? org.sourceUrl,
        throughFounder: null,
      });
    }
  }

  const targetAlum = index.alumByPerson.get(personId);
  if (targetAlum?.drfTeam) {
    const targetSpan = yearSpan(targetAlum);
    if (targetSpan) {
      for (const alum of index.graph.alumni) {
        if (alum.personId === personId || alum.drfTeam !== targetAlum.drfTeam) continue;
        const span = yearSpan(alum);
        const overlap = span ? yearOverlap(targetSpan, span) : null;
        if (!overlap) continue;
        const years = overlap.start === overlap.end ? String(overlap.start) : `${overlap.start}–${overlap.end}`;
        consider(best, {
          alum,
          score: 94,
          strength: "strong",
          reason: `Same ${alum.drfTeam} DRF team, overlapping years ${years}`,
          evidenceUrl: alum.sourceUrl,
          throughFounder: null,
        });
      }
    }
  }

  for (const span of index.graph.schoolYears.get(personId) ?? []) {
    for (const row of index.alumSpansByCampus.get(span.universityId) ?? []) {
      if (row.alum.personId === personId) continue;
      const overlap = yearOverlap(span, row.span);
      if (!overlap) continue;
      const label = index.graph.orgs.get(span.universityId)?.campusShort || index.graph.orgs.get(span.universityId)?.name || span.universityId;
      const alumYear = classYearOf(index, row.alum.personId);
      const otherYear = classYearOf(index, personId);
      consider(best, {
        alum: row.alum,
        score: alumYear != null && alumYear === otherYear ? 55 : 50,
        strength: "medium",
        reason: samePlaceReason(label, alumYear, otherYear, overlap),
        evidenceUrl: row.alum.sourceUrl,
        throughFounder: null,
      });
    }
  }

  for (const hit of index.batchesByPerson.get(personId) ?? []) {
    for (const otherId of index.peopleByBatch.get(hit.key) ?? []) {
      const alum = index.alumByPerson.get(otherId);
      if (!alum || alum.personId === personId) continue;
      consider(best, {
        alum,
        score: 92,
        strength: "strong",
        reason: batchReason(hit.key, hit.label),
        evidenceUrl: hit.sourceUrl,
        throughFounder: null,
      });
    }
  }

  const links = [...best.values()];
  index.personLinks.set(personId, links);
  return links;
}

function toPath(candidate: Candidate, throughFounder: string | null): IntroPath {
  return {
    alumPersonId: candidate.alum.personId,
    alumName: candidate.alum.name,
    role: candidate.alum.currentRole,
    firm: candidate.alum.currentFirm,
    school: candidate.alum.schoolLabel,
    linkedinUrl: candidate.alum.linkedinUrl,
    linkedinConfidence: candidate.alum.linkedinConfidence,
    strength: candidate.strength,
    reason: candidate.reason,
    throughFounder,
    evidenceUrl: candidate.evidenceUrl ?? candidate.alum.sourceUrl,
  };
}

function present(best: Map<string, Candidate>, throughName: Map<string, string | null>): IntroPath[] {
  return [...best.values()]
    .sort((a, b) => b.score - a.score || a.alum.name.localeCompare(b.alum.name))
    .slice(0, PATH_LIMIT)
    .map((candidate) => toPath(candidate, throughName.get(candidate.alum.personId) ?? candidate.throughFounder));
}

function rankProject(index: ReferralIndex, projectId: string): Candidate[] {
  const best = new Map<string, Candidate>();
  const founders = index.graph.peopleByOrg.get(projectId)?.map((member) => member.personId) ?? [];
  const founderIds = founders.filter((personId) => index.foundedByPerson.get(personId)?.has(projectId));
  for (const founderId of founderIds) {
    const founderName = index.graph.people.get(founderId)?.name ?? null;
    for (const link of linksForPerson(index, founderId)) {
      if (index.foundedByPerson.get(link.alum.personId)?.has(projectId)) continue;
      consider(best, { ...link, throughFounder: founderName });
    }
  }

  for (const hit of index.batchesByProject.get(projectId) ?? []) {
    for (const personId of index.peopleByBatch.get(hit.key) ?? []) {
      const alum = index.alumByPerson.get(personId);
      if (!alum || index.foundedByPerson.get(alum.personId)?.has(projectId)) continue;
      consider(best, {
        alum,
        score: 92,
        strength: "strong",
        reason: batchReason(hit.key, hit.label),
        evidenceUrl: hit.sourceUrl,
        throughFounder: null,
      });
    }
  }

  for (const item of index.backersByProject.get(projectId) ?? []) {
    if (index.foundedByPerson.get(item.alum.personId)?.has(projectId)) continue;
    consider(best, {
      alum: item.alum,
      score: 96,
      strength: "strong",
      reason: `Backed through ${item.alum.currentFirm}`,
      evidenceUrl: item.url,
      throughFounder: null,
    });
  }

  const metro = index.metroByProject.get(projectId);
  if (metro) {
    for (const alum of index.alumniByMetro.get(metro.id) ?? []) {
      if (index.foundedByPerson.get(alum.personId)?.has(projectId)) continue;
      consider(best, {
        alum,
        score: 10,
        strength: "weak",
        reason: `Same ${metro.label} metro`,
        evidenceUrl: metro.sourceUrl,
        throughFounder: null,
      });
    }
  }

  return [...best.values()].sort((a, b) => b.score - a.score || a.alum.name.localeCompare(b.alum.name));
}

function linksToPerson(index: ReferralIndex, personId: string): IntroPath[] {
  const best = new Map<string, Candidate>();
  const throughName = new Map<string, string | null>();
  for (const link of linksForPerson(index, personId)) {
    consider(best, link);
    throughName.set(link.alum.personId, null);
  }
  for (const startupId of index.foundedByPerson.get(personId) ?? []) {
    for (const hit of index.batchesByProject.get(startupId) ?? []) {
      for (const otherId of index.peopleByBatch.get(hit.key) ?? []) {
        const alum = index.alumByPerson.get(otherId);
        if (!alum || alum.personId === personId) continue;
        consider(best, {
          alum,
          score: 92,
          strength: "strong",
          reason: batchReason(hit.key, hit.label),
          evidenceUrl: hit.sourceUrl,
          throughFounder: null,
        });
      }
    }
    const metro = index.metroByProject.get(startupId);
    if (!metro) continue;
    for (const alum of index.alumniByMetro.get(metro.id) ?? []) {
      if (alum.personId === personId) continue;
      consider(best, {
        alum,
        score: 10,
        strength: "weak",
        reason: `Same ${metro.label} metro`,
        evidenceUrl: metro.sourceUrl,
        throughFounder: null,
      });
    }
  }
  for (const alum of index.graph.alumni) {
    if (!alum.investorId || !alum.currentFirm || alum.personId === personId) continue;
    const portfolio = index.graph.portfolioByInvestor.get(alum.investorId) ?? [];
    const startups = index.foundedByPerson.get(personId);
    if (!startups) continue;
    const hit = portfolio.find((item) => startups.has(item.projectId));
    if (!hit) continue;
    consider(best, {
      alum,
      score: 96,
      strength: "strong",
      reason: `Backed through ${alum.currentFirm}`,
      evidenceUrl: hit.sourceUrl,
      throughFounder: null,
    });
  }
  return present(best, throughName);
}

function targetFor(index: ReferralIndex, id: string): IntroTarget | null {
  const person = index.graph.people.get(id);
  if (person) {
    const campusId = person.campuses[0];
    const campus = campusId ? index.graph.orgs.get(campusId) : undefined;
    return { id, kind: "person", name: person.name, campusName: campus?.campusShort ?? campus?.name ?? null, websiteUrl: null };
  }
  const org = index.graph.orgs.get(id);
  if (!org || org.kind !== "company") return null;
  return { id, kind: "project", name: org.name, campusName: org.campusShort, websiteUrl: org.sourceUrl };
}

export function introPanelFor(id: string): IntroPanel {
  if (!id) return { target: null, paths: [] };
  const index = loadIndex();
  const target = targetFor(index, id);
  if (!target) return { target: null, paths: [] };
  const paths = target.kind === "project" ? (index.projectPaths.get(id) ?? rankProject(index, id).slice(0, PATH_LIMIT).map((candidate) => toPath(candidate, candidate.throughFounder))) : linksToPerson(index, id);
  return { target, paths };
}

export function alumniReferralDirectory(): AlumReferral[] {
  return loadIndex().alumni;
}

export function introCoverage(): IntroCoverage {
  return loadIndex().coverage;
}

export interface ReferrerMapLink {
  startupId: string;
  startupName: string;
  founderIds: string[];
  campusId: string | null;
  strength: IntroStrength;
  reason: string;
}

export interface ReferrerMapAlum {
  id: string;
  name: string;
  role: string | null;
  firm: string | null;
  campusId: string | null;
  links: ReferrerMapLink[];
}

const STRENGTH_RANK: Record<IntroStrength, number> = { strong: 3, medium: 2, weak: 1 };

/** Map overlay: alumni and the startups, founders, and campuses they can refer. Weak metro paths stay out unless asked for. */
export function referrerOverlay(includeWeak = false): { alumni: ReferrerMapAlum[] } {
  const index = loadIndex();
  const foundersOf = new Map<string, string[]>();
  for (const [personId, startups] of index.foundedByPerson) {
    for (const startupId of startups) {
      const list = foundersOf.get(startupId) ?? [];
      if (!list.includes(personId)) list.push(personId);
      foundersOf.set(startupId, list);
    }
  }
  const alumni: ReferrerMapAlum[] = [];
  for (const [personId, startups] of index.reachByAlum) {
    const alum = index.alumByPerson.get(personId);
    if (!alum) continue;
    const links: ReferrerMapLink[] = [];
    for (const [startupId, candidate] of startups) {
      if (!includeWeak && candidate.strength === "weak") continue;
      const org = index.graph.orgs.get(startupId);
      links.push({
        startupId,
        startupName: org?.name ?? startupId,
        founderIds: foundersOf.get(startupId) ?? [],
        campusId: org?.campusId ?? null,
        strength: candidate.strength,
        reason: candidate.reason,
      });
    }
    if (!links.length) continue;
    links.sort((a, b) => STRENGTH_RANK[b.strength] - STRENGTH_RANK[a.strength] || a.startupName.localeCompare(b.startupName) || a.startupId.localeCompare(b.startupId));
    alumni.push({
      id: personId,
      name: alum.name,
      role: alum.currentRole,
      firm: alum.currentFirm,
      campusId: alum.universityId,
      links,
    });
  }
  alumni.sort((a, b) => b.links.length - a.links.length || a.name.localeCompare(b.name));
  return { alumni };
}

/** Referrer line stored on a pipeline card. Empty when this alum is not a real path. */
export function referrerLineFor(entityId: string, alumPersonId: string): string | null {
  const panel = introPanelFor(entityId);
  const path = panel.paths.find((item) => item.alumPersonId === alumPersonId);
  if (!path || !panel.target) return null;
  const line = `${path.alumName} — ${path.reason}`;
  return line.slice(0, 120);
}
