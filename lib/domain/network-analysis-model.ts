// Pure pieces of the network analysis tables: metro names and the
// serializable shape the page renders. National program names live in
// national-programs.ts. Counts are filled from the database in
// network-analysis.ts. Nothing here invents a tally.

export interface AnalysisColumn {
  id: string;
  label: string;
  /** Metro columns take the slate scale. Unknown and the All column do not. */
  shade: boolean;
}

export interface AnalysisCell {
  count: number;
  /** Map node ids shown when this cell is chosen. */
  ids: string[];
}

export interface AnalysisRow {
  id: string;
  label: string;
  /** Scouting tier for a national program. Metro rows and Backed by top VC leave this empty. */
  tier?: string | null;
  cells: AnalysisCell[];
  all: AnalysisCell;
}

export interface HeatmapTable {
  id: string;
  title: string;
  subtitle: string;
  rowHeader: string;
  columns: AnalysisColumn[];
  rows: AnalysisRow[];
  allLabel: string;
  caption: string;
}

export interface DensityRow {
  id: string;
  label: string;
  founders: number;
  startups: number;
  undergrads: number;
  perThousand: number;
  ids: string[];
  enrollmentYear: string;
  enrollmentKind: string;
  sourceName: string;
  sourceUrl: string;
}

export interface DensityTable {
  title: string;
  subtitle: string;
  rows: DensityRow[];
  caption: string;
}

export interface NetworkAnalysis {
  metros: HeatmapTable;
  programs: HeatmapTable;
  density: DensityTable;
}

export interface Metro {
  id: string;
  label: string;
  places: readonly string[];
}

/** Headquarters strings stored on company_facts, grouped into metros. Longer places win. */
export const METROS: readonly Metro[] = [
  {
    id: "sf",
    label: "SF Bay Area",
    places: [
      "san francisco",
      "san fransisco",
      "south san francisco",
      "palo alto",
      "mountain view",
      "menlo park",
      "redwood city",
      "sunnyvale",
      "santa clara",
      "san jose",
      "san mateo",
      "oakland",
      "emeryville",
      "berkeley",
      "fremont",
      "hayward",
      "cupertino",
      "burlingame",
      "daly city",
      "millbrae",
      "bay area",
      "stanford",
      "lafayette, california",
    ],
  },
  { id: "nyc", label: "NYC", places: ["new york", "nyc", "brooklyn", "manhattan"] },
  { id: "boston", label: "Boston", places: ["boston", "cambridge, massachusetts", "cambridge, ma"] },
  { id: "philadelphia", label: "Philadelphia", places: ["philadelphia", "philly"] },
  { id: "la", label: "Los Angeles", places: ["los angeles"] },
  { id: "seattle", label: "Seattle", places: ["seattle", "bellevue"] },
  { id: "austin", label: "Austin", places: ["austin"] },
  { id: "toronto", label: "Toronto", places: ["toronto"] },
  { id: "london", label: "London", places: ["london"] },
  { id: "paris", label: "Paris", places: ["paris"] },
  { id: "atlanta", label: "Atlanta", places: ["atlanta"] },
  { id: "baltimore", label: "Baltimore", places: ["baltimore"] },
];

const PLACES = METROS.flatMap((metro) => metro.places.map((place) => ({ place, metro }))).sort((a, b) => b.place.length - a.place.length);

export function normalizePlace(raw: string): string {
  return raw.toLowerCase().replace(/\./g, "").replace(/\s+/g, " ").trim();
}

export function metroOf(raw: string): Metro | null {
  const text = normalizePlace(raw);
  if (!text) return null;
  for (const item of PLACES) {
    if (text === item.place || text.startsWith(`${item.place},`) || text.startsWith(`${item.place} `)) return item.metro;
  }
  return null;
}


/** Map investor / program node id, same slug the network map uses. */
export function investorNodeId(name: string): string {
  return `inv_${name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")}`;
}

export function perThousand(founders: number, undergrads: number): number {
  if (undergrads <= 0) return 0;
  return Math.round((founders / undergrads) * 10000) / 10;
}
