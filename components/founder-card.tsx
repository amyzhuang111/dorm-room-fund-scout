import { memo } from "react";
import Link from "next/link";
import type { FounderRow } from "@/lib/domain/queries";
import { publicLink } from "@/lib/domain/company-link";
import { buildHref } from "@/lib/domain/url";
import { ScoutLink } from "./scout-nav";
import { EnrollmentBadge, LeftSchoolBadge, PotentialFounderBadge, SignalTierBadge, UnverifiedBadge, VerificationBadge } from "./badges";
import { FeedbackControls, FeedbackUndo } from "./feedback-controls";
import { PersonLinkButton, ProfileIconLinks } from "./person-link";
import { CompanyNameLink } from "./company-website";
import { EntityMarks } from "./entity-marks";

export const FounderCard = memo(function FounderCard({
  founder,
  feedbackView,
  open = false,
  basePath = "/founder/discover",
  current = {},
}: {
  founder: FounderRow & { boostNote?: string | null };
  feedbackView?: string;
  open?: boolean;
  basePath?: string;
  current?: Record<string, string | undefined>;
}) {
  const companies = founder.projects.filter((p) => p.kind === "company");
  const projects = founder.projects.filter((p) => p.kind !== "company");
  const { founderSignal, coverage } = founder.founderSignal;
  return (
    <div className="row-cv rounded-md border border-border-c bg-surface p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex flex-wrap items-center gap-1.5 font-medium text-foreground">
            {founder.name}
            <EntityMarks entityType="person" entityId={founder.id} name={founder.name} campusName={founder.universityName} websiteUrl={founder.linkedinUrl} />
          </div>
          <p className="mt-1 text-xs text-muted">{founder.universityName ?? "University unknown"}</p>
          <p className="mt-1 flex flex-wrap items-center gap-1">
            {founder.founderStatus === "potential" && <PotentialFounderBadge />}
            <EnrollmentBadge status={founder.enrollmentStatus} label={founder.enrollmentLabel} evidence={founder.enrollmentEvidence} basis={founder.enrollmentBasis} />
            <LeftSchoolBadge leftSchool={founder.leftSchool} />
            <SignalTierBadge tier={founder.signalTier} basis={founder.signalTierBasis} />
            <VerificationBadge status={founder.verificationStatus} verifiedAt={founder.lastVerifiedAt} note={founder.verificationNote} />
            {founder.signalEvidence?.unverified && <UnverifiedBadge />}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <PersonLinkButton link={founder.link} name={founder.name} />
          <ProfileIconLinks links={founder.profileLinks} name={founder.name} />
        </div>
      </div>

      {founder.founderStatus === "potential" && founder.potentialSignal && (
        <p className="mt-2 text-sm text-foreground">{founder.potentialSignal}</p>
      )}
      {founder.founderStatus !== "potential" && founder.strongestEvidence && (
        <p className={`mt-2 text-sm text-foreground ${open ? "" : "line-clamp-3"}`}>{founder.strongestEvidence}</p>
      )}
      {founder.reviewNotes.length > 0 && (
        <p className={`mt-2 text-xs text-muted ${open ? "" : "line-clamp-2"}`}>{founder.reviewNotes.join(" ")}</p>
      )}
      {founder.hotspots.length > 0 && (
        <p className="mt-2 text-xs text-muted">
          <span className="font-semibold uppercase tracking-wide">Hotspots </span>
          {founder.hotspots.map((hotspot, index) => (
            <span key={hotspot.id}>
              {index > 0 ? ", " : ""}
              <Link href={hotspot.href} className="text-link hover:underline">
                {hotspot.place}
              </Link>
            </span>
          ))}
        </p>
      )}

      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-xs text-muted" style={{ fontVariantNumeric: "tabular-nums" }}>
          {founderSignal != null ? `Founder Signal ${founderSignal} · ${Math.round(coverage * 100)}% coverage` : "unassessed"}
        </span>
        <ScoutLink
          href={buildHref(basePath, current, { founder: open ? null : founder.id })}
          className="text-xs font-medium text-link"
          aria-expanded={open}
        >
          {open ? "Hide record" : "Companies and evidence"}
        </ScoutLink>
      </div>
      {founder.promotionReasonLabel && <p className="mt-1 text-[11px] text-muted">{founder.promotionReasonLabel}</p>}
      {founder.boostNote && <p className="mt-1 text-[11px] text-link">{founder.boostNote}</p>}

      {open && (
        <div className="mt-3 space-y-3 border-t border-border-c pt-3 text-sm">
          {founder.founderStatus === "potential" && founder.signalEvidence && (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Signal evidence</h3>
              <p className="mt-1 text-xs text-foreground">
                {founder.signalEvidence.excerpt} {founder.signalEvidence.unverified && <UnverifiedBadge />}
              </p>
              {founder.signalEvidence.sourceUrl && (
                <a href={founder.signalEvidence.sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-xs text-link underline">
                  {founder.signalEvidence.sourceName || "source"}
                </a>
              )}
            </section>
          )}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Companies</h3>
            {companies.length === 0 && !founder.possibleCompany && <p className="mt-1 text-xs text-muted">No company on record.</p>}
            <ul className="mt-1 space-y-1.5">
              {companies.map((p) => {
                const link = publicLink(p.websiteUrl, p.primaryLink, p.primaryLinkKind);
                return (
                  <li key={p.id} className="flex flex-wrap items-center gap-2">
                    <CompanyNameLink id={p.id} name={p.name} websiteUrl={p.websiteUrl} className="font-medium text-link hover:underline" />
                    <EntityMarks entityType="project" entityId={p.id} name={p.name} campusName={founder.universityName} websiteUrl={p.websiteUrl} />
                    <SignalTierBadge tier={p.signalTier} />
                    <span className="text-xs text-muted">{p.role.replaceAll("_", " ")}</span>
                    {link && (
                      <a href={link.url} target="_blank" rel="noopener noreferrer" className="rounded-md bg-accent px-2 py-0.5 text-[11px] font-medium text-accent-foreground">
                        {link.kind === "official" ? "Visit website" : `Open ${link.label}`}
                      </a>
                    )}
                  </li>
                );
              })}
              {founder.possibleCompany && (
                <li className="text-xs text-muted">Possible company: {founder.possibleCompany.name} (unconfirmed)</li>
              )}
            </ul>
          </section>
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Projects</h3>
            {projects.length === 0 && <p className="mt-1 text-xs text-muted">No project on record.</p>}
            <ul className="mt-1 space-y-1">
              {projects.map((p) => {
                const link = publicLink(p.websiteUrl, p.primaryLink, p.primaryLinkKind);
                return (
                  <li key={p.id} className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="text-foreground">{p.name}</span>
                    <span className="text-muted">{p.role.replaceAll("_", " ")}</span>
                    {link && (
                      <a href={link.url} target="_blank" rel="noopener noreferrer" className="text-link underline">
                        {link.label}
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
          {founder.otherLinks.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Other sources</h3>
              <ul className="mt-1 space-y-1.5">
                {founder.otherLinks.map((item) => {
                  let host = item.url;
                  try {
                    host = new URL(item.url).hostname.replace(/^www\./, "");
                  } catch {
                    host = item.url;
                  }
                  return (
                    <li key={item.url} className="text-xs">
                      <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-link underline">
                        {host}
                      </a>
                      {item.status === "unverified" && <span className="ml-1 text-muted">unverified</span>}
                      {item.excerpt && <p className="mt-0.5 text-muted">{item.excerpt}</p>}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Education</h3>
            {founder.education.length === 0 && <p className="mt-1 text-xs text-muted">No education evidence on record.</p>}
            <ul className="mt-1 space-y-1.5">
              {founder.education.map((item) => (
                <li key={item.excerpt} className="text-xs text-foreground">
                  {item.excerpt}
                  {item.sourceUrl && (
                    <>
                      {" "}
                      <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-link underline">
                        source
                      </a>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}

      {feedbackView === "hidden" ? (
        <FeedbackUndo entityType="person" entityId={founder.id} name={founder.name} />
      ) : (
        <FeedbackControls entityType="person" entityId={founder.id} name={founder.name} />
      )}
    </div>
  );
});
