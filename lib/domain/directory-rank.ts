import { canonicalizeTag } from "@/lib/display/canonical-tag";
/** Stored fields the company list is allowed to rank on. No database access. */
export interface RankCard {
  signals: number;
  signalKind: "funding" | "launch" | "award" | "acquisition" | null;
  signalLabel: "Funding" | "Launch" | "Award" | "Acquisition" | null;
  founders: string[];
  programs: string[];
  stage: string | null;
  operatingStatus: "acquired" | "dead" | null;
  school: string | null;
  schoolId: string | null;
  /** Optional identity for specific Why-it-here lines (DirectoryCard). */
  foundedYear?: number | null;
  /** Year for Why-it-here when foundedYear is missing (signal/news date). Not shown as "founded". */
  activityYear?: number | null;
  primaryProgram?: string | null;
}

const SIGNAL_STRENGTH: Record<string, number> = {
  acquisition: 8,
  funding: 6,
  launch: 4,
  award: 2,
};

const STAGE_TRACTION: Record<string, number> = {
  "Pre-seed": 2,
  Seed: 4,
  "Series A": 6,
  "Series B": 8,
  "Series C": 10,
  Venture: 5,
};

function programLabel(name: string): string {
  return canonicalizeTag(name).chip ?? name.trim();
}

/** A funding, launch, or acquisition signal. One award or unlabeled signal is weak. */
function signalIsStrong(card: RankCard): boolean {
  return (SIGNAL_STRENGTH[card.signalKind ?? ""] ?? 0) >= 4;
}

/**
 * Transparent rank from stored fields only.
 * Tier 0 can lead: a campus, and more than one signal or one strong signal.
 * A single weak signal stays in tier 1. No campus stays in tier 2.
 * Score adds signal count, signal kind, founder count, programs, and stage.
 */
export function directoryRank(card: RankCard): { tier: number; score: number } {
  const signals = Math.max(0, card.signals);
  const founders = card.founders.filter((name) => name.trim()).length;
  const programs = [...new Set(card.programs.map(programLabel).filter(Boolean))];
  const strength = signals > 0 || card.signalLabel ? SIGNAL_STRENGTH[card.signalKind ?? ""] ?? 0 : 0;
  const stage = card.stage ? STAGE_TRACTION[card.stage] ?? 1 : 0;
  const acquired = card.operatingStatus === "acquired" ? 3 : 0;
  const score = signals * 3 + strength + Math.min(founders, 5) * 2 + Math.min(programs.length, 3) * 4 + stage + acquired;
  const hasCampus = Boolean(card.schoolId || card.school?.trim());
  const oneWeakSignal = signals <= 1 && !signalIsStrong(card);
  const tier = !hasCampus ? 2 : oneWeakSignal ? 1 : 0;
  return { tier, score };
}

/**
 * Lead reasons for rank - signal weight + programs + stage status.
 * Omits school and founder counts already shown on the card identity/facts lines.
 * Blank when there is nothing beyond "no signals".
 */
export function whyItsHere(card: RankCard): string | null {
  // Prefer program / signal weight; fall back to campus + year so thin rows keep real substance (73a desk parity).
  const signals = Math.max(0, card.signals);
  const kind = card.signalLabel ? card.signalLabel.toLowerCase() : "";
  const campus =
    card.school?.replace(/^University of (?:California, )?/, "").replace(/ University$/, "").trim() || null;
  const program = card.primaryProgram?.trim() || null;
  const programs = [...new Set(card.programs.map(programLabel).filter(Boolean))];
  const yc = programs.find((name) => /y\s*combinator/i.test(name)) || null;
  const year =
    card.foundedYear != null
      ? String(card.foundedYear)
      : card.activityYear != null
        ? String(card.activityYear)
        : null;

  if (card.operatingStatus === "acquired") {
    return campus ? `Acquired · ${campus}` : "Acquired";
  }
  if (signals > 1) {
    const latest = kind ? `, latest ${kind}` : "";
    const place = yc
      ? ` · ${yc}`
      : program && program !== card.signalLabel
        ? ` · ${program}`
        : campus
          ? ` · ${campus}`
          : "";
    return `${signals} signals${latest}${place}`;
  }
  if (signals === 1) {
    const bits = [kind ? `1 ${kind} signal` : "1 signal"];
    if (yc) bits.push(yc);
    else if (program) bits.push(program);
    else if (campus) bits.push(campus);
    if (year && !bits.includes(year)) bits.push(year);
    return bits.join(" · ");
  }
  const bits: string[] = [];
  if (yc) bits.push(yc);
  else if (program) bits.push(program);
  if (campus && !bits.includes(campus)) bits.push(campus);
  if (year && !bits.includes(year)) bits.push(year);
  if (card.stage && !bits.includes(card.stage)) bits.push(card.stage);
  if (!bits.length) return null;
  // Single bare stage with no other identity is too thin / repeats facts line.
  if (bits.length === 1 && bits[0] === card.stage && !yc && !program && !campus) return null;
  return bits.join(" · ");
}
