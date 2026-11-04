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

const BAD_START_PRONOUNS = new Set(["him", "her", "them", "it", "they", "we", "us", "me", "my", "his", "their", "its"]);

const SUBJECTLESS = /^(is|are|was|were|has|have|had|will|can|does|do|did|building|making|equipping|creating|helping)\b/i;

/** True when the first token looks like a mid-word cut or orphan pronoun. */
export function pitchStartsBad(text: string): boolean {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return true;
  if (/^[a-z]/.test(t)) return true;
  if (/^[[('"]/.test(t)) return true;
  const first = (t.match(/^[A-Za-z']+/)?.[0] || "").toLowerCase();
  if (BAD_START_PRONOUNS.has(first)) return true;
  // Short lowercase fragment before a Capitalized token: "ns Health"
  if (/^[a-z]{1,4}\s+[A-Z]/.test(t)) return true;
  return false;
}

function stripBrackets(text: string): string {
  return text
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Keep source casing; only lift the first letter; expand known campus acronyms. */
function fixCasing(text: string): string {
  let out = text;
  // mit / Mit as a whole word (not inside limit/submit)
  out = out.replace(/\b[Mm]it\b/g, "MIT");
  out = out.replace(/\b[Mm]it('s)\b/g, "MIT$1");
  if (!out) return out;
  const first = out.charAt(0);
  if (/[a-z]/.test(first)) {
    out = first.toUpperCase() + out.slice(1);
  }
  return out;
}

/**
 * Advance past a mid-source cut to the next sentence that starts cleanly.
 * Prefers ". "/"! "/"? " boundaries; falls back to a capitalised clause after a comma.
 */
function snapToSentenceStart(text: string): string {
  let cur = text.replace(/^[….]+/, "").trim();
  // Drop a leading orphan period left by cuts
  cur = cur.replace(/^\.+\s*/, "").trim();
  for (let guard = 0; guard < 6 && pitchStartsBad(cur); guard += 1) {
    const next = cur.match(/[.!?]["']?\s+(.*)$/);
    if (next && next[1] && next[1].trim().length >= 12) {
      cur = next[1].trim();
      continue;
    }
    // ", I co-founded…" / " and I …" → start at I
    const iClause = cur.match(/,\s+(I\s+.{11,})$/);
    if (iClause) {
      cur = iClause[1].trim();
      continue;
    }
    // Skip a leading mid-word token: "ns Health …" → try after first space-run if rest looks like a title+clause
    const skipFrag = cur.match(/^[a-z]{1,6}\s+(.+)$/);
    if (skipFrag && /^[A-Z]/.test(skipFrag[1]) && !pitchStartsBad(skipFrag[1])) {
      cur = skipFrag[1].trim();
      continue;
    }
    break;
  }
  return cur;
}

/**
 * Clean free-text pitches for every route: strip scrape residue, brackets, and
 * mid-source cuts; keep source casing (only capitalise the first letter; MIT
 * fix); prefix a subject when the clause has none.
 */
export function sanitizePitch(
  value: string | null | undefined,
  name?: string | null,
  subject?: string | null,
): string | null {
  if (!value) return null;
  let text = stripUrls(value) || "";
  text = stripLeadingName(text, name) || "";
  for (const re of SCRAPE_PATTERNS) text = text.replace(re, " ");
  // Collapse scrape joins like "Intempus ... equipping" / "Name … rest"
  text = text.replace(/\s*(?:\.{3}|…)\s*/g, " ");
  text = stripBrackets(text);
  // Drop orphan fragments that start with a leading period after cuts
  text = text
    .replace(/(^|[·|])\s*\.\s+/g, "$1 ")
    .replace(/\(\s*\)/g, " ")
    .replace(/\s*[·|,;:]\s*(?=[·|,;:]|$)/g, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s·|,;:.…]+|[\s·|,;:.…]+$/g, "")
    .trim();
  text = humanizeEnumText(text) || "";
  text = snapToSentenceStart(text);

  const who = (subject ?? name)?.trim() || "";
  if (who && SUBJECTLESS.test(text)) {
    text = `${who} ${text.replace(/^\s+/, "")}`.replace(/\s{2,}/g, " ").trim();
  }

  text = fixCasing(text);

  // Still a bad start after recovery → drop rather than show a fragment
  if (pitchStartsBad(text)) return null;

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
