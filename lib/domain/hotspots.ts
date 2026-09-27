// Loads the campus hotspot directory and joins it to evidence already in
// the database. A person or startup is linked only when a stored claim,
// source name, or project role names that place. Directory text never
// becomes a membership on its own.

import fs from "node:fs";
import path from "node:path";
import { databasePath, getDb } from "../db/client";
import {
  appendixFromRows,
  bestCard,
  cardsFromRows,
  hasPhrase,
  hotspotHref,
  hotspotMapNodeId,
  investorNodeId,
  matchPhrases,
  mentionPhrase,
  normHotspotName,
  normPlace,
  ORG_ALIAS_PHRASES,
  parseCsv,
  placesMatch,
  samePlace,
  type AppendixEntry,
  type HotspotCard,
  type HotspotSectionId,
  type HotspotTier,
  type NormPlace,
  type RelatedHotspot,
} from "./hotspot-model";

const CSV_PATH = path.join(process.cwd(), "data", "imports", "campus_hotspots.csv");

export interface HotspotPlaceGroup {
  placeKey: string;
  label: string;
  phrase: string | null;
  phrases: string[];
  campusIds: string[];
  mapNodeId: string;
  merged: "program" | "investor" | null;
  cards: HotspotCard[];
}

export interface HotspotGraphPatch {
  programs: { id: string; label: string; campuses: string[] }[];
  campusAdds: { id: string; campusId: string }[];
  edges: { source: string; target: string; type: "at_campus" | "member_of" }[];
  places: number;
  mergedPrograms: number;
  mergedInvestors: number;
  newNodes: number;
  atCampusEdges: number;
  evidenceEdges: number;
}

interface Index {
  stamp: string;
  cards: HotspotCard[];
  appendix: AppendixEntry[];
  groups: HotspotPlaceGroup[];
  byPerson: Map<string, string[]>;
  byProject: Map<string, string[]>;
  peopleByPlace: Map<string, string[]>;
  projectsByPlace: Map<string, string[]>;
}

let cache: Index | null = null;

function fileStamp(file: string): string {
  try {
    const st = fs.statSync(/*turbopackIgnore: true*/ file);
    return `${st.mtimeMs}:${st.size}`;
  } catch {
    return "missing";
  }
}

function stamp(): string {
  return `${fileStamp(CSV_PATH)}|${fileStamp(databasePath())}`;
}

export function hotspotCards(): HotspotCard[] {
  return getIndex().cards;
}

export function hotspotAppendix(): AppendixEntry[] {
  return getIndex().appendix;
}

export function hotspotGroups(): HotspotPlaceGroup[] {
  return getIndex().groups;
}

function readRows(): Record<string, string>[] {
  const text = fs.readFileSync(CSV_PATH, "utf8");
  return parseCsv(text);
}

function getIndex(): Index {
  const current = stamp();
  if (cache?.stamp === current) return cache;
  const rows = readRows();
  const cards = cardsFromRows(rows);
  const appendix = appendixFromRows(rows);
  const built = buildLinks(cards);
  cache = { stamp: current, cards, appendix, ...built };
  return cache;
}

