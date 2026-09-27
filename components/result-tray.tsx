"use client";

import { useState } from "react";
import { publicLink } from "@/lib/domain/company-link";
import type { CandidateSummary } from "@/lib/domain/queries";
import { FeedbackControls } from "./feedback-controls";
import { PersonLinkButton } from "./person-link";
import { CompanyNameLink } from "./company-website";
import { EnrollmentBadge, LeftSchoolBadge, SameSchoolBadge, SignalTierBadge } from "./badges";
import { EntityMarks } from "./entity-marks";

// Design MD §5: "In canvas views, show a collapsible bottom result tray
// with compact cards. Selecting a card selects the same entity on the
// canvas and in the drawer." Companies aren't individually plotted on the
// globe (only campus dots are), and CandidateSummary only carries a
// university NAME (see listCandidateProjects), not an id it could fly the
// globe to — so the canvas half of "select the same entity" isn't
// something this can do without guessing an id from a name. Scoped
// honestly to what's real: selecting a card opens it in the drawer (the
// same navigation every other company link in this app already uses) and
// leaves the current campus selection alone.
export function ResultTray({
  candidates,
  current,
  docked = false,
}: {
  candidates: CandidateSummary[];
  basePath: string;
  current: Record<string, string | undefined>;
  /** Sit below the map on a solid white bar instead of floating over labels. */
  docked?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(true);

  if (candidates.length === 0) return null;

  return (
    <div className={docked ? "mt-2 overflow-hidden rounded-lg border border-black/15 bg-white text-black shadow-sm" : "glass-panel absolute bottom-3 left-3 right-14 overflow-hidden"}>
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="glass-panel-head w-full text-left"
        aria-expanded={!collapsed}
      >
        <span className="text-sm font-medium text-foreground">
          {candidates.length} {candidates.length === 1 ? "result" : "results"}
        </span>
        <span className="ml-auto text-[11px] text-muted">{collapsed ? "Show ▲" : "Hide ▼"}</span>
      </button>
      {!collapsed && (
        <ul className="flex gap-2 overflow-x-auto px-3 pb-3 pt-1">
          {candidates.map((c) => (
            <li key={c.id} className="shrink-0">
              <div
                className={`block w-52 rounded-md border px-2.5 py-2 text-xs ${
                  current.project === c.id ? "border-accent bg-accent/10" : "border-border-c"
                }`}
              >
                <span className="flex items-center gap-1">
                  <CompanyNameLink id={c.id} name={c.name} websiteUrl={c.websiteUrl} className="block truncate font-medium text-foreground hover:text-link" />
                  <SignalTierBadge tier={c.signalTier} basis={c.signalTierBasis} />
                  {c.sameSchoolCofounders ? <SameSchoolBadge /> : null}
                  <EntityMarks entityType="project" entityId={c.id} name={c.name} campusName={c.universities[0]} websiteUrl={c.websiteUrl} />
                </span>
                <p className="line-clamp-2 text-muted">{c.description || c.founders[0] || "No description yet"}</p>
                <p className="truncate text-muted">{c.universities[0] ?? "Campus not confirmed"}</p>
                {(() => {
                  const link = publicLink(c.websiteUrl, c.primaryLink, c.primaryLinkKind);
                  if (!link) return null;
                  return (
                    <a href={link.url} target="_blank" rel="noopener noreferrer" className="link-chip mt-1 max-w-full truncate">
                      {link.kind === "official" ? link.url.replace(/^https?:\/\//, "") : link.label}
                    </a>
                  );
                })()}
                {"boostNote" in c && (c as CandidateSummary & { boostNote?: string | null }).boostNote && (
                  <p className="mt-0.5 line-clamp-2 text-link">{(c as CandidateSummary & { boostNote?: string }).boostNote}</p>
                )}
                <FeedbackControls entityType="project" entityId={c.id} name={c.name} url={c.websiteUrl || c.primaryLink} />
                <ul className="mt-1 space-y-1">
                  {c.founderLinks.slice(0, 2).map((f) => (
                    <li key={f.personId} className="flex flex-wrap items-center gap-1">
                      <span className="text-foreground">{f.name}</span>
                      <EnrollmentBadge status={f.enrollmentStatus} label={f.enrollmentLabel} basis={f.enrollmentBasis} />
                      <LeftSchoolBadge leftSchool={f.leftSchool} />
                      <PersonLinkButton link={f.link} name={f.name} />
                    </li>
                  ))}
                </ul>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
