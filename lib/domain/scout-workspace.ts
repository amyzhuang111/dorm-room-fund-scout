import type { FacetCompany } from './sample-facets';
import { statusOf, STATUS_LABEL } from './sample-facets';
import { matchesSector } from './sectors';
import type { FounderLead } from './founder-index';
import { cleanCsvDate, cleanCsvList, cleanCsvNames, cleanCsvText, cleanCsvUrls, encodeCsv } from '../display/csv';

export type WorkspacePanel = 'companies' | 'founders' | 'networks' | 'rankings' | 'insights';
export const PANELS: { id: WorkspacePanel; label: string }[] = [
  { id: 'companies', label: 'Companies' }, { id: 'founders', label: 'Founders' },
  { id: 'networks', label: 'Networks' }, { id: 'rankings', label: 'Rankings' }, { id: 'insights', label: 'Insights' },
];
export function panelOf(value: string | null): WorkspacePanel { return PANELS.find(p => p.id === value)?.id ?? 'companies'; }
export type WorkspaceFilters = { q: string; campus: string; sector: string; region: string; status: string; network: string; missing: string; sort: string };
export function workspaceFilters(params: Pick<URLSearchParams, 'get'>): WorkspaceFilters {
  return { q: params.get('q') ?? '', campus: params.get('campus') ?? '', sector: params.get('sector') ?? '', region: params.get('hqRegion') ?? '', status: params.get('status') ?? '', network: params.get('network') ?? '', missing: params.get('missing') ?? '', sort: params.get('sort') ?? 'signals' };
}
export function campusIds(company: FacetCompany): string[] { return [...new Set([...(company.campusIds ?? []), ...(company.schoolId ? [company.schoolId] : [])])]; }
export function campusNames(company: FacetCompany): string[] { return company.campuses?.length ? company.campuses : company.school ? [company.school] : []; }
export function hasNamedFounder(company: FacetCompany): boolean {
  return (company.founders ?? []).some(name => /[\p{L}]{2,}/u.test(name) && !/^(unknown|unnamed|n\/a|founder)$/i.test(name.trim()));
}
export const COVERAGE_FIELDS = [
  { id: 'campus', label: 'Campus', has: (c: FacetCompany) => campusIds(c).length > 0 },
  { id: 'founders', label: 'Named founders', has: hasNamedFounder },
  { id: 'year', label: 'Founded year', has: (c: FacetCompany) => !!c.foundedYear },
  { id: 'sector', label: 'Industry', has: (c: FacetCompany) => !!c.sectorId },
  { id: 'region', label: 'Headquarters', has: (c: FacetCompany) => !!c.hqRegion },
  { id: 'team', label: 'Team size', has: (c: FacetCompany) => !!c.teamSize },
  { id: 'status', label: 'Operating status', has: (c: FacetCompany) => statusOf(c) !== 'unknown' },
  { id: 'logo', label: 'Logo', has: (c: FacetCompany) => !!c.logoUrl },
];
export function filterWorkspace(companies: FacetCompany[], filters: WorkspaceFilters): FacetCompany[] {
  const tokens = filters.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const missing = COVERAGE_FIELDS.find(field => field.id === filters.missing);
  return companies.filter(c => {
    const ids = campusIds(c);
    if (filters.campus === 'missing' ? ids.length > 0 : filters.campus && !ids.includes(filters.campus)) return false;
    if (filters.sector && !matchesSector(c, filters.sector)) return false;
    if (filters.region && (filters.region === 'missing' ? !!c.hqRegion : c.hqRegion !== filters.region)) return false;
    if (filters.status && statusOf(c) !== filters.status) return false;
    if (filters.network && !(c.programs ?? []).includes(filters.network)) return false;
    if (missing?.has(c)) return false;
    const text = [c.name, c.description, ...campusNames(c), ...(c.founders ?? []), c.sector, c.hqRegion, ...(c.programs ?? [])].join(' ').toLowerCase();
    return tokens.every(token => text.includes(token));
  }).sort((a,b) => {
    if (filters.sort === 'name') return a.name.localeCompare(b.name);
    if (filters.sort === 'recent') return (b.latestSignalAt ?? '').localeCompare(a.latestSignalAt ?? '') || a.name.localeCompare(b.name);
    return b.signals - a.signals || a.name.localeCompare(b.name);
  });
}
export function workspaceFounders(founders: FounderLead[], companies: FacetCompany[], filters: WorkspaceFilters): FounderLead[] {
  const companyIds = new Set(companies.map(c => c.id));
  const requiresCompany = !!(filters.sector || filters.region || filters.status || filters.network || filters.missing);
  const tokens = filters.q.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const seen = new Set<string>();
  return founders.filter(f => {
    if (seen.has(f.id)) return false;
    if (filters.campus === 'missing' ? !!f.campusId : filters.campus && f.campusId !== filters.campus) return false;
    if (requiresCompany && (!f.companyId || !companyIds.has(f.companyId))) return false;
    const text = [f.name, f.campus, f.company, f.sector, ...f.programs].join(' ').toLowerCase();
    if (!tokens.every(t => text.includes(t)) && !(f.companyId && companyIds.has(f.companyId))) return false;
    seen.add(f.id);
    return true;
  }).sort((a,b) => filters.sort === 'name' ? a.name.localeCompare(b.name) : b.signalTypes.length - a.signalTypes.length || a.name.localeCompare(b.name));
}
export function rankGroups(companies: FacetCompany[], kind: 'campus' | 'network') {
  const groups = new Map<string, { id: string; name: string; companies: number; signals: number }>();
  for (const c of companies) {
    const ids = kind === 'campus' ? campusIds(c) : [...new Set(c.programs ?? [])];
    const labels = campusNames(c);
    ids.forEach((id, i) => {
      const group = groups.get(id) ?? { id, name: kind === 'campus' ? labels[i] ?? c.school ?? id : id, companies: 0, signals: 0 };
      group.companies++; group.signals += c.signals; groups.set(id, group);
    });
  }
  return [...groups.values()].sort((a,b) => b.companies - a.companies || b.signals - a.signals || a.name.localeCompare(b.name));
}
export function workspaceCsv(panel: WorkspacePanel, companies: FacetCompany[], founders: FounderLead[]): string {
  if (panel === 'founders') return encodeCsv([
    ['Founder', 'Campus', 'Company', 'Role', 'Graduation year', 'Industry', 'Programs', 'Signal types', 'Sources', 'Record'],
    ...founders.map(f => [cleanCsvText(f.name), cleanCsvText(f.campus), cleanCsvText(f.company), cleanCsvText(f.role), f.gradYear, cleanCsvText(f.sector), cleanCsvList(f.programs), cleanCsvList(f.signalTypes), cleanCsvUrls([...Object.values(f.signalSourceByType), ...Object.values(f.programSourceByLabel)]), `/founders?founder=${encodeURIComponent(f.id)}`]),
  ]);
  if (panel === 'rankings' || panel === 'networks') return encodeCsv([
    [panel === 'rankings' ? 'Campus' : 'Investor or program network', 'Companies in filtered view', 'Recorded signals'],
    ...rankGroups(companies, panel === 'rankings' ? 'campus' : 'network').map(g => [cleanCsvText(g.name), g.companies, g.signals]),
  ]);
  if (panel === 'insights') return encodeCsv([['Field', 'Present', 'Missing', 'Total'], ...COVERAGE_FIELDS.map(f => { const n = companies.filter(f.has).length; return [f.label,n,companies.length-n,companies.length]; })]);
  return encodeCsv([
    ['Company','Campuses','Founders','Industry','HQ region','Founded year','Team size','Operating status','Funding stage','Investors or programs','Signals','Latest signal date','Sources','Record'],
    ...companies.map(c => [cleanCsvText(c.name),cleanCsvList(campusNames(c)),cleanCsvNames(c.founders ?? []),cleanCsvText(c.sector),cleanCsvText(c.hqRegion),c.foundedYear,cleanCsvText(c.teamSize),STATUS_LABEL[statusOf(c)],cleanCsvText(c.stage),cleanCsvList(c.programs ?? []),c.signals,cleanCsvDate(c.latestSignalAt),cleanCsvUrls(c.sourceUrls ?? []),`/startup/${encodeURIComponent(c.id)}`]),
  ]);
}
