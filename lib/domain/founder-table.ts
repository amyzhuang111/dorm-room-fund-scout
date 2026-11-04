import fs from "node:fs";
import { databasePath, getDb } from "../db/client";
import { campusSlug, shortCampusLabel } from "./campuses";
import { localCompanyLogoUrl } from "./local-logos";
import { listFoundersForPage } from "./queries";

const TIER_RANK: Record<string, number> = { "S+": 0, S: 1, A: 2, B: 3, C: 4, D: 5, talent: 6, Unranked: 7 };

export interface FounderTableRow {
  id: string;
  name: string;
  tier: string | null;
  tierBasis: string | null;
  campus: string | null;
  campusId: string | null;
  campusSlug: string | null;
  company: string | null;
  companyId: string | null;
  year: number | null;
  signal: string | null;
  signalType: string | null;
  signalAt: string | null;
  score: number | null;
  verified: boolean;
}

// The database file does not change while an instance runs (read-only bundle on
// Vercel; locally any write bumps its mtime), so each table is built once per
// campus per file version instead of on every request. One /founders request
// used to run this heavy signals scan three times.
function dbStamp(): string {
  try {
    const st = fs.statSync(databasePath());
    return `${st.mtimeMs}:${st.size}`;
  } catch {
    return "missing";
  }
}
const founderTableMemo = new Map<string, { stamp: string; rows: FounderTableRow[] }>();
const projectRowsMemo = new Map<string, { stamp: string; rows: ProjectTableRow[] }>();

export function loadFounderTable(universityId?: string): FounderTableRow[] {
  const key = universityId ?? "";
  const stamp = dbStamp();
  const hit = founderTableMemo.get(key);
  if (hit?.stamp === stamp) return hit.rows;
  const rows = buildFounderTable(universityId);
  founderTableMemo.set(key, { stamp, rows });
  return rows;
}

function buildFounderTable(universityId?: string): FounderTableRow[] {
  const db = getDb();
  const years = new Map<string, number>();
  try {
    for (const row of db.prepare(
      `SELECT id as person_id, enrollment_grad_year as year FROM people WHERE enrollment_grad_year IS NOT NULL`
    ).all() as { person_id: string; year: number }[]) {
      if (!years.has(row.person_id)) years.set(row.person_id, row.year);
    }
  } catch {
    // Older databases keep class year off the person row. The column stays blank.
  }
  const signals = new Map<string, { type: string; at: string | null; text: string | null }>();
  for (const row of db.prepare(
    `SELECT ppr.person_id as person_id, s.signal_type as type, s.created_at as created_at, s.source_date as source_date, s.current_observation as text
       FROM signals s
       JOIN person_project_roles ppr ON ppr.project_id = s.project_id
      ORDER BY s.created_at DESC`
  ).all() as { person_id: string; type: string; created_at: string | null; source_date: string | null; text: string | null }[]) {
    if (!signals.has(row.person_id)) signals.set(row.person_id, { type: row.type, at: dated(row.source_date) ?? row.created_at, text: row.text });
  }

  const rows = listFoundersForPage(universityId ? { universityId } : {})
    .filter((founder) => (universityId ? founder.campuses.some((campus) => campus.universityId === universityId) || founder.universityId === universityId : true))
    .map((founder) => {
      const campusId = founder.universityId;
      const signal = signals.get(founder.id);
      return {
        id: founder.id,
        name: founder.name,
        tier: founder.signalTier,
        tierBasis: founder.signalTierBasis,
        campus: founder.universityName ? shortCampusLabel(campusId ?? "", founder.universityName) : null,
        campusId,
        campusSlug: campusId && founder.universityName ? campusSlug(shortCampusLabel(campusId, founder.universityName)) : null,
        company: founder.linkedCompany?.name ?? founder.possibleCompany?.name ?? founder.projects.find((project) => project.kind === "company")?.name ?? null,
        companyId: founder.linkedCompany?.id ?? founder.projects.find((project) => project.kind === "company")?.id ?? null,
        year: years.get(founder.id) ?? null,
        signal: signal?.text ?? founder.strongestEvidence,
        signalType: signal?.type ?? null,
        signalAt: signal?.at ?? null,
        score: founder.founderSignal.founderSignal,
        verified: founder.verificationStatus === "confirmed",
      };
    });
  rows.sort(
    (a, b) =>
      (TIER_RANK[a.tier ?? "Unranked"] ?? 7) - (TIER_RANK[b.tier ?? "Unranked"] ?? 7) ||
      signalTime(b.signalAt) - signalTime(a.signalAt) ||
      a.name.localeCompare(b.name)
  );
  return rows;
}

