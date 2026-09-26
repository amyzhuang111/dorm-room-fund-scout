// Structured campus-hotspot directory. Every column from the source CSV is
// kept on the card, including the link. Tiers here are the directory's own
// scouting notes. They are not Founder Signal.

export type HotspotSectionId = "existing_founders" | "startups" | "potential_founders";
export type HotspotTier = "S" | "A" | "B" | "C" | "D";
export type HotspotPlaceKind = "campus" | "city" | "other";

export interface HotspotCard {
  id: string;
  region: string;
  campus: string;
  campusId: string | null;
  placeKind: HotspotPlaceKind;
  section: HotspotSectionId;
  sectionLabel: string;
  number: number | null;
  place: string;
  type: string;
  tier: HotspotTier;
  whatYoullFind: string;
  howToGetIn: string;
  when: string;
  linkLabel: string;
  url: string;
  placeKey: string;
  sortGroup: number;
}

export interface AppendixEntry {
  campus: string;
  campusId: string | null;
  tier: string;
  name: string;
  kind: string;
  evidence: string;
  url: string;
}

export interface RelatedHotspot {
  id: string;
  place: string;
  campus: string;
  tier: string;
  type: string;
  href: string;
  mapNodeId: string;
}

const SECTION_BY_LABEL: Record<string, HotspotSectionId> = {
  "1. Meet great existing founders": "existing_founders",
  "2. Meet great startups": "startups",
  "3. Meet great potential founders": "potential_founders",
};

export const SECTION_LABEL: Record<HotspotSectionId, string> = {
  existing_founders: "Meet great existing founders",
  startups: "Meet great startups",
  potential_founders: "Meet great potential founders",
};

export const SECTION_ORDER: HotspotSectionId[] = ["existing_founders", "startups", "potential_founders"];

const TIERS = new Set<HotspotTier>(["S", "A", "B", "C", "D"]);

const CAMPUS_IDS: Record<string, string> = {
  Penn: "univ_penn",
  "UC Berkeley": "univ_berkeley",
  Stanford: "univ_stanford",
  MIT: "univ_mit",
  Harvard: "univ_harvard",
  Columbia: "univ_columbia",
  "Georgia Tech": "univ_gatech",
  Michigan: "univ_michigan",
  Princeton: "univ_princeton",
  CMU: "univ_cmu",
  Waterloo: "univ_waterloo",
};

const CITIES = new Set(["Philadelphia", "San Francisco", "New York", "Boston"]);

const LEADING_CAMPUS = [
  "university of pennsylvania",
  "university of california berkeley",
  "university of toronto",
  "university of washington",
  "unc chapel hill",
  "georgia tech",
  "boston university",
  "ut austin",
  "cornell tech",
  "uc berkeley",
  "penn",
  "berkeley",
  "stanford",
  "mit",
  "harvard",
  "waterloo",
  "columbia",
  "yale",
  "princeton",
  "cmu",
  "ucla",
  "usc",
  "nyu",
  "duke",
  "emory",
  "brown",
  "caltech",
  "toronto",
  "michigan",
  "northwestern",
  "georgetown",
  "uchicago",
  "uiuc",
  "dartmouth",
].sort((a, b) => b.length - a.length);

const BLOCKED_PHRASES = new Set([
  "founders",
  "founder",
  "genesis",
  "launchpad",
  "the cube",
  "cube",
  "house",
  "fund",
  "labs",
  "lab",
  "venture",
  "ventures",
  "startup",
  "startups",
  "club",
  "program",
  "week",
  "tech",
  "studio",
  "garage",
  "dorm",
  "media",
  "institute",
  "challenge",
  "competition",
  "accelerator",
  "incubator",
  "fellowship",
  "hackathon",
  "grant",
  "course",
  "partners",
  "community",
  "pitch",
]);

const FILLER_TOKENS = new Set(["and", "the", "at", "of", "for", "in"]);

export function normHotspotName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/@/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function coreName(place: string): string {
  return place.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim();
}

export function placeKeyOf(place: string): string {
  return normHotspotName(coreName(place));
}

function stripLeadingCampus(name: string): string {
  for (const prefix of LEADING_CAMPUS) {
    if (name === prefix) return name;
    if (name.startsWith(`${prefix} `)) return name.slice(prefix.length + 1);
  }
  return name;
}

export interface NormPlace {
  core: string;
  full: string;
}

export function normPlace(name: string): NormPlace {
  return { core: placeKeyOf(name), full: normHotspotName(name) };
}

export function placesMatch(a: NormPlace, b: NormPlace): boolean {
  if (!a.core || !b.core) return false;
  if (a.core === b.core) return true;
  if (a.core.startsWith(`${b.core} `) || b.core.startsWith(`${a.core} `)) return true;
  const sa = stripLeadingCampus(a.core);
  const sb = stripLeadingCampus(b.core);
  if (sa === sb && sa.length >= 6) return true;
  if (a.full.includes("jerome fisher") && b.full.includes("jerome fisher") && a.full.includes("m and t") && b.full.includes("m and t")) return true;
  return false;
}

export function samePlace(a: string, b: string): boolean {
  return placesMatch(normPlace(a), normPlace(b));
}

export function mentionPhrase(place: string): string | null {
  const phrase = placeKeyOf(place);
  if (phrase.length < 4 || BLOCKED_PHRASES.has(phrase)) return null;
  const tokens = phrase.split(" ").filter((token) => token.length > 1 && !FILLER_TOKENS.has(token) && !BLOCKED_PHRASES.has(token));
  if (tokens.length === 0) return null;
  if (tokens.length === 1 && tokens[0].length < 4) return null;
  return phrase;
}

