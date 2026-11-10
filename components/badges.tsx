import { enrollmentPhrase, readPersonScope } from "@/lib/domain/claim-scope";
import type { PrecollegeSignalView } from "@/lib/domain/precollege";
import { bestPrecollegeSignals } from "@/lib/domain/precollege";
import type { ProgramSignalView } from "@/lib/domain/program-signals";
import { bestProgramSignals, membershipDirectory } from "@/lib/domain/program-signals";
import type { Queue } from "@/lib/domain/queue";
import { QUEUE_LABELS } from "@/lib/domain/queue";
import { primaryBlocker, type GateOutcome } from "@/lib/screening/gates";

// Dark-text-on-light-bg chip style, using solid status pairs rather than an opacity trick.
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
  Unranked: "tier-chip tier-none",
  "S+": "tier-chip tier-splus",
  S: "tier-chip tier-s",
  A: "tier-chip tier-a",
  B: "tier-chip tier-b",
  C: "tier-chip tier-c",
  D: "tier-chip tier-d",
  talent: "tier-chip tier-talent",
};

export function SameSchoolBadge() {
  return (
    <span
      className="inline-flex shrink-0 items-center rounded-full border border-border-c bg-white px-1.5 py-0.5 text-[10px] font-semibold leading-none text-foreground"
      title="Two or more co-founders attended the same campus in overlapping years."
    >
      Same school
    </span>
  );
}

export function SignalTierBadge({ tier, basis }: { tier: string | null | undefined; basis?: string | null }) {
  const label = tier && tier.trim() ? tier : "Unranked";
  return (
    <span
      className={`inline-flex shrink-0 items-center leading-none ${TIER_CLASS[label] ?? "tier-chip tier-none"}`}
      title={basis ? `Signal tier ${label}. ${basis}` : label === "Unranked" ? "No program, funding, or verified national-signal evidence on file." : `Signal tier ${label}`}
    >
      {label}
    </span>
  );
}

export function TierBadge({ tier, label }: { tier: string | null; label: string }) {
  if (!tier) return <span className="text-xs text-muted">{label}:  · </span>;
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

function TrophyIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" aria-hidden="true" className="shrink-0">
      <path
        fill="currentColor"
        d="M7 3h10v2h3a1 1 0 0 1 1 1v3a5 5 0 0 1-5 5h-.3A6 6 0 0 1 13 16.9V19h3v2H8v-2h3v-2.1A6 6 0 0 1 8.3 14H8a5 5 0 0 1-5-5V6a1 1 0 0 1 1-1h3V3zm0 4H5v2a3 3 0 0 0 2.8 3H8V7zm10 0v5h.2A3 3 0 0 0 19 9V7h-2z"
      />
    </svg>
  );
}

export function PrecollegeBadges({ signals }: { signals: PrecollegeSignalView[] | undefined }) {
  const ranked = bestPrecollegeSignals(signals ?? []);
  if (!ranked.length) return null;
  const shown = ranked.slice(0, 2);
  const extra = ranked.length - shown.length;
  return (
    <>
      {shown.map((signal) => {
        const likely = signal.matchStatus === "likely";
        const tip = `${signal.label}. ${likely ? "Likely match: full name only, school and class year were not both confirmed." : "Confirmed: full name, school, and class year agree."} ${signal.sourceUrl}`;
        const thiel = signal.signalType === "thiel_fellow";
        const chip = thiel
          ? likely
            ? "border-dashed border-foreground bg-white text-foreground"
            : "border-foreground bg-foreground text-white ring-2 ring-accent ring-offset-1"
          : likely
            ? "border-dashed border-foreground bg-white text-foreground"
            : "border-foreground bg-foreground text-white";
        return (
          <a
            key={`${signal.signalType}-${signal.year ?? "na"}-${signal.sourceUrl}`}
            href={signal.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            title={thiel ? `${tip} Tier S+.` : tip}
            className={`inline-flex shrink-0 items-center gap-1 rounded-full border py-0.5 leading-none ${thiel ? "px-2 text-[11px] font-bold" : "px-1.5 text-[10px] font-semibold"} ${chip}`}
          >
            <TrophyIcon />
            {signal.label}
            {thiel ? <span>S+</span> : null}
            {likely ? <span className="font-medium">likely</span> : null}
          </a>
        );
      })}
      {extra > 0 && <span className="text-[10px] font-medium text-muted">+{extra}</span>}
    </>
  );
}

function ProgramIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" aria-hidden="true" className="shrink-0">
      <path fill="currentColor" d="M12 3 3 8.2V11h18V8.2L12 3zm-7 9.5V21h5v-5h4v5h5v-8.5H5z" />
    </svg>
  );
}

