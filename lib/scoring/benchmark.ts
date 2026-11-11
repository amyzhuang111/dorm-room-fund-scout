import { computeRubric, type Ratings } from './rubric';

// Display bands for the existing seven-factor rubric. These are product
// thresholds, not the program/investor signal tiers or eligibility gates.
export const BENCHMARK_VERSION = '2026-11-11.v1';
export const BENCHMARK_BANDS = [
  { tier: 'A', minimum: 80, label: 'Strong evidence' },
  { tier: 'B', minimum: 65, label: 'Promising evidence' },
  { tier: 'C', minimum: 50, label: 'Mixed evidence' },
  { tier: 'D', minimum: 0, label: 'Material concerns' },
] as const;

export function benchmark(ratings: Ratings) {
  const result = computeRubric(ratings);
  const band = result.qualityScore == null ? null : BENCHMARK_BANDS.find(b => result.qualityScore! >= b.minimum)!;
  return { ...result, tier: band?.tier ?? 'Unassessed', label: band?.label ?? 'More evidence needed' };
}
