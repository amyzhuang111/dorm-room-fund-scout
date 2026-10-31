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
  /** Stored person_project_roles.role for the linked company, when present. */
  role: string | null;
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
  return whyWorthALookCandidates(founder)[0] ?? null;
}

function isYcReason(label: string): boolean {
  return /y\s*combinator/i.test(label);
}

/** Ordered real-data leads for a founder (strong signals, then programs with YC last, then weak). */
export function whyWorthALookCandidates(founder: FounderLead): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  function push(label: string | null | undefined) {
    const text = label?.trim();
    if (!text || seen.has(text)) return;
    seen.add(text);
    out.push(text);
  }
  // Keep why off fields already on the card (campus, company, sector, year, role).
  const STRONG = new Set(["funding", "launch", "accelerator", "award"]);
  const strong = [...founder.signalTypes.filter((t) => STRONG.has(t))].sort(
    (a, b) => ({ funding: 0, launch: 1, accelerator: 2, award: 3 }[a] ?? 50) - ({ funding: 0, launch: 1, accelerator: 2, award: 3 }[b] ?? 50) || a.localeCompare(b),
  );
  if (strong.length >= 2) {
    push(`${signalTypeLabel(strong[0])} and ${signalTypeLabel(strong[1]).toLowerCase()} on record`);
  }
  for (const t of strong) {
    push(`${signalTypeLabel(t)} on record`);
  }
  // Named programs are the specific desk facts (diversifier may skip a repeated YC).
  const programs = [...founder.programs].sort((a, b) => Number(isYcReason(b)) - Number(isYcReason(a)) || a.localeCompare(b));
  for (const name of programs) push(name);
  const WEAK_RANK: Record<string, number> = {
    affiliation_change: 0,
    continued_dev: 1,
    demo: 2,
  };
  for (const t of [...founder.signalTypes]
    .filter((x) => !STRONG.has(x))
    .sort((a, b) => (WEAK_RANK[a] ?? 50) - (WEAK_RANK[b] ?? 50) || a.localeCompare(b))) {
    push(`${signalTypeLabel(t)} on record`);
  }
  return out;
}

/**
 * Assign why-lines across a visible page: no repeated YC reason, no repeated
 * company+reason pair. Prefer unused candidates; blank rather than duplicate YC.
 */
export function assignWhyWorthALook(founders: readonly FounderLead[]): Map<string, string | null> {
  const usedReasons = new Set<string>();
  const usedPairs = new Set<string>();
  const assigned = new Map<string, string | null>();
  for (const founder of founders) {
    const pairKey = (reason: string) => `${founder.companyId ?? founder.company ?? ""}|${reason}`;
    const cands = whyWorthALookCandidates(founder);
    let pick: string | null = null;
    for (const c of cands) {
      if (usedPairs.has(pairKey(c))) continue;
      if (isYcReason(c) && usedReasons.has(c)) continue;
      if (usedReasons.has(c) && cands.some((x) => !usedReasons.has(x) && !usedPairs.has(pairKey(x)) && !(isYcReason(x) && usedReasons.has(x)))) {
        continue;
      }
      pick = c;
      break;
    }
    if (!pick) {
      pick =
        cands.find((c) => !usedPairs.has(pairKey(c)) && !(isYcReason(c) && usedReasons.has(c))) ??
        null;
    }
    if (pick) {
      usedReasons.add(pick);
      usedPairs.add(pairKey(pick));
    }
    assigned.set(founder.id, pick);
  }
  return assigned;
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


/** Prefer different companies (and campuses) in the early window so the fold is not a single-startup clone stack. */
export function diversifyFounders(founders: FounderLead[], window = 24): FounderLead[] {
  if (founders.length <= 1) return founders;
  const picked: FounderLead[] = [];
  const rest = [...founders];
  const usedCompany = new Set<string>();
  const usedCampus = new Set<string>();
  while (rest.length && picked.length < window) {
    let idx = rest.findIndex((f) => {
      const company = (f.companyId || f.company || "").trim();
      const campus = (f.campusId || f.campus || "").trim();
      const companyOk = !company || !usedCompany.has(company);
      const campusOk = !campus || !usedCampus.has(campus) || usedCampus.size >= Math.min(8, window);
      return companyOk && campusOk;
    });
    if (idx < 0) {
      idx = rest.findIndex((f) => {
        const company = (f.companyId || f.company || "").trim();
        return !company || !usedCompany.has(company);
      });
    }
    if (idx < 0) idx = 0;
    const next = rest.splice(idx, 1)[0]!;
    picked.push(next);
    const company = (next.companyId || next.company || "").trim();
    const campus = (next.campusId || next.campus || "").trim();
    if (company) usedCompany.add(company);
    if (campus) usedCampus.add(campus);
  }
  return picked.concat(rest);
}

export function filterFounders(founders: FounderLead[], query: FounderQuery): FounderLead[] {
  return diversifyFounders(sortFounders(founders.filter((founder) => founderMatches(founder, query))));
}
