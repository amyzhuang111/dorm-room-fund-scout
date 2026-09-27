"use client";

import { useEffect, useState } from "react";
import { buildHref } from "@/lib/domain/url";
import { publicLink } from "@/lib/domain/company-link";
import type { CampusBuilder, CandidateSummary, UniversitySummary } from "@/lib/domain/queries";
import { EnrollmentBadge, LeftSchoolBadge, QueueBadge, SignalTierBadge } from "./badges";
import { PersonLinkButton } from "./person-link";
import { ScoutLink } from "./scout-nav";
import { CompanyNameLink } from "./company-website";
import { EntityMarks } from "./entity-marks";

const TABS = ["prospects", "builders", "signals", "sources"] as const;
type Tab = (typeof TABS)[number];

interface CampusExtras {
  builders: CampusBuilder[];
  signals: { id: string; project_name: string; signal_type: string; current_observation: string; source_date: string | null }[];
  sources: { id: string; name: string; url: string; status: string; discoveredLeadCount: number; lastSuccessAt: string | null }[];
}

const extraCache = new Map<string, CampusExtras>();

export function UniversityPanel({
  university,
  candidates,
  basePath,
  current,
}: {
  university: UniversitySummary;
  candidates: CandidateSummary[];
  basePath: string;
  current: Record<string, string | undefined>;
}) {
  const tab: Tab = TABS.includes(current.tab as Tab) ? (current.tab as Tab) : "prospects";
  const [extras, setExtras] = useState<CampusExtras | null>(extraCache.get(university.id) ?? null);
  const [extrasFor, setExtrasFor] = useState(university.id);
  if (university.id !== extrasFor) {
    setExtrasFor(university.id);
    setExtras(extraCache.get(university.id) ?? null);
  }

  useEffect(() => {
    if (tab === "prospects") return;
    if (extraCache.get(university.id)) return;
    let cancel = false;
    fetch(`/api/campus/${encodeURIComponent(university.id)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: CampusExtras | null) => {
        if (cancel || !data) return;
        extraCache.set(university.id, data);
        setExtras(data);
      })
      .catch(() => {});
    return () => {
      cancel = true;
    };
  }, [university.id, tab]);

  const top = candidates.filter((c) => c.queue === "top_prospects");
  const exploration = candidates.filter((c) => c.queue === "exploration");

  return (
    <div className="p-4">
      <h2 className="text-lg font-semibold text-foreground">{university.name}</h2>
      <p className="mt-0.5 text-xs text-muted">
        {university.candidateProjectCount} candidate{university.candidateProjectCount === 1 ? "" : "s"} · {university.sourcesConfigured} source(s) configured
        {university.lastCheckedAt ? ` · last checked ${university.lastCheckedAt.slice(0, 10)}` : " · never checked"}
      </p>
      {university.coordSource && <p className="mt-0.5 text-[11px] text-muted">Coordinates: {university.coordSource}</p>}

      <div className="mt-3 flex gap-1 border-b border-border-c">
        {TABS.map((item) => (
          <ScoutLink
            key={item}
            href={buildHref(basePath, current, { tab: item })}
            className={`rounded-t-md px-3 py-1.5 text-xs font-medium capitalize ${tab === item ? "border-b-2 border-accent text-foreground" : "text-muted hover:text-foreground"}`}
          >
            {item === "prospects" ? "Top prospects" : item}
          </ScoutLink>
        ))}
      </div>

      <div className="mt-3">
        {tab === "prospects" && (
          <div className="space-y-3">
            {top.length === 0 && (
              <p className="text-sm text-muted">
                No candidates currently pass every gate with enough evidence for a headline score.{" "}
                <ScoutLink href={buildHref(basePath, current, { queue: "exploration" })} className="text-link underline">
                  See {exploration.length} in Exploration
                </ScoutLink>
                .
              </p>
            )}
            <ul className="space-y-2">
              {[...top, ...exploration].map((c) => {
                const link = publicLink(c.websiteUrl, c.primaryLink, c.primaryLinkKind);
                return (
                  <li key={c.id}>
                    <div className="rounded-md border border-border-c p-2.5 hover:bg-surface-2">
                      <div className="flex items-start justify-between gap-2">
                        <span className="flex flex-wrap items-center gap-1.5">
                          <CompanyNameLink id={c.id} name={c.name} websiteUrl={c.websiteUrl} className="text-sm font-medium text-foreground hover:text-link" />
                          <SignalTierBadge tier={c.signalTier} basis={c.signalTierBasis} />
                          <EntityMarks entityType="project" entityId={c.id} name={c.name} campusName={university.name} websiteUrl={c.websiteUrl} />
                        </span>
                        <QueueBadge queue={c.queue} />
                      </div>
                      <ul className="mt-1 space-y-1">
                        {c.founderLinks.length === 0 && <li className="text-xs text-muted">Founders unknown</li>}
                        {c.founderLinks.slice(0, 3).map((f) => (
                          <li key={f.personId} className="flex flex-wrap items-center gap-1 text-xs">
                            <span className="text-foreground">{f.name}</span>
                            <EntityMarks entityType="person" entityId={f.personId} name={f.name} campusName={university.name} />
                            <EnrollmentBadge status={f.enrollmentStatus} label={f.enrollmentLabel} basis={f.enrollmentBasis} />
                            <LeftSchoolBadge leftSchool={f.leftSchool} />
                            <PersonLinkButton link={f.link} name={f.name} />
                          </li>
                        ))}
                      </ul>
                      {link && (
                        <a href={link.url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex rounded-md bg-accent px-2 py-0.5 text-[11px] font-medium text-accent-foreground">
                          {link.kind === "official" ? "Visit website" : `Open ${link.label}`}
                        </a>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        {tab === "builders" && (
          <ul className="space-y-1.5">
            {(extras?.builders ?? []).map((b) => (
              <li key={b.id} className="rounded-md border border-border-c p-2 text-sm">
                <span className="inline-flex flex-wrap items-center gap-1.5">
                  <span className="font-medium text-foreground">{b.name}</span>
                  <PersonLinkButton link={b.link} name={b.name} />
                </span>
                <span className="ml-2 text-xs text-muted">{b.status.replace("_", " ")}</span>
                {b.projects.length > 0 && <p className="mt-0.5 text-xs text-muted">Built: {b.projects.join(", ")}</p>}
              </li>
            ))}
            {extras && extras.builders.length === 0 && <p className="text-sm text-muted">No builders on record yet for this campus.</p>}
            {!extras && <p className="text-sm text-muted">Loading builders…</p>}
          </ul>
        )}
        {tab === "signals" && (
          <ul className="space-y-1.5">
            {(extras?.signals ?? []).map((s) => (
              <li key={s.id} className="rounded-md border border-border-c p-2 text-sm">
                <p className="font-medium text-foreground">{s.project_name}</p>
                <p className="text-xs text-foreground">{s.current_observation}</p>
                <p className="mt-0.5 text-xs text-muted">
                  {s.signal_type.replace("_", " ")}
                  {s.source_date ? ` · ${s.source_date}` : ""}
                </p>
              </li>
            ))}
            {extras && extras.signals.length === 0 && <p className="text-sm text-muted">No dated signals recorded for this campus yet.</p>}
            {!extras && <p className="text-sm text-muted">Loading signals…</p>}
          </ul>
        )}
        {tab === "sources" && (
          <ul className="space-y-1.5">
            {(extras?.sources ?? []).map((s) => (
              <li key={s.id} className="rounded-md border border-border-c p-2 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-foreground">{s.name}</span>
                  <span className="text-xs text-muted capitalize">{s.status.replace("_", " ")}</span>
                </div>
                <p className="text-xs text-muted">
                  {s.discoveredLeadCount} lead(s) found · last success {s.lastSuccessAt?.slice(0, 10) ?? "never"}
                </p>
                <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-xs text-link underline">
                  {s.url}
                </a>
              </li>
            ))}
            {extras && extras.sources.length === 0 && <p className="text-sm text-muted">No sources scoped to this campus yet.</p>}
            {!extras && <p className="text-sm text-muted">Loading sources…</p>}
          </ul>
        )}
      </div>
    </div>
  );
}
