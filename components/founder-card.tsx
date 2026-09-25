import Link from "next/link";
import type { FounderRow } from "@/lib/domain/queries";
import { EnrollmentBadge } from "./badges";
import { FeedbackControls, FeedbackUndo } from "./feedback-controls";

export function FounderCard({ founder, feedbackView }: { founder: FounderRow & { boostNote?: string | null }; feedbackView?: string }) {
  const evidenceProjects = founder.projects.filter((p) => p.kind === "project");
  const { founderSignal, coverage } = founder.founderSignal;
  return (
    <div className="rounded-md border border-border-c bg-surface p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-medium text-foreground">{founder.name}</p>
          <p className="mt-1 text-xs text-muted">{founder.universityName ?? "University unknown"}</p>
          <p className="mt-1">
            <EnrollmentBadge status={founder.enrollmentStatus} label={founder.enrollmentLabel} evidence={founder.enrollmentEvidence} />
          </p>
        </div>
        <span className="flex shrink-0 flex-col items-end gap-0.5">
          {founder.linkedinUrl && (
            <a
              href={founder.linkedinUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-medium text-link hover:underline"
              title="LinkedIn URL found on a source page"
            >
              LinkedIn ↗
            </a>
          )}
          {!founder.linkedinUrl && founder.linkedinCandidates[0] && (
            <a
              href={founder.linkedinCandidates[0].url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-warn hover:underline"
              title={founder.linkedinCandidates[0].reason}
            >
              LinkedIn unverified
            </a>
          )}
          {founder.websiteUrl && (
            <a href={founder.websiteUrl} target="_blank" rel="noopener noreferrer" className="max-w-[140px] truncate text-xs text-link hover:underline">
              {founder.websiteUrl.replace(/^https?:\/\//, "")}
            </a>
          )}
        </span>
      </div>

      {founder.strongestEvidence && <p className="mt-2 text-sm text-foreground line-clamp-2">{founder.strongestEvidence}</p>}

      {evidenceProjects.length > 0 && (
        <p className="mt-1.5 text-xs text-muted">
          Built: {evidenceProjects.map((p) => p.name).join(", ")}
        </p>
      )}

      <div className="mt-2 flex items-center justify-between">
        <span className="text-xs text-muted" style={{ fontVariantNumeric: "tabular-nums" }}>
          {founderSignal != null ? `Founder Signal ${founderSignal} · ${Math.round(coverage * 100)}% coverage` : "unassessed"}
        </span>
        {founder.linkedCompany ? (
          <Link href={`/startup/discover?project=${founder.linkedCompany.id}`} className="text-xs font-medium text-link hover:underline">
            {founder.linkedCompany.name} →
          </Link>
        ) : founder.possibleCompany ? (
          <span className="text-xs text-muted" title="Self-reported in their own bio — not yet independently confirmed">
            Possible company: {founder.possibleCompany.name} (unconfirmed)
          </span>
        ) : (
          <span className="text-xs text-muted">No company detected</span>
        )}
      </div>
      {founder.promotionReasonLabel && <p className="mt-1 text-[11px] text-muted">{founder.promotionReasonLabel}</p>}
      {founder.boostNote && <p className="mt-1 text-[11px] text-link">{founder.boostNote}</p>}
      {feedbackView === "hidden" ? (
        <FeedbackUndo entityType="person" entityId={founder.id} name={founder.name} />
      ) : (
        <FeedbackControls entityType="person" entityId={founder.id} name={founder.name} />
      )}
    </div>
  );
}
