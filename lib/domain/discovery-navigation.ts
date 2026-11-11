/** Preserve the research context when changing discovery surfaces. */
export function discoveryHref(target: "map" | "companies" | "signals", search: URLSearchParams): string {
  const params = new URLSearchParams(search);
  // The workspace and full directory use different names for the same HQ facet.
  const hq = params.get("hqRegion") || params.get("hq");
  params.delete("hqRegion");
  if (hq) params.set("hq", hq);
  for (const key of [...params.keys()]) {
    if (!["network", "missing", "campus", "sector", "kind", "q", "stage", "status", "flag", "year", "yearMissing", "sectorMissing", "hq", "country", "recency", "sort", "c"].includes(key)) params.delete(key);
  }
  if (target === "map" && hq) {
    params.delete("hq");
    params.set("hqRegion", hq);
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
