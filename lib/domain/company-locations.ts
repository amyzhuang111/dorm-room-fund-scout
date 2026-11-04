import { databaseStamp, getDb } from "../db/client";
import { loadDirectory } from "./directory";
import centers from "@/data/company-city-centers.json";
import officeLocations from "@/data/company-office-locations.json";

export type CompanyOffice = {
  address: string; coordinates: [number, number]; sourceUrl: string; coordinateSource: string;
  coordinateMethod: string; checkedAt: string; kind: string;
};

export type CompanyCity = {
  id: string; city: string; country: string; coordinates: [number, number]; coordinateSource: string;
  companies: { id: string; hq: string | null; sourceUrl: string; office?: CompanyOffice }[];
};
export type CompanyLocations = { precision: "mixed"; total: number; mapped: number; addressMapped: number; unmapped: number; cities: CompanyCity[] };

type HqRow = { project_id: string; value_text: string; source_url: string };
type CityCenter = (typeof centers.cities)[number];
type OfficeRecord = (typeof officeLocations.locations)[number];

/** A reviewed business address supplies its own city; it never creates an HQ fact. */
export function resolveCompanyLocations(
  companyIds: string[], rows: HqRow[], cityCenters: CityCenter[], officeRecords: OfficeRecord[],
): CompanyLocations {
  const allowed = new Set(companyIds);
  const lookup = new Map(cityCenters.map(city => [city.storedLabel, city]));
  const cityIds = new Map(cityCenters.map(city => [city.id, city]));
  const offices = new Map(officeRecords.map(office => [office.projectId, office]));
  const cities = new Map<string, CompanyCity>();
  const mapped = new Set<string>();
  const firstHq = new Map<string, HqRow>();
  // Match the first stored HQ used by assembleCompanyProfile; do not substitute a different fact.
  for (const row of rows) {
    if (allowed.has(row.project_id) && !firstHq.has(row.project_id)) firstHq.set(row.project_id, row);
  }
  for (const id of allowed) {
    const row = firstHq.get(id);
    const hq = row && /^https?:\/\//.test(row.source_url) ? row : undefined;
    const office = offices.get(id);
    const validOffice = office && cityIds.has(office.cityId) && Number.isFinite(office.latitude) && Number.isFinite(office.longitude)
      && Math.abs(office.latitude) <= 90 && Math.abs(office.longitude) <= 180
      && /^https:\/\//.test(office.sourceUrl) && /^https:\/\//.test(office.coordinateSource);
    const city = validOffice ? cityIds.get(office.cityId) : hq ? lookup.get(hq.value_text.trim()) : undefined;
    if (!city) continue;
    const group = cities.get(city.id) ?? { id: city.id, city: city.city, country: city.country, coordinates: [city.longitude, city.latitude] as [number, number], coordinateSource: city.sourceUrl, companies: [] };
    group.companies.push({ id, hq: hq?.value_text ?? null, sourceUrl: hq?.source_url ?? office!.sourceUrl, ...(validOffice ? {office: {
      address: office.address, coordinates: [office.longitude, office.latitude] as [number, number],
      sourceUrl: office.sourceUrl, coordinateSource: office.coordinateSource, coordinateMethod: office.coordinateMethod,
      checkedAt: office.checkedAt, kind: office.kind,
    }} : {}) });
    cities.set(city.id, group);
    mapped.add(id);
  }
  return { precision: "mixed", total: allowed.size, mapped: mapped.size, addressMapped: [...cities.values()].reduce((n,c) => n + c.companies.filter(co=>co.office).length, 0), unmapped: allowed.size - mapped.size, cities: [...cities.values()].sort((a,b) => b.companies.length - a.companies.length || a.city.localeCompare(b.city, "en-US")) };
}

/** Campus affiliation never supplies an office location. */
let locationsMemo: { stamp: string; data: CompanyLocations } | null = null;

export function companyLocations(): CompanyLocations {
  const stamp = databaseStamp();
  if (locationsMemo?.stamp === stamp) return locationsMemo.data;
  const data = companyLocationsUncached();
  locationsMemo = { stamp, data };
  return data;
}

function companyLocationsUncached(): CompanyLocations {
  const rows = getDb().prepare("SELECT project_id, value_text, source_url FROM company_facts WHERE fact_key = 'hq'").all() as HqRow[];
  return resolveCompanyLocations(loadDirectory().cards.map(c => c.id), rows, centers.cities, officeLocations.locations);
}
