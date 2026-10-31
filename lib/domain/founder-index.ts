/** A founder a sourcer can filter. Every field is null when it is not stored. */

export interface FounderLead {
  id: string;
  name: string;
  campusId: string | null;
  campus: string | null;
  programs: string[];
  sector: string | null;
  gradYear: number | null;
  signalTypes: string[];
  company: string | null;
  companyId: string | null;
}

export interface FounderQuery {
  text?: string;
  campusId?: string | null;
  program?: string | null;
  sector?: string | null;
  gradYear?: number | "missing" | null;
  signalType?: string | null;
}

const SIGNAL_LABEL: Record<string, string> = {
  funding: "Funding",
  award: "Award",
  launch: "Launch",
  continued_dev: "Continued development",
  accelerator: "Accelerator",
  affiliation_change: "Affiliation change",
  // Stored signal_type value from project-showing records. The label avoids calling the product a demo.
  demo: "Shown project",
};

export function signalTypeLabel(type: string): string {
  return SIGNAL_LABEL[type] ?? type.replace(/_/g, " ");
}

/**
 * Lead reasons not already on the card (card shows campus · company · sector · year).
 * Blank when there is no program or signal on record — never invent, never pad.
 */
/** Prefer the single strongest stored lead; blank when none. Never dump the whole program list. */
export function whyWorthALook(founder: FounderLead): string | null {
  const STRONG = new Set(["funding", "launch", "accelerator", "award"]);
  const strong = founder.signalTypes.filter((t) => STRONG.has(t));
  if (strong.length) {
    const RANK: Record<string, number> = { funding: 0, launch: 1, accelerator: 2, award: 3 };
    const best = [...strong].sort((a, b) => (RANK[a] ?? 50) - (RANK[b] ?? 50) || a.localeCompare(b))[0]!;
    return signalTypeLabel(best);
  }
  if (founder.programs.length) {
    const yc = founder.programs.find((name) => /y\s*combinator/i.test(name));
    return yc ?? founder.programs[0]!;
  }
  // Weak signals only when nothing else is on record.
  if (founder.signalTypes.length) {
    const WEAK_RANK: Record<string, number> = {
      affiliation_change: 0,
      continued_dev: 1,
      demo: 2,
    };
    const best = [...founder.signalTypes].sort(
      (a, b) => (WEAK_RANK[a] ?? 50) - (WEAK_RANK[b] ?? 50) || a.localeCompare(b),
    )[0]!;
    return signalTypeLabel(best);
  }
  return null;
}

function tokens(text: string | undefined): string[] {
  return (text ?? "").trim().toLowerCase().split(/\s+/).filter(Boolean);
}

export function founderMatches(founder: FounderLead, query: FounderQuery): boolean {
  if (query.campusId) {
    if (query.campusId === "missing") {
      if (founder.campusId) return false;
    } else if (founder.campusId !== query.campusId) return false;
  }
  if (query.program) {
    if (!founder.programs.includes(query.program)) return false;
  }
  if (query.sector) {
    if (query.sector === "missing") {
      if (founder.sector) return false;
    } else if (founder.sector !== query.sector) return false;
  }
  if (query.gradYear === "missing") {
    if (founder.gradYear != null) return false;
  } else if (query.gradYear != null && founder.gradYear !== query.gradYear) return false;
  if (query.signalType) {
    if (query.signalType === "missing") {
      if (founder.signalTypes.length) return false;
    } else if (!founder.signalTypes.includes(query.signalType)) return false;
  }
  const words = tokens(query.text);
  if (!words.length) return true;
  const hay = [
    founder.name,
    founder.campus ?? "",
    founder.company ?? "",
    founder.sector ?? "",
    founder.gradYear != null ? String(founder.gradYear) : "",
    ...founder.programs,
    ...founder.signalTypes.map(signalTypeLabel),
  ]
    .join("\n")
    .toLowerCase();
  return words.every((word) => hay.includes(word));
}

/** Campus founders with a real signal or program lead. Missing campus, or one weak signal and no program, stay behind them. */
export function founderRank(founder: FounderLead): { tier: number; score: number } {
  const strong = founder.signalTypes.some((type) => type === "funding" || type === "launch" || type === "accelerator");
  const oneWeak = founder.signalTypes.length <= 1 && !strong;
  const tier = !founder.campusId ? 2 : oneWeak && founder.programs.length === 0 ? 1 : 0;
  const score =
    founder.signalTypes.length * 3 +
    (strong ? 6 : 0) +
    Math.min(founder.programs.length, 3) * 4 +
    (founder.company ? 2 : 0) +
    (founder.gradYear != null ? 1 : 0) +
    (founder.sector ? 1 : 0);
  return { tier, score };
}

export function sortFounders(founders: FounderLead[]): FounderLead[] {
  return [...founders].sort((a, b) => {
    const left = founderRank(a);
    const right = founderRank(b);
    if (left.tier !== right.tier) return left.tier - right.tier;
    if (left.score !== right.score) return right.score - left.score;
    return a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
  });
}

export function filterFounders(founders: FounderLead[], query: FounderQuery): FounderLead[] {
  return sortFounders(founders.filter((founder) => founderMatches(founder, query)));
}
