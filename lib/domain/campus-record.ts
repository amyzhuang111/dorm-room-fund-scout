/** The startup a campus marker opens. Same choice as the side-panel link. */

export type CampusLead = {
  campusId: string;
  companyId: string;
  companyName: string;
};

type LeadCard = {
  id: string;
  name: string;
  schoolId: string | null;
  signals: number;
};

/** One real company per campus: most stored signals, then name. */
export function topCampusLeads(cards: LeadCard[]): CampusLead[] {
  const best = new Map<string, { id: string; name: string; signals: number }>();
  for (const card of cards) {
    const campusId = card.schoolId?.trim();
    const name = card.name?.trim();
    if (!campusId || !card.id || !name) continue;
    const signals = Number(card.signals) || 0;
    const current = best.get(campusId);
    if (
      !current ||
      signals > current.signals ||
      (signals === current.signals && name.localeCompare(current.name) < 0)
    ) {
      best.set(campusId, { id: card.id, name, signals });
    }
  }
  return [...best.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([campusId, row]) => ({ campusId, companyId: row.id, companyName: row.name }));
}

/** Marker, list row, and the page it opens stay the same company. */
export function campusRecordHref(
  campusId: string,
  lead: CampusLead | undefined,
  slug: string | null | undefined,
): string {
  const campus = campusId.trim();
  if (lead && lead.campusId === campus && lead.companyId) {
    const query = new URLSearchParams({ from: "map", campus });
    return `/startup/${encodeURIComponent(lead.companyId)}?${query.toString()}`;
  }
  if (slug) return `/campuses/${encodeURIComponent(slug)}`;
  return "/campuses";
}
