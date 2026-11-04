/**
 * Map raw signal / backer / program_membership strings to short chip labels.
 * Known programs and funds keep their canonical casing. Anything that cannot
 * become a label of MAX_CHIP_CHARS or fewer is demoted to description text.
 */
import { NATIONAL_PROGRAMS, normalizeProgramText } from "@/lib/domain/national-programs";
import { PROGRAM_SIGNAL_LABEL } from "@/lib/domain/program-signals";

export const MAX_CHIP_CHARS = 28;
export const MAX_CHIP_WORDS = 5;

export type CanonicalTagResult = {
  /** Short label for a chip, or null when nothing chip-worthy remains. */
  chip: string | null;
  /** Original (or residual) text to fold into description / evidence. */
  demoted: string | null;
  /** True when a known alias or pattern produced the chip. */
  mapped: boolean;
};

type Entry = { label: string; aliases: string[] };

/** Funds, campus programs, and awards beyond NATIONAL_PROGRAMS. */
const EXTRA: Entry[] = [
  { label: "Dorm Room Fund", aliases: ["dorm room fund", "drf"] },
  { label: "Sequoia", aliases: ["sequoia capital", "sequoia"] },
  { label: "Felicis", aliases: ["felicis ventures", "felicis"] },
  { label: "Venture Lab VIP-X", aliases: ["penn venture lab vip-x", "venture lab vip-x", "penn venture lab", "vip-x"] },
  { label: "SkyDeck", aliases: ["berkeley skydeck", "skydeck"] },
  { label: "MIT delta v", aliases: ["mit delta v", "delta v"] },
  { label: "MIT $100K", aliases: ["mit $100k entrepreneurship competition", "mit $100k competition", "mit $100k", "mit 100k"] },
  { label: "Penn Sustainability Prize", aliases: ["presidents innovation/sustainability prize", "president s innovation/sustainability prize", "presidents sustainability prize", "president s sustainability prize", "innovation/sustainability prize"] },
  { label: "Innovate@BU", aliases: ["innovate@bu new venture competition", "innovate@bu", "innovate bu", "e@b", "e at b", "e bs", "e b"] },
  { label: "Free Ventures", aliases: ["free ventures"] },
  { label: "CREATE-X", aliases: ["create-x startup launch", "create-x"] },
  { label: "TreeHacks", aliases: ["treehacks"] },
  { label: "Y Combinator", aliases: ["y combinator", "ycombinator", "yc"] },
  { label: "General Catalyst", aliases: ["general catalyst"] },
  { label: "Andreessen Horowitz", aliases: ["andreessen horowitz"] },
  { label: "Founders Fund", aliases: ["founders fund"] },
  { label: "Kleiner Perkins", aliases: ["kleiner perkins"] },
  { label: "Pear VC", aliases: ["pear vc", "pearx", "pear x"] },
  { label: "Accel Scholars", aliases: ["accel leadership program", "accel scholars", "accel scholar"] },
  { label: "Neo Scholars", aliases: ["neo scholars", "neo scholar"] },
  { label: "a16z Speedrun", aliases: ["andreessen horowitz speedrun", "a16z speedrun", "speedrun"] },
  { label: "Thiel Fellowship", aliases: ["thiel fellowship", "thiel fellows", "thiel fellow"] },
  { label: "Z Fellows", aliases: ["z fellows", "z fellow"] },
  { label: "South Park Commons", aliases: ["south park commons founder fellowship", "south park commons founder fellow", "south park commons", "spc"] },
  { label: "HF0", aliases: ["hacker fellowship 0", "hf0"] },
  { label: "Emergent Ventures", aliases: ["emergent ventures"] },
  { label: "Human Capital", aliases: ["human capital fellowship", "hc fellowship", "delta fellowship"] },
  { label: "Founders Inc", aliases: ["founders inc off season", "founders inc"] },
  { label: "1517 Fund", aliases: ["1517 medici", "1517 fund", "medici project"] },
  { label: "Contrary", aliases: ["contrary venture partners", "contrary"] },
  { label: "Buildspace", aliases: ["buildspace"] },
  { label: "Pioneer", aliases: ["pioneer accelerator", "pioneer"] },
  { label: "The Residency", aliases: ["the residency", "inventors residency"] },
  { label: "AGI House", aliases: ["agi house"] },
  { label: "Afore FIR U", aliases: ["afore fir u", "afore fir"] },
  { label: "Frontier Tower", aliases: ["frontier tower"] },
  { label: "UC LAUNCH", aliases: ["uc launch"] },
  { label: "Cornell eLab", aliases: ["cornell elab"] },
  { label: "CMU VentureBridge", aliases: ["cmu venturebridge", "venturebridge"] },
  { label: "Cardinal Ventures", aliases: ["cardinal ventures"] },
  { label: "Velocity", aliases: ["velocity"] },
  { label: "Rise of the Rest", aliases: ["revolution s rise of the rest seed fund", "rise of the rest"] },
];

