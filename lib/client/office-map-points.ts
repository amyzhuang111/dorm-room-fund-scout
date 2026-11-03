import type { FeatureCollection, Point } from "geojson";

type OfficeCity = { id: string; companies: { id: string; name: string; office?: { coordinates: [number, number] } }[] };

/** Keep shared offices at their sourced coordinates and expose every company. */
export function officeMapPoints(cities: OfficeCity[]): FeatureCollection<Point> {
  const buildings = new Map<string, { coordinates: [number, number]; cityId: string; ids: string[]; names: string[] }>();
  for (const city of cities) for (const co of city.companies) {
    if (!co.office) continue;
    const key = `${city.id}:${co.office.coordinates.join(",")}`;
    const building = buildings.get(key) ?? { coordinates: co.office.coordinates, cityId: city.id, ids: [], names: [] };
    building.ids.push(co.id);
    building.names.push(co.name);
    buildings.set(key, building);
  }
  return { type: "FeatureCollection", features: [...buildings].map(([id, b]) => ({
    type: "Feature", geometry: { type: "Point", coordinates: b.coordinates },
    properties: { id, cityId: b.cityId, companyIds: JSON.stringify(b.ids), count: b.ids.length,
      name: b.names.length === 1 ? b.names[0] : `${b.names.length.toLocaleString("en-US")} companies at this address` },
  })) };
}