function buildLinks(cards: HotspotCard[]): Omit<Index, "stamp" | "cards" | "appendix"> {
  const db = getDb();
  const grouped = new Map<string, HotspotCard[]>();
  for (const card of cards) {
    const list = grouped.get(card.placeKey) ?? [];
    list.push(card);
    grouped.set(card.placeKey, list);
  }

  const programs = db
    .prepare(
      `SELECT p.id, p.name FROM projects p
       WHERE p.kind = 'project' AND (
         p.id IN (
           SELECT source_entity_id FROM relationships
           WHERE relationship_type = 'affiliated_with' AND source_entity_type = 'project' AND target_entity_type = 'university'
         )
         OR p.id IN (
           SELECT project_id FROM person_project_roles GROUP BY project_id HAVING COUNT(DISTINCT person_id) >= 8
         )
       )`
    )
    .all() as { id: string; name: string }[];

  const investorNames = new Map<string, string>();
  const investorRows = db.prepare(`SELECT DISTINCT value_text FROM company_facts WHERE fact_key = 'investor'`).all() as { value_text: string }[];
  for (const row of investorRows) {
    const name = row.value_text.replace(/\s+/g, " ").trim();
    if (name) investorNames.set(investorNodeId(name), name);
  }
  investorNames.set(investorNodeId("Dorm Room Fund"), "Dorm Room Fund");
  const investors = [...investorNames.entries()].map(([id, name]) => ({ id, name }));

  const companyIds = new Set(
    (db.prepare(`SELECT id FROM projects WHERE kind = 'company'`).all() as { id: string }[]).map((row) => row.id)
  );

  const groups: HotspotPlaceGroup[] = [];
  for (const [placeKey, list] of grouped) {
    const label = [...list].sort((a, b) => coreLength(a.place) - coreLength(b.place) || a.place.localeCompare(b.place))[0].place;
    const program = pickMatch(label, programs);
    const investor = program ? null : pickMatch(label, investors);
    const campusIds = [...new Set(list.map((card) => card.campusId).filter((id): id is string => !!id))];
    groups.push({
      placeKey,
      label: program?.name ?? investor?.name ?? shortestCore(list),
      phrase: mentionPhrase(label),
      phrases: [],
      campusIds,
      mapNodeId: program?.id ?? investor?.id ?? hotspotMapNodeId(placeKey),
      merged: program ? "program" : investor ? "investor" : null,
      cards: list,
    });
  }

  assignMatchPhrases(groups);

  const claims = db.prepare(`SELECT entity_type, entity_id, excerpt, value_json, claim_type, source_id FROM claims`).all() as {
    entity_type: string;
    entity_id: string;
    excerpt: string;
    value_json: string | null;
    claim_type: string;
    source_id: string | null;
  }[];
  const sources = db.prepare(`SELECT id, name FROM sources`).all() as { id: string; name: string }[];
  const sourceNorm = new Map(sources.map((source) => [source.id, normHotspotName(source.name)]));
  const claimNorms: { entity_type: string; entity_id: string; source_id: string | null; norm: string; sourceNorm: string }[] = claims.map((claim) => {
    const structured = claim.claim_type === "program_membership" || claim.claim_type === "accelerator_founder" ? claim.value_json ?? "" : "";
    return {
      entity_type: claim.entity_type,
      entity_id: claim.entity_id,
      source_id: claim.source_id,
      norm: normHotspotName(`${claim.excerpt || ""} ${structured}`),
      sourceNorm: claim.source_id ? (sourceNorm.get(claim.source_id) ?? "") : "",
    };
  });
  for (const row of db.prepare(`SELECT id, potential_signal FROM people WHERE potential_signal IS NOT NULL AND length(trim(potential_signal)) >= 4`).all() as {
    id: string;
    potential_signal: string;
  }[]) {
    claimNorms.push({ entity_type: "person", entity_id: row.id, source_id: null, norm: normHotspotName(row.potential_signal), sourceNorm: "" });
  }
  for (const row of db.prepare(`SELECT person_id, role FROM affiliations WHERE role IS NOT NULL AND length(trim(role)) >= 4`).all() as {
    person_id: string;
    role: string;
  }[]) {
    claimNorms.push({ entity_type: "person", entity_id: row.person_id, source_id: null, norm: normHotspotName(row.role), sourceNorm: "" });
  }
  for (const row of db.prepare(`SELECT id, aliases_json, description FROM projects WHERE kind = 'company'`).all() as {
    id: string;
    aliases_json: string;
    description: string | null;
  }[]) {
    const bits = [row.description ?? "", ...parseAliasList(row.aliases_json)];
    const norm = normHotspotName(bits.join(" "));
    if (norm.length >= 4) claimNorms.push({ entity_type: "project", entity_id: row.id, source_id: null, norm, sourceNorm: "" });
  }
  for (const row of db.prepare(`SELECT project_id, value_text, excerpt FROM company_facts WHERE fact_key IN ('description', 'investor', 'funding_round')`).all() as {
    project_id: string;
    value_text: string;
    excerpt: string;
  }[]) {
    const norm = normHotspotName(`${row.value_text} ${row.excerpt}`);
    if (norm.length >= 4) claimNorms.push({ entity_type: "project", entity_id: row.project_id, source_id: null, norm, sourceNorm: "" });
  }

  const roles = db
    .prepare(
      `SELECT ppr.person_id, p.id, p.name, p.kind FROM person_project_roles ppr JOIN projects p ON p.id = ppr.project_id`
    )
    .all() as { person_id: string; id: string; name: string; kind: string }[];

  const byPerson = new Map<string, Set<string>>();
  const byProject = new Map<string, Set<string>>();
  const peopleByPlace = new Map<string, Set<string>>();
  const projectsByPlace = new Map<string, Set<string>>();

  const addPerson = (personId: string, placeKey: string) => {
    if (!personId) return;
    const places = byPerson.get(personId) ?? new Set<string>();
    places.add(placeKey);
    byPerson.set(personId, places);
    const people = peopleByPlace.get(placeKey) ?? new Set<string>();
    people.add(personId);
    peopleByPlace.set(placeKey, people);
  };
  const addProject = (projectId: string, placeKey: string) => {
    if (!projectId || !companyIds.has(projectId)) return;
    const places = byProject.get(projectId) ?? new Set<string>();
    places.add(placeKey);
    byProject.set(projectId, places);
    const projects = projectsByPlace.get(placeKey) ?? new Set<string>();
    projects.add(projectId);
    projectsByPlace.set(placeKey, projects);
  };

  const groupNorm = new Map(groups.map((group) => [group.placeKey, normPlace(group.label)]));
  const groupsByToken = new Map<string, HotspotPlaceGroup[]>();
  const shortPhrases: { phrase: string; group: HotspotPlaceGroup }[] = [];
  for (const group of groups) {
    for (const phrase of group.phrases) {
      const tokens = phrase.split(" ").filter((token) => token.length >= 4);
      if (!tokens.length) {
        shortPhrases.push({ phrase, group });
        continue;
      }
      for (const token of tokens) {
        const list = groupsByToken.get(token) ?? [];
        if (!list.includes(group)) list.push(group);
        groupsByToken.set(token, list);
      }
    }
  }

  const sourceGroups = new Map<string, HotspotPlaceGroup[]>();
  for (const source of sources) {
    const named = normPlace(source.name);
    const hits = groups.filter((group) => {
      const norm = groupNorm.get(group.placeKey);
      return !!norm && placesMatch(named, norm);
    });
    if (hits.length) sourceGroups.set(source.id, hits);
  }

  const rolesByProject = new Map<string, { person_id: string; id: string; kind: string }[]>();
  const projectNorm = new Map<string, NormPlace>();
  for (const role of roles) {
    if (!projectNorm.has(role.id)) projectNorm.set(role.id, normPlace(role.name));
    const list = rolesByProject.get(role.id) ?? [];
    list.push(role);
    rolesByProject.set(role.id, list);
  }
  for (const [projectId, named] of projectNorm) {
    for (const group of groups) {
      const norm = groupNorm.get(group.placeKey);
      if (!norm || !placesMatch(named, norm)) continue;
      for (const role of rolesByProject.get(projectId) ?? []) {
        addPerson(role.person_id, group.placeKey);
        if (role.kind === "company") addProject(role.id, group.placeKey);
      }
    }
  }

  const programLinks = db
    .prepare(
      `SELECT r.source_entity_id AS company_id, p.name AS program_name
       FROM relationships r
       JOIN projects p ON p.id = r.target_entity_id AND p.kind = 'project'
       WHERE r.relationship_type = 'part_of_program'
         AND r.source_entity_type = 'project'
         AND r.target_entity_type = 'project'`
    )
    .all() as { company_id: string; program_name: string }[];
  for (const link of programLinks) {
    const named = normPlace(link.program_name);
    for (const group of groups) {
      const norm = groupNorm.get(group.placeKey);
      if (!norm || !placesMatch(named, norm)) continue;
      addProject(link.company_id, group.placeKey);
    }
  }

  for (const claim of claimNorms) {
    const seen = new Set<string>();
    const link = (group: HotspotPlaceGroup) => {
      if (seen.has(group.placeKey)) return;
      seen.add(group.placeKey);
      if (claim.entity_type === "person") addPerson(claim.entity_id, group.placeKey);
      else if (claim.entity_type === "project") addProject(claim.entity_id, group.placeKey);
    };
    const tokens = new Set(`${claim.norm} ${claim.sourceNorm}`.split(" ").filter((token) => token.length >= 4));
    for (const token of tokens) {
      for (const group of groupsByToken.get(token) ?? []) {
        if (seen.has(group.placeKey)) continue;
        if (!group.phrases.some((phrase) => hasPhrase(claim.norm, phrase) || hasPhrase(claim.sourceNorm, phrase))) continue;
        link(group);
      }
    }
    for (const item of shortPhrases) {
      if (hasPhrase(claim.norm, item.phrase) || hasPhrase(claim.sourceNorm, item.phrase)) link(item.group);
    }
    if (!claim.source_id) continue;
    for (const group of sourceGroups.get(claim.source_id) ?? []) link(group);
  }

  return {
    groups,
    byPerson: mapSets(byPerson),
    byProject: mapSets(byProject),
    peopleByPlace: mapSets(peopleByPlace),
    projectsByPlace: mapSets(projectsByPlace),
  };
}

