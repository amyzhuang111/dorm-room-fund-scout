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
  companies: { id: string; hq: string; sourceUrl: string; office?: CompanyOffice }[];
};
export type CompanyLocations = { precision: "mixed"; total: number; mapped: number; addressMapped: number; unmapped: number; cities: CompanyCity[] };

let locationsMemo: { stamp: string; data: CompanyLocations } | null = null;

/** HQ evidence chooses the city. Campus affiliation never supplies an office location. */
export function companyLocations(): CompanyLocations {
  const stamp = databaseStamp();
  if (locationsMemo?.stamp === stamp) return locationsMemo.data;
  const data = companyLocationsUncached();
  locationsMemo = { stamp, data };
  return data;
}

function companyLocationsUncached(): CompanyLocations {
  const cards = loadDirectory().cards;
  const allowed = new Set(cards.map(c => c.id));
  const lookup = new Map(centers.cities.map(city => [city.storedLabel, city]));
  const offices = new Map(officeLocations.locations.map(office => [office.projectId, office]));
  const cities = new Map<string, CompanyCity>();
  const mapped = new Set<string>();
  const seen = new Set<string>();
  // Match the first stored HQ used by assembleCompanyProfile; do not substitute a different fact.
  const rows = getDb().prepare("SELECT project_id, value_text, source_url FROM company_facts WHERE fact_key = 'hq'").all() as {project_id: string; value_text: string; source_url: string}[];
  for (const row of rows) {
    if (!allowed.has(row.project_id) || seen.has(row.project_id)) continue;
    seen.add(row.project_id);
    if (!/^https?:\/\//.test(row.source_url)) continue;
    const city = lookup.get(row.value_text.trim());
    if (!city) continue;
    const group = cities.get(city.id) ?? { id: city.id, city: city.city, country: city.country, coordinates: [city.longitude, city.latitude] as [number, number], coordinateSource: city.sourceUrl, companies: [] };
    const office = offices.get(row.project_id);
    const validOffice = office && office.cityId === city.id && Number.isFinite(office.latitude) && Number.isFinite(office.longitude)
      && Math.abs(office.latitude) <= 90 && Math.abs(office.longitude) <= 180
      && /^https:\/\//.test(office.sourceUrl) && /^https:\/\//.test(office.coordinateSource);
    group.companies.push({ id: row.project_id, hq: row.value_text, sourceUrl: row.source_url, ...(validOffice ? {office: {
      address: office.address, coordinates: [office.longitude, office.latitude] as [number, number],
      sourceUrl: office.sourceUrl, coordinateSource: office.coordinateSource, coordinateMethod: office.coordinateMethod,
      checkedAt: office.checkedAt, kind: office.kind,
    }} : {}) });
    cities.set(city.id, group);
    mapped.add(row.project_id);
  }
  return { precision: "mixed", total: cards.length, mapped: mapped.size, addressMapped: [...cities.values()].reduce((n,c) => n + c.companies.filter(co=>co.office).length, 0), unmapped: cards.length - mapped.size, cities: [...cities.values()].sort((a,b) => b.companies.length - a.companies.length || a.city.localeCompare(b.city, "en-US")) };
}
