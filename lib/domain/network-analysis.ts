// Campus, program, and headquarters tallies for the network analysis tables.
// Every count is a distinct id from campus-universe.db. Missing headquarters
// stay in Unknown. Enrollment comes from the cited table, never from a guess.

import fs from "node:fs";
import { databasePath, getDb } from "../db/client";
import { shortCampusLabel } from "./campuses";
import {
  METROS,
  metroOf,
  perThousand,
  type AnalysisCell,
  type AnalysisColumn,
  type AnalysisRow,
  type DensityRow,
  type HeatmapTable,
  type NetworkAnalysis,
} from "./network-analysis-model";
import {
  NATIONAL_PROGRAMS,
  TOP_VC_ID,
  TOP_VC_LABEL,
  claimProgramTexts,
  investorFactIsTopVc,
  nationalProgramTierRank,
  programsInText,
} from "./national-programs";
import { undergradEnrollment } from "./undergrad-enrollment";

const CAMPUS_ROWS = 12;
const METRO_COLUMNS = 8;
const CAMPUS_COLUMNS = 8;
const DENSITY_ROWS = 15;
const VERIFIED = new Set(["confirmed", "partial"]);

interface Founder {
  id: string;
  verified: boolean;
}

let cache: { stamp: string; analysis: NetworkAnalysis } | null = null;

export function buildNetworkAnalysis(): NetworkAnalysis {
  let stamp = "missing";
  try {
    const stat = fs.statSync(databasePath());
    stamp = `${stat.mtimeMs}:${stat.size}`;
  } catch {
    stamp = "missing";
  }
  if (cache?.stamp === stamp) return cache.analysis;
  const analysis = assemble();
  cache = { stamp, analysis };
  return analysis;
}

function assemble(): NetworkAnalysis {
  const db = getDb();
  const universities = db.prepare(`SELECT id, name FROM universities`).all() as { id: string; name: string }[];
  const universityIds = new Set(universities.map((row) => row.id));
  const labelOf = new Map(universities.map((row) => [row.id, shortCampusLabel(row.id, row.name)]));

  const founders = new Map<string, Founder>();
  for (const row of db.prepare(`SELECT id, verification_status FROM people WHERE founder_status = 'founder'`).all() as {
    id: string;
    verification_status: string | null;
  }[]) {
    founders.set(row.id, { id: row.id, verified: VERIFIED.has(row.verification_status ?? "") });
  }

  const campusesByPerson = new Map<string, Set<string>>();
  for (const row of db.prepare(`SELECT person_id, university_id FROM affiliations`).all() as { person_id: string; university_id: string }[]) {
    if (!universityIds.has(row.university_id)) continue;
    const list = campusesByPerson.get(row.person_id) ?? new Set<string>();
    list.add(row.university_id);
    campusesByPerson.set(row.person_id, list);
  }

  const companiesByPerson = new Map<string, Set<string>>();
  const peopleByCompany = new Map<string, Set<string>>();
  const startupVerified = new Set<string>();
  for (const row of db
    .prepare(
      `SELECT ppr.person_id, ppr.project_id, p.verification_status
       FROM person_project_roles ppr
       JOIN projects p ON p.id = ppr.project_id
       WHERE p.kind = 'company' AND p.is_investable_candidate = 1 AND lower(ppr.role) LIKE '%founder%'`
    )
    .all() as { person_id: string; project_id: string; verification_status: string | null }[]) {
    if (!founders.has(row.person_id)) continue;
    const companies = companiesByPerson.get(row.person_id) ?? new Set<string>();
    companies.add(row.project_id);
    companiesByPerson.set(row.person_id, companies);
    const people = peopleByCompany.get(row.project_id) ?? new Set<string>();
    people.add(row.person_id);
    peopleByCompany.set(row.project_id, people);
    if (VERIFIED.has(row.verification_status ?? "")) startupVerified.add(row.project_id);
  }

  const hqByCompany = new Map<string, string>();
  for (const row of db.prepare(`SELECT project_id, value_text FROM company_facts WHERE fact_key = 'hq' AND length(trim(value_text)) > 0`).all() as {
    project_id: string;
    value_text: string;
  }[]) {
    if (!hqByCompany.has(row.project_id)) hqByCompany.set(row.project_id, row.value_text.trim());
  }

  const founderCount = new Map<string, number>();
  for (const founder of founders.values()) {
    for (const campusId of campusesByPerson.get(founder.id) ?? []) {
      founderCount.set(campusId, (founderCount.get(campusId) ?? 0) + 1);
    }
  }
  const campusesByFounders = [...founderCount.entries()].sort((a, b) => b[1] - a[1] || (labelOf.get(a[0]) ?? a[0]).localeCompare(labelOf.get(b[0]) ?? b[0]));
  const metroCampuses = campusesByFounders.slice(0, CAMPUS_ROWS).map(([id]) => id);
  const programCampuses = campusesByFounders.slice(0, CAMPUS_COLUMNS).map(([id]) => id);

  const metros = buildMetros(metroCampuses, labelOf, peopleByCompany, campusesByPerson, hqByCompany);
  const programs = buildPrograms(db, programCampuses, labelOf, founders, campusesByPerson, companiesByPerson, peopleByCompany);
  const density = buildDensity(labelOf, founders, campusesByPerson, peopleByCompany, startupVerified);
  return { metros, programs, density };
}