function assignMatchPhrases(groups: HotspotPlaceGroup[]) {
  const owners = new Map<string, Set<string>>();
  const candidates = new Map<string, string[]>();
  for (const group of groups) {
    const phrases = new Set<string>();
    for (const card of group.cards) for (const phrase of matchPhrases(card.place)) phrases.add(phrase);
    for (const alias of ORG_ALIAS_PHRASES[group.placeKey] ?? []) phrases.add(alias);
    const list = [...phrases];
    candidates.set(group.placeKey, list);
    for (const phrase of list) {
      const set = owners.get(phrase) ?? new Set<string>();
      set.add(group.placeKey);
      owners.set(phrase, set);
    }
  }
  for (const group of groups) {
    const aliases = new Set(ORG_ALIAS_PHRASES[group.placeKey] ?? []);
    group.phrases = (candidates.get(group.placeKey) ?? []).filter((phrase) => aliases.has(phrase) || owners.get(phrase)?.size === 1);
    group.phrase = mentionPhrase(group.label);
  }
}

function parseAliasList(json: string | null): string[] {
  if (!json) return [];
  try {
    const value = JSON.parse(json) as unknown;
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  } catch {
    return [];
  }
}

function placeKeyOfSafe(name: string): string {
  return normHotspotName(name.replace(/\s*\([^)]*\)\s*/g, " "));
}