function signalTime(iso: string | null): number {
  if (!iso) return Number.NEGATIVE_INFINITY;
  const then = Date.parse(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
  return Number.isNaN(then) ? Number.NEGATIVE_INFINITY : then;
}

function dated(value: string | null): string | null {
  if (!value) return null;
  return /^\d{4}-\d{2}-\d{2}/.test(value.trim()) ? value.trim() : null;
}


function bestTier(values: (string | null | undefined)[]): string | null {
  let best: string | null = null;
  let rank = 99;
  for (const value of values) {
    const key = value && TIER_RANK[value] != null ? value : null;
    if (!key) continue;
    if (TIER_RANK[key] < rank) {
      best = key;
      rank = TIER_RANK[key];
    }
  }
  return best;
}

function cleanLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  const text = value.trim();
  if (!text || text === "-" || text === "\u2014") return null;
  return text;
}

export function parseSignalCopy(text: string | null): { event: string | null; detail: string | null; full: string | null } {
  if (!text) return { event: null, detail: null, full: null };
  const cleaned = text.replace(/:\s*"-"\s*(?:\u2014|\u2013|-)\s*-\./g, ".").replace(/[ \t]{2,}/g, " ").trim();
  if (!cleaned) return { event: null, detail: null, full: null };
  const match = cleaned.match(/^(.*?)\s+project gallery submission\b[:.]?\s*(.*)$/i);
  if (!match) return { event: null, detail: cleaned, full: cleaned };
  const detail = match[2].replace(/^\.\s*/, "").trim();
  return { event: match[1].trim() || null, detail: detail || null, full: cleaned };
}

function quotedName(text: string | null): string | null {
  if (!text) return null;
  const match = text.match(/"([^"]+)"/);
  return match ? cleanLabel(match[1]) : null;
}

export interface ProjectMate {
  id: string;
  name: string;
  tier: string | null;
  tierBasis: string | null;
  signalAt: string | null;
}

export interface ProjectTableRow {
  id: string;
  name: string;
  event: string | null;
  detail: string | null;
  full: string | null;
  signalAt: string | null;
  tier: string | null;
  tierBasis: string | null;
  campus: string | null;
  campusSlug: string | null;
  people: ProjectMate[];
  verified: boolean;
  logoUrl: string | null;
}

/**
 * A verified program roster is source evidence, even if no separate launch,
 * news or funding signal was recorded. Display it as a roster note, not as
 * proof of launch or traction. This makes newly imported Stanford/Cornell
 * founders discoverable in the existing /founders table without fabricating
 * activity or promoting unrelated hackathon participants.
 */
function projectRosterNotes(db: ReturnType<typeof getDb>, projectIds: string[]): Map<string, string> {
  const notes = new Map<string, string>();
  for (let index = 0; index < projectIds.length; index += 350) {
    const ids = projectIds.slice(index, index + 350);
    const marks = ids.map(() => "?").join(",");
    const claims = db.prepare(
      `SELECT entity_id AS project_id, value_json, excerpt
         FROM claims
        WHERE entity_type='project' AND claim_type='program_membership'
          AND entity_id IN (${marks})
        ORDER BY retrieved_at DESC`
    ).all(...ids) as { project_id: string; value_json: string | null; excerpt: string | null }[];
    for (const claim of claims) {
      if (notes.has(claim.project_id)) continue;
      let program: string | null = null;
      try {
        const value = JSON.parse(claim.value_json || "{}") as { org?: unknown };
        if (typeof value.org === "string") program = cleanLabel(value.org);
      } catch {
        // Invalid structured data: fall back to the observed excerpt only.
      }
      const observed = cleanLabel(claim.excerpt);
      const text = program
        ? `Listed in ${program}.`
        : observed ? `Program roster: ${observed.slice(0, 220)}` : null;
      if (text) notes.set(claim.project_id, text);
    }
  }
  return notes;
}

interface ProjectHit {
  person_id: string;
  project_id: string;
  project_name: string;
  project_kind: string;
  description: string | null;
  signal_tier: string | null;
  signal_tier_basis: string | null;
  obs: string | null;
  source_date: string | null;
  created_at: string | null;
}

export function loadProjectRows(universityId?: string): ProjectTableRow[] {
  const key = universityId ?? "";
  const stamp = dbStamp();
  const hit = projectRowsMemo.get(key);
  if (hit?.stamp === stamp) return hit.rows;
  const rows = buildProjectRows(universityId);
  projectRowsMemo.set(key, { stamp, rows });
  return rows;
}

