// Shared campus, club, program, company, and co-founder graph used for
// warm-intro paths and connector scores. Built from stored rows only.

import fs from "node:fs";
import { databasePath, getDb } from "../db/client";
import { shortCampusLabel } from "./campuses";
import { listDrfAlumni, type DrfAlumRow } from "./drf-alumni";

export type IntroOrgKind = "campus" | "program" | "company";

export interface IntroOrg {
  id: string;
  name: string;
  kind: IntroOrgKind;
  members: number;
  campusId: string | null;
  campusShort: string | null;
  cohort: boolean;
  sourceUrl: string | null;
}

export interface IntroLink {
  personId: string;
  sourceUrl: string | null;
}

export interface IntroGraph {
  people: Map<string, { id: string; name: string; campuses: string[] }>;
  orgs: Map<string, IntroOrg>;
  orgsByPerson: Map<string, { orgId: string; sourceUrl: string | null }[]>;
  peopleByOrg: Map<string, IntroLink[]>;
  cofounders: Map<string, IntroLink[]>;
  startupsByPerson: Map<string, string[]>;
  alumni: DrfAlumRow[];
  strongFounders: Set<string>;
}

const COHORT = /cohort|class of|\bbatch\b/i;
const STRONG_TIER = new Set(["S+", "S", "A", "B", "C", "D"]);
const VERIFIED = new Set(["confirmed", "partial"]);

let cache: { stamp: string; graph: IntroGraph } | null = null;

export function loadIntroGraph(): IntroGraph {
  let stamp = "missing";
  try {
    const stat = fs.statSync(databasePath());
    stamp = `${stat.mtimeMs}:${stat.size}`;
  } catch {
    stamp = "missing";
  }
  if (cache?.stamp === stamp) return cache.graph;
  const graph = assembleIntroGraph();
  cache = { stamp, graph };
  return graph;
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V) {
  const list = map.get(key) ?? [];
  list.push(value);
  map.set(key, list);
}

