// Founder Scout candidate promotion (FOUNDER_SCOUT_SOURCING.md §46-51, §92,
// §111-112). Most resolved people should stay cheap, unpromoted records —
// only evidence-backed candidates surface in Founder Scout Discover by
// default. Deterministic and evidence-based; no LLM, no name/prestige
// shortcuts. "Do not promote based only on club membership, hackathon
// attendance, or a lab directory listing" (§47) is enforced by requiring a
// role that isn't one of the generic placeholder labels below, a second
// distinct project, or a real company link.

export type PromotionReason = "company_founder" | "leadership_role" | "repeat_builder" | "named_technical_role";

export interface PromotionResult {
  promoted: boolean;
  reason: PromotionReason | null;
  reasonLabel: string | null;
}

// Roles that, by themselves, are not differentiated ownership evidence —
// either a generic hackathon-team-member label (see the devpost-hackathon.ts
// fix: Devpost's public team-member list never tells us who owned what) or a
// resolution-layer placeholder.
const GENERIC_ROLES = new Set(["team_member", "contributor", "unknown", "member", ""]);

const REASON_LABEL: Record<PromotionReason, string> = {
  company_founder: "Linked to a real (or plausibly forming) company as a founder.",
  leadership_role: "Held a named leadership/technical-lead role on a real project.",
  repeat_builder: "Appears with a real role on 2+ distinct projects — repeat building.",
  named_technical_role: "Held a specific, named technical role (not a generic team-member label) on a real project.",
};

function isLeadershipRole(role: string): boolean {
  const r = role.toLowerCase();
  return r.includes("team lead") || r.includes("director") || r.includes("technical lead") || r.includes("co-director");
}

export function evaluatePromotion(projects: { kind: string; role: string }[]): PromotionResult {
  if (projects.some((p) => p.kind === "company")) {
    return { promoted: true, reason: "company_founder", reasonLabel: REASON_LABEL.company_founder };
  }
  if (projects.some((p) => isLeadershipRole(p.role))) {
    return { promoted: true, reason: "leadership_role", reasonLabel: REASON_LABEL.leadership_role };
  }
  const distinctNonGeneric = projects.filter((p) => !GENERIC_ROLES.has(p.role.toLowerCase().trim()));
  if (distinctNonGeneric.length > 0) {
    return { promoted: true, reason: "named_technical_role", reasonLabel: REASON_LABEL.named_technical_role };
  }
  if (projects.length >= 2) {
    return { promoted: true, reason: "repeat_builder", reasonLabel: REASON_LABEL.repeat_builder };
  }
  return { promoted: false, reason: null, reasonLabel: null };
}
