// National programs for the "Programs to campuses" heatmap. Campus clubs
// and single-campus houses stay off this list: these programs recruit
// across schools.
//
// Tiers are scouting labels for the row. They are not Founder Signal,
// eligibility, or an investment score. A row that names a program in
// PROGRAM_DIRECTORY uses that directory tier. Thiel Fellowship is S+ and
// is not a directory program. Neo, Y Combinator, Accel Scholars, Pear,
// a16z Speedrun, and Human Capital keep the hotspot letter already on
// this table.
//
// A phrase matches only as whole words after punctuation is stripped, so
// "Founders, Inc." counts and "Founders include" does not.

import { PROGRAM_DIRECTORY, type ProgramSignalType } from "./program-signals";

export const NATIONAL_PROGRAM_TIERS = ["S+", "S", "A", "B", "C"] as const;
export type NationalProgramTier = (typeof NATIONAL_PROGRAM_TIERS)[number];

export interface NationalProgram {
  id: string;
  label: string;
  tier: NationalProgramTier;
  /** Normalized phrases. Longer aliases are listed with the short ones. */
  aliases: readonly string[];
  /** Membership badges of this type count on the row, and the tier comes from PROGRAM_DIRECTORY. */
  signalType?: ProgramSignalType;
}

function directoryTier(program: ProgramSignalType): NationalProgramTier {
  return PROGRAM_DIRECTORY[program].tier;
}

export const NATIONAL_PROGRAMS: readonly NationalProgram[] = [
  {
    id: "thiel",
    label: "Thiel Fellowship",
    tier: "S+",
    aliases: ["thiel fellowship", "thiel fellows", "thiel fellow"],
  },
  {
    id: "spc",
    label: "South Park Commons",
    tier: directoryTier("south_park_commons"),
    signalType: "south_park_commons",
    aliases: ["south park commons founder fellowship", "south park commons", "spc founder fellowship", "spc fellowship"],
  },
  {
    id: "hf0",
    label: "HF0",
    tier: directoryTier("hf0"),
    signalType: "hf0",
    aliases: ["hacker fellowship 0", "hf0"],
  },
  {
    id: "emergent",
    label: "Emergent Ventures",
    tier: directoryTier("emergent_ventures"),
    signalType: "emergent_ventures",
    aliases: ["emergent ventures"],
  },
  {
    id: "kp_fellows",
    label: "Kleiner Perkins Fellows",
    tier: directoryTier("kleiner_perkins_fellows"),
    signalType: "kleiner_perkins_fellows",
    aliases: ["kleiner perkins engineering fellow", "kleiner perkins fellows", "kleiner perkins fellow", "kp fellows", "kp fellow"],
  },
  {
    // Hotspot directory: Neo Scholars, S.
    id: "neo",
    label: "Neo Scholars",
    tier: "S",
    aliases: ["neo scholars", "neo scholar"],
  },
  {
    // Hotspot directory: Y Combinator (funded founders), S.
    id: "yc",
    label: "Y Combinator",
    tier: "S",
    aliases: ["y combinator", "ycombinator", "yc founder", "yc"],
  },
  {
    id: "z_fellows",
    label: "Z Fellows",
    tier: directoryTier("z_fellows"),
    signalType: "z_fellows",
    aliases: ["z fellows", "z fellow"],
  },
  {
    // No hotspot-directory row. A, with the other selective fellowships that are not S.
    id: "accel_scholars",
    label: "Accel Scholars",
    tier: "A",
    aliases: ["accel leadership program", "accel leadership", "accel scholars", "accel scholar", "accel leaders", "accel leader"],
  },
  {
    // Hotspot directory: Pear Fellows is A and Pear Garage is B. One combined row uses A.
    id: "pear",
    label: "Pear Fellows / Pear Garage",
    tier: "A",
    aliases: ["pear vc garage", "pear fellows", "pear fellow", "pear garage", "pearx"],
  },
  {
    // Hotspot directory: a16z speedrun (funded founders), A.
    id: "speedrun",
    label: "a16z Speedrun",
    tier: "A",
    aliases: ["andreessen horowitz speedrun", "a16z speedrun", "speedrun"],
  },
  {
    // Hotspot directory: Human Capital Fellowship, A. Delta Fellowship and
    // HC Fellowship are the directory's aliases. A prize line and the Cal
    // Hacks project named Human Capital are not membership.
    id: "human_capital",
    label: "Human Capital",
    tier: "A",
    aliases: ["human capital fellowship", "hc fellowship", "delta fellowship"],
  },
  {
    id: "founders_inc",
    label: "Founders Inc",
    tier: directoryTier("founders_inc"),
    signalType: "founders_inc",
    aliases: ["founders inc off season", "founders inc"],
  },
  {
    id: "agi_house",
    label: "AGI House",
    tier: directoryTier("agi_house"),
    signalType: "agi_house",
    aliases: ["agi house"],
  },
  {
    id: "contrary",
    label: "Contrary",
    tier: directoryTier("contrary_venture_partners"),
    signalType: "contrary_venture_partners",
    aliases: ["contrary venture partners", "contrary venture partner", "contrary class of"],
  },
  {
    id: "fund_1517",
    label: "1517 Fund",
    tier: directoryTier("medici_1517"),
    signalType: "medici_1517",
    aliases: ["1517 medici", "1517 fund", "medici project"],
  },
  {
    id: "afore",
    label: "Afore FIR U",
    tier: directoryTier("afore_fir_u"),
    signalType: "afore_fir_u",
    aliases: ["afore fir u", "afore fir"],
  },
  {
    id: "the_residency",
    label: "The Residency",
    tier: directoryTier("the_residency"),
    signalType: "the_residency",
    aliases: ["the residency", "inventors residency"],
  },
  {
    id: "pioneer",
    label: "Pioneer",
    tier: directoryTier("pioneer"),
    signalType: "pioneer",
    aliases: ["pioneer accelerator"],
  },
  {
    id: "buildspace",
    label: "Buildspace",
    tier: directoryTier("buildspace"),
    signalType: "buildspace",
    aliases: ["buildspace"],
  },
  {
    id: "frontier_tower",
    label: "Frontier Tower",
    tier: directoryTier("frontier_tower"),
    signalType: "frontier_tower",
    aliases: ["frontier tower"],
  },
];