function coreLength(place: string): number {
  return place.replace(/\s*\([^)]*\)\s*/g, " ").trim().length;
}

export function directoryLabel(cards: HotspotCard[]): string {
  return [...cards].sort((a, b) => coreLength(a.place) - coreLength(b.place) || a.place.localeCompare(b.place))[0].place.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim();
}

function shortestCore(cards: HotspotCard[]): string {
  return directoryLabel(cards);
}

function pickMatch(label: string, candidates: { id: string; name: string }[]): { id: string; name: string } | null {
  const hits = candidates.filter((candidate) => samePlace(label, candidate.name));
  if (hits.length === 0) return null;
  const exact = hits.filter((candidate) => placeKeyOfSafe(candidate.name) === placeKeyOfSafe(label));
  const pool = exact.length ? exact : hits;
  pool.sort((a, b) => a.name.length - b.name.length || a.id.localeCompare(b.id));
  return pool[0];
}

function mapSets(input: Map<string, Set<string>>): Map<string, string[]> {
  return new Map([...input.entries()].map(([key, value]) => [key, [...value]]));
}

function relatedFromKeys(keys: string[], campusId?: string | null): RelatedHotspot[] {
  const index = getIndex();
  const byKey = new Map(index.groups.map((group) => [group.placeKey, group]));
  const out: RelatedHotspot[] = [];
  for (const key of keys) {
    const group = byKey.get(key);
    if (!group) continue;
    const card = bestCard(group.cards, campusId);
    out.push({
      id: card.id,
      place: group.label,
      campus: card.campus,
      tier: card.tier,
      type: card.type,
      href: hotspotHref(card),
      mapNodeId: group.mapNodeId,
    });
  }
  const rank: Record<string, number> = { S: 0, A: 1, B: 2, C: 3, D: 4 };
  out.sort((a, b) => (rank[a.tier] ?? 9) - (rank[b.tier] ?? 9) || a.place.localeCompare(b.place));
  return out;
}

