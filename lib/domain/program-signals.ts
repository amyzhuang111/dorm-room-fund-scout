// Membership in a founder program (Founders Inc, South Park Commons).
// Shown as a badge on the person. It is not an input to Founder Signal,
// eligibility, or investment score. confirmed means the official page names
// the person. likely means the page only supports a weaker link, such as a
// first name tied to a surname on a second page.

export const PROGRAM_SIGNAL_TYPES = ["founders_inc", "south_park_commons"] as const;
export type ProgramSignalType = (typeof PROGRAM_SIGNAL_TYPES)[number];
export type ProgramMatchStatus = "confirmed" | "likely";

export const PROGRAM_SIGNAL_LABEL: Record<ProgramSignalType, string> = {
  founders_inc: "Founders Inc",
  south_park_commons: "South Park Commons",
};

export interface ProgramSignalView {
  signalType: ProgramSignalType;
  label: string;
  year: number | null;
  matchStatus: ProgramMatchStatus;
  sourceUrl: string;
}

export function isProgramSignalType(value: string): value is ProgramSignalType {
  return (PROGRAM_SIGNAL_TYPES as readonly string[]).includes(value);
}

export function isProgramMatchStatus(value: string): value is ProgramMatchStatus {
  return value === "confirmed" || value === "likely";
}

export function bestProgramSignals(signals: ProgramSignalView[]): ProgramSignalView[] {
  return [...signals].sort(
    (a, b) =>
      (a.matchStatus === b.matchStatus ? 0 : a.matchStatus === "confirmed" ? -1 : 1) ||
      (b.year ?? 0) - (a.year ?? 0) ||
      a.label.localeCompare(b.label)
  );
}
