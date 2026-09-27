// Pure pieces of the network analysis tables: metro names, program names,
// and the serializable shape the page renders. Counts are filled from the
// database in network-analysis.ts. Nothing here invents a tally.

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

export interface ProgramName {
  id: string;
  label: string;
}

interface ProgramRule {
  id: string;
  label: string;
  test: (text: string) => boolean;
}

// Clubs, accelerators, and fellowships that actually appear in stored claims,
// program relationships, and investor facts. A string can match more than one
// (a batch line sometimes names two programs).
const PROGRAMS: readonly ProgramRule[] = [
  { id: "delta_fellowship", label: "Delta Fellowship", test: (text) => text.includes("delta fellowship") },
  { id: "deltav", label: "MIT delta v", test: (text) => text.includes("delta v") },
  { id: "vipx", label: "VIP-X", test: (text) => /vip-x|vip x/.test(text) },
  { id: "yc", label: "Y Combinator", test: (text) => text.includes("y combinator") || text.includes("ycombinator") || /\byc\b/.test(text) },
  { id: "speedrun", label: "a16z Speedrun", test: (text) => text.includes("speedrun") },
  { id: "neo", label: "Neo Scholars", test: (text) => text.includes("neo scholar") || text === "neo" },
  { id: "thiel", label: "Thiel Fellowship", test: (text) => text.includes("thiel fellow") },
  { id: "pear", label: "Pear", test: (text) => /\bpear fellows\b|\bpear garage\b|\bpearx\b|^pear$/.test(text) },
  { id: "skydeck", label: "Berkeley SkyDeck", test: (text) => text.includes("skydeck") },
  { id: "mayfield", label: "Mayfield Fellows", test: (text) => text.includes("mayfield fellow") },
  { id: "startx", label: "StartX", test: (text) => /\bstartx\b/.test(text) },
  { id: "cal_launchpad", label: "Cal Launchpad", test: (text) => text.includes("cal launchpad") || text === "launchpad" },
  { id: "nyu_launchpad", label: "NYU Summer Launchpad", test: (text) => text.includes("nyu summer launchpad") },
  { id: "free_ventures", label: "Free Ventures", test: (text) => text.includes("free ventures") },
  { id: "penn_labs", label: "Penn Labs", test: (text) => /\bpenn labs\b/.test(text) },
  { id: "velocity", label: "Velocity", test: (text) => /\bvelocity\b/.test(text) },
  { id: "uc_launch", label: "UC LAUNCH", test: (text) => text.includes("uc launch") },
  { id: "cardinal", label: "Cardinal Ventures", test: (text) => text.includes("cardinal ventures") },
  { id: "eb", label: "Entrepreneurs @ Berkeley", test: (text) => text.includes("entrepreneurs @ berkeley") || text.includes("entrepreneurs at berkeley") },
  { id: "electric", label: "Penn Electric Racing", test: (text) => text.includes("penn electric racing") },
  { id: "aerial", label: "Penn Aerial Robotics", test: (text) => text.includes("penn aerial robotics") },
  {
    id: "mt",
    label: "M&T",
    test: (text) => text.includes("jerome fisher") || text.includes("management & technology") || text.includes("management and technology") || /^m&t\b/.test(text),
  },
  { id: "stvp", label: "Stanford STVP", test: (text) => /\bstvp\b/.test(text) },
  { id: "accel_scholars", label: "Accel Scholars", test: (text) => text.includes("accel scholar") },
  { id: "widjaja", label: "Widjaja Fellows", test: (text) => text.includes("widjaja") },
  { id: "wharton_analytics", label: "Wharton Analytics Fellows", test: (text) => text.includes("wharton analytics fellow") },
  { id: "createx", label: "CREATE-X", test: (text) => text.includes("create-x") || text.includes("create x") },
  { id: "desai", label: "Desai Accelerator", test: (text) => text.includes("desai accelerator") },
  { id: "elab", label: "Cornell eLab", test: (text) => /\belab\b/.test(text) },
];

export function programsInText(raw: string): ProgramName[] {
  const text = raw.toLowerCase().replace(/\s+/g, " ").trim();
  if (!text) return [];
  return PROGRAMS.filter((program) => program.test(text)).map((program) => ({ id: program.id, label: program.label }));
}

export function claimProgramTexts(valueJson: string, sourceName: string | null): string[] {
  const texts: string[] = [];
  if (sourceName && sourceName.trim()) texts.push(sourceName);
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(valueJson);
  } catch {
    parsed = null;
  }
  if (parsed && typeof parsed === "object") {
    const record = parsed as Record<string, unknown>;
    for (const key of ["org", "program", "role", "excerpt"]) {
      const value = record[key];
      if (typeof value === "string" && value.trim()) texts.push(value);
    }
  } else if (valueJson.trim()) {
    texts.push(valueJson);
  }
  return texts;
}

/** Map investor / program node id, same slug the network map uses. */
export function investorNodeId(name: string): string {
  return `inv_${name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")}`;
}

export function perThousand(founders: number, undergrads: number): number {
  if (undergrads <= 0) return 0;
  return Math.round((founders / undergrads) * 10000) / 10;
}