export function assembleIntroGraph(): IntroGraph {
  const db = getDb();
  const people = new Map<string, { id: string; name: string; campuses: string[] }>();
  for (const row of db.prepare(`SELECT id, name FROM people`).all() as { id: string; name: string }[]) {
    people.set(row.id, { id: row.id, name: row.name, campuses: [] });
  }

  const strongFounders = new Set<string>();
  for (const row of db.prepare(`SELECT id, signal_tier, verification_status FROM people WHERE founder_status = 'founder'`).all() as {
    id: string;
    signal_tier: string | null;
    verification_status: string | null;
  }[]) {
    if (row.signal_tier && STRONG_TIER.has(row.signal_tier) && VERIFIED.has(row.verification_status ?? "")) strongFounders.add(row.id);
  }

  const orgs = new Map<string, IntroOrg>();
  const orgsByPerson = new Map<string, { orgId: string; sourceUrl: string | null }[]>();
  const peopleByOrg = new Map<string, IntroLink[]>();
  const memberCount = new Map<string, number>();

  const campusRows = db.prepare(
    `SELECT a.person_id, a.university_id, u.name, c.source_url
     FROM affiliations a
     JOIN universities u ON u.id = a.university_id
     LEFT JOIN claims c ON c.id = a.claim_id`
  ).all() as { person_id: string; university_id: string; name: string; source_url: string | null }[];

  for (const row of campusRows) {
    if (!people.has(row.person_id)) continue;
    const person = people.get(row.person_id)!;
    if (!person.campuses.includes(row.university_id)) person.campuses.push(row.university_id);
    if (!orgs.has(row.university_id)) {
      orgs.set(row.university_id, {
        id: row.university_id,
        name: shortCampusLabel(row.university_id, row.name),
        kind: "campus",
        members: 0,
        campusId: row.university_id,
        campusShort: shortCampusLabel(row.university_id, row.name),
        cohort: false,
        sourceUrl: null,
      });
    }
    push(orgsByPerson, row.person_id, { orgId: row.university_id, sourceUrl: row.source_url });
    push(peopleByOrg, row.university_id, { personId: row.person_id, sourceUrl: row.source_url });
    memberCount.set(row.university_id, (memberCount.get(row.university_id) ?? 0) + 1);
  }

  const campusByProject = new Map<string, string>();
  for (const row of db.prepare(
    `SELECT source_entity_id AS project_id, target_entity_id AS university_id
     FROM relationships
     WHERE relationship_type = 'affiliated_with' AND source_entity_type = 'project' AND target_entity_type = 'university'`
  ).all() as { project_id: string; university_id: string }[]) {
    if (!campusByProject.has(row.project_id)) campusByProject.set(row.project_id, row.university_id);
  }

  const roleRows = db.prepare(
    `SELECT ppr.person_id, ppr.project_id, ppr.role, p.kind, p.name, p.website_url, c.source_url
     FROM person_project_roles ppr
     JOIN projects p ON p.id = ppr.project_id
     LEFT JOIN claims c ON c.id = ppr.claim_id`
  ).all() as {
    person_id: string;
    project_id: string;
    role: string | null;
    kind: string;
    name: string;
    website_url: string | null;
    source_url: string | null;
  }[];

  const foundersByCompany = new Map<string, { personId: string; sourceUrl: string | null }[]>();
  const seenMember = new Set<string>();
  for (const row of roleRows) {
    if (!people.has(row.person_id)) continue;
    const key = `${row.person_id}|${row.project_id}`;
    if (!seenMember.has(key)) {
      seenMember.add(key);
      const campusId = campusByProject.get(row.project_id) ?? null;
      if (!orgs.has(row.project_id)) {
        orgs.set(row.project_id, {
          id: row.project_id,
          name: row.name,
          kind: row.kind === "company" ? "company" : "program",
          members: 0,
          campusId,
          campusShort: campusId ? shortCampusLabel(campusId) : null,
          cohort: COHORT.test(row.name),
          sourceUrl: row.website_url,
        });
      }
      push(orgsByPerson, row.person_id, { orgId: row.project_id, sourceUrl: row.source_url });
      push(peopleByOrg, row.project_id, { personId: row.person_id, sourceUrl: row.source_url });
      memberCount.set(row.project_id, (memberCount.get(row.project_id) ?? 0) + 1);
    }
    if (row.kind === "company" && (row.role ?? "").toLowerCase().includes("founder")) {
      const list = foundersByCompany.get(row.project_id) ?? [];
      if (!list.some((item) => item.personId === row.person_id)) list.push({ personId: row.person_id, sourceUrl: row.source_url });
      foundersByCompany.set(row.project_id, list);
    }
  }

  for (const [id, count] of memberCount) {
    const org = orgs.get(id);
    if (org) org.members = count;
  }

  const cofounders = new Map<string, IntroLink[]>();
  const startupsByPerson = new Map<string, string[]>();
  for (const [companyId, founders] of foundersByCompany) {
    for (const founder of founders) {
      const startups = startupsByPerson.get(founder.personId) ?? [];
      if (!startups.includes(companyId)) startups.push(companyId);
      startupsByPerson.set(founder.personId, startups);
    }
    if (founders.length < 2 || founders.length > 8) continue;
    for (let i = 0; i < founders.length; i++) {
      for (let j = 0; j < founders.length; j++) {
        if (i === j) continue;
        const list = cofounders.get(founders[i].personId) ?? [];
        if (!list.some((item) => item.personId === founders[j].personId)) {
          list.push({ personId: founders[j].personId, sourceUrl: founders[j].sourceUrl ?? founders[i].sourceUrl });
        }
        cofounders.set(founders[i].personId, list);
      }
    }
  }

  return {
    people,
    orgs,
    orgsByPerson,
    peopleByOrg,
    cofounders,
    startupsByPerson,
    alumni: listDrfAlumni(),
    strongFounders,
  };
}
