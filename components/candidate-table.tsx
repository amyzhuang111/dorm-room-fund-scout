import Link from "next/link";
import { buildHref } from "@/lib/domain/url";
import { shortCampusName } from "@/lib/domain/campuses";
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
    <div>
      <ul className="space-y-2 p-3 sm:hidden">
        {candidates.map((c) => (
          <li key={c.id} className="rounded-lg border border-border-c bg-surface p-3">
            <Link href={buildHref(basePath, current, { project: c.id })} className="font-medium text-foreground">
              {c.name}
            </Link>
            <p className="mt-1 text-sm text-muted line-clamp-3">{c.description || "What it builds is not on record yet."}</p>
            <p className="mt-2 text-xs text-foreground">
              {c.founders[0] ?? "Founder not named"}
              {c.founders.length > 1 ? ` +${c.founders.length - 1}` : ""}
              {c.universities.length ? ` · ${c.universities.map(shortCampusName).join(", ")}` : ""}
            </p>
            <p className="mt-1 text-xs text-muted line-clamp-2">{whyInvestigate(c)}</p>
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto sm:block">
      <table className="w-full text-sm" style={{ fontVariantNumeric: "tabular-nums" }}>
        <thead className="sticky top-0 z-10 bg-background">
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
                  <p className="mt-0.5 max-w-[280px] text-xs leading-snug text-muted line-clamp-2">{c.description || "What it builds is not on record yet."}</p>
                  {c.websiteUrl && (
                    <a href={c.websiteUrl} target="_blank" rel="noopener noreferrer" className="mt-0.5 inline-block max-w-[220px] truncate text-[11px] text-accent underline">
                      {c.websiteUrl.replace(/^https?:\/\//, "")}
                    </a>
                  )}
                </td>
                <td className="px-3 py-2.5 text-muted">
                  <p className="text-foreground">
                    {c.founders[0] ?? "—"}
                    {extraFounders}
                  </p>
                  <p className="text-xs">{c.universities.map(shortCampusName).join(", ") || "Campus not confirmed"}</p>
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
    </div>
  );
}
