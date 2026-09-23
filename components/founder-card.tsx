import Link from "next/link";
import type { FounderRow } from "@/lib/domain/queries";
import { AffiliationStatusBadge } from "./badges";

export function FounderCard({ founder }: { founder: FounderRow }) {
  const evidenceProjects = founder.projects.filter((p) => p.kind === "project");
  const { founderSignal, coverage } = founder.founderSignal;
  return (
    <div className="rounded-md border border-border-c bg-surface p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-medium text-foreground">{founder.name}</p>
          <p className="text-xs text-muted">
            {founder.universityName ?? "University unknown"} · <AffiliationStatusBadge status={founder.status} />
          </p>
        </div>
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
          <Link href={`/startup/discover?project=${founder.linkedCompany.id}`} className="text-xs font-medium text-accent hover:underline">
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
    </div>
  );
}
