/** Accept only a local company-list URL, never an external return destination. */
export function companyBrowsePath(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2000 || !value.startsWith("/companies") || /[\\\r\n]/.test(value)) return null;
  try {
    const url = new URL(value, "https://campus-scout.invalid");
    if (url.origin !== "https://campus-scout.invalid" || url.pathname !== "/companies") return null;
    return url.pathname + url.search;
  } catch { return null; }
}

export function companyRecordHref(id: string, from?: string | null): string {
  const path = `/startup/${encodeURIComponent(id)}`;
  const back = companyBrowsePath(from);
  return back ? `${path}?${new URLSearchParams({ from: back })}` : path;
}
