// Reddit / student-community signal — a SOURCE-RANKING input, never a
// Founder Signal, investment-score, eligibility, or company-traction input.
// "Reddit repeatedly points toward Penn Labs → increase priority for
// building a Penn Labs adapter" is correct. "Reddit says Penn Labs is good
// → a Penn Labs member gets +15 Founder Signal" is exactly the mistake this
// file exists to make structurally impossible: these fields are never read
// by lib/scoring/founder-signal.ts or lib/screening/gates.ts, only by the
// Sources page and campus playbooks.
//
// Community evidence is never mechanically scored from raw comment text —
// these fields preserve the evidence behind a human's source classification
// (who looked, what they found, how confident), not an automated tally.

export type CommunityConfidence = "high" | "medium" | "low" | "insufficient";

export const COMMUNITY_CONFIDENCE_MEANING: Record<CommunityConfidence, string> = {
  high: "Multiple independent campus-community discussions (different threads, different commenters) point toward the same organization.",
  medium: "One strong thread, or multiple weak/single mentions.",
  low: "A single anecdote · real, but not enough to act on alone.",
  insufficient: "No useful campus-specific discussion found. This is NOT negative evidence · absence of discussion is not evidence of absence of quality.",
};

// What a source/community characteristically looks like, per repeated
// community description — not a score, a set of descriptive tags a human
// applies after reading the actual discussion.
export type CommunitySignalCategory =
  | "BUILDER_DENSITY"
  | "FOUNDER_DENSITY"
  | "SELECTIVITY"
  | "PROJECT_QUALITY"
  | "STARTUP_ACTIVITY"
  | "COFOUNDER_NETWORK"
  | "ACTIVE_COMMUNITY"
  | "CONSULTING_HEAVY"
  | "NETWORKING_HEAVY"
  | "DOWNSTREAM"
  | "INACTIVE"
  | "UNKNOWN";

export const COMMUNITY_SIGNAL_CATEGORY_LABEL: Record<CommunitySignalCategory, string> = {
  BUILDER_DENSITY: "Builder density",
  FOUNDER_DENSITY: "Founder density",
  SELECTIVITY: "Selectivity",
  PROJECT_QUALITY: "Project quality",
  STARTUP_ACTIVITY: "Startup activity",
  COFOUNDER_NETWORK: "Cofounder network",
  ACTIVE_COMMUNITY: "Active community",
  CONSULTING_HEAVY: "Consulting-heavy",
  NETWORKING_HEAVY: "Networking-heavy",
  DOWNSTREAM: "Downstream",
  INACTIVE: "Inactive",
  UNKNOWN: "Unknown",
};

// Who's speaking matters: a club officer/employee is useful for factual
// operational detail (cohort size, selectivity numbers) but is NOT
// independent community validation of the source's quality — that
// distinction has to survive into any rationale text a human writes.
export type CommenterRelationship = "member" | "officer" | "alumni" | "student" | "unknown";

export interface CommunitySignal {
  categories: CommunitySignalCategory[];
  confidence: CommunityConfidence;
  mentionCount: number | null;
  independentMentions: number | null;
  positiveMentions: number | null;
  negativeMentions: number | null;
  rationale: string | null;
  lastCheckedAt: string | null;
}

export function parseCommunitySignalCategories(json: string | null | undefined): CommunitySignalCategory[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? (parsed as CommunitySignalCategory[]) : [];
  } catch {
    return [];
  }
}
