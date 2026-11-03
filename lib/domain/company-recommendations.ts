import { shortCampusLabel } from "./campuses";
import { browseHref } from "./facet-url";
import type { FacetCompany } from "./sample-facets";

export type CompanyRecommendations = {
  scope: "campus" | "sector" | "signals";
  context: string;
  href: string;
  linkLabel: string;
  rows: { id: string; name: string; reason: string; detail: string }[];
};

/** Relatedness uses stored campus and sector IDs, never inferred company facts. */
export function companyRecommendations(all: FacetCompany[], subject: FacetCompany): CompanyRecommendations {
  const others = all.filter(c => c.id !== subject.id);
  const campusPeers = subject.schoolId ? others.filter(c => c.schoolId === subject.schoolId) : [];
  const sectorPeers = subject.sectorId ? others.filter(c => c.sectorId === subject.sectorId) : [];
  const scope = campusPeers.length ? "campus" : sectorPeers.length ? "sector" : "signals";
  const pool = scope === "campus" ? campusPeers : scope === "sector" ? sectorPeers : others.filter(c => c.signals > 0);
  const sameSector = (c: FacetCompany) => !!subject.sectorId && c.sectorId === subject.sectorId;
  const campus = shortCampusLabel(subject.schoolId ?? "", subject.school ?? "Campus");
  const rows = [...pool].sort((a, b) =>
    Number(sameSector(b)) - Number(sameSector(a)) ||
    b.signals - a.signals || a.name.localeCompare(b.name, "en-US") || a.id.localeCompare(b.id, "en-US")
  ).slice(0, 6).map(c => {
    const campusName = c.schoolId ? shortCampusLabel(c.schoolId, c.school ?? "Campus") : null;
    const reason = scope === "campus"
      ? sameSector(c) ? "Same sector" : c.sector || "Same campus"
      : scope === "sector" ? campusName || "Same sector"
      : `${c.signals.toLocaleString("en-US")} ${c.signals === 1 ? "signal" : "signals"}`;
    const detail = scope === "campus"
      ? `Same campus: ${campus}${sameSector(c) ? `; same sector: ${subject.sector || "on record"}` : c.sector ? `; sector: ${c.sector}` : ""}`
      : scope === "sector" ? `Same sector: ${subject.sector || "on record"}${campusName ? `; campus: ${campusName}` : ""}`
      : "No shared campus or sector on record. Shown for its recorded signals.";
    return { id: c.id, name: c.name, reason, detail };
  });
  return {
    scope,
    context: scope === "campus" ? `Also at ${campus}` : scope === "sector" ? subject.sector || "Same sector" : "Recorded signals",
    href: scope === "campus" ? browseHref({ facets: { campus: subject.schoolId } }) : scope === "sector" ? browseHref({ facets: { sector: subject.sectorId } }) : browseHref({ feed: "leaderboard" }),
    linkLabel: scope === "campus" ? `View all ${campus} companies` : scope === "sector" ? "View all in this sector" : "Explore companies with signals",
    rows,
  };
}