function buildMetros(
  campusIds: string[],
  labelOf: Map<string, string>,
  peopleByCompany: Map<string, Set<string>>,
  campusesByPerson: Map<string, Set<string>>,
  hqByCompany: Map<string, string>
): HeatmapTable {
  const companiesByCampus = new Map<string, Set<string>>();
  for (const campusId of campusIds) companiesByCampus.set(campusId, new Set());
  for (const [companyId, people] of peopleByCompany) {
    const campuses = new Set<string>();
    for (const personId of people) {
      for (const campusId of campusesByPerson.get(personId) ?? []) campuses.add(campusId);
    }
    for (const campusId of campuses) companiesByCampus.get(campusId)?.add(companyId);
  }

  const companiesByMetro = new Map<string, Set<string>>();
  let unknownCompanies = 0;
  const seenUnknown = new Set<string>();
  for (const campusId of campusIds) {
    for (const companyId of companiesByCampus.get(campusId) ?? []) {
      const hq = hqByCompany.get(companyId);
      if (!hq) {
        if (!seenUnknown.has(companyId)) {
          seenUnknown.add(companyId);
          unknownCompanies += 1;
        }
        continue;
      }
      const metro = metroOf(hq);
      if (!metro) continue;
      const list = companiesByMetro.get(metro.id) ?? new Set<string>();
      list.add(companyId);
      companiesByMetro.set(metro.id, list);
    }
  }
  const metroColumns = [...companiesByMetro.entries()].sort((a, b) => b[1].size - a[1].size || a[0].localeCompare(b[0])).slice(0, METRO_COLUMNS);
  const columns: AnalysisColumn[] = metroColumns.map(([id]) => ({
    id,
    label: METROS.find((metro) => metro.id === id)?.label ?? id,
    shade: true,
  }));
  if (unknownCompanies > 0) columns.push({ id: "unknown", label: "Unknown", shade: false });

  const rows: AnalysisRow[] = campusIds.map((campusId) => {
    const companies = companiesByCampus.get(campusId) ?? new Set<string>();
    const buckets = new Map<string, Set<string>>();
    const knownIds = new Set<string>();
    const unknownIds = new Set<string>();
    for (const companyId of companies) {
      const hq = hqByCompany.get(companyId);
      if (!hq) {
        unknownIds.add(companyId);
        continue;
      }
      knownIds.add(companyId);
      const metro = metroOf(hq);
      if (!metro) continue;
      const list = buckets.get(metro.id) ?? new Set<string>();
      list.add(companyId);
      buckets.set(metro.id, list);
    }
    const cells = columns.map((column) => {
      if (column.id === "unknown") return cellFor(unknownIds, campusId, peopleByCompany, campusesByPerson);
      return cellFor(buckets.get(column.id) ?? new Set(), campusId, peopleByCompany, campusesByPerson);
    });
    return {
      id: campusId,
      label: labelOf.get(campusId) ?? campusId,
      cells,
      all: cellFor(knownIds, campusId, peopleByCompany, campusesByPerson),
    };
  });

  const startupTotal = new Set<string>();
  const knownTotal = new Set<string>();
  for (const campusId of campusIds) {
    for (const companyId of companiesByCampus.get(campusId) ?? []) {
      startupTotal.add(companyId);
      if (hqByCompany.has(companyId)) knownTotal.add(companyId);
    }
  }
  const caption = `Cells are startups founded by someone at that campus. Headquarters are on file for ${knownTotal.size.toLocaleString()} of ${startupTotal.size.toLocaleString()} startups tied to these campuses. Shading compares the metro columns. Unknown has no headquarters fact. All metros counts every known headquarters, including cities that are not a column.`;

  return {
    id: "metros",
    title: "Campuses to metros",
    subtitle: "Where companies founded by each campus's founders are headquartered.",
    rowHeader: "Campus",
    columns,
    rows,
    allLabel: "All metros",
    caption,
  };
}

