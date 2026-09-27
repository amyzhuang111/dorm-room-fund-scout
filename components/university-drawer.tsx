import Link from "next/link";
import { buildHref } from "@/lib/domain/url";
import { listBuildersForUniversity, listCandidateProjects, listSignalsForUniversity, listSources, type UniversitySummary } from "@/lib/domain/queries";
import { readReviewState } from "@/lib/domain/review-server";
import { reviewCompanies } from "@/lib/domain/review-view";
import { companyMatchesEnrollment, selectedEnrollment } from "@/lib/domain/founder-status";
import { EnrollmentBadge, LeftSchoolBadge, QueueBadge, SameSchoolBadge, SignalTierBadge } from "./badges";
import { CampusBenchmarks } from "./campus-benchmarks";
import { PersonLinkButton } from "./person-link";
import { publicLink } from "@/lib/domain/company-link";
import { CompanyNameLink } from "./company-website";
import { DrfPresenceNote } from "./drf-presence-note";

const TABS = ["prospects", "builders", "signals", "sources"] as const;
type Tab = (typeof TABS)[number];

export function UniversityDrawer({
  university,
  tab,
  basePath,
  current,
}: {
  university: UniversitySummary;
  tab: Tab;
  basePath: string;
  current: Record<string, string | undefined>;
}) {
  const activeTab: Tab = TABS.includes(tab) ? tab : "prospects";

  return (
    <div className="p-4">
      <h2 className="text-lg font-semibold text-foreground">{university.name}</h2>
      <p className="mt-0.5 text-xs text-muted">
        {university.candidateProjectCount} candidate{university.candidateProjectCount === 1 ? "" : "s"} · {university.sourcesConfigured} source(s) configured
        {university.lastCheckedAt ? ` · last checked ${university.lastCheckedAt.slice(0, 10)}` : " · never checked"}
      </p>
      {university.coordSource && <p className="mt-0.5 text-[11px] text-muted">Coordinates: {university.coordSource}</p>}
      <DrfPresenceNote presence={university.drfPresence} />
      <CampusBenchmarks pitchbook={university.pitchbook} hitRate={university.hitRate} />

      <div className="mt-3 flex gap-1 border-b border-border-c">
        {TABS.map((t) => (
          <Link
            key={t}
            href={buildHref(basePath, current, { tab: t })}
            className={`rounded-t-md px-3 py-1.5 text-xs font-medium capitalize ${activeTab === t ? "border-b-2 border-accent text-foreground" : "text-muted hover:text-foreground"}`}
          >
            {t === "prospects" ? "Top prospects" : t}
          </Link>
        ))}
      </div>

      <div className="mt-3">
        {activeTab === "prospects" && <ProspectsTab universityId={university.id} basePath={basePath} current={current} />}
        {activeTab === "builders" && <BuildersTab universityId={university.id} />}
        {activeTab === "signals" && <SignalsTab universityId={university.id} />}
        {activeTab === "sources" && <SourcesTab universityId={university.id} />}
      </div>
    </div>
  );
}

async function ProspectsTab({ universityId, basePath, current }: { universityId: string; basePath: string; current: Record<string, string | undefined> }) {
  const review = await readReviewState();
  const candidates = reviewCompanies(listCandidateProjects({ universityId }), review.records, review.likes, "default").filter((company) =>
    companyMatchesEnrollment(company.founderLinks, selectedEnrollment(current.enroll))
  );
  const top = candidates.filter((c) => c.queue === "top_prospects");
  const exploration = candidates.filter((c) => c.queue === "exploration");
  return (
    <div className="space-y-3">
      {top.length === 0 && (
        <p className="text-sm text-muted">
          No candidates currently pass every gate with enough evidence for a headline score.{" "}
          <Link href={buildHref(basePath, current, { queue: "exploration" })} className="text-link underline">
            See {exploration.length} in Exploration
          </Link>
          .
        </p>
      )}
      <ul className="space-y-2">
        {[...top, ...exploration].map((c) => (
          <li key={c.id}>
            <div className="rounded-md border border-border-c p-2.5 hover:bg-surface-2">
              <div className="flex items-start justify-between gap-2">
                <span className="flex flex-wrap items-center gap-1.5">
                  <CompanyNameLink id={c.id} name={c.name} websiteUrl={c.websiteUrl} className="text-sm font-medium text-foreground hover:text-link" />
                  <SignalTierBadge tier={c.signalTier} basis={c.signalTierBasis} />
                  {c.sameSchoolCofounders ? <SameSchoolBadge /> : null}
                </span>
                <QueueBadge queue={c.queue} />
              </div>
              <ul className="mt-1 space-y-1">
                {c.founderLinks.length === 0 && <li className="text-xs text-muted">Founders unknown</li>}
                {c.founderLinks.slice(0, 3).map((f) => (
                  <li key={f.personId} className="flex flex-wrap items-center gap-1 text-xs">
                    <span className="text-foreground">{f.name}</span>
                    <EnrollmentBadge status={f.enrollmentStatus} label={f.enrollmentLabel} basis={f.enrollmentBasis} />
                    <LeftSchoolBadge leftSchool={f.leftSchool} />
                    <PersonLinkButton link={f.link} name={f.name} />
                  </li>
                ))}
              </ul>
              {(() => {
                const link = publicLink(c.websiteUrl, c.primaryLink, c.primaryLinkKind);
                if (!link) return null;
                return (
                  <a href={link.url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex rounded-md bg-accent px-2 py-0.5 text-[11px] font-medium text-accent-foreground">
                    {link.kind === "official" ? "Visit website" : `Open ${link.label}`}
                  </a>
                );
              })()}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function BuildersTab({ universityId }: { universityId: string }) {
  const builders = listBuildersForUniversity(universityId);
  return (
    <ul className="space-y-1.5">
      {builders.map((b) => (
        <li key={b.id} className="rounded-md border border-border-c p-2 text-sm">
          <span className="inline-flex flex-wrap items-center gap-1.5">
            <span className="font-medium text-foreground">{b.name}</span>
            <PersonLinkButton link={b.link} name={b.name} />
          </span>
          <span className="ml-2 text-xs text-muted">{b.status.replace("_", " ")}</span>
          {b.projects.length > 0 && <p className="mt-0.5 text-xs text-muted">Built: {b.projects.join(", ")}</p>}
        </li>
      ))}
      {builders.length === 0 && <p className="text-sm text-muted">No builders on record yet for this campus.</p>}
    </ul>
  );
}

function SignalsTab({ universityId }: { universityId: string }) {
  const signals = listSignalsForUniversity(universityId);
  return (
    <ul className="space-y-1.5">
      {signals.map((s) => (
        <li key={s.id} className="rounded-md border border-border-c p-2 text-sm">
          <p className="font-medium text-foreground">{s.project_name}</p>
          <p className="text-xs text-foreground">{s.current_observation}</p>
          <p className="mt-0.5 text-xs text-muted">
            {s.signal_type.replace("_", " ")}
            {s.source_date ? ` · ${s.source_date}` : ""}
          </p>
        </li>
      ))}
      {signals.length === 0 && <p className="text-sm text-muted">No dated signals recorded for this campus yet.</p>}
    </ul>
  );
}

function SourcesTab({ universityId }: { universityId: string }) {
  const sources = listSources().filter((s) => s.campuses.includes(universityId) || s.campuses.length === 0);
  return (
    <ul className="space-y-1.5">
      {sources.map((s) => (
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
      {sources.length === 0 && <p className="text-sm text-muted">No sources scoped to this campus yet.</p>}
    </ul>
  );
}
