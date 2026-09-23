import type { GateResult } from "../screening/gates";

export type Queue = "top_prospects" | "exploration" | "watch" | "reference_outside_brief";

// Display labels only — the underlying Queue values/IDs are unchanged so
// stored history and links keep working (UIUX_UPGRADE_CLAUDE.md §11: "map
// to existing queue IDs without destroying history").
export const QUEUE_LABELS: Record<Queue, string> = {
  top_prospects: "Ready to review",
  exploration: "Needs research",
  watch: "Watching",
  reference_outside_brief: "Outside brief",
};

export interface QueueInputs {
  isPortfolioReference: boolean;
  overallGate: GateResult | null; // null = not yet screened
  hasHeadlineScore: boolean; // rubric coverage threshold met
  hasWatchMilestone: boolean; // an explicit revisit date/milestone is on record
}

export function assignQueue(input: QueueInputs): Queue {
  if (input.isPortfolioReference || input.overallGate === "outside_current_brief") {
    return "reference_outside_brief";
  }
  if (input.overallGate === "pass" && input.hasHeadlineScore) {
    return "top_prospects";
  }
  if (input.hasWatchMilestone) {
    return "watch";
  }
  return "exploration";
}