function cellFor(companyIds: Set<string>, campusId: string, peopleByCompany: Map<string, Set<string>>, campusesByPerson: Map<string, Set<string>>): AnalysisCell {
  const ids = new Set<string>();
  if (companyIds.size > 0) ids.add(campusId);
  for (const companyId of companyIds) {
    ids.add(companyId);
    for (const personId of peopleByCompany.get(companyId) ?? []) {
      if (campusesByPerson.get(personId)?.has(campusId)) ids.add(personId);
    }
  }
  return { count: companyIds.size, ids: [...ids] };
}

function buildPrograms(
  db: ReturnType<typeof getDb>,
  campusIds: string[],
  labelOf: Map<string, string>,
  founders: Map<string, Founder>,
  campusesByPerson: Map<string, Set<string>>,
  companiesByPerson: Map<string, Set<string>>,
  peopleByCompany: Map<string, Set<string>>
): HeatmapTable {
  const byProgram = new Map<string, { label: string; tier: string | null; people: Map<string, Set<string>>; all: Set<string>; nodes: Set<string> }>();

  const ensure = (program: { id: string; label: string; tier: string | null }) => {
    let row = byProgram.get(program.id);
    if (!row) {
      row = { label: program.label, tier: program.tier, people: new Map(), all: new Set(), nodes: new Set() };
      byProgram.set(program.id, row);
    }
    return row;
  };

  for (const program of NATIONAL_PROGRAMS) ensure(program);
  const topVc = { id: TOP_VC_ID, label: TOP_VC_LABEL, tier: null as string | null };
  ensure(topVc);

  const addPerson = (program: { id: string; label: string; tier: string | null }, personId: string) => {
    if (!founders.has(personId)) return;
    const campuses = campusesByPerson.get(personId);
    if (!campuses || campuses.size === 0) return;
    const row = ensure(program);
    row.all.add(personId);
    for (const campusId of campuses) {
      const list = row.people.get(campusId) ?? new Set<string>();
      list.add(personId);
      row.people.set(campusId, list);
    }
  };

  const addCompany = (program: { id: string; label: string; tier: string | null }, companyId: string) => {
    for (const personId of peopleByCompany.get(companyId) ?? []) addPerson(program, personId);
  };

  const addTexts = (texts: string[], onMatch: (program: { id: string; label: string; tier: string | null }) => void) => {
    const seen = new Set<string>();
    for (const text of texts) {
      for (const program of programsInText(text)) {
        if (seen.has(program.id)) continue;
        seen.add(program.id);
        onMatch(program);
      }
    }
  };

  const claims = db
    .prepare(
      `SELECT c.entity_type, c.entity_id, c.value_json, s.name AS source_name
       FROM claims c
       LEFT JOIN sources s ON s.id = c.source_id
       WHERE c.claim_type IN (
         'program_membership',
         'accelerator_membership',
         'accelerator_founder',
         'source_mention',
         'affiliation',
         'bio_membership',
         'funding',
         'potential_founder_signal'
       )`
    )
    .all() as { entity_type: string; entity_id: string; value_json: string; source_name: string | null }[];
  for (const claim of claims) {
    const texts = claimProgramTexts(claim.value_json, claim.source_name);
    if (claim.entity_type === "person") addTexts(texts, (program) => addPerson(program, claim.entity_id));
    else if (claim.entity_type === "project") addTexts(texts, (program) => addCompany(program, claim.entity_id));
  }

  const links = db
    .prepare(
      `SELECT r.relationship_type, r.source_entity_type, r.source_entity_id, r.target_entity_id, p.name AS program_name
       FROM relationships r
       JOIN projects p ON p.id = r.target_entity_id
       WHERE r.relationship_type IN ('part_of_program', 'participated_in_program')`
    )
    .all() as { relationship_type: string; source_entity_type: string; source_entity_id: string; target_entity_id: string; program_name: string }[];
  for (const link of links) {
    for (const program of programsInText(link.program_name)) {
      const row = ensure(program);
      row.nodes.add(link.target_entity_id);
      if (link.relationship_type === "participated_in_program" && link.source_entity_type === "person") addPerson(program, link.source_entity_id);
      if (link.relationship_type === "part_of_program" && link.source_entity_type === "project") addCompany(program, link.source_entity_id);
    }
  }

  for (const row of db.prepare(`SELECT person_id, role FROM affiliations WHERE length(trim(role)) > 0`).all() as { person_id: string; role: string }[]) {
    addTexts([row.role], (program) => addPerson(program, row.person_id));
  }

  for (const row of db.prepare(`SELECT project_id, value_text FROM company_facts WHERE fact_key = 'investor' AND length(trim(value_text)) >= 2`).all() as {
    project_id: string;
    value_text: string;
  }[]) {
    for (const program of programsInText(row.value_text)) addCompany(program, row.project_id);
    if (investorFactIsTopVc(row.value_text)) addCompany(topVc, row.project_id);
  }

  for (const row of db
    .prepare(`SELECT person_id, label FROM precollege_signals WHERE signal_type = 'thiel_fellow' AND match_status IN ('confirmed', 'likely') AND label != ''`)
    .all() as { person_id: string; label: string }[]) {
    for (const program of programsInText(row.label.includes("thiel") ? row.label : "Thiel Fellowship")) addPerson(program, row.person_id);
  }

  const ranked = [...byProgram.entries()]
    .filter(([, row]) => row.all.size > 0)
    .sort((a, b) => {
      const aLast = a[0] === TOP_VC_ID ? 1 : 0;
      const bLast = b[0] === TOP_VC_ID ? 1 : 0;
      if (aLast !== bLast) return aLast - bLast;
      const byTier = nationalProgramTierRank(a[1].tier) - nationalProgramTierRank(b[1].tier);
      if (byTier !== 0) return byTier;
      return b[1].all.size - a[1].all.size || a[1].label.localeCompare(b[1].label);
    });
  const columns: AnalysisColumn[] = campusIds.map((id) => ({ id, label: labelOf.get(id) ?? id, shade: true }));
  const rows: AnalysisRow[] = ranked.map(([id, row]) => {
    const cells = campusIds.map((campusId) => personCell(row.people.get(campusId) ?? new Set(), campusId, row.nodes, companiesByPerson));
    const allIds = new Set<string>(row.nodes);
    for (const personId of row.all) {
      allIds.add(personId);
      for (const campusId of campusesByPerson.get(personId) ?? []) allIds.add(campusId);
      for (const companyId of companiesByPerson.get(personId) ?? []) allIds.add(companyId);
    }
    return {
      id,
      label: row.label,
      tier: row.tier,
      cells,
      all: { count: row.all.size, ids: [...allIds] },
    };
  });

  return {
    id: "programs",
    title: "Programs to campuses",
    subtitle: "National programs across every campus, ordered by tier and then by founder count.",
    rowHeader: "Program",
    columns,
    rows,
    allLabel: "All",
    caption:
      "National programs only. A row is kept when at least one founder matches. Cells count distinct founders matched from claim text, a source name, a program relationship, an affiliation role, or an investor fact on a company they founded. Aliases count, including Accel Leaders, Pear VC Garage, Founders, Inc., and SPC Founder Fellowship. Backed by top VC counts founders whose startup has an investor fact naming Sequoia, a16z, Benchmark, Accel, Founders Fund, Greylock, Lightspeed, General Catalyst, Index, Khosla, Thrive, Bessemer, GV, First Round, Pear, Floodgate, SV Angel, Lux, or NEA. The chip is a scouting tier, not Founder Signal. All counts each founder once, so two campuses share one All total. Columns are the eight campuses with the most founders on record.",
  };
}