function buildProjectRows(universityId?: string): ProjectTableRow[] {
  const people = loadFounderTable(universityId);
  const byId = new Map(people.map((person) => [person.id, person]));
  const db = getDb();
  const hits: ProjectHit[] = [];
  const ids = people.map((person) => person.id);
  for (let index = 0; index < ids.length; index += 400) {
    const slice = ids.slice(index, index + 400);
    const marks = slice.map(() => "?").join(",");
    hits.push(
      ...db
        .prepare(
          `SELECT r.person_id as person_id, p.id as project_id, p.name as project_name, p.kind as project_kind, p.description as description, p.signal_tier as signal_tier, p.signal_tier_basis as signal_tier_basis,
                  s.current_observation as obs, s.source_date as source_date, s.created_at as created_at
             FROM person_project_roles r
             JOIN projects p ON p.id = r.project_id
             LEFT JOIN signals s ON s.project_id = p.id
            WHERE r.person_id IN (${marks})`,
        )
        .all(...slice) as ProjectHit[],
    );
  }

  const grouped = new Map<string, ProjectHit[]>();
  const seenPeople = new Set<string>();
  for (const hit of hits) {
    if (!byId.has(hit.person_id)) continue;
    seenPeople.add(hit.person_id);
    const list = grouped.get(hit.project_id) ?? [];
    list.push(hit);
    grouped.set(hit.project_id, list);
  }

  const rosterNotes = projectRosterNotes(db, [...grouped.keys()]);
  const rows: ProjectTableRow[] = [];
  for (const [projectId, projectHits] of grouped) {
    const members = new Map<string, FounderTableRow>();
    let obs: string | null = null;
    let signalAt: string | null = null;
    let signalRank = Number.NEGATIVE_INFINITY;
    let description: string | null = null;
    let projectTier: string | null = null;
    let projectTierBasis: string | null = null;
    let projectName: string | null = null;
    for (const hit of projectHits) {
      const person = byId.get(hit.person_id);
      if (person) members.set(person.id, person);
      projectName = projectName ?? hit.project_name;
      description = description ?? hit.description;
      if (!projectTier && hit.signal_tier) {
        projectTier = hit.signal_tier;
        projectTierBasis = hit.signal_tier_basis;
      }
      const at = dated(hit.source_date) ?? hit.created_at;
      const rank = signalTime(hit.created_at);
      if (rank >= signalRank) {
        signalRank = rank;
        signalAt = at;
        if (hit.obs) obs = hit.obs;
      }
    }
    const parsed = parseSignalCopy(obs);
    const rosterNote = projectHits.some((hit) => hit.project_kind === "company") ? rosterNotes.get(projectId) ?? null : null;
    const mates = [...members.values()]
      .map((person) => ({ id: person.id, name: person.name, tier: person.tier, tierBasis: person.tierBasis, signalAt: person.signalAt }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const campus = majorityCampus([...members.values()]);
    const tier = bestTier([projectTier, ...mates.map((mate) => mate.tier)]);
    const tierBasis =
      (tier && projectTier === tier ? projectTierBasis : null) ||
      mates.find((mate) => mate.tier === tier)?.tierBasis ||
      projectTierBasis ||
      mates.find((mate) => mate.tierBasis)?.tierBasis ||
      null;
    rows.push({
      id: projectId,
      name: cleanLabel(projectName) ?? quotedName(obs) ?? mates[0]?.name ?? "",
      event: parsed.event,
      detail: cleanLabel(description) ?? parsed.detail ?? rosterNote,
      full: parsed.full ?? cleanLabel(description) ?? rosterNote,
      signalAt,
      tier,
      tierBasis,
      campus: campus?.campus ?? null,
      campusSlug: campus?.campusSlug ?? null,
      people: mates,
      verified: [...members.values()].some((person) => person.verified),
      logoUrl: localCompanyLogoUrl(projectId),
    });
  }

  for (const person of people) {
    if (seenPeople.has(person.id)) continue;
    const parsed = parseSignalCopy(person.signal);
    rows.push({
      id: `person:${person.id}`,
      name: person.name,
      event: parsed.event,
      detail: parsed.detail,
      full: parsed.full,
      signalAt: person.signalAt,
      tier: person.tier,
      tierBasis: person.tierBasis,
      campus: person.campus,
      campusSlug: person.campusSlug,
      people: [{ id: person.id, name: person.name, tier: person.tier, tierBasis: person.tierBasis, signalAt: person.signalAt }],
      verified: person.verified,
      logoUrl: person.companyId ? localCompanyLogoUrl(person.companyId) : null,
    });
  }

  // Rank by tier first (S+ → Unranked), then recency.
  rows.sort(
    (a, b) =>
      (TIER_RANK[a.tier ?? "Unranked"] ?? 7) - (TIER_RANK[b.tier ?? "Unranked"] ?? 7) ||
      signalTime(b.signalAt) - signalTime(a.signalAt) ||
      a.name.localeCompare(b.name),
  );
  return rows;
}

function majorityCampus(people: FounderTableRow[]): { campus: string; campusSlug: string | null } | null {
  const counts = new Map<string, { campus: string; campusSlug: string | null; count: number }>();
  for (const person of people) {
    if (!person.campus) continue;
    const current = counts.get(person.campus) ?? { campus: person.campus, campusSlug: person.campusSlug, count: 0 };
    current.count += 1;
    counts.set(person.campus, current);
  }
  const ranked = [...counts.values()].sort((a, b) => b.count - a.count || a.campus.localeCompare(b.campus));
  return ranked[0] ?? null;
}