/** Lower sorts first. S+ is ahead of S. */
export function nationalProgramTierRank(tier: string | null | undefined): number {
  const index = NATIONAL_PROGRAM_TIERS.indexOf(tier as NationalProgramTier);
  return index === -1 ? NATIONAL_PROGRAM_TIERS.length : index;
}

export interface ProgramName {
  id: string;
  label: string;
  tier: NationalProgramTier;
}

const PROGRAM_BY_ID = new Map(NATIONAL_PROGRAMS.map((program) => [program.id, program]));

export function nationalProgramById(id: string): NationalProgram | null {
  return PROGRAM_BY_ID.get(id) ?? null;
}

export function normalizeProgramText(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9+]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasPhrase(text: string, phrase: string): boolean {
  return ` ${text} `.includes(` ${phrase} `);
}

/** Prize copy is not Human Capital membership. Strip it before alias checks. */
function programHaystack(text: string): string {
  return text.replace(/human capital fellowship prize/g, " ");
}

export function programsInText(raw: string): ProgramName[] {
  const text = programHaystack(normalizeProgramText(raw));
  if (!text) return [];
  const hits: ProgramName[] = [];
  for (const program of NATIONAL_PROGRAMS) {
    if (program.aliases.some((alias) => hasPhrase(text, alias))) {
      hits.push({ id: program.id, label: program.label, tier: program.tier });
    }
  }
  return hits;
}

const URL_KEYS = new Set(["url", "website", "ycurl", "linkedin", "sourceurl", "href", "websiteurl", "source_url"]);

function collectStrings(value: unknown, key: string | null, out: string[]) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return;
    if (key && URL_KEYS.has(key.toLowerCase().replace(/[^a-z]/g, ""))) return;
    if (/^https?:\/\//i.test(trimmed)) return;
    out.push(trimmed);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, key, out);
    return;
  }
  if (value && typeof value === "object") {
    for (const [childKey, child] of Object.entries(value as Record<string, unknown>)) {
      collectStrings(child, childKey, out);
    }
  }
}

/**
 * Claim body plus a source name when that name identifies one program.
 * A source title that names two programs is left out so a shared backfill
 * page is not credited to both.
 */
export function claimProgramTexts(valueJson: string, sourceName: string | null): string[] {
  const texts: string[] = [];
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(valueJson);
  } catch {
    parsed = null;
  }
  if (parsed && typeof parsed === "object") collectStrings(parsed, null, texts);
  else if (valueJson.trim() && !/^https?:\/\//i.test(valueJson.trim())) texts.push(valueJson.trim());

  const source = sourceName?.trim() ?? "";
  if (source && programsInText(source).length === 1) texts.push(source);
  return texts;
}

export const TOP_VC_ID = "top_vc";
export const TOP_VC_LABEL = "Backed by top VC";

/**
 * Investor-fact names for the Backed by top VC row. Word boundaries keep
 * "Lux Capital" and reject "luxury". Program batches stored as investors
 * (a16z Speedrun, Thiel Fellowship, Accel Scholars, Pear Fellows) are not
 * the firm.
 */
const TOP_VC_PHRASES = [
  "sequoia",
  "andreessen horowitz",
  "a16z",
  "benchmark",
  "accel partners",
  "founders fund",
  "greylock",
  "lightspeed",
  "general catalyst",
  "index ventures",
  "khosla",
  "thrive capital",
  "bessemer",
  "google ventures",
  "first round",
  "pear vc",
  "floodgate",
  "sv angel",
  "lux capital",
  "new enterprise associates",
] as const;

const TOP_VC_EXACT = new Set(["accel", "index", "thrive", "gv", "pear", "lux", "nea"]);

const TOP_VC_BLOCK = ["speedrun", "fellowship", "scholar", "scholars", "garage", "fellow", "fellows", "leader", "leaders", "leadership", "dorm"];

export function investorFactIsTopVc(raw: string): boolean {
  const text = normalizeProgramText(raw);
  if (!text) return false;
  if (TOP_VC_BLOCK.some((phrase) => hasPhrase(text, phrase))) return false;
  if (TOP_VC_EXACT.has(text)) return true;
  return TOP_VC_PHRASES.some((phrase) => hasPhrase(text, phrase));
}
