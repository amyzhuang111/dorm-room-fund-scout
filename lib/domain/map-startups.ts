import type { FacetCompany } from "./sample-facets";
import { matchesSector, sectorIdsOf, sectorLabelsOf } from "./sectors";

export const EMPTY_STARTUP_FILTERS = { program: "", sector: "", year: "", signal: "", stage: "" };
export type StartupFilters = typeof EMPTY_STARTUP_FILTERS;

export function programsOf(company: FacetCompany): string[] {
  return [...new Set([...(company.programs ?? []), company.primaryProgram]
    .filter((value): value is string => Boolean(value)))];
}

/** Search/campus scope only. Filter choices must not depend on the current page. */
export function mapStartupPool(companies: FacetCompany[], query: string, campusId: string | null): FacetCompany[] {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return companies.filter((company) => {
    if (campusId === "missing" ? Boolean(company.schoolId) : campusId && company.schoolId !== campusId) return false;
    const haystack = [company.name, company.school, company.description, ...sectorLabelsOf(company),
      ...(company.founders ?? []), ...programsOf(company)].join(" ").toLowerCase();
    return tokens.every((token) => haystack.includes(token));
  });
}

/** Filter the full pool before pagination, counting every company once. */
export function filterMapStartups(companies: FacetCompany[], filters: StartupFilters): FacetCompany[] {
  return companies.filter((company) =>
    (!filters.program || programsOf(company).includes(filters.program)) &&
    (!filters.sector || (filters.sector === "__missing" ? !sectorIdsOf(company).length : matchesSector(company, filters.sector))) &&
    (!filters.year || (filters.year === "__missing" ? company.foundedYear == null : String(company.foundedYear) === filters.year)) &&
    (!filters.signal || (filters.signal === "__missing" ? !company.signalKind : company.signalKind === filters.signal)) &&
    (!filters.stage || company.stage === filters.stage));
}
