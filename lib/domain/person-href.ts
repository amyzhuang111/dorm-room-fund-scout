/** Canonical record for one named person. */
export function namedPersonPath(id: string): string {
  return `/founders/${encodeURIComponent(id)}`;
}

/**
 * Legacy list URLs carry the person in `founder` or `person`.
 * A non-empty id opens that record, or the id it was merged into.
 * A search or campus query is not a named person and stays on the directory.
 */
export function namedPersonTarget(
  sp: Record<string, string | undefined>,
  survivor: (id: string) => string | null = () => null,
): string | null {
  const raw = (sp.founder || sp.person || "").trim();
  if (!raw) return null;
  return namedPersonPath(survivor(raw) || raw);
}
