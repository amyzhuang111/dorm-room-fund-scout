import Link from "next/link";
import { buildHref } from "@/lib/domain/url";
import type { CandidateSummary } from "@/lib/domain/queries";
import { GateBadge } from "./badges";

function whyInvestigate(c: CandidateSummary): string {
  if (c.latestSignalNote) return c.latestSignalNote;
  if (c.openQuestion) return c.openQuestion;
  return "No supporting evidence recorded yet — open the drawer to research.";
}

function priorityLabel(c: CandidateSummary): string {
  if (c.qualityScore != null) return `${c.qualityScore}/100`;
  return "Unassessed";
}

export function CandidateTable({
  candidates,
  basePath,
  current,
}: {
  candidates: CandidateSummary[];
  basePath: string;
  current: Record<string, string | undefined>;
}) {
  if (candidates.length === 0) {
    return (
      <div className="p-6 text-sm text-muted">
        <p className="font-medium text-foreground">No companies match yet.</p>
        <p className="mt-1">Adjust filters, or scan a source from the Sources page to bring in more records.</p>
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm" style={{ fontVariantNumeric: "tabular-nums" }}>
        <thead>
          <tr className="border-b border-border-c text-left text-xs uppercase tracking-wide text-muted">
            <th className="px-3 py-2 font-medium">Company</th>
            <th className="px-3 py-2 font-medium">Founder / campus</th>
            <th className="px-3 py-2 font-medium">Why investigate</th>
            <th className="px-3 py-2 font-medium">Eligibility</th>
            <th className="px-3 py-2 font-medium">Priority</th>
            <th className="px-3 py-2 font-medium">Latest activity</th>
          </tr>
        </thead>
        <tbody>
          {candidates.map((c) => {
            const extraFounders = c.founders.length > 1 ? ` +${c.founders.length - 1}` : "";
            return (
              <tr key={c.id} className={`border-b border-border-c align-top hover:bg-surface-2 ${current.project === c.id ? "bg-accent/5" : ""}`} style={{ height: "68px" }}>
                <td className="px-3 py-2.5">
                  <Link href={buildHref(basePath, current, { project: c.id })} className="font-medium text-foreground hover:text-accent">
                    {c.name}
                  </Link>
                  <p className="mt-0.5 max-w-[260px] text-xs text-muted line-clamp-2">{c.description || `Sector: ${c.sector ?? "unknown"}`}</p>
                </td>
                <td className="px-3 py-2.5 text-muted">
                  <p className="text-foreground">
                    {c.founders[0] ?? "—"}
                    {extraFounders}
                  </p>
                  <p className="text-xs">{c.universities.join(", ") || "—"}</p>
                </td>
                <td className="px-3 py-2.5 max-w-[260px] text-muted line-clamp-2">{whyInvestigate(c)}</td>
                <td className="px-3 py-2.5">
                  <GateBadge result={c.overallGate} gateOutcomes={c.gateOutcomes} />
                </td>
                <td className="px-3 py-2.5 text-muted">{priorityLabel(c)}</td>
                <td className="px-3 py-2.5 max-w-[200px] truncate text-muted" title={c.latestSignalNote ?? undefined}>
                  {c.latestSignalNote ?? "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
