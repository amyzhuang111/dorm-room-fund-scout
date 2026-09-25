import Link from "next/link";
import { buildHref } from "@/lib/domain/url";
import { shortCampusName } from "@/lib/domain/campuses";
import { publicLink } from "@/lib/domain/company-link";
import type { CandidateSummary } from "@/lib/domain/queries";
import { EnrollmentBadge, GateBadge } from "./badges";
import { FeedbackControls, FeedbackUndo } from "./feedback-controls";

function whyInvestigate(c: CandidateSummary): string {
  if (c.latestSignalNote) return c.latestSignalNote;
  if (c.openQuestion) return c.openQuestion;
  return "No supporting evidence recorded yet — open the drawer to research.";
}

function FounderLinks({ founders }: { founders: CandidateSummary["founderLinks"] }) {
  if (founders.length === 0) return <span>Founder not named</span>;
  const shown = founders.slice(0, 2);
  const extra = founders.length - shown.length;
  return (
    <span>
      {shown.map((f, i) => (
        <span key={f.name}>
          {i > 0 ? ", " : ""}
          {f.name}
          {f.linkedinUrl && (
            <>
              {" "}
              <a href={f.linkedinUrl} target="_blank" rel="noopener noreferrer" className="text-link underline">
                LinkedIn
              </a>
            </>
          )}
          {!f.linkedinUrl && f.linkedinCandidates[0] && (
            <>
              {" "}
              <a href={f.linkedinCandidates[0].url} target="_blank" rel="noopener noreferrer" className="text-warn underline" title={f.linkedinCandidates[0].reason}>
                LinkedIn unverified
              </a>
            </>
          )}
        </span>
      ))}
      {extra > 0 ? ` +${extra}` : ""}
    </span>
  );
}

function priorityLabel(c: CandidateSummary): string {
  if (c.qualityScore != null) return `${c.qualityScore}/100`;
  return "Unassessed";
}

function CompanyLink({ c }: { c: CandidateSummary }) {
  const link = publicLink(c.websiteUrl, c.primaryLink, c.primaryLinkKind);
  if (!link) return <p className="mt-0.5 text-[11px] text-muted">No public page on record</p>;
  const host = link.url.replace(/^https?:\/\//, "");
  return (
    <a href={link.url} target="_blank" rel="noopener noreferrer" className="link-chip mt-1 truncate">
      {link.kind === "official" ? host : `${link.label}`}
    </a>
  );
}

export function CandidateTable({
  candidates,
  basePath,
  current,
  feedbackView,
}: {
  candidates: (CandidateSummary & { boostNote?: string | null })[];
  basePath: string;
  current: Record<string, string | undefined>;
  feedbackView?: string;
}) {
  if (candidates.length === 0) {
    return (
      <div className="p-6 text-sm text-muted">
        <p className="font-medium text-foreground">No companies match yet.</p>
        <p className="mt-1">Student and New grad are on. Turn on Alumni or Unknown, or scan a source, to widen the list.</p>
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
            <CompanyLink c={c} />
            {c.boostNote && <p className="mt-0.5 text-[11px] text-link">{c.boostNote}</p>}
            {feedbackView === "hidden" ? (
              <FeedbackUndo entityType="project" entityId={c.id} name={c.name} url={c.websiteUrl || c.primaryLink} />
            ) : (
              <FeedbackControls entityType="project" entityId={c.id} name={c.name} url={c.websiteUrl || c.primaryLink} />
            )}
            <p className="mt-2 text-xs text-foreground">
              <FounderLinks founders={c.founderLinks} />
              {c.universities.length ? ` · ${c.universities.map(shortCampusName).join(", ")}` : ""}
            </p>
            <p className="mt-1 flex flex-wrap gap-1">
              {c.founderLinks.slice(0, 2).map((f) => (
                <EnrollmentBadge key={f.personId} status={f.enrollmentStatus} label={f.enrollmentLabel} />
              ))}
            </p>
            <p className="mt-1 text-xs text-muted line-clamp-2">{whyInvestigate(c)}</p>
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto sm:block">
      <table className="w-full text-sm" style={{ fontVariantNumeric: "tabular-nums" }}>
        <thead className="sticky top-0 z-10 bg-surface-2">
          <tr className="border-b border-border-c text-left text-xs uppercase tracking-wide text-foreground">
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
            return (
              <tr key={c.id} className={`border-b border-border-c align-top hover:bg-surface ${current.project === c.id ? "bg-accent-subtle" : ""}`} style={{ height: "68px" }}>
                <td className="px-3 py-2.5">
                  <Link href={buildHref(basePath, current, { project: c.id })} className="font-medium text-foreground hover:text-link">
                    {c.name}
                  </Link>
                  <p className="mt-0.5 max-w-[280px] text-xs leading-snug text-muted line-clamp-2">{c.description || "What it builds is not on record yet."}</p>
                  <CompanyLink c={c} />
                  {c.sectorTags.length > 0 && (
                    <p className="mt-1 flex flex-wrap gap-1">
                      {c.sectorTags.slice(0, 3).map((tag) => (
                        <span key={tag} className="sector-chip">{tag}</span>
                      ))}
                    </p>
                  )}
                  {c.boostNote && <p className="mt-0.5 text-[11px] text-link">{c.boostNote}</p>}
                  {feedbackView === "hidden" ? (
                    <FeedbackUndo entityType="project" entityId={c.id} name={c.name} url={c.websiteUrl || c.primaryLink} />
                  ) : (
                    <FeedbackControls entityType="project" entityId={c.id} name={c.name} url={c.websiteUrl || c.primaryLink} />
                  )}
                </td>
                <td className="px-3 py-2.5 text-muted">
                  <FounderLinks founders={c.founderLinks} />
                  <p className="text-xs">{c.universities.map(shortCampusName).join(", ") || "Campus not confirmed"}</p>
                  <p className="mt-1 flex flex-wrap gap-1">
                    {c.founderLinks.slice(0, 2).map((f) => (
                      <EnrollmentBadge key={f.personId} status={f.enrollmentStatus} label={f.enrollmentLabel} />
                    ))}
                  </p>
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
