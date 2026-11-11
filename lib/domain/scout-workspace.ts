import { stageFilter, fundingStageLabel } from './funding-stage';
import type { FacetCompany } from './sample-facets';
import { statusOf, STATUS_LABEL, COVERAGE_FIELDS, filterFacetCompanies, type StatusId } from './sample-facets';
import { companyCampusIds } from './campus-membership';
import { shortCampusLabel } from './campuses';
import type { FounderLead } from './founder-index';
import { cleanCsvDate, cleanCsvList, cleanCsvNames, cleanCsvText, cleanCsvUrls, encodeCsv } from '../display/csv';

export type WorkspacePanel = 'companies' | 'founders' | 'networks' | 'rankings' | 'insights';
export const PANELS: { id: WorkspacePanel; label: string }[] = [
  { id: 'companies', label: 'Companies' }, { id: 'founders', label: 'Founders' },
  { id: 'networks', label: 'Networks' }, { id: 'rankings', label: 'Rankings' }, { id: 'insights', label: 'Insights' },
];
export function panelOf(value: string | null): WorkspacePanel { return PANELS.find(p => p.id === value)?.id ?? 'companies'; }
export type WorkspaceFilters = { q: string; campus: string; sector: string; region: string; status: string; stage: string; network: string; missing: string; sort: string };
export function workspaceFilters(params: Pick<URLSearchParams, 'get'>): WorkspaceFilters {
  return { q: params.get('q') ?? '', campus: params.get('campus') ?? '', sector: params.get('sector') ?? '', region: params.get('hqRegion') ?? params.get('hq') ?? '', status: params.get('status') ?? '', stage: stageFilter(params.get('stage')), network: params.get('network') ?? '', missing: params.get('missing') ?? '', sort: params.get('sort') ?? 'signals' };
}
export const campusIds = companyCampusIds;
export function campusNames(company: FacetCompany): string[] { return company.campuses?.length ? company.campuses : company.school ? [company.school] : []; }
export { hasNamedFounder, COVERAGE_FIELDS } from './sample-facets';
export function filterWorkspace(companies: FacetCompany[], filters: WorkspaceFilters): FacetCompany[] {
  return filterFacetCompanies(companies, { campus:filters.campus || null, sector:filters.sector || null, hqRegion:filters.region || null, status:(filters.status || null) as StatusId | null, query:filters.q, stage:filters.stage || null, network:filters.network || null, missing:filters.missing || null }).sort((a,b) => {
    if (filters.sort === 'name') return a.name.localeCompare(b.name);
    if (filters.sort === 'recent') return (b.latestSignalAt ?? '').localeCompare(a.latestSignalAt ?? '') || a.name.localeCompare(b.name);
    return b.signals - a.signals || a.name.localeCompare(b.name);
  });
}
export function workspaceFounders(founders: FounderLead[], companies: FacetCompany[], filters: WorkspaceFilters): FounderLead[] {
  const companyIds = new Set(companies.map(c => c.id));
  const requiresCompany = !!(filters.sector || filters.region || filters.status || filters.stage || filters.network || filters.missing);
  const tokens = filters.q.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const seen = new Set<string>();
  return founders.filter(f => {
    if (seen.has(f.id)) return false;
    const schools = [...new Set([...(f.campusIds ?? []), ...(f.campusId ? [f.campusId] : [])])];
    const linkedCompanies = [...new Set([...(f.companyIds ?? []), ...(f.companyId ? [f.companyId] : [])])];
    const hasCompany = linkedCompanies.some(id => companyIds.has(id));
    if (filters.campus === 'missing' ? schools.length > 0 : filters.campus && !schools.includes(filters.campus)) return false;
    if (requiresCompany && !hasCompany) return false;
    const text = [f.name, f.campus, f.company, f.sector, ...f.programs].join(' ').toLowerCase();
    if (!tokens.every(t => text.includes(t)) && !hasCompany) return false;
    seen.add(f.id);
    return true;
  }).sort((a,b) => filters.sort === 'name' ? a.name.localeCompare(b.name) : b.signalTypes.length - a.signalTypes.length || a.name.localeCompare(b.name));
}
export function rankGroups(companies: FacetCompany[], kind: 'campus' | 'network') {
  const groups = new Map<string, { id: string; name: string; companies: number; signals: number }>();
  const seen = new Set<string>();
  for (const c of companies) {
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    const ids = kind === 'campus' ? campusIds(c) : [...new Set(c.programs ?? [])];
    ids.forEach((id) => {
      const pairedIndex = c.campusIds?.indexOf(id) ?? -1;
      const label = pairedIndex >= 0 ? c.campuses?.[pairedIndex] : id === c.schoolId ? c.school : undefined;
      const group = groups.get(id) ?? { id, name: kind === 'campus' ? shortCampusLabel(id, label ?? id) : id, companies: 0, signals: 0 };
      group.companies++; group.signals += c.signals; groups.set(id, group);
    });
  }
  return [...groups.values()].sort((a,b) => b.companies - a.companies || b.signals - a.signals || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}
export function workspaceCsv(panel: WorkspacePanel, companies: FacetCompany[], founders: FounderLead[]): string {
  if (panel === 'founders') return encodeCsv([
    ['Founder', 'Campus', 'Company', 'Role', 'Graduation year', 'Industry', 'Programs', 'Signal types', 'Sources', 'Record'],
    ...founders.map(f => [cleanCsvText(f.name), cleanCsvText(f.campus), cleanCsvText(f.company), cleanCsvText(f.role), f.gradYear, cleanCsvText(f.sector), cleanCsvList(f.programs), cleanCsvList(f.signalTypes), cleanCsvUrls([...Object.values(f.signalSourceByType), ...Object.values(f.programSourceByLabel)]), `/founder/discover?founder=${encodeURIComponent(f.id)}`]),
  ]);
  if (panel === 'rankings' || panel === 'networks') return encodeCsv([
    [panel === 'rankings' ? 'Campus' : 'Investor or program network', 'Companies in filtered view', 'Recorded signals'],
    ...rankGroups(companies, panel === 'rankings' ? 'campus' : 'network').map(g => [cleanCsvText(g.name), g.companies, g.signals]),
  ]);
  if (panel === 'insights') return encodeCsv([['Field', 'Present', 'Missing', 'Total'], ...COVERAGE_FIELDS.map(f => { const n = companies.filter(f.has).length; return [f.label,n,companies.length-n,companies.length]; })]);
  return encodeCsv([
    ['Company','Campuses','Founders','Industry','HQ region','Founded year','Team size','Operating status','Funding stage','Investors or programs','Signals','Latest signal date','Sources','Record'],
    ...companies.map(c => [cleanCsvText(c.name),cleanCsvList(campusNames(c)),cleanCsvNames(c.founders ?? []),cleanCsvText(c.sector),cleanCsvText(c.hqRegion),c.foundedYear,cleanCsvText(c.teamSize),STATUS_LABEL[statusOf(c)],cleanCsvText(fundingStageLabel(c.stage)),cleanCsvList(c.programs ?? []),c.signals,cleanCsvDate(c.latestSignalAt),cleanCsvUrls(c.sourceUrls ?? []),`/startup/${encodeURIComponent(c.id)}`]),
  ]);
}
