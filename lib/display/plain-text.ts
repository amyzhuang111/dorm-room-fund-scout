/**
 * Display-only: render stored text without em/en dashes. Stored values are
 * never rewritten; this runs at render time.
 *   "2013–2015"  -> "2013 to 2015"
 *   "Nebraska–Lincoln" -> "Nebraska-Lincoln"
 *   "30 Sep–4 Nov"     -> "30 Sep to 4 Nov"
 *   "a — b"      -> "a, b"
 *   "—" (alone)  -> "n/a"
 */
export function plainText(s: string): string;
export function plainText(s: string | null | undefined): string | null | undefined;
export function plainText(s: string | null | undefined): string | null | undefined {
  if (s == null) return s;
  if (!/[\u2013\u2014]/.test(s)) return s;
  if (/^\s*[\u2013\u2014]\s*$/.test(s)) return "n/a";
  return s
    .replace(/(\d)\s*[\u2013\u2014]\s*(\d)/g, "$1 to $2")
    .replace(/([A-Za-z])[\u2013\u2014]([A-Za-z])/g, "$1-$2")
    .replace(/(\w)[\u2013\u2014](\w)/g, "$1 to $2")
    .replace(/^\s*[\u2013\u2014]\s*/, "")
    .replace(/\s*[\u2013\u2014]\s*$/, "")
    .replace(/[,;:]?\s*[\u2013\u2014]+\s*/g, ", ");
}
