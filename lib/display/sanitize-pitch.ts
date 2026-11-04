import { stripLeadingName, stripUrls } from "@/lib/display/strip-urls";
import { humanizeEnumText } from "@/lib/display/enum-labels";

/** Patterns that mark scraper / search-index residue in founder pitches. */
const SCRAPE_PATTERNS: RegExp[] = [
  /\bSnippet\s*:/gi,
  /\[this profile cited\]/gi,
  /\(search-index summary\)/gi,
  /\.?\s*Evidence\s*:\s*/gi,
  /\bsearch-index\b/gi,
  /\bcited in (?:the )?index\b/gi,
  /\bprofile title is\b/gi,
  /\bconfirmed LinkedIn\b/gi,
];

/**
 * Clean free-text pitches: strip URLs, scrape boilerplate, name echo, and
 * dangling punctuation left behind.
 */
export function sanitizePitch(
  value: string | null | undefined,
  name?: string | null,
): string | null {
  if (!value) return null;
  let text = stripUrls(value) || "";
  text = stripLeadingName(text, name) || "";
  for (const re of SCRAPE_PATTERNS) text = text.replace(re, " ");
  // Collapse scrape joins like "Intempus ... equipping" / "Name … rest"
  text = text.replace(/\s*(?:\.{3}|…)\s*/g, " ");
  // Drop orphan fragments that start with a leading period after cuts
  text = text
    .replace(/(^|[·|])\s*\.\s+/g, "$1 ")
    .replace(/\(\s*\)/g, " ")
    .replace(/\s*[·|,;:]\s*(?=[·|,;:]|$)/g, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s·|,;:.]+|[\s·|,;:.]+$/g, "")
    .trim();
  text = humanizeEnumText(text) || "";
  // If almost nothing useful remains, blank the pitch
  if (text.length < 8) return null;
  if (/^(orbit|snippet|evidence|summary)\b/i.test(text) && text.length < 40) return null;
  return text || null;
}

export function looksLikeScrapedPitch(value: string | null | undefined): boolean {
  if (!value) return false;
  return SCRAPE_PATTERNS.some((re) => {
    re.lastIndex = 0;
    return re.test(value);
  });
}
