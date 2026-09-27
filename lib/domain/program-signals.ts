// Membership in a founder program or residency. Shown as a badge on the
// person. It is not an input to Founder Signal, eligibility, or investment
// score. confirmed means the official page names the person. likely means
// the page only supports a weaker link, such as a first name tied to a
// surname on a second page.

export const PROGRAM_SIGNAL_TYPES = [
  "founders_inc",
  "south_park_commons",
  "the_residency",
  "z_fellows",
  "emergent_ventures",
  "medici_1517",
  "contrary_venture_partners",
  "buildspace",
  "afore_fir_u",
  "pioneer",
  "kleiner_perkins_fellows",
] as const;
export type ProgramSignalType = (typeof PROGRAM_SIGNAL_TYPES)[number];
export type ProgramMatchStatus = "confirmed" | "likely";

export const PROGRAM_SIGNAL_LABEL: Record<ProgramSignalType, string> = {
  founders_inc: "Founders Inc",
  south_park_commons: "South Park Commons",
  the_residency: "The Residency",
  z_fellows: "Z Fellow",
  emergent_ventures: "Emergent Ventures",
  medici_1517: "1517 Medici",
  contrary_venture_partners: "Contrary Venture Partner",
  buildspace: "Buildspace",
  afore_fir_u: "Afore FIR U",
  pioneer: "Pioneer",
  kleiner_perkins_fellows: "Kleiner Perkins Fellow",
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
