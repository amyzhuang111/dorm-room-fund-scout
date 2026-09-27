import fs from "node:fs";
import { databasePath, getDb } from "../db/client";
import { shortCampusLabel } from "./campuses";
import {
  HIT_RATE_SENTENCE,
  fundingIsGoodOutcome,
  fundingStageKind,
  scoreHitRates,
  type CampusHitRate,
  type FundingStageKind,
  type HitObservation,
} from "./campus-hit-rate-model";
import { type HitRateTable } from "./network-analysis-model";
import { claimProgramTexts, programsInText } from "./national-programs";

const TOP_TIER = new Set(["yc", "thiel", "speedrun"]);

let cache: { stamp: string; rows: CampusHitRate[] } | null = null;

function dbStamp(): string {
  try {
    const stat = fs.statSync(databasePath());
    return `${stat.mtimeMs}:${stat.size}`;
  } catch {
    return "missing";
  }
}

function stageFromFact(detailJson: string, valueText: string): string | null {
  try {
    const parsed = JSON.parse(detailJson) as { stage?: unknown };
    if (typeof parsed.stage === "string" && parsed.stage.trim()) return parsed.stage.trim();
  } catch {
    // value text still carries "Seed|$7M"
  }
  const head = valueText.split("|")[0]?.trim();
  return head || null;
}

function leadsFromFact(detailJson: string): string[] {
  try {
    const parsed = JSON.parse(detailJson) as { leads?: unknown };
    if (!Array.isArray(parsed.leads)) return [];
    return parsed.leads.filter((lead): lead is string => typeof lead === "string" && lead.trim().length > 0);
  } catch {
    return [];
  }
}

