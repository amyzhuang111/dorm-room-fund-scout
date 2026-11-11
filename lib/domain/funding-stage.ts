/** Shared, source-backed funding facets. Program membership never implies a round. */
export const FUNDING_STAGES = ['Pre-seed', 'Seed', 'Series A', 'Series B', 'Series C', 'Series D', 'Series E+','Venture','Accelerator','Pre-seed / student project'] as const;
export type FundingStage = typeof FUNDING_STAGES[number];
export const UNKNOWN_STAGE = 'unknown';

export function normalizeFundingStage(raw: string | null | undefined): FundingStage | null {
  const value = raw?.trim().toLowerCase().replace(/[–—_-]/g, ' ').replace(/\s+/g, ' ');
  if (!value) return null;
  if (value === 'preseed' || value === 'pre seed') return 'Pre-seed';
  if (value === 'pre seed / student project') return 'Pre-seed / student project';
  if (/^series [e-z]\+?$/.test(value)) return 'Series E+';
  return FUNDING_STAGES.find(stage => stage.toLowerCase() === value) ?? null;
}

export function stageFilter(raw: string | null | undefined): string {
  if (!raw?.trim()) return '';
  if (['unknown', 'missing', 'not_on_record'].includes(raw.trim().toLowerCase())) return UNKNOWN_STAGE;
  // Preserve invalid filters as non-matching instead of silently showing every company.
  return normalizeFundingStage(raw) ?? raw.trim();
}

export function fundingStageLabel(raw: string | null | undefined): string {
  const stage = normalizeFundingStage(raw);
  if (stage === 'Accelerator') return 'Accelerator · round unknown';
  if (stage === 'Pre-seed / student project') return 'Student project · round unverified';
  if (stage === 'Venture') return 'Venture · round unspecified';
  return stage ?? 'Stage unknown';
}

export function matchesFundingStage(recorded: string | null | undefined, selected: string | null | undefined): boolean {
  if (!selected) return true;
  const filter = stageFilter(selected), stage = normalizeFundingStage(recorded);
  return filter === UNKNOWN_STAGE ? stage === null : stage === filter;
}

export function fundingStageBuckets(companies: { stage?: string | null }[]) {
  const counts = new Map<string, number>();
  for (const company of companies) {
    const stage = normalizeFundingStage(company.stage) ?? UNKNOWN_STAGE;
    counts.set(stage, (counts.get(stage) ?? 0) + 1);
  }
  return [...FUNDING_STAGES, UNKNOWN_STAGE].map(id => ({ id, label: fundingStageLabel(id), count: counts.get(id) ?? 0 }));
}

const progression: Record<FundingStage, number> = { 'Pre-seed / student project':0, Accelerator:1, Venture:2, 'Pre-seed':3, Seed:4, 'Series A':5, 'Series B':6, 'Series C':7, 'Series D':8, 'Series E+':9 };
/** Highest documented round; generic program facts cannot overwrite a named round.
 * This is a recorded-stage facet, not an assertion that the source is current. */
export function preferredFundingStage(current: string | null | undefined, candidate: string | null | undefined): FundingStage | null {
  const a = normalizeFundingStage(current), b = normalizeFundingStage(candidate);
  if (!a) return b;
  if (!b) return a;
  return progression[b] > progression[a] ? b : a;
}

export function fundingStageSortRank(raw: string | null | undefined): number {
  const stage = normalizeFundingStage(raw);
  return stage ? FUNDING_STAGES.indexOf(stage) : FUNDING_STAGES.length;
}
