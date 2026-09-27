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

export const SECTION_SHORT: Record<HotspotSectionId, string> = {
  existing_founders: "Existing founders",
  startups: "Startups",
  potential_founders: "Potential founders",
};

/** Directory tier S is tier 1. These are scouting notes, not Founder Signal. */
export function tierNumber(tier: HotspotTier): number {
  if (tier === "S") return 1;
  if (tier === "A") return 2;
  if (tier === "B") return 3;
  if (tier === "C") return 4;
  return 5;
}

export function tierBandLabel(tier: HotspotTier): string {
  return `Tier ${tierNumber(tier)} · ${tier}`;
}

/**
 * Exact alternate names for one directory place. A text mention matches only
 * these strings (or the place's own name), never a guessed abbreviation.
 */
export const ORG_ALIAS_PHRASES: Record<string, readonly string[]> = {
  "jerome fisher m and t": ["jerome fisher management and technology", "management and technology", "m and t"],
  // Stored affiliation role from the YC directory ingest: "YC founder; page names {campus}".
  "y combinator": ["yc founder"],
  // Berkeley prints the dual-degree abbreviation as M.E.T. '28.
  "management entrepreneurship and technology": ["m e t"],
  // "VIP-X" strips to a phrase shorter than the matcher keeps on its own.
  "vip x accelerator": ["vip x"],
  // Bare "launchpad" also appears in NYU Summer Launchpad, so the Berkeley club
  // is matched only when the stored role says Cal Launchpad.
  launchpad: ["cal launchpad"],
  // The place name itself is not a safe phrase: a Cal Hacks project is named
  // "Human Capital", and TreeHacks prizes say "Human Capital Fellowship Prize".
  "human capital fellowship": ["delta fellowship", "hc fellowship"],
};

const MT_CORES = new Set([
  "m and t",
  "jerome fisher m and t",
  "jerome fisher management and technology",
  "management and technology",
]);

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
  Brown: "univ_brown",
  "Cornell / Cornell Tech": "univ_cornell",
  Duke: "univ_duke",
  NYU: "univ_nyu",
  "Notre Dame": "univ_notredame",
  "UT Austin": "univ_utexas",
  UVA: "univ_uva",
  "University of Toronto": "univ_toronto",
  Yale: "univ_yale",
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

// Phrases matchPhrases would otherwise emit, but that also hit a different
// project or a prize. Membership is recorded with the curated aliases above.
const DROPPED_MATCH_PHRASES = new Set(["human capital", "human capital fellowship", "prod"]);

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

// A shorter name that is a different organization. "Human Capital" is a Cal
// Hacks project. "Prod" is too generic to absorb "Prod fellowship".
const PREFIX_MATCH_BLOCKED = new Set(["human capital", "prod"]);

export function placesMatch(a: NormPlace, b: NormPlace): boolean {
  if (!a.core || !b.core) return false;
  if (a.core === b.core) return true;
  if (a.core.startsWith(`${b.core} `) || b.core.startsWith(`${a.core} `)) {
    const shorter = a.core.length <= b.core.length ? a.core : b.core;
    if (!PREFIX_MATCH_BLOCKED.has(shorter)) return true;
  }
  const sa = stripLeadingCampus(a.core);
  const sb = stripLeadingCampus(b.core);
  if (sa === sb && sa.length >= 6) return true;
  if (MT_CORES.has(a.core) && MT_CORES.has(b.core)) return true;
  if (MT_CORES.has(sa) && MT_CORES.has(sb)) return true;
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

const TRAILING_GENERIC = [
  " organising team",
  " organizing team",
  " fellows program",
  " fellowship",
  " programme",
  " program",
  " accelerator",
  " incubator",
  " competition",
  " challenge",
  " club",
];

const COMMON_PHRASE = new Set([
  "core",
  "sail",
  "house",
  "fund",
  "labs",
  "lab",
  "city",
  "week",
  "tech",
  "club",
  "cube",
  "venture",
  "ventures",
  "studio",
  "garage",
  "launch",
  "founders",
  "founder",
  "partners",
  "partner",
  "student",
  "students",
  "funded",
  "cohort",
  "track",
  "campus",
  "program",
  "programme",
  "laboratory",
  "institute",
  "center",
  "centre",
  "entrepreneurship",
  "university",
  "college",
  "school",
  "office",
  "research",
  "capital",
  "foundation",
  "network",
  "community",
  "summer",
  "winter",
  "prize",
  "grant",
  "awards",
  "scholarship",
  "organising",
  "organizing",
  "innovation",
]);

const CAMPUS_TOKEN = new Set([
  "penn",
  "berkeley",
  "stanford",
  "mit",
  "harvard",
  "waterloo",
  "columbia",
  "princeton",
  "michigan",
  "cmu",
  "ucla",
  "nyu",
  "duke",
  "emory",
  "brown",
  "yale",
  "toronto",
  "georgetown",
  "dartmouth",
  "cornell",
  "usc",
  "uiuc",
  "caltech",
  "northwestern",
  "uchicago",
  "upenn",
  "wharton",
  "gatech",
]);

/**
 * Phrases that can identify this place in stored text. The caller drops any
 * phrase shared by two organizations, except curated aliases.
 */
export function matchPhrases(place: string): string[] {
  const phrases = new Set<string>();
  const primary = mentionPhrase(place);
  if (primary) phrases.add(primary);
  let stripped = placeKeyOf(place);
  for (let guard = 0; guard < 4; guard++) {
    const next = TRAILING_GENERIC.reduce((name, suffix) => (name.endsWith(suffix) ? name.slice(0, -suffix.length).trim() : name), stripped);
    if (next === stripped) break;
    stripped = next;
    const single = !stripped.includes(" ");
    const generic = single && (BLOCKED_PHRASES.has(stripped) || COMMON_PHRASE.has(stripped) || CAMPUS_TOKEN.has(stripped));
    if (stripped.length >= 6 && !generic) phrases.add(stripped);
  }
  for (const raw of place.matchAll(/\(([^)]+)\)/g)) {
    const inner = raw[1].trim().replace(/^(and|formerly|run by|incl\.?|including|a|the)\s+/i, "").trim();
    const norm = normHotspotName(inner);
    if (norm.length < 4 || BLOCKED_PHRASES.has(norm) || COMMON_PHRASE.has(norm)) continue;
    const useful = norm.split(" ").filter((token) => token.length > 1 && !FILLER_TOKENS.has(token) && !CAMPUS_TOKEN.has(token) && !BLOCKED_PHRASES.has(token) && !COMMON_PHRASE.has(token));
    if (useful.some((token) => token.length >= 4)) phrases.add(norm);
    const collapsed = inner.toLowerCase().replace(/[^a-z0-9]+/g, "");
    if (/^[a-z0-9]{4,8}$/.test(collapsed) && !COMMON_PHRASE.has(collapsed) && !BLOCKED_PHRASES.has(collapsed)) phrases.add(collapsed);
  }
  return [...phrases].filter((phrase) => !DROPPED_MATCH_PHRASES.has(phrase));
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