export function hasPhrase(haystackNorm: string, phrase: string): boolean {
  if (!phrase || phrase.length < 4) return false;
  return ` ${haystackNorm} `.includes(` ${phrase} `);
}

export function campusIdForLabel(campus: string): string | null {
  return CAMPUS_IDS[campus] ?? null;
}

export function placeKindFor(campus: string, region: string): HotspotPlaceKind {
  if (CITIES.has(campus) || region === "City places") return "city";
  if (campus === "Cross-campus programmes" || campus === "All campuses" || region.startsWith("Cross-campus")) return "other";
  return "campus";
}

export function sortGroupFor(campus: string, placeKind: HotspotPlaceKind): number {
  if (campus === "Penn") return 0;
  if (campus === "UC Berkeley") return 1;
  if (placeKind === "city") return 3;
  return 2;
}

export function slugId(parts: string[]): string {
  const slug = normHotspotName(parts.join(" ")).replace(/ /g, "-").replace(/^-|-$/g, "");
  return slug.slice(0, 96) || "hotspot";
}

export function investorNodeId(name: string): string {
  return `inv_${name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")}`;
}

export function hotspotMapNodeId(placeKey: string): string {
  return `hsn_${placeKey.replace(/ /g, "_").slice(0, 72)}`;
}

export function hotspotHref(card: Pick<HotspotCard, "id" | "campus">, from?: string): string {
  const params = new URLSearchParams();
  params.set("campus", card.campus);
  if (from) params.set("from", from);
  return `/hotspots?${params.toString()}#${card.id}`;
}

export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  for (let i = 0; i < src.length; i++) {
    const char = src[i];
    if (quoted) {
      if (char === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") cell += char;
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  const header = rows[0] ?? [];
  return rows.slice(1).filter((cells) => cells.some((value) => value.trim())).map((cells) => {
    const record: Record<string, string> = {};
    header.forEach((key, index) => {
      record[key] = cells[index] ?? "";
    });
    return record;
  });
}

function field(row: Record<string, string>, name: string): string {
  return (row[name] ?? "").trim();
}

export function cardsFromRows(rows: Record<string, string>[]): HotspotCard[] {
  const cards: HotspotCard[] = [];
  for (const row of rows) {
    const sectionLabel = field(row, "section");
    const section = SECTION_BY_LABEL[sectionLabel];
    if (!section) continue;
    const tier = field(row, "Tier").toUpperCase();
    if (!TIERS.has(tier as HotspotTier)) continue;
    const campus = field(row, "campus");
    const place = field(row, "Place");
    if (!campus || !place) continue;
    const placeKind = placeKindFor(campus, field(row, "region"));
    const number = Number(field(row, "#"));
    cards.push({
      id: `hs-${slugId([campus, place, section])}`,
      region: field(row, "region"),
      campus,
      campusId: campusIdForLabel(campus),
      placeKind,
      section,
      sectionLabel,
      number: Number.isFinite(number) && number > 0 ? number : null,
      place,
      type: field(row, "Type"),
      tier: tier as HotspotTier,
      whatYoullFind: field(row, "What you’ll find") || field(row, "What you'll find"),
      howToGetIn: field(row, "How to get in the room"),
      when: field(row, "When"),
      linkLabel: field(row, "Link") || "link",
      url: field(row, "urls"),
      placeKey: placeKeyOf(place),
      sortGroup: sortGroupFor(campus, placeKind),
    });
  }
  return cards;
}

export function appendixFromRows(rows: Record<string, string>[]): AppendixEntry[] {
  const entries: AppendixEntry[] = [];
  for (const row of rows) {
    if (field(row, "section")) continue;
    const name = field(row, "Name");
    const url = field(row, "urls");
    if (!name || !url.startsWith("http")) continue;
    const campus = field(row, "campus");
    entries.push({
      campus,
      campusId: campusIdForLabel(campus),
      tier: field(row, "Tier"),
      name,
      kind: field(row, "Kind"),
      evidence: field(row, "Evidence"),
      url,
    });
  }
  return entries;
}

export function compareCampuses(a: HotspotCard, b: HotspotCard): number {
  if (a.sortGroup !== b.sortGroup) return a.sortGroup - b.sortGroup;
  const byName = a.campus.localeCompare(b.campus);
  if (byName !== 0) return byName;
  const section = SECTION_ORDER.indexOf(a.section) - SECTION_ORDER.indexOf(b.section);
  if (section !== 0) return section;
  return (a.number ?? 999) - (b.number ?? 999) || a.place.localeCompare(b.place);
}

const TIER_RANK: Record<string, number> = { S: 0, A: 1, B: 2, C: 3, D: 4 };

export function bestCard(cards: HotspotCard[], campusId?: string | null): HotspotCard {
  const preferred = campusId ? cards.filter((card) => card.campusId === campusId) : [];
  const pool = preferred.length ? preferred : cards;
  return [...pool].sort((a, b) => {
    const tier = (TIER_RANK[a.tier] ?? 9) - (TIER_RANK[b.tier] ?? 9);
    if (tier !== 0) return tier;
    const section = SECTION_ORDER.indexOf(a.section) - SECTION_ORDER.indexOf(b.section);
    if (section !== 0) return section;
    return a.campus.localeCompare(b.campus);
  })[0];
}
