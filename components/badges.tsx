import { enrollmentBadge } from "@/lib/domain/founder-status";
import type { Queue } from "@/lib/domain/queue";
import { QUEUE_LABELS } from "@/lib/domain/queue";
import { primaryBlocker, type GateOutcome } from "@/lib/screening/gates";

// Dark-text-on-light-bg chip style, matching dormroomfund.com's own status
// pairs (e.g. their green-dark/green-light) rather than an opacity trick.
const QUEUE_CLASS: Record<Queue, string> = {
  top_prospects: "bg-ok-bg text-ok border-ok/20",
  exploration: "bg-accent-2/20 text-link border-accent-2/40",
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

const ENROLLMENT_CLASS: Record<string, string> = {
  current_student: "bg-ok-bg text-ok border-ok/30",
  recent_grad: "bg-warn-bg text-warn border-warn/30",
  older_alumni: "bg-danger-bg text-danger border-danger/20",
  unknown: "bg-surface text-muted border-border-c",
};

export function EnrollmentBadge({
  status,
  label,
  evidence,
}: {
  status: string | null | undefined;
  label?: string | null;
  evidence?: string | null;
}) {
  const key = status && status in ENROLLMENT_CLASS ? status : "unknown";
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${ENROLLMENT_CLASS[key]}`}
      title={evidence ?? undefined}
    >
      {enrollmentBadge(status, label)}
    </span>
  );
}

export function AffiliationStatusBadge({ status }: { status: string }) {
  const label: Record<string, string> = {
    current_student: "Current student",
    recent_grad: "Recent grad",
    older_alumni: "Older alumni",
    unverified: "Unverified",
  };
  return <span className="text-xs text-muted">{label[status] ?? status}</span>;
}
