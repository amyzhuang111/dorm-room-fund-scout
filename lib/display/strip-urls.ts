/** Remove raw http(s) URLs and bare www hosts from free text for card pitches. */
export function stripUrls(value: string | null | undefined): string | null {
  if (!value) return null;
  const cleaned = value
    .replace(/https?:\/\/[^\s)\]>'"]+/gi, " ")
    .replace(/\bwww\.[^\s)\]>'"]+/gi, " ")
    .replace(/\s*[·|,;:]\s*(?=[·|,;:]|$)/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  return cleaned || null;
}

/** Drop a leading "Name ·" / "Name:" echo of the person name. */
export function stripLeadingName(text: string | null | undefined, name: string | null | undefined): string | null {
  if (!text) return null;
  if (!name) return text;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`^${escaped}\\s*(?:[:·\\-|–—]\\s*|\\s+)`, "i");
  const out = text.replace(re, "").trim();
  return out || null;
}