function fromNational(): Entry[] {
  const out: Entry[] = [];
  for (const program of NATIONAL_PROGRAMS) {
    out.push({ label: program.label, aliases: [...program.aliases] });
  }
  for (const [type, label] of Object.entries(PROGRAM_SIGNAL_LABEL)) {
    const aliases = [normalizeProgramText(label), type.replace(/_/g, " ")];
    out.push({ label, aliases });
  }
  return out;
}

/** Longer aliases first so "a16z speedrun" wins over "a16z". */
function buildAliasIndex(entries: Entry[]): { alias: string; label: string }[] {
  const seen = new Map<string, string>();
  for (const entry of [...fromNational(), ...EXTRA, ...entries]) {
    if (entry.label.length > MAX_CHIP_CHARS) continue;
    for (const alias of entry.aliases) {
      const key = normalizeProgramText(alias);
      if (!key) continue;
      // Prefer first registered label for a given alias (EXTRA can override national duplicates by going last... so register EXTRA after and overwrite)
      seen.set(key, entry.label);
    }
    const self = normalizeProgramText(entry.label);
    if (self) seen.set(self, entry.label);
  }
  // Re-apply EXTRA last so canonical short labels win
  for (const entry of EXTRA) {
    if (entry.label.length > MAX_CHIP_CHARS) continue;
    for (const alias of entry.aliases) {
      const key = normalizeProgramText(alias);
      if (key) seen.set(key, entry.label);
    }
    const self = normalizeProgramText(entry.label);
    if (self) seen.set(self, entry.label);
  }
  return [...seen.entries()]
    .map(([alias, label]) => ({ alias, label }))
    .sort((a, b) => b.alias.length - a.alias.length || a.label.localeCompare(b.label));
}

const ALIAS_INDEX = buildAliasIndex([]);

function isSentence(text: string): boolean {
  const trimmed = text.trim();
  if (/[.!?]$/.test(trimmed)) return true;
  if (trimmed.split(/\s+/).filter(Boolean).length > MAX_CHIP_WORDS) return true;
  // Narrative scrape openers
  if (/\bnote names\b/i.test(trimmed)) return true;
  if (/\bpublic companies page lists\b/i.test(trimmed)) return true;
  if (/\bper\s+[\w.-]+\.\w+/i.test(trimmed)) return true;
  return false;
}

function awardChip(norm: string, raw: string): string | null {
  // MIT $100K 2026 First Place ($100K) → MIT $100K 1st
  if (/\bmit\b/.test(norm) && /100\s*k/.test(norm)) {
    if (/\bfirst place\b|\b1st\b/.test(norm)) return "MIT $100K 1st";
    if (/\bsecond place\b|\b2nd\b/.test(norm)) return "MIT $100K 2nd";
    if (/\bthird place\b|\b3rd\b/.test(norm)) return "MIT $100K 3rd";
    return "MIT $100K";
  }
  // a16z speedrun SR007 → a16z Speedrun SR007
  const sr = norm.match(/\b(?:a16z\s+)?speedrun\s+(sr\s*\d{2,4})\b/i) || raw.match(/\b(SR\s*\d{2,4})\b/i);
  if (/\bspeedrun\b/.test(norm) && sr) {
    const batch = sr[1].replace(/\s+/g, "").toUpperCase();
    const label = `a16z Speedrun ${batch}`;
    return label.length <= MAX_CHIP_CHARS ? label : "a16z Speedrun";
  }
  if (/\bspeedrun\b/.test(norm) || /\ba16z speedrun\b/.test(norm)) return "a16z Speedrun";
  // YC Winter 2023 / Y Combinator Summer 2025 → YC W23 / YC S25
  const yc = norm.match(/\b(?:y combinator|yc)\s+(winter|summer|fall|spring)\s*(20)?(\d{2})\b/);
  if (yc) {
    const season = ({ winter: "W", summer: "S", fall: "F", spring: "Sp" } as Record<string, string>)[yc[1]] ?? yc[1].slice(0, 1).toUpperCase();
    const label = `YC ${season}${yc[3]}`;
    return label.length <= MAX_CHIP_CHARS ? label : "YC";
  }
  // Thiel Fellowship 2026 ($250k) → Thiel Fellowship
  if (/\bthiel fellowship\b/.test(norm)) return "Thiel Fellowship";
  // President's … Prize 2021
  if (/sustainability prize|innovation\/sustainability/.test(norm)) return "Penn Sustainability Prize";
  return null;
}

