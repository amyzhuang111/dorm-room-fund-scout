/** Display-only title-case for chips/tags. Keeps short acronyms (YC, AI, S+) intact. */
const KEEP = new Set(["YC", "AI", "ML", "VR", "AR", "HQ", "HR", "S+", "S", "A", "B", "C", "D", "VIP", "VIP-X", "DRF", "NW", "BU", "MIT", "NYU", "CMU", "UCLA", "UC", "B2B", "B2C"]);

export function titleCaseTag(raw: string | null | undefined): string {
  if (!raw) return "";
  const text = raw.replace(/\s+/g, " ").trim();
  if (!text) return "";
  // Already mixed / title-ish and short acronym
  if (KEEP.has(text)) return text;
  if (/^[A-Z0-9+/\-]{1,6}$/.test(text) && text === text.toUpperCase() && text.length <= 4) {
    return text;
  }
  return text
    .toLowerCase()
    .split(/(\s+|\/|·|-)/)
    .map((part) => {
      if (!part || /^(\s+|\/|·|-)$/.test(part)) return part;
      const upper = part.toUpperCase();
      if (KEEP.has(upper) || KEEP.has(part)) return KEEP.has(upper) ? upper : part;
      if (/^\d/.test(part)) return part;
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join("");
}
