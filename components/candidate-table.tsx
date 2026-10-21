import { Fragment, memo } from "react";
import { useWindowedItems } from "./windowed-list";
import { buildHref } from "@/lib/domain/url";
import { ScoutLink } from "./scout-nav";
import { formatCampusList } from "@/lib/domain/campuses";
import { publicLink } from "@/lib/domain/company-link";
import type { CandidateSummary, ProjectDetail } from "@/lib/domain/queries";
import { EnrollmentBadge, GateBadge, LeftSchoolBadge, SameSchoolBadge, SignalTierBadge } from "./badges";
import { FeedbackControls, FeedbackUndo } from "./feedback-controls";
import { PersonLinkButton } from "./person-link";
import { CompanyDetail } from "./company-detail";
import { CompanyNameLink } from "./company-website";
import { EntityMarks } from "./entity-marks";

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
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
      {shown.map((f) => (
        <span key={f.personId} className="inline-flex items-center gap-1">
          {f.name}
          {f.link && <PersonLinkButton link={f.link} name={f.name} />}
        </span>
      ))}
      {extra > 0 ? <span>+{extra}</span> : null}
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

export const CandidateTable = memo(function CandidateTable({
  candidates,
  basePath,
  current,
  feedbackView,
  detail,
}: {
  candidates: (CandidateSummary & { boostNote?: string | null })[];
  basePath: string;
  current: Record<string, string | undefined>;
  feedbackView?: string;
  detail?: ProjectDetail | null;
}) {
  const { anchorRef, window: windowed } = useWindowedItems(candidates, 88);
  const open = current.project ? candidates.find((c) => c.id === current.project) : undefined;
  const rows = open && !windowed.slice.some((c) => c.id === open.id) ? [...windowed.slice, open] : windowed.slice;
  if (candidates.length === 0) {
    return (
      <div className="p-6 text-sm text-muted">
        <p className="font-medium text-foreground">No companies match yet.</p>
        <p className="mt-1">Student and New grad are on. Turn on Alumni, or scan a source, to widen the list.</p>
      </div>
    );
  }
  return (
    <div ref={anchorRef}>
      <ul className="space-y-2 p-3 sm:hidden">
        {windowed.padTop > 0 && <li aria-hidden="true" style={{ height: windowed.padTop }} />}
        {rows.map((c) => (
          <li key={c.id} className="rounded-lg border border-border-c bg-surface p-3">
            <span className="flex flex-wrap items-center gap-1.5">
              <CompanyNameLink id={c.id} name={c.name} websiteUrl={c.websiteUrl} />
              <SignalTierBadge tier={c.signalTier} basis={c.signalTierBasis} />
              {c.sameSchoolCofounders ? <SameSchoolBadge /> : null}
              <EntityMarks entityType="project" entityId={c.id} name={c.name} campusName={c.universities[0]} websiteUrl={c.websiteUrl} />
            </span>
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
              {c.universities.length ? ` · ${formatCampusList(c.universities)}` : ""}
            </p>
            <p className="mt-1 flex flex-wrap gap-1">
              {c.founderLinks.slice(0, 2).map((f) => (
                <span key={f.personId} className="inline-flex flex-wrap gap-1">
                  <EnrollmentBadge status={f.enrollmentStatus} label={f.enrollmentLabel} basis={f.enrollmentBasis} />
                  <LeftSchoolBadge leftSchool={f.leftSchool} />
                </span>
              ))}
            </p>
            <p className="mt-1 text-xs text-muted line-clamp-2">{whyInvestigate(c)}</p>
            {detail && detail.id === c.id && (
              <div className="mt-3 rounded-md border border-border-c bg-white">
                <CompanyDetail project={detail} />
              </div>
            )}
          </li>
        ))}
        {windowed.padBottom > 0 && <li aria-hidden="true" style={{ height: windowed.padBottom }} />}
      </ul>
      <div className="paper-card hidden overflow-x-auto sm:block">
      <table className="w-full text-sm" style={{ fontVariantNumeric: "tabular-nums" }}>
        <thead className="sticky top-0 z-10 bg-surface">
          <tr className="border-b border-border-c text-left">
            <th className="ui-label px-4 py-3 font-medium">Company</th>
            <th className="ui-label px-4 py-3 font-medium">Founder / campus</th>
            <th className="ui-label px-4 py-3 font-medium">Why investigate</th>
            <th className="ui-label px-4 py-3 font-medium">Eligibility</th>
            <th className="ui-label px-4 py-3 font-medium">Priority</th>
            <th className="ui-label px-4 py-3 font-medium">Latest activity</th>
          </tr>
        </thead>
        <tbody>
          {windowed.padTop > 0 && (
            <tr aria-hidden="true">
              <td colSpan={6} style={{ height: windowed.padTop, padding: 0, border: 0 }} />
            </tr>
          )}
          {rows.map((c) => {
            return (
              <Fragment key={c.id}>
              <tr className={`row-cv border-b border-border-c align-top hover:bg-background ${current.project === c.id ? "bg-accent-subtle" : ""}`}>
                <td className="px-4 py-3">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <CompanyNameLink id={c.id} name={c.name} websiteUrl={c.websiteUrl} className="font-medium text-foreground hover:text-link" />
                    <SignalTierBadge tier={c.signalTier} basis={c.signalTierBasis} />
                    {c.sameSchoolCofounders ? <SameSchoolBadge /> : null}
                    <EntityMarks entityType="project" entityId={c.id} name={c.name} campusName={c.universities[0]} websiteUrl={c.websiteUrl} />
                  </span>
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
                  <p className="text-xs">{formatCampusList(c.universities) || "Campus not confirmed"}</p>
                  <p className="mt-1 flex flex-wrap gap-1">
                    {c.founderLinks.slice(0, 2).map((f) => (
                      <span key={f.personId} className="inline-flex flex-wrap gap-1">
                  <EnrollmentBadge status={f.enrollmentStatus} label={f.enrollmentLabel} basis={f.enrollmentBasis} />
                  <LeftSchoolBadge leftSchool={f.leftSchool} />
                </span>
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
              {detail && detail.id === c.id && (
                <tr className="border-b border-border-c bg-white">
                  <td colSpan={6} className="px-2 py-2">
                    <div className="rounded-md border border-border-c">
                      <div className="flex justify-end border-b border-border-c px-3 py-1.5">
                        <ScoutLink href={buildHref(basePath, current, { project: null })} className="text-xs text-muted hover:text-foreground">
                          Close
                        </ScoutLink>
                      </div>
                      <CompanyDetail project={detail} />
                    </div>
                  </td>
                </tr>
              )}
              </Fragment>
            );
          })}
          {windowed.padBottom > 0 && (
            <tr aria-hidden="true">
              <td colSpan={6} style={{ height: windowed.padBottom, padding: 0, border: 0 }} />
            </tr>
          )}
        </tbody>
      </table>
      </div>
    </div>
  );
});