export function relatedHotspotsForPerson(personId: string, campusId?: string | null): RelatedHotspot[] {
  return relatedFromKeys(getIndex().byPerson.get(personId) ?? [], campusId);
}

export function relatedHotspotsForProject(projectId: string): RelatedHotspot[] {
  return relatedFromKeys(getIndex().byProject.get(projectId) ?? []);
}

export function hotspotGroupByMapId(id: string): HotspotPlaceGroup | null {
  return getIndex().groups.find((group) => group.mapNodeId === id || hotspotMapNodeId(group.placeKey) === id) ?? null;
}

export function personIdsForPlace(placeKey: string): string[] {
  return getIndex().peopleByPlace.get(placeKey) ?? [];
}

export function projectIdsForPlace(placeKey: string): string[] {
  return getIndex().projectsByPlace.get(placeKey) ?? [];
}

export function hotspotGraphPatch(input: {
  personIds: Set<string>;
  startupIds: Set<string>;
  universityIds: Set<string>;
}): HotspotGraphPatch {
  const index = getIndex();
  const programs: HotspotGraphPatch["programs"] = [];
  const campusAdds: HotspotGraphPatch["campusAdds"] = [];
  const edges: HotspotGraphPatch["edges"] = [];
  const seen = new Set<string>();
  const addEdge = (source: string, target: string, type: "at_campus" | "member_of") => {
    const key = `${source}|${target}|${type}`;
    if (seen.has(key)) return;
    seen.add(key);
    edges.push({ source, target, type });
  };

  let mergedPrograms = 0;
  let mergedInvestors = 0;
  let newNodes = 0;
  for (const group of index.groups) {
    const campuses = group.campusIds.filter((id) => input.universityIds.has(id));
    if (group.merged === "program") {
      mergedPrograms += 1;
      for (const campusId of campuses) campusAdds.push({ id: group.mapNodeId, campusId });
    } else if (group.merged === "investor") {
      mergedInvestors += 1;
    } else {
      newNodes += 1;
      programs.push({ id: group.mapNodeId, label: group.label, campuses });
    }
    for (const campusId of campuses) addEdge(group.mapNodeId, campusId, "at_campus");
    for (const personId of index.peopleByPlace.get(group.placeKey) ?? []) {
      if (!input.personIds.has(personId) || personId === group.mapNodeId) continue;
      addEdge(personId, group.mapNodeId, "member_of");
    }
    if (group.merged !== "investor") {
      for (const projectId of index.projectsByPlace.get(group.placeKey) ?? []) {
        if (!input.startupIds.has(projectId) || projectId === group.mapNodeId) continue;
        addEdge(projectId, group.mapNodeId, "member_of");
      }
    }
  }

  const atCampusEdges = edges.filter((edge) => edge.type === "at_campus").length;
  const evidenceEdges = edges.filter((edge) => edge.type === "member_of").length;
  return {
    programs,
    campusAdds,
    edges,
    places: index.groups.length,
    mergedPrograms,
    mergedInvestors,
    newNodes,
    atCampusEdges,
    evidenceEdges,
  };
}

