/**
 * Campus Scout signature: compact typographic seal letters from a campus short label.
 * Real labels only  -  never invent a school.
 */

import { shortCampusName } from "./campuses";

const OVERRIDE: Record<string, string> = {
  Berkeley: "Bk",
  Stanford: "St",
  Waterloo: "Wa",
  Harvard: "Hv",
  Columbia: "Cu",
  "Georgia Tech": "GT",
  Michigan: "Mi",
  Princeton: "Pr",
  Brown: "Bn",
  Cornell: "Cr",
  "Cornell Tech": "CT",
  Duke: "Dk",
  "Harvey Mudd": "HM",
  Yale: "Yl",
  "Boston University": "BU",
  Caltech: "Te",
  Cambridge: "Cb",
  Dartmouth: "Dm",
  Emory: "Em",
  Georgetown: "Gt",
  Lafayette: "Lf",
  Laurentian: "Ln",
  Northwestern: "NW",
  "Notre Dame": "ND",
  "Queen's": "Qu",
  Rice: "Rc",
  Toronto: "To",
  "UT Austin": "UT",
  Penn: "Pn",
  UCLA: "LA",
  UChicago: "Chi",
  UIUC: "IL",
  UNC: "NC",
  USC: "SC",
  UVA: "VA",
  UW: "UW",
  MIT: "MIT",
  CMU: "CMU",
  NYU: "NYU",
};

function normalizeLabel(label: string): string {
  const short = shortCampusName(label);
  if (short && short !== label) return short;
  return label
    .replace(/^University of (?:California(?:,)?\s*)?/i, "")
    .replace(/\s+University$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 2-3 letter seal for a campus shortLabel or free-text campus name.
 * Returns null when there is no campus to mark.
 */
export function campusSealLetters(label: string | null | undefined): string | null {
  const raw = (label || "").replace(/\s+/g, " ").trim();
  if (!raw) return null;
  const cleaned = normalizeLabel(raw);
  if (!cleaned) return null;
  if (OVERRIDE[cleaned]) return OVERRIDE[cleaned];
  if (OVERRIDE[raw]) return OVERRIDE[raw];
  // Already a short code (MIT, CMU, UVA…)
  if (/^[A-Z0-9]{2,4}$/i.test(cleaned) && !/\s/.test(cleaned)) {
    return cleaned.toUpperCase().slice(0, 3);
  }
  const words = cleaned.replace(/'/g, "").split(" ").filter(Boolean);
  if (words.length >= 2) {
    const initials = words.map((w) => w[0] || "").join("").toUpperCase();
    return initials.slice(0, 3) || null;
  }
  const w = words[0] || cleaned;
  if (w.length <= 3) return w;
  return `${w[0]!.toUpperCase()}${w[1]!.toLowerCase()}`;
}
