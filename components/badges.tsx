import type { Queue } from "@/lib/domain/queue";
import { QUEUE_LABELS } from "@/lib/domain/queue";
import { primaryBlocker, type GateOutcome } from "@/lib/screening/gates";

// Dark-text-on-light-bg chip style, matching dormroomfund.com's own status
// pairs (e.g. their green-dark/green-light) rather than an opacity trick.
const QUEUE_CLASS: Record<Queue, string> = {
  top_prospects: "bg-ok-bg text-ok border-ok/20",
  exploration: "bg-accent/10 text-accent border-accent/25",
  watch: "bg-warn-bg text-warn border-warn/20",
  reference_outside_brief: "bg-surface-2 text-muted border-border-c",
};

export function QueueBadge({ queue }: { queue: Queue }) {
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${QUEUE_CLASS[queue]}`}>
      {QUEUE_LABELS[queue]}
    </span>
  );
}

const GATE_CLASS: Record<string, string> = {
  pass: "bg-ok-bg text-ok border-ok/20",
  needs_verification: "bg-warn-bg text-warn border-warn/20",
  outside_current_brief: "bg-danger-bg text-danger border-danger/20",
};

const GATE_LABEL: Record<string, string> = {
  pass: "Fits brief",
  needs_verification: "Needs research",
  outside_current_brief: "Outside brief",
};

// `gateOutcomes` is optional so existing call sites that only have the
// aggregate result keep working; pass it when available to show a specific
// named blocker ("Confirm stage") instead of a generic "Needs research".
export function GateBadge({ result, gateOutcomes }: { result: string | null; gateOutcomes?: GateOutcome[] }) {
  if (!result) return <span className="text-xs text-muted">Not screened</span>;
  const specific = result === "needs_verification" && gateOutcomes ? primaryBlocker(gateOutcomes) : null;
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${GATE_CLASS[result] ?? ""}`}>
      {specific ?? GATE_LABEL[result] ?? result}
    </span>
  );
}

const TIER_CLASS: Record<string, string> = {
  S: "bg-accent text-accent-foreground border-accent",
  A: "bg-ok-bg text-ok border-ok/20",
  B: "bg-warn-bg text-warn border-warn/20",
  C: "bg-surface-2 text-muted border-border-c",
  D: "bg-surface-2 text-muted border-border-c",
};

export function TierBadge({ tier, label }: { tier: string | null; label: string }) {
  if (!tier) return <span className="text-xs text-muted">{label}: —</span>;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${TIER_CLASS[tier] ?? ""}`}>
      {label}: {tier}
    </span>
  );
}

const COMMUNITY_CONFIDENCE_CLASS: Record<string, string> = {
  high: "bg-ok-bg text-ok border-ok/20",
  medium: "bg-warn-bg text-warn border-warn/20",
  low: "bg-surface-2 text-muted border-border-c",
  insufficient: "bg-surface-2 text-muted border-border-c",
};

export function CommunityConfidenceBadge({ confidence }: { confidence: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium uppercase ${COMMUNITY_CONFIDENCE_CLASS[confidence] ?? ""}`}>
      {confidence}
    </span>
  );
}

// Softer wording + a real explanation on hover, never a status this data
// hasn't earned — "unverified" here means exactly what it always has
// (e.g. a hackathon roster or Devpost submission has no school field, so
// it can't by itself confirm current enrollment). Styling it as a plain
// neutral pill with a tooltip replaces the bare, slightly alarming-looking
// gray "Unverified" text with something calmer, without ever claiming a
// confidence level the underlying data doesn't actually have.
const AFFILIATION_STATUS_CLASS: Record<string, string> = {
  current_student: "bg-ok-bg text-ok border-ok/20",
  recent_grad: "bg-ok-bg text-ok border-ok/20",
  older_alumni: "bg-surface-2 text-muted border-border-c",
  unverified: "bg-surface-2 text-muted border-border-c",
};

const AFFILIATION_STATUS_LABEL: Record<string, string> = {
  current_student: "Current student",
  recent_grad: "Recent grad",
  older_alumni: "Alumni",
  unverified: "Unconfirmed",
};

const AFFILIATION_STATUS_TITLE: Record<string, string> = {
  current_student: "Enrollment status confirmed by the source (e.g. a program directory or class-year mention).",
  recent_grad: "Recently graduated, per the source.",
  older_alumni: "Alumni, per the source — not necessarily a current student.",
  unverified: "Real evidence ties this person to the university (e.g. a hackathon roster or campus-org listing), but that source alone can't confirm they're currently enrolled — not independently checked yet.",
};

export function AffiliationStatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[11px] font-medium ${AFFILIATION_STATUS_CLASS[status] ?? "bg-surface-2 text-muted border-border-c"}`}
      title={AFFILIATION_STATUS_TITLE[status] ?? "Affiliation status as recorded by the source."}
    >
      {AFFILIATION_STATUS_LABEL[status] ?? status}
    </span>
  );
}
