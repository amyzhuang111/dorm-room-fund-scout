// Deterministic quality-rubric calculator. Scores are computed here, never by
// an LLM — an LLM (if configured) may only PROPOSE ratings/rationale from cited
// evidence; this module does the arithmetic and enforces the coverage rule.

import { SCREENING_CONFIG } from "../screening/config";

export const RUBRIC_VERSION = "2026-09-18.v1";

export type Rating = 0 | 1 | 2 | 3 | 4 | 5 | null;

export const RUBRIC_DIMENSIONS = [
  { key: "ability_to_build", label: "Ability to build", weight: 20 },
  { key: "domain_knowledge_access", label: "Domain knowledge and access", weight: 15 },
  { key: "entrepreneurial_execution", label: "Entrepreneurial execution", weight: 10 },
  { key: "differentiated_insight", label: "Differentiated insight", weight: 15 },
  { key: "customer_pain_market", label: "Customer pain and market potential", weight: 20 },
  { key: "learning_validation", label: "Learning and validation", weight: 10 },
  { key: "next_milestone_financing", label: "Next milestone and financing feasibility", weight: 10 },
] as const;

export type DimensionKey = (typeof RUBRIC_DIMENSIONS)[number]["key"];

export type Ratings = Partial<Record<DimensionKey, Rating>>;

export interface RubricResult {
  coverage: number; // 0..1, share of total weight assessed
  qualityScore: number | null; // 0..100, null unless headline-score gate is met
  assessedDimensions: DimensionKey[];
  missingDimensions: DimensionKey[];
  strongestSignal: { key: DimensionKey; rating: number } | null;
  openQuestion: string;
}

const WEIGHT_BY_KEY: Record<DimensionKey, number> = RUBRIC_DIMENSIONS.reduce(
  (acc, d) => ({ ...acc, [d.key]: d.weight }),
  {} as Record<DimensionKey, number>
);

const REQUIRED_FOR_HEADLINE = new Set(
  SCREENING_CONFIG.requiredDimensionsForHeadlineScore.value as DimensionKey[]
);
const COVERAGE_THRESHOLD = SCREENING_CONFIG.coverageThresholdForHeadlineScore.value;

export function computeRubric(ratings: Ratings): RubricResult {
  const assessed: DimensionKey[] = [];
  const missing: DimensionKey[] = [];
  let weightedSum = 0;
  let assessedWeight = 0;

  for (const dim of RUBRIC_DIMENSIONS) {
    const r = ratings[dim.key];
    if (r === null || r === undefined) {
      missing.push(dim.key);
      continue;
    }
    assessed.push(dim.key);
    assessedWeight += dim.weight;
    weightedSum += dim.weight * (r / 5);
  }

  const coverage = assessedWeight / 100;
  const rawScore = assessedWeight > 0 ? (100 * weightedSum) / assessedWeight : null;

  const hasRequiredDimensions = [...REQUIRED_FOR_HEADLINE].every((k) => assessed.includes(k));
  const qualityScore = coverage >= COVERAGE_THRESHOLD && hasRequiredDimensions ? rawScore : null;

  let strongestSignal: { key: DimensionKey; rating: number } | null = null;
  for (const dim of RUBRIC_DIMENSIONS) {
    const r = ratings[dim.key];
    if (typeof r === "number" && (strongestSignal === null || r > strongestSignal.rating)) {
      strongestSignal = { key: dim.key, rating: r };
    }
  }

  const openQuestion = missing.length
    ? `Still unassessed: ${missing.map((k) => RUBRIC_DIMENSIONS.find((d) => d.key === k)!.label).join(", ")}.`
    : "All dimensions assessed.";

  return {
    coverage,
    qualityScore: qualityScore == null ? null : Math.round(qualityScore * 10) / 10,
    assessedDimensions: assessed,
    missingDimensions: missing,
    strongestSignal,
    openQuestion,
  };
}

export function weightOf(key: DimensionKey): number {
  return WEIGHT_BY_KEY[key];
}
