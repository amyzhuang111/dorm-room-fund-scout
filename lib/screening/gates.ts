import { SCREENING_CONFIG } from "./config";

export type GateResult = "pass" | "needs_verification" | "outside_current_brief";

export interface GateOutcome {
  gate: string;
  result: GateResult;
  rationale: string;
}

export type AffiliationStatus = "current_student" | "recent_grad" | "older_alumni" | "unverified";

export interface FundingFact {
  amount: number | null; // null = amount unknown, NOT zero
  instrument: "equity" | "safe" | "grant" | "debt" | "unknown";
  eventDate: string | null;
}

export interface ProjectFacts {
  affiliationStatus: AffiliationStatus;
  affiliationEvidenceDated: boolean; // false if the only evidence is an old/undated bio
  selfReportedStage: string | null; // e.g. "pre-seed" as claimed by the company itself
  verifiedStage: string | null; // stage corroborated by an independent source (round report, program cohort, etc.)
  fundingEvents: FundingFact[]; // distinct events; caller must have already deduped
  businessModelTags: string[]; // e.g. "molecule_level_biotech", "cpg_brand", "software_for_cpg", ...
  isConfirmedPortfolioMember: boolean;
  fundingAvailability: "open" | "planned" | "closed" | "unknown";
}

function sumKnownFunding(events: FundingFact[]): { total: number; hasUnknown: boolean } {
  let total = 0;
  let hasUnknown = false;
  for (const e of events) {
    if (e.amount == null) hasUnknown = true;
    else total += e.amount;
  }
  return { total, hasUnknown };
}

export function evaluateAffiliationGate(facts: ProjectFacts): GateOutcome {
  if (facts.affiliationStatus === "current_student" || facts.affiliationStatus === "recent_grad") {
    if (!facts.affiliationEvidenceDated) {
      return {
        gate: "affiliation",
        result: "needs_verification",
        rationale:
          "Enrollment/graduation claim exists but isn't dated · an old biography is not proof of current status. Needs a dated source.",
      };
    }
    return {
      gate: "affiliation",
      result: "pass",
      rationale: `Dated evidence supports ${facts.affiliationStatus.replace("_", " ")}, within the brief's ${SCREENING_CONFIG.studentRecencyYears.value}-year guidance.`,
    };
  }
  if (facts.affiliationStatus === "older_alumni") {
    return {
      gate: "affiliation",
      result: "needs_verification",
      rationale:
        "Affiliation evidence points to alumni status beyond the brief's typical recency window. Confirm before excluding.",
    };
  }
  return {
    gate: "affiliation",
    result: "needs_verification",
    rationale: "No dated affiliation evidence yet. Unknown is not the same as ineligible · route to research.",
  };
}

export function evaluateStageGate(facts: ProjectFacts): GateOutcome {
  const allowed = SCREENING_CONFIG.stageAllowed.value;
  if (!facts.verifiedStage) {
    return {
      gate: "stage",
      result: "needs_verification",
      rationale: facts.selfReportedStage
        ? `Only a self-reported stage ("${facts.selfReportedStage}") exists · a self-selected pre-seed label alone is insufficient. Needs independent corroboration (round report, program record, or founder-disclosed detail with a date).`
        : "No stage evidence yet.",
    };
  }
  if (allowed.includes(facts.verifiedStage)) {
    return { gate: "stage", result: "pass", rationale: `Verified stage "${facts.verifiedStage}" matches the current sourcing brief (${allowed.join(", ")}).` };
  }
  return {
    gate: "stage",
    result: "outside_current_brief",
    rationale: `Verified stage "${facts.verifiedStage}" is past the current pre-seed-only brief.`,
  };
}

export function evaluatePriorFundingGate(facts: ProjectFacts): GateOutcome {
  const trigger = SCREENING_CONFIG.priorFundingReviewTriggerUsd.value;
  const { total, hasUnknown } = sumKnownFunding(facts.fundingEvents);
  if (facts.fundingEvents.length === 0) {
    return {
      gate: "prior_funding",
      result: "needs_verification",
      rationale: "No funding events on record. No announcement found does not mean zero funding · treat as unknown, not cleared.",
    };
  }
  if (hasUnknown) {
    return {
      gate: "prior_funding",
      result: "needs_verification",
      rationale: `At least one funding event has an undisclosed amount. Known total so far is $${total.toLocaleString("en-US")}, which is a floor, not the real total.`,
    };
  }
  if (total >= trigger) {
    return {
      gate: "prior_funding",
      result: "outside_current_brief",
      rationale: `Known prior funding ($${total.toLocaleString("en-US")}) is at or above the $${trigger.toLocaleString("en-US")} review trigger (internal sourcing guidance, not a published hard cap).`,
    };
  }
  return {
    gate: "prior_funding",
    result: "pass",
    rationale: `Known prior funding ($${total.toLocaleString("en-US")}) is below the $${trigger.toLocaleString("en-US")} review trigger.`,
  };
}

