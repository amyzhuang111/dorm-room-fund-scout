/** Preserve the research context when changing discovery surfaces. */
export function discoveryHref(target: "map" | "companies" | "signals", search: URLSearchParams): string {
  const params = new URLSearchParams(search);
  for (const key of [...params.keys()]) {
    if (!["campus", "sector", "kind", "q", "stage", "status", "flag", "year", "yearMissing", "sectorMissing", "hq", "country", "recency", "sort", "c"].includes(key)) params.delete(key);
  }
  if (target === "signals") params.set("feed", "leaderboard");
  const path = target === "map" ? "/" : "/companies";
  return params.size ? `${path}?${params}` : path;
}

export function safeDiscoveryReturn(from: string | null, campus: string | null): string {
  if (from && /^\/companies(?:\?|$)/.test(from)) return from;
  if (from === "map") return campus ? `/?${new URLSearchParams({ campus })}` : "/";
  return "/companies";
}