function personCell(people: Set<string>, campusId: string, extra: Set<string>, companiesByPerson: Map<string, Set<string>>): AnalysisCell {
  const ids = new Set<string>();
  if (people.size > 0) {
    ids.add(campusId);
    for (const id of extra) ids.add(id);
  }
  for (const personId of people) {
    ids.add(personId);
    for (const companyId of companiesByPerson.get(personId) ?? []) ids.add(companyId);
  }
  return { count: people.size, ids: [...ids] };
}

function buildDensity(
  labelOf: Map<string, string>,
  founders: Map<string, Founder>,
  campusesByPerson: Map<string, Set<string>>,
  peopleByCompany: Map<string, Set<string>>,
  startupVerified: Set<string>
): { title: string; subtitle: string; rows: DensityRow[]; caption: string } {
  const foundersByCampus = new Map<string, Set<string>>();
  let omitted = 0;
  const withFounders = new Set<string>();
  for (const founder of founders.values()) {
    if (!founder.verified) continue;
    for (const campusId of campusesByPerson.get(founder.id) ?? []) {
      withFounders.add(campusId);
      const list = foundersByCampus.get(campusId) ?? new Set<string>();
      list.add(founder.id);
      foundersByCampus.set(campusId, list);
    }
  }
  const startupsByCampus = new Map<string, Set<string>>();
  for (const companyId of startupVerified) {
    const campuses = new Set<string>();
    for (const personId of peopleByCompany.get(companyId) ?? []) {
      if (!founders.get(personId)?.verified) continue;
      for (const campusId of campusesByPerson.get(personId) ?? []) campuses.add(campusId);
    }
    for (const campusId of campuses) {
      const list = startupsByCampus.get(campusId) ?? new Set<string>();
      list.add(companyId);
      startupsByCampus.set(campusId, list);
    }
  }

  const rows: DensityRow[] = [];
  for (const campusId of withFounders) {
    const enrollment = undergradEnrollment(campusId);
    if (!enrollment) {
      omitted += 1;
      continue;
    }
    const people = foundersByCampus.get(campusId) ?? new Set<string>();
    const startups = startupsByCampus.get(campusId) ?? new Set<string>();
    const ids = new Set<string>([campusId, ...people, ...startups]);
    rows.push({
      id: campusId,
      label: labelOf.get(campusId) ?? campusId,
      founders: people.size,
      startups: startups.size,
      undergrads: enrollment.undergrads,
      perThousand: perThousand(people.size, enrollment.undergrads),
      ids: [...ids],
      enrollmentYear: enrollment.year,
      enrollmentKind: enrollment.kind,
      sourceName: enrollment.sourceName,
      sourceUrl: enrollment.sourceUrl,
    });
  }
  rows.sort((a, b) => b.perThousand - a.perThousand || b.founders - a.founders || a.label.localeCompare(b.label));
  const shown = rows.slice(0, DENSITY_ROWS);
  const caption = `Verified means confirmation status confirmed or partly verified. Founders per 1,000 divides those founders by the cited undergraduate enrollment. ${omitted === 0 ? "Every campus with a verified founder has an enrollment figure." : `${omitted} ${omitted === 1 ? "campus" : "campuses"} with verified founders ${omitted === 1 ? "has" : "have"} no enrollment figure on file and ${omitted === 1 ? "is" : "are"} left out of this ranking.`} This is founders on record, not a census of every founder at the school.`;
  return {
    title: "Per-capita founder density",
    subtitle: "Verified founders on record per 1,000 undergraduates.",
    rows: shown,
    caption,
  };
}