export function evaluateBusinessModelGate(facts: ProjectFacts): GateOutcome {
  const tags = facts.businessModelTags;
  if (tags.includes("molecule_level_biotech")) {
    return {
      gate: "business_model",
      result: "outside_current_brief",
      rationale: "Tagged as molecule-level biotech, which the current sourcing brief avoids.",
    };
  }
  if (tags.includes("cpg_brand") && !tags.includes("software_for_cpg")) {
    return {
      gate: "business_model",
      result: "outside_current_brief",
      rationale: "Tagged as a CPG brand itself (not software sold to CPG brands), which the brief deprioritizes by default. Reviewable exception path applies.",
    };
  }
  if (tags.length === 0) {
    return {
      gate: "business_model",
      result: "needs_verification",
      rationale: "Business model/sector not yet tagged from evidence.",
    };
  }
  return { gate: "business_model", result: "pass", rationale: `Business model tags (${tags.join(", ")}) don't trigger a sector exclusion.` };
}

export function evaluatePortfolioRelationshipGate(facts: ProjectFacts): GateOutcome {
  if (facts.isConfirmedPortfolioMember) {
    return {
      gate: "portfolio_relationship",
      result: "outside_current_brief",
      rationale: "Matched to an existing portfolio entry by name, alias, or domain. Kept as a reference and left out of new targets.",
    };
  }
  return { gate: "portfolio_relationship", result: "pass", rationale: "No confirmed match to a portfolio directory." };
}

export function evaluateFundingAvailabilityGate(facts: ProjectFacts): GateOutcome {
  if (facts.fundingAvailability === "unknown") {
    return {
      gate: "funding_availability",
      result: "needs_verification",
      rationale: "Round-open status unknown. Unknown can still justify a meeting but not an investment-ready label.",
    };
  }
  if (facts.fundingAvailability === "closed") {
    return { gate: "funding_availability", result: "needs_verification", rationale: "Round reported closed · confirm before treating as actionable." };
  }
  return { gate: "funding_availability", result: "pass", rationale: `Funding availability: ${facts.fundingAvailability}.` };
}

export function evaluateAllGates(facts: ProjectFacts): GateOutcome[] {
  return [
    evaluateAffiliationGate(facts),
    evaluateStageGate(facts),
    evaluatePriorFundingGate(facts),
    evaluateBusinessModelGate(facts),
    evaluatePortfolioRelationshipGate(facts),
    evaluateFundingAvailabilityGate(facts),
  ];
}

export function overallGateStatus(outcomes: GateOutcome[]): GateResult {
  if (outcomes.some((o) => o.result === "outside_current_brief")) return "outside_current_brief";
  if (outcomes.some((o) => o.result === "needs_verification")) return "needs_verification";
  return "pass";
}

const BLOCKER_LABEL: Record<string, string> = {
  affiliation: "Confirm student status",
  stage: "Confirm stage",
  prior_funding: "Confirm funding",
  business_model: "Confirm company",
  portfolio_relationship: "Confirm portfolio status",
  funding_availability: "Confirm funding",
};

// A specific, named blocker instead of a generic "Needs research" — checked
// in a fixed priority order (identity/eligibility first, since there's no
// point confirming stage for someone who isn't even a student).
const BLOCKER_PRIORITY = ["affiliation", "stage", "prior_funding", "business_model", "funding_availability", "portfolio_relationship"];

export function primaryBlocker(outcomes: GateOutcome[]): string | null {
  const unresolved = outcomes.filter((o) => o.result !== "pass");
  if (unresolved.length === 0) return null;
  unresolved.sort((a, b) => BLOCKER_PRIORITY.indexOf(a.gate) - BLOCKER_PRIORITY.indexOf(b.gate));
  return BLOCKER_LABEL[unresolved[0].gate] ?? "Needs research";
}
