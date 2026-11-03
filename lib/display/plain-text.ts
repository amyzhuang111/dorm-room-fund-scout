/**
 * Display-only: render stored text without em/en dashes. Stored values are
 * never rewritten; this runs at render time.
 *   "2022–23", "5–10", "12–2pm"     -> "2022-23", "5-10", "12-2pm"  (numeric range: hyphen)
 *   "Nebraska–Lincoln", "Sep–4 Nov" -> "Nebraska-Lincoln", "Sep-4 Nov" (unspaced en dash: hyphen)
 *   "films—all", "a — b"            -> "films, all", "a, b"          (em dash / spaced dash: comma)
 *   "repo — Direct", "(YC) – Open"  -> "repo. Direct", "(YC). Open"  (before a capital: period)
 *   "—" alone -> "n/a"; leading/trailing dashes are dropped.
 * An em dash between words never becomes a joined hyphen.
 */
const DASH = /[\u2013\u2014]/;

export function plainText(s: string): string;
export function plainText(s: string | null | undefined): string | null | undefined;
export function plainText(s: string | null | undefined): string | null | undefined {
  if (s == null || !DASH.test(s)) return s;
  if (/^\s*[\u2013\u2014]+\s*$/.test(s)) return "n/a";
  return s
    .replace(/(\d)\s*[\u2013\u2014]\s*(\d)/g, "$1-$2")
    .replace(/(\w)\u2013(\w)/g, "$1-$2")
    .replace(/^[\s\u2013\u2014]+/, "")
    .replace(/[\s\u2013\u2014]+$/, "")
    .replace(/[,;:.]?\s*[\u2013\u2014]+\s*(?=[A-Z])/g, ". ")
    .replace(/[,;:]?\s*[\u2013\u2014]+\s*/g, ", ");
}

function isLinkish(key: string, v: string): boolean {
  return /(?:url|href|src|id|slug)$/i.test(key) || /^(?:[a-z]+:|\/)\S*$/i.test(v.trim());
}

/** Deep copy with plainText() on every display string. Links, ids and slugs are left as-is. */
export function plainTextDeep<T>(value: T, key = ""): T {
  if (typeof value === "string") return (isLinkish(key, value) ? value : plainText(value)) as T;
  if (Array.isArray(value)) return value.map((v) => plainTextDeep(v, key)) as T;
  if (value && typeof value === "object" && [Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = plainTextDeep(v, k);
    return out as T;
  }
  return value;
}