export interface OrganizationMapNode {
  id: string;
  label: string;
  campuses: string[];
  campusLabel: string;
  tier: HotspotTier;
  sections: HotspotSectionId[];
  typeLabel: string;
  url: string | null;
  linkedPeople: number;
  linkedFounders: number;
  linkedStartups: number;
}

/** One node per directory place. Edges exist only where stored text or a role names that place. */
export function organizationMap(input: {
  personIds: Set<string>;
  startupIds: Set<string>;
  founderIds: Set<string>;
  universityIds: Set<string>;
}): { nodes: OrganizationMapNode[]; edges: { source: string; target: string; type: "member_of" | "at_campus" }[] } {
  const index = getIndex();
  const nodes: OrganizationMapNode[] = [];
  const edges: { source: string; target: string; type: "member_of" | "at_campus" }[] = [];
  const seen = new Set<string>();
  const addEdge = (source: string, target: string, type: "member_of" | "at_campus") => {
    if (!source || !target || source === target) return;
    const key = `${source}|${target}|${type}`;
    if (seen.has(key)) return;
    seen.add(key);
    edges.push({ source, target, type });
  };

  for (const group of index.groups) {
    // The place is already the program or investor node. A second organization
    // id makes search list the same entity twice (program and organization).
    if (group.merged === "program" || group.merged === "investor") continue;
    const id = hotspotMapNodeId(group.placeKey);
    const card = bestCard(group.cards);
    const campuses = [...new Set(group.campusIds.filter((campusId) => input.universityIds.has(campusId)))];
    const people = (index.peopleByPlace.get(group.placeKey) ?? []).filter((personId) => input.personIds.has(personId));
    const startups = (index.projectsByPlace.get(group.placeKey) ?? []).filter((projectId) => input.startupIds.has(projectId));
    const sections = [...new Set(group.cards.map((item) => item.section))];
    nodes.push({
      id,
      label: shortestCore(group.cards),
      campuses,
      campusLabel: [...new Set(group.cards.map((item) => item.campus))].join(" · "),
      tier: card.tier,
      sections,
      typeLabel: card.type,
      url: card.url || null,
      linkedPeople: people.length,
      linkedFounders: people.filter((personId) => input.founderIds.has(personId)).length,
      linkedStartups: startups.length,
    });
    for (const campusId of campuses) addEdge(id, campusId, "at_campus");
    for (const personId of people) addEdge(personId, id, "member_of");
    for (const projectId of startups) addEdge(projectId, id, "member_of");
  }
  return { nodes, edges };
}

export function hotspotCountsByCampus(): { campus: string; cards: number; places: number; placeKind: string }[] {
  const cards = hotspotCards();
  const byCampus = new Map<string, { cards: number; places: Set<string>; placeKind: string; sortGroup: number }>();
  for (const card of cards) {
    const row = byCampus.get(card.campus) ?? { cards: 0, places: new Set<string>(), placeKind: card.placeKind, sortGroup: card.sortGroup };
    row.cards += 1;
    row.places.add(card.placeKey);
    byCampus.set(card.campus, row);
  }
  return [...byCampus.entries()]
    .sort((a, b) => a[1].sortGroup - b[1].sortGroup || a[0].localeCompare(b[0], "en", { sensitivity: "base" }))
    .map(([campus, row]) => ({ campus, cards: row.cards, places: row.places.size, placeKind: row.placeKind }));
}