export function loadHitObservations(): HitObservation[] {
  const db = getDb();
  const people = db
    .prepare(
      `SELECT id, enrollment_grad_year FROM people WHERE founder_status = 'founder'`
    )
    .all() as { id: string; enrollment_grad_year: number | null }[];
  const byId = new Map<string, { year: number | null; endYear: number | null; campuses: Set<string>; companies: Set<string> }>();
  for (const person of people) {
    const year = person.enrollment_grad_year != null && person.enrollment_grad_year >= 1970 && person.enrollment_grad_year <= 2040
      ? person.enrollment_grad_year
      : null;
    byId.set(person.id, { year, endYear: null, campuses: new Set(), companies: new Set() });
  }

  for (const row of db.prepare(`SELECT person_id, university_id, end_date FROM affiliations`).all() as {
    person_id: string;
    university_id: string;
    end_date: string | null;
  }[]) {
    const person = byId.get(row.person_id);
    if (!person) continue;
    person.campuses.add(row.university_id);
    const match = row.end_date?.match(/\b(19|20)\d{2}\b/);
    const year = match ? Number(match[0]) : null;
    if (year != null && year >= 1970 && year <= 2040 && (person.endYear == null || year > person.endYear)) person.endYear = year;
  }
  for (const person of byId.values()) {
    if (person.year == null) person.year = person.endYear;
  }

  for (const row of db
    .prepare(
      `SELECT ppr.person_id, ppr.project_id
       FROM person_project_roles ppr
       JOIN projects p ON p.id = ppr.project_id
       WHERE p.kind = 'company' AND lower(ppr.role) LIKE '%founder%'`
    )
    .all() as { person_id: string; project_id: string }[]) {
    byId.get(row.person_id)?.companies.add(row.project_id);
  }

  const roundsByProject = new Map<string, FundingStageKind[]>();
  const addRound = (projectId: string, kind: FundingStageKind) => {
    const list = roundsByProject.get(projectId) ?? [];
    list.push(kind);
    roundsByProject.set(projectId, list);
  };
  const projectsWithRounds = new Set<string>();
  for (const row of db
    .prepare(`SELECT project_id, value_text, detail_json FROM company_facts WHERE fact_key = 'funding_round'`)
    .all() as { project_id: string; value_text: string; detail_json: string }[]) {
    projectsWithRounds.add(row.project_id);
    addRound(row.project_id, fundingStageKind(stageFromFact(row.detail_json, row.value_text)));
  }
  for (const row of db.prepare(`SELECT project_id, instrument FROM funding_events`).all() as { project_id: string; instrument: string | null }[]) {
    if (projectsWithRounds.has(row.project_id)) continue;
    const instrument = (row.instrument ?? "").toLowerCase();
    addRound(row.project_id, instrument === "grant" ? "grant" : "unknown");
  }

  const goodPeople = new Set<string>();
  const goodCompanies = new Set<string>();
  for (const [projectId, kinds] of roundsByProject) {
    if (fundingIsGoodOutcome(kinds)) goodCompanies.add(projectId);
  }

  const markPerson = (personId: string) => {
    if (byId.has(personId)) goodPeople.add(personId);
  };
  const markCompany = (projectId: string) => {
    goodCompanies.add(projectId);
  };

  const claims = db
    .prepare(
      `SELECT c.entity_type, c.entity_id, c.value_json, s.name AS source_name
       FROM claims c
       LEFT JOIN sources s ON s.id = c.source_id
       WHERE c.claim_type IN (
         'program_membership', 'accelerator_membership', 'accelerator_founder',
         'source_mention', 'affiliation', 'bio_membership', 'funding', 'potential_founder_signal'
       )`
    )
    .all() as { entity_type: string; entity_id: string; value_json: string; source_name: string | null }[];
  for (const claim of claims) {
    const texts = claimProgramTexts(claim.value_json, claim.source_name);
    let hit = false;
    for (const text of texts) {
      for (const program of programsInText(text)) {
        if (TOP_TIER.has(program.id)) hit = true;
      }
    }
    if (!hit) continue;
    if (claim.entity_type === "person") markPerson(claim.entity_id);
    else if (claim.entity_type === "project") markCompany(claim.entity_id);
  }

  for (const row of db.prepare(`SELECT project_id, value_text, detail_json FROM company_facts WHERE fact_key IN ('investor', 'funding_round')`).all() as {
    project_id: string;
    value_text: string;
    detail_json: string;
  }[]) {
    let hit = false;
    for (const program of programsInText(row.value_text)) {
      if (TOP_TIER.has(program.id)) hit = true;
    }
    for (const lead of leadsFromFact(row.detail_json)) {
      for (const program of programsInText(lead)) {
        if (TOP_TIER.has(program.id)) hit = true;
      }
    }
    if (hit) markCompany(row.project_id);
  }

  for (const row of db
    .prepare(`SELECT person_id FROM precollege_signals WHERE signal_type = 'thiel_fellow' AND match_status IN ('confirmed', 'likely')`)
    .all() as { person_id: string }[]) {
    markPerson(row.person_id);
  }

  for (const row of db
    .prepare(
      `SELECT r.source_entity_type, r.source_entity_id, p.name AS program_name
       FROM relationships r
       JOIN projects p ON p.id = r.target_entity_id
       WHERE r.relationship_type IN ('part_of_program', 'participated_in_program')`
    )
    .all() as { source_entity_type: string; source_entity_id: string; program_name: string }[]) {
    let hit = false;
    for (const program of programsInText(row.program_name)) {
      if (TOP_TIER.has(program.id)) hit = true;
    }
    if (!hit) continue;
    if (row.source_entity_type === "person") markPerson(row.source_entity_id);
    else if (row.source_entity_type === "project") markCompany(row.source_entity_id);
  }

  const observations: HitObservation[] = [];
  for (const [id, person] of byId) {
    if (person.campuses.size === 0) continue;
    let good = goodPeople.has(id);
    if (!good) {
      for (const companyId of person.companies) {
        if (goodCompanies.has(companyId)) {
          good = true;
          break;
        }
      }
    }
    observations.push({ id, year: person.year, good, campuses: [...person.campuses] });
  }
  return observations;
}

export function campusHitRates(): CampusHitRate[] {
  const current = dbStamp();
  if (cache?.stamp === current) return cache.rows;
  const rows = scoreHitRates(loadHitObservations());
  cache = { stamp: current, rows };
  return rows;
}

export function hitRateByCampus(): Map<string, CampusHitRate> {
  return new Map(campusHitRates().map((row) => [row.universityId, row]));
}

export function buildHitRateTable(): HitRateTable {
  const rows = campusHitRates()
    .filter((row) => row.reliable)
    .map((row) => ({
      id: row.universityId,
      label: shortCampusLabel(row.universityId),
      founders: row.founders,
      good: row.good,
      hitRate: row.hitRate,
      low: row.low,
      high: row.high,
      ids: row.ids,
    }));
  const hidden = campusHitRates().filter((row) => !row.reliable).length;
  return {
    title: "Campus hit rate",
    subtitle: HIT_RATE_SENTENCE,
    sentence: HIT_RATE_SENTENCE,
    rows,
    caption: `The hit rate is a multiple of the comparison group, not the share of founders with a good outcome. Founders with a graduation year are compared with that class year. Founders without one are compared with all tracked founders. The interval is a rough 95% range after shrinkage toward 1.0. ${hidden === 0 ? "Every campus with a tracked founder is shown." : `${hidden} ${hidden === 1 ? "campus is" : "campuses are"} left off this ranking because they have fewer than 8 tracked founders or a 95% interval wider than 1.25.`}`,
  };
}
