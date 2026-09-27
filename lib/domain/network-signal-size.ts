import type { MapNodeType } from "./network-map";

const ACCELERATOR = /yc-funded|y combinator|\byc\b|techstars|speedrun|antler|entrepreneur first|\bincubator\b|\baccelerator\b/i;

export function mentionsAccelerator(text: string | null | undefined): boolean {
  return Boolean(text && ACCELERATOR.test(text));
}

/**
 * Confirmed startups count fully, partial ones at half. Unverified startups
 * do not count. Funded, accelerator-backed, and S/A or DRF-portfolio companies
 * weigh more.
 */
export function startupSignalWeight(input: {
  verification: string | null;
  funded: boolean;
  accelerator: boolean;
  strongTier: boolean;
}): number {
  const verified = input.verification === "confirmed" ? 1 : input.verification === "partial" ? 0.5 : 0;
  if (verified === 0) return 0;
  let boost = 1;
  if (input.funded) boost += 0.5;
  if (input.accelerator) boost += 0.5;
  if (input.strongTier) boost += 0.5;
  return verified * boost;
}

/** A strong founder is verified and either S/A or tied to a startup that itself counts. */
export function founderSignalWeight(input: { verification: string | null; tier: string | null; startupWeight: number }): number {
  const verified = input.verification === "confirmed" ? 1 : input.verification === "partial" ? 0.5 : 0;
  if (verified === 0) return 0;
  const strongTier = input.tier === "S" || input.tier === "A";
  if (!strongTier && input.startupWeight <= 0) return 0;
  return verified * (strongTier ? 1.5 : 1);
}

/** Sqrt, then divide by the group max, so a small elite ratio can fill the range. */
export function sqrtScores(ratios: number[]): number[] {
  const rooted = ratios.map((ratio) => Math.sqrt(Math.max(0, ratio)));
  const max = rooted.reduce((best, value) => Math.max(best, value), 0);
  if (max <= 0) return ratios.map(() => 0);
  return rooted.map((value) => value / max);
}

export interface SignalParts {
  count: number;
  weight: number;
  denominator: number;
  ratio: number;
  score: number;
}

export function connectionSignal(degree: number, cap: number): SignalParts {
  const count = Math.max(0, degree);
  return {
    count,
    weight: count,
    denominator: 1,
    ratio: count,
    score: Math.min(1, Math.sqrt(count) / Math.sqrt(Math.max(cap, 1))),
  };
}

export function signalFields(parts: SignalParts): {
  signalCount: number;
  signalWeight: number;
  signalDenominator: number;
  signalRatio: number;
  signalScore: number;
} {
  return {
    signalCount: parts.count,
    signalWeight: parts.weight,
    signalDenominator: parts.denominator,
    signalRatio: parts.ratio,
    signalScore: parts.score,
  };
}

export function perCapitaSignal(count: number, weight: number, denominator: number, score: number): SignalParts {
  const den = Math.max(1, denominator);
  return { count, weight, denominator: den, ratio: weight / den, score };
}

function formatCount(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function formatRatio(value: number): string {
  if (!Number.isFinite(value) || value === 0) return "0";
  if (Number.isInteger(value)) return String(value);
  if (value >= 10) return value.toFixed(1);
  if (value >= 1) return value.toFixed(2);
  if (value >= 0.1) return value.toFixed(3);
  return value.toFixed(4);
}

/** Hover line: raw count, denominator, and the ratio that sets the size. */
export function signalTooltip(node: { type: MapNodeType; signalCount?: number; signalWeight?: number; signalDenominator?: number; signalRatio?: number }): string {
  const count = node.signalCount ?? 0;
  const weight = node.signalWeight ?? count;
  const denominator = node.signalDenominator ?? 1;
  const ratio = node.signalRatio ?? 0;
  if (node.type === "person" || node.type === "startup") {
    return `${formatCount(count)} connections / ${formatCount(denominator)} · ratio ${formatRatio(ratio)}`;
  }
  const unit = node.type === "campus" ? "undergrads" : "members";
  const weighted = Math.abs(weight - count) > 0.05 ? ` (weight ${formatCount(weight)})` : "";
  return `${formatCount(count)} strong${weighted} / ${formatCount(denominator)} ${unit} · ratio ${formatRatio(ratio)}`;
}
