import { getDb } from "../db/client";
import { shortCampusLabel } from "./campuses";
import type { FounderLead } from "./founder-index";
import { listFounders } from "./queries";
import { sectorLabel } from "./sectors";

function programLabel(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "";
  if (/venture\s*lab\s*vip-?x/i.test(trimmed) || /^penn\s+venture\s+lab$/i.test(trimmed)) return "Penn Venture Lab";
  return trimmed;
}

function isUsableSourceUrl(url: string | null | undefined): url is string {
  if (!url) return false;
  const trimmed = url.trim();
  if (!/^https?:\/\//i.test(trimmed)) return false;
  if (/duckduckgo\.com/i.test(trimmed)) return false;
  return true;
}

function preferSource(current: string | undefined, next: string | null | undefined): string | undefined {
  if (!isUsableSourceUrl(next)) return current;
  if (!current) return next;
  // Prefer non-yc directory pages only when we have nothing; keep first good URL stable.
  return current;
}

/** Promoted founders with only the campus, program, sector, year, signal, and company fields on record. */
export function buildFounderIndex(): FounderLead[] {
  const db = getDb();
  const years = new Map<string, number>();
  for (const row of db.prepare(`SELECT id, enrollment_grad_year as year FROM people WHERE enrollment_grad_year IS NOT NULL`).all() as {
    id: string;
    year: number;
  }[]) {
    if (Number.isFinite(row.year)) years.set(row.id, row.year);
  }
  const programsByProject = new Map<string, string[]>();
  const programSourceByProject = new Map<string, Record<string, string>>();
  for (const row of db
    .prepare(
      `SELECT project_id, value_text, source_url FROM company_facts WHERE fact_key = 'investor' AND TRIM(COALESCE(value_text, '')) != ''`,
    )
    .all() as { project_id: string; value_text: string; source_url: string | null }[]) {
    const label = programLabel(row.value_text);
    if (!label) continue;
    const list = programsByProject.get(row.project_id) ?? [];
    if (!list.includes(label)) list.push(label);
    programsByProject.set(row.project_id, list);
    if (isUsableSourceUrl(row.source_url)) {
      const map = programSourceByProject.get(row.project_id) ?? {};
      map[label] = preferSource(map[label], row.source_url) ?? row.source_url;
      programSourceByProject.set(row.project_id, map);
    }
  }
  const sectorByProject = new Map<string, string>();
  for (const row of db.prepare(`SELECT project_id, tag FROM project_sector_tags ORDER BY is_primary DESC, tag`).all() as {
    project_id: string;
    tag: string;
  }[]) {
    if (!sectorByProject.has(row.project_id)) sectorByProject.set(row.project_id, sectorLabel(row.tag));
  }
  const signalsByProject = new Map<string, string[]>();
  const signalSourceByProject = new Map<string, Record<string, string>>();
  const signalRows = db
    .prepare(
      `SELECT id, project_id, signal_type, claim_ids_json FROM signals WHERE TRIM(COALESCE(signal_type, '')) != ''`,
    )
    .all() as { id: string; project_id: string; signal_type: string; claim_ids_json: string | null }[];
  const claimIds: string[] = [];
  const parsedBySignal = new Map<string, string[]>();
  for (const row of signalRows) {
    const list = signalsByProject.get(row.project_id) ?? [];
    if (!list.includes(row.signal_type)) list.push(row.signal_type);
    signalsByProject.set(row.project_id, list);
    let ids: string[] = [];
    try {
      const raw = row.claim_ids_json ? JSON.parse(row.claim_ids_json) : [];
      if (Array.isArray(raw)) ids = raw.filter((x): x is string => typeof x === "string");
    } catch {
      ids = [];
    }
    parsedBySignal.set(row.id, ids);
    for (const id of ids) claimIds.push(id);
  }
  const claimUrlById = new Map<string, string>();
  if (claimIds.length) {
    const unique = [...new Set(claimIds)];
    const chunk = 400;
    for (let i = 0; i < unique.length; i += chunk) {
      const slice = unique.slice(i, i + chunk);
      const ph = slice.map(() => "?").join(",");
      for (const row of db
        .prepare(`SELECT id, source_url FROM claims WHERE id IN (${ph}) AND source_url IS NOT NULL AND TRIM(source_url) != ''`)
        .all(...slice) as { id: string; source_url: string }[]) {
        if (isUsableSourceUrl(row.source_url)) claimUrlById.set(row.id, row.source_url);
      }
    }
  }
  for (const row of signalRows) {
    let source: string | undefined;
    for (const cid of parsedBySignal.get(row.id) ?? []) {
      const url = claimUrlById.get(cid);
      if (url) {
        source = url;
        break;
      }
    }
    if (!source) continue;
    const map = signalSourceByProject.get(row.project_id) ?? {};
    map[row.signal_type] = preferSource(map[row.signal_type], source) ?? source;
    signalSourceByProject.set(row.project_id, map);
  }

  const roleByPersonProject = new Map<string, string>();
  for (const row of db
    .prepare(`SELECT person_id, project_id, role FROM person_project_roles WHERE role IS NOT NULL AND trim(role) != ''`)
    .all() as { person_id: string; project_id: string; role: string }[]) {
    const key = `${row.person_id}::${row.project_id}`;
    if (!roleByPersonProject.has(key)) roleByPersonProject.set(key, row.role.trim());
  }

  const leads: FounderLead[] = [];
  for (const founder of listFounders()) {
    const companyIds: string[] = [];
    if (founder.linkedCompany) companyIds.push(founder.linkedCompany.id);
    for (const project of founder.projects) {
      if (project.kind === "company" && /founder/i.test(project.role) && !companyIds.includes(project.id)) companyIds.push(project.id);
    }
    const programs: string[] = [];
    const signalTypes: string[] = [];
    const signalSourceByType: Record<string, string> = {};
    const programSourceByLabel: Record<string, string> = {};
    let sector: string | null = null;
    for (const id of companyIds) {
      for (const program of programsByProject.get(id) ?? []) {
        if (!programs.includes(program)) programs.push(program);
      }
      for (const type of signalsByProject.get(id) ?? []) {
        if (!signalTypes.includes(type)) signalTypes.push(type);
      }
      for (const [type, url] of Object.entries(signalSourceByProject.get(id) ?? {})) {
        signalSourceByType[type] = preferSource(signalSourceByType[type], url) ?? url;
      }
      for (const [label, url] of Object.entries(programSourceByProject.get(id) ?? {})) {
        programSourceByLabel[label] = preferSource(programSourceByLabel[label], url) ?? url;
      }
      if (!sector) sector = sectorByProject.get(id) ?? null;
    }
    for (const signal of founder.programSignals) {
      if (signal.matchStatus !== "confirmed") continue;
      const label = programLabel(signal.label);
      if (label && !programs.includes(label)) programs.push(label);
      if (label && isUsableSourceUrl(signal.sourceUrl)) {
        programSourceByLabel[label] = preferSource(programSourceByLabel[label], signal.sourceUrl) ?? signal.sourceUrl;
      }
    }
    if (!sector) {
      const tag = founder.sectorTags.find((value) => value.trim());
      if (tag) sector = tag;
    }
    const company =
      founder.linkedCompany?.name ??
      founder.projects.find((project) => project.kind === "company" && /founder/i.test(project.role))?.name ??
      null;
    const companyId = founder.linkedCompany?.id ?? companyIds[0] ?? null;
    const campusId = founder.universityId;
    const campus = founder.universityName ? shortCampusLabel(campusId ?? "", founder.universityName) : null;
    const rawRole = companyId ? roleByPersonProject.get(`${founder.id}::${companyId}`) ?? null : null;
    const role = rawRole
      ? rawRole
          .replace(/[—–]/g, " · ")
          .replace(/_/g, " ")
          .replace(/\bteam member\b/gi, "Team member")
          .replace(/\bco-founder\b/gi, "Co-founder")
          .replace(/\bfounder\b/gi, "Founder")
          .replace(/\bmember\b/gi, "Member")
          .replace(/\bcontributor\b/gi, "Contributor")
          .replace(/\balumnus\b/gi, "Alumnus")
          .replace(/\bnot listed\b/gi, "Not listed")
          .replace(/\s+·\s+/g, " · ")
          .trim()
      : null;
    leads.push({
      id: founder.id,
      name: founder.name,
      campusId,
      campusIds: [...new Set([campusId, ...founder.campuses.map(c => c.universityId)].filter((id): id is string => Boolean(id)))],
      campus,
      programs,
      sector,
      gradYear: years.get(founder.id) ?? null,
      signalTypes,
      company,
      companyId,
      companyIds,
      role,
      signalSourceByType,
      programSourceByLabel,
    });
  }
  leads.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  return leads;
}
