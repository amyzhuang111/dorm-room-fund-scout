/** Incomplete ISO dates like 2026-05-00 or 2026-00-00 become the part that was stored. */
export function formatCorpusDate(raw: string | number | null | undefined): string | null {
  if (raw == null || raw === "") return null;
  const text = String(raw).trim();
  if (!text) return null;
  if (/^\d{4}$/.test(text)) return text;
  const m = text.match(/^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?/);
  if (!m) return text;
  const year = m[1];
  const month = m[2] && m[2] !== "00" ? m[2] : null;
  const day = m[3] && m[3] !== "00" ? m[3] : null;
  if (day && month) return `${year}-${month}-${day}`;
  if (month) return `${year}-${month}`;
  if (year) return year;
  return null;
}
