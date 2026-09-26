// Founder-signal tiers from the scouting playbook. S is the strongest.
// Null means no playbook rule applied. The tier is a label on the record,
// not an input to Founder Signal or eligibility.

export const SIGNAL_TIERS = ["S", "A", "B", "C", "D", "talent"] as const;
export type SignalTier = (typeof SIGNAL_TIERS)[number];

export function isSignalTier(value: string | null | undefined): value is SignalTier {
  return SIGNAL_TIERS.includes(value as SignalTier);
}

/** Lower is stronger. Talent sorts after D. Unset tiers sort last. */
export function signalTierRank(tier: string | null | undefined): number {
  const index = SIGNAL_TIERS.indexOf(tier as SignalTier);
  return index === -1 ? SIGNAL_TIERS.length : index;
}

export function preferSignalTier(current: string | null | undefined, incoming: string | null | undefined): string | null {
  const next = isSignalTier(incoming) ? incoming : null;
  const prev = isSignalTier(current) ? current : null;
  if (!next) return prev;
  if (!prev) return next;
  return signalTierRank(next) < signalTierRank(prev) ? next : prev;
}
