/**
 * National programs that stay labeled on the fitted network map.
 * Matching is for placement and labels only. It does not affect Founder Signal,
 * eligibility, or investment score.
 * Pear Dorm and Pear Garage are separate from Pear Fellows and do not match.
 */
const FEATURED_NATIONAL: { key: string; pattern: RegExp }[] = [
  { key: "thiel", pattern: /\bthiel fellowship\b/i },
  { key: "yc", pattern: /\by combinator\b|\bycombinator\b/i },
  { key: "founders_inc", pattern: /\bfounders inc\b/i },
  { key: "z_fellows", pattern: /\bz fellows\b/i },
  { key: "emergent", pattern: /\bemergent ventures\b/i },
  { key: "spc", pattern: /\bsouth park commons\b|\bspc\b/i },
  { key: "neo", pattern: /\bneo scholars\b/i },
  { key: "hf0", pattern: /\bhf0\b/i },
  { key: "contrary", pattern: /\bcontrary venture\b/i },
  { key: "pear", pattern: /\bpear fellows\b/i },
  { key: "speedrun", pattern: /\ba16z speedrun\b/i },
  { key: "human_capital", pattern: /\bhuman capital\b/i },
  { key: "kp", pattern: /\bkleiner perkins\b/i },
];

export function featuredNationalKey(label: string | null | undefined): string | null {
  const name = (label ?? "").trim();
  if (!name) return null;
  if (/\bpear dorm\b|\bpear garage\b/i.test(name)) return null;
  for (const row of FEATURED_NATIONAL) if (row.pattern.test(name)) return row.key;
  return null;
}