function findExactAlias(norm: string): string | null {
  for (const { alias, label } of ALIAS_INDEX) {
    if (norm === alias) return label;
  }
  return null;
}

function findPhraseAlias(norm: string): string | null {
  const padded = ` ${norm} `;
  for (const { alias, label } of ALIAS_INDEX) {
    if (padded.includes(` ${alias} `)) return label;
  }
  return null;
}

/**
 * Turn a raw program / backer / signal string into a chip label or demote it.
 * Never title-cases: mapped labels use their canonical form; short non-sentence
 * raw strings keep their original casing.
 */
export function canonicalizeTag(raw: string | null | undefined): CanonicalTagResult {
  if (!raw) return { chip: null, demoted: null, mapped: false };
  const text = raw.replace(/\s+/g, " ").trim();
  if (!text) return { chip: null, demoted: null, mapped: false };

  // Apostrophe in E@B's collapses to "ebs" under normalize — catch before that.
  if (/\be\s*@\s*b\b/i.test(text) || /\binnovate\s*@\s*bu\b/i.test(text)) {
    return {
      chip: "Innovate@BU",
      demoted: isSentence(text) || text.length > MAX_CHIP_CHARS ? text : null,
      mapped: true,
    };
  }

  const norm = normalizeProgramText(text);
  const award = awardChip(norm, text);
  if (award) {
    const demoted = text.length > award.length && text.toLowerCase() !== award.toLowerCase() ? text : null;
    return { chip: award, demoted, mapped: true };
  }

  const exact = findExactAlias(norm);
  if (exact) {
    return { chip: exact, demoted: null, mapped: true };
  }

  // Short non-sentence strings keep original casing (e.g. YC S24, Felicis).
  if (!isSentence(text) && text.length <= MAX_CHIP_CHARS) {
    return { chip: text, demoted: null, mapped: false };
  }

  // Long / sentence: extract a known program if present, else demote fully.
  const phrase = findPhraseAlias(norm);
  if (phrase) {
    return { chip: phrase, demoted: text, mapped: true };
  }

  return { chip: null, demoted: text, mapped: false };
}

/** Apply canonicalizeTag across many raw strings; dedupe chips; collect demotions. */
export function canonicalizeTags(
  raws: (string | null | undefined)[],
): { chips: string[]; demoted: string[]; mapped: number; demotedCount: number } {
  const chips: string[] = [];
  const demoted: string[] = [];
  let mapped = 0;
  let demotedCount = 0;
  for (const raw of raws) {
    const result = canonicalizeTag(raw);
    if (result.mapped && result.chip) mapped += 1;
    if (result.chip && !chips.includes(result.chip)) chips.push(result.chip);
    if (result.demoted) {
      demotedCount += 1;
      if (!demoted.includes(result.demoted)) demoted.push(result.demoted);
    }
  }
  return { chips, demoted, mapped, demotedCount };
}

export function chipLooksBad(label: string): boolean {
  const text = label.replace(/\s+/g, " ").trim();
  if (!text) return true;
  if (text.length > MAX_CHIP_CHARS) return true;
  if (isSentence(text)) return true;
  return false;
}
