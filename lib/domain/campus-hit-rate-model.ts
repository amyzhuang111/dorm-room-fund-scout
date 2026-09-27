// Campus hit rate. For each class year, a founder's expected success is that
// year's share of good outcomes. The campus rate is observed good outcomes
// divided by that expectation, which is its share of good outcomes over its
// share of founders when everyone shares one year. Small campuses shrink
// toward 1.0 with a Gamma prior whose mean is 1.

export const HIT_RATE_SENTENCE =
  "Hit rate divides this campus's share of founders with a follow-on round, funding past pre-seed, or a YC, Thiel, or Speedrun spot by its share of tracked founders in the same class year, or by its share of all tracked founders when no class year is on record, and shrinks toward 1.0 when few founders are on record.";

export const MIN_FOUNDERS_FOR_HIT_RATE = 8;
/** A wider 95% interval is too loose to rank. Those campuses stay on the campus page, greyed out. */
export const MAX_HIT_RATE_INTERVAL = 1.25;

export type FundingStageKind = "preseed" | "grant" | "seed" | "later" | "unknown";

export interface HitObservation {
  id: string;
  year: number | null;
  good: boolean;
  campuses: string[];
}

export interface CampusHitRate {
  universityId: string;
  founders: number;
  good: number;
  hitRate: number;
  low: number;
  high: number;
  reliable: boolean;
  ids: string[];
  priorStrength: number;
}

export function fundingStageKind(stage: string | null | undefined): FundingStageKind {
  const text = (stage ?? "").toLowerCase().replace(/[_/]+/g, " ").replace(/\s+/g, " ").trim();
  if (!text) return "unknown";
  if (/pre[-\s]?seed/.test(text)) return "preseed";
  if (/\bgrant\b/.test(text)) return "grant";
  if (/series\s*[a-f]\b/.test(text) || /\bseries\s+[a-f]\b/.test(text)) return "later";
  if (/\bseed\b/.test(text)) return "seed";
  if (/\b(growth|late stage|late|priced round|venture round)\b/.test(text)) return "later";
  return "unknown";
}

/** A follow-on is two or more non-grant rounds. Seed or later is past pre-seed. */
export function fundingIsGoodOutcome(kinds: readonly FundingStageKind[]): boolean {
  const venture = kinds.filter((kind) => kind !== "grant");
  if (venture.length >= 2) return true;
  return venture.some((kind) => kind === "seed" || kind === "later");
}

function stratumKey(year: number | null): string {
  return year == null ? "*" : String(year);
}

/** Wilson–Hilferty chi-square approximation, as a Gamma(shape, rate) quantile. */
export function gammaQuantile(shape: number, rate: number, z: number): number {
  if (!(shape > 0) || !(rate > 0)) return 0;
  const width = 1 - 1 / (9 * shape) + z * Math.sqrt(1 / (9 * shape));
  if (width <= 0) return 0;
  return (shape * width * width * width) / rate;
}

export function estimatePriorStrength(rows: { observed: number; expected: number }[]): number {
  const usable = rows.filter((row) => row.expected >= 1);
  if (usable.length < 4) return 8;
  let excess = 0;
  for (const row of usable) {
    const ratio = row.observed / row.expected;
    excess += (ratio - 1) ** 2 - 1 / row.expected;
  }
  const variance = excess / usable.length;
  if (variance <= 0.02) return 20;
  return Math.min(20, Math.max(4, 1 / variance));
}

const Z95 = 1.959963984540054;

export function scoreHitRates(
  observations: readonly HitObservation[],
  options?: { minFounders?: number; priorStrength?: number }
): CampusHitRate[] {
  const minFounders = options?.minFounders ?? MIN_FOUNDERS_FOR_HIT_RATE;
  // A missing class year is not a cohort. Those founders use the overall
  // good-outcome rate. Grouping them together was comparing new campus scans
  // with older funded founders who simply have no graduation year on record.
  let totalGood = 0;
  const strata = new Map<string, { good: number; n: number }>();
  for (const row of observations) {
    if (row.good) totalGood += 1;
    if (row.year == null) continue;
    const key = stratumKey(row.year);
    const stratum = strata.get(key) ?? { good: 0, n: 0 };
    stratum.n += 1;
    if (row.good) stratum.good += 1;
    strata.set(key, stratum);
  }
  const globalRate = observations.length > 0 ? totalGood / observations.length : 0;
  const rateOf = (year: number | null) => {
    if (year == null) return globalRate;
    const stratum = strata.get(stratumKey(year));
    if (!stratum || stratum.n === 0) return globalRate;
    return stratum.good / stratum.n;
  };

  const byCampus = new Map<string, { observed: number; expected: number; founders: number; ids: string[] }>();
  for (const row of observations) {
    const expected = rateOf(row.year);
    for (const campusId of new Set(row.campuses)) {
      const campus = byCampus.get(campusId) ?? { observed: 0, expected: 0, founders: 0, ids: [campusId] };
      campus.founders += 1;
      campus.expected += expected;
      if (row.good) campus.observed += 1;
      campus.ids.push(row.id);
      byCampus.set(campusId, campus);
    }
  }

  const drafted = [...byCampus.entries()].map(([universityId, campus]) => ({ universityId, ...campus }));
  const prior = options?.priorStrength ?? estimatePriorStrength(drafted.map((row) => ({ observed: row.observed, expected: row.expected })));

  return drafted
    .map((campus) => {
      const shape = prior + campus.observed;
      const rate = prior + campus.expected;
      const hitRate = rate > 0 ? shape / rate : 1;
      return {
        universityId: campus.universityId,
        founders: campus.founders,
        good: campus.observed,
        hitRate,
        low: gammaQuantile(shape, rate, -Z95),
        high: gammaQuantile(shape, rate, Z95),
        reliable:
          campus.founders >= minFounders &&
          gammaQuantile(shape, rate, Z95) - gammaQuantile(shape, rate, -Z95) <= MAX_HIT_RATE_INTERVAL,
        ids: campus.ids,
        priorStrength: prior,
      };
    })
    .sort((a, b) => Number(b.reliable) - Number(a.reliable) || b.hitRate - a.hitRate || b.founders - a.founders || a.universityId.localeCompare(b.universityId));
}

export function formatHitRate(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
