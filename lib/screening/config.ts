// DRF screening configuration. Every rule is tagged with where it came from:
// - public_policy: stated on DRF's own public FAQ (reviewed 2026-09-18)
// - user_guidance: internal sourcing guidance, not published DRF policy
// - proposed_setting: a product default we invented to make the screen runnable, not attributed to DRF
//
// Do not present user_guidance or proposed_setting values as DRF's official rules in the UI.

export type Provenance = "public_policy" | "user_guidance" | "proposed_setting";

export interface ScreeningConfigEntry<T> {
  key: string;
  value: T;
  provenance: Provenance;
  reason: string;
}

export const SCREENING_CONFIG = {
  studentRecencyYears: {
    key: "student_recency_years",
    value: 2,
    provenance: "public_policy",
    reason:
      "DRF's public FAQ (dormroomfund.com, reviewed 2026-09-18) says it backs students and recent graduates, generally within two years of graduation, with DRF-community exceptions.",
  } as ScreeningConfigEntry<number>,

  mvpRequired: {
    key: "mvp_required",
    value: false,
    provenance: "public_policy",
    reason: "DRF's public FAQ explicitly states an MVP is not required.",
  } as ScreeningConfigEntry<boolean>,

  priorFundingReviewTriggerUsd: {
    key: "prior_funding_review_trigger_usd",
    value: 2_000_000,
    provenance: "user_guidance",
    reason:
      "Internal sourcing guidance: usually pre-seed, before raising more than 'a couple million dollars.' This is a review trigger, not a confirmed DRF hard cap — the public FAQ does not state an exact figure.",
  } as ScreeningConfigEntry<number>,

  stageAllowed: {
    key: "stage_allowed",
    value: ["pre-seed"] as string[],
    provenance: "user_guidance",
    reason: "Internal sourcing guidance: pre-seed only for new targets.",
  } as ScreeningConfigEntry<string[]>,

  sectorExclusions: {
    key: "sector_exclusions",
    value: ["molecule_level_biotech", "cpg_brand"] as string[],
    provenance: "user_guidance",
    reason:
      "Internal sourcing guidance: avoid molecule-level hard biotech and most consumer packaged goods (as a brand, not as software sold to CPG brands). Not stated on DRF's public FAQ.",
  } as ScreeningConfigEntry<string[]>,

  sectorResearchInterests: {
    key: "sector_research_interests",
    value: ["ai_native", "robotics", "quantum", "data_rlhf_infra", "bio_selected"] as string[],
    provenance: "user_guidance",
    reason: "Internal sourcing guidance: research interests to weight discovery toward, not an eligibility filter.",
  } as ScreeningConfigEntry<string[]>,

  coverageThresholdForHeadlineScore: {
    key: "coverage_threshold_for_headline_score",
    value: 0.7,
    provenance: "proposed_setting",
    reason:
      "Proposed default so sparse profiles don't get a misleadingly precise number. Needs calibration; configurable in Settings.",
  } as ScreeningConfigEntry<number>,

  requiredDimensionsForHeadlineScore: {
    key: "required_dimensions_for_headline_score",
    value: ["ability_to_build", "domain_knowledge_access", "customer_pain_market"] as string[],
    provenance: "proposed_setting",
    reason:
      "Proposed default: a headline score requires at least these three dimensions assessed, in addition to the coverage threshold.",
  } as ScreeningConfigEntry<string[]>,
} as const;

export function allScreeningConfigEntries(): ScreeningConfigEntry<unknown>[] {
  return Object.values(SCREENING_CONFIG);
}
