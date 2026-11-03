import { getDb } from "../db/client";
import { loadDirectory } from "./directory";
import centers from "@/data/company-city-centers.json";

export type CompanyCity = {
  id: string; city: string; country: string; coordinates: [number, number]; coordinateSource: string;
  companies: { id: string; hq: string; sourceUrl: string }[];
};
export type CompanyLocations = { precision: "city"; total: number; mapped: number; unmapped: number; cities: CompanyCity[] };

/** HQ evidence chooses the city. Campus affiliation never supplies an office location. */
export function companyLocations(): CompanyLocations {
  const cards = loadDirectory().cards;
  const allowed = new Set(cards.map(c => c.id));
  const lookup = new Map(centers.cities.map(city => [city.storedLabel, city]));
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
    group.companies.push({ id: row.project_id, hq: row.value_text, sourceUrl: row.source_url });
    cities.set(city.id, group);
    mapped.add(row.project_id);
  }
  return { precision: "city", total: cards.length, mapped: mapped.size, unmapped: cards.length - mapped.size, cities: [...cities.values()].sort((a,b) => b.companies.length - a.companies.length || a.city.localeCompare(b.city, "en-US")) };
}