const PROGRAM_TIER_CHIP: Record<string, string> = {
  "S+": "border-foreground bg-foreground text-white text-[12px] font-bold px-2 ring-2 ring-accent ring-offset-1",
  S: "border-accent bg-accent text-accent-foreground text-[11px] font-bold px-2",
  A: "border-ok/30 bg-ok-bg text-ok text-[10px] font-semibold px-1.5",
  B: "border-warn/30 bg-warn-bg text-warn text-[10px] font-medium px-1.5",
  C: "border-border-c bg-surface-2 text-muted text-[10px] font-medium px-1.5",
};

export function ProgramBadges({ signals }: { signals: ProgramSignalView[] | undefined }) {
  const ranked = bestProgramSignals(signals ?? []);
  if (!ranked.length) return null;
  const shown = ranked.slice(0, 2);
  const extra = ranked.length - shown.length;
  return (
    <>
      {shown.map((signal) => {
        const fallback = membershipDirectory(signal.signalType, signal.label);
        const tier = signal.tier || fallback.tier;
        const rationale = signal.tierRationale || fallback.rationale;
        const source = signal.tierSourceUrl || fallback.sourceUrl;
        const likely = signal.matchStatus === "likely";
        const tip = `${signal.label}. Tier ${tier}. ${rationale} Source: ${source}`;
        return (
          <a
            key={`${signal.signalType}-${signal.year ?? "na"}-${signal.sourceUrl}`}
            href={signal.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            title={tip}
            className={`inline-flex shrink-0 items-center gap-1 rounded-full border py-0.5 leading-none ${PROGRAM_TIER_CHIP[tier] ?? PROGRAM_TIER_CHIP.C} ${
              likely ? "border-dashed bg-white text-foreground" : ""
            }`}
          >
            <ProgramIcon />
            {signal.label}
            <span>{tier}</span>
            {likely ? <span className="font-medium">likely</span> : null}
          </a>
        );
      })}
      {extra > 0 && <span className="text-[10px] font-medium text-muted">+{extra}</span>}
    </>
  );
}

export function PotentialFounderBadge() {
  return (
    <span className="inline-flex shrink-0 items-center rounded-full border border-border-c bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-muted">
      Potential founder
    </span>
  );
}

const VERIFICATION_CLASS: Record<string, string> = {
  confirmed: "bg-ok-bg text-ok border-ok/20",
  partial: "bg-warn-bg text-warn border-warn/20",
  unverified: "bg-surface-2 text-muted border-border-c",
};

const VERIFICATION_LABEL: Record<string, string> = {
  confirmed: "Verified",
  partial: "Partly verified",
  unverified: "Unverified",
};

export function VerificationBadge({
  status,
  verifiedAt,
  note,
  scope,
}: {
  status?: string | null;
  verifiedAt?: string | null;
  note?: string | null;
  scope?: "company" | "record";
}) {
  if (!status) return null;
  const when = verifiedAt ? verifiedAt.slice(0, 10) : "";
  const label = scope === "company" && status === "confirmed" ? "Company verified" : (VERIFICATION_LABEL[status] ?? status);
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${VERIFICATION_CLASS[status] ?? "bg-surface-2 text-muted border-border-c"}`}
      title={[note, when ? `Checked ${when}` : ""].filter(Boolean).join(" ")}
    >
      {label}
      {when ? ` ${when}` : ""}
    </span>
  );
}

export function UnverifiedBadge() {
  return (
    <span
      className="inline-flex shrink-0 items-center rounded-full border border-border-c bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium text-muted"
      title="This evidence is an unverified search-index summary, not a page we fetched directly."
    >
      unverified
    </span>
  );
}

export function LeftSchoolBadge({ leftSchool }: { leftSchool?: boolean | number | null }) {
  if (!leftSchool) return null;
  return (
    <span
      className="inline-flex shrink-0 items-center rounded-full border border-border-c bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-muted"
      title="The bio says this person left school or is on leave. Enrollment stays based on class-year evidence."
    >
      Left school
    </span>
  );
}

export function EnrollmentBadge({
  name,
  status,
  label,
  evidence,
  basis,
  sourceUrl,
  leftSchool,
  year,
  classYearSupport,
}: {
  name?: string | null;
  status: string | null | undefined;
  label?: string | null;
  evidence?: string | null;
  basis?: string | null;
  sourceUrl?: string | null;
  leftSchool?: boolean | null;
  year?: number | null;
  classYearSupport?: string | null;
}) {
  const fromLabel = Number(label?.match(/\b(20\d{2})\b/)?.[1] ?? "");
  const scope = readPersonScope({
    name,
    year: year ?? (Number.isFinite(fromLabel) && fromLabel > 1900 ? fromLabel : null),
    classYearSupport,
    status,
    basis,
    evidence,
    sourceUrl,
    leftSchool,
  });
  const present = enrollmentPhrase(scope);
  return (
    <span
      className={`block max-w-full min-w-0 basis-full whitespace-normal break-words rounded-md border px-2 py-1 text-left text-[14px] font-medium leading-5 ${ENROLLMENT_CLASS.unknown}`}
      data-enrollment-reading=""
      title={scope.presentText}
    >
      {scope.classYearText}
      {" · "}
      {present}
      {basis === "inferred" ? <span className="font-normal"> est.</span> : null}
    </span>
  );
}

// Softer wording + a real explanation on hover. "unverified" still means
// the source ties the person to the university without confirming current
// enrollment. The label is "Unconfirmed"; the stored value is unchanged.
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
  older_alumni: "Alumni, per the source · not necessarily a current student.",
  unverified: "Real evidence ties this person to the university (e.g. a hackathon roster or campus-org listing), but that source alone can't confirm they're currently enrolled · not independently checked yet.",
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


/** Company-level founder-recency gate label. Unverified is never counted as kept. */
export function RecencyStatusBadge({
  status,
}: {
  status: "kept" | "excluded_older_alumni" | "unverified_recency" | string | null | undefined;
}) {
  if (!status) return null;
  const map: Record<string, { label: string; className: string; title: string }> = {
    kept: {
      label: "Recency kept",
      className: "bg-ok-bg text-ok border-ok/20",
      title: "At least one founder is a current student or graduated 2023 or later.",
    },
    excluded_older_alumni: {
      label: "Excluded · older alumni",
      className: "bg-surface-2 text-muted border-border-c",
      title: "Checked founders all graduated before 2023.",
    },
    unverified_recency: {
      label: "Unverified recency",
      className: "bg-warn-bg text-warn border-warn/20",
      title: "Founder graduation years not yet verified. Not counted as a verified/investable company.",
    },
  };
  const row = map[status] ?? {
    label: status,
    className: "bg-surface-2 text-muted border-border-c",
    title: "Founder recency status.",
  };
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${row.className}`}
      title={row.title}
      data-recency-status={status}
    >
      {row.label}
    </span>
  );
}
