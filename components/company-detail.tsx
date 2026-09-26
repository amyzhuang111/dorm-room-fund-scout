import Link from "next/link";
import type { NamedFounder, ProjectDetail } from "@/lib/domain/queries";
import { storedCompanyLinks } from "@/lib/domain/company-link";
import { EnrollmentBadge, GateBadge, LeftSchoolBadge, SignalTierBadge } from "./badges";
import { PipelineForm } from "./pipeline-form";
import { NotesSection } from "./notes-section";
import { AssessmentForm } from "./assessment-form";
import { FeedbackControls } from "./feedback-controls";
import { PersonLinkButton, ProfileIconLinks } from "./person-link";

function founderHref(founder: NamedFounder): string {
  const params = new URLSearchParams({
    founder: founder.personId,
    enroll: "current_student,recent_grad,older_alumni,unknown",
  });
  if (founder.founderStatus === "potential") params.set("pool", "potential");
  return `/founder/discover?${params.toString()}`;
}

function FounderLine({ founder }: { founder: NamedFounder }) {
  return (
    <li className="flex flex-wrap items-center gap-1.5 text-sm text-foreground">
      <Link href={founderHref(founder)} className="font-medium text-link hover:underline">
        {founder.name}
      </Link>
      <EnrollmentBadge status={founder.enrollmentStatus} label={founder.enrollmentLabel} />
      <LeftSchoolBadge leftSchool={founder.leftSchool} />
      <PersonLinkButton link={founder.link} name={founder.name} />
      <ProfileIconLinks links={founder.profileLinks} name={founder.name} />
      <span className="text-xs text-muted">{[founder.school, founder.program].filter(Boolean).join(" · ") || "School not on record"}</span>
    </li>
  );
}

export function CompanyDetail({ project }: { project: ProjectDetail }) {
  const concernReasons = project.gateOutcomes.filter((g) => g.result !== "pass");
  const strongestEvidence = project.claims[0];
  const strongestConcern = concernReasons[0];

  return (
    <div className="space-y-5 p-4">
      {/* Header */}
      <div>
        <div className="flex items-start justify-between gap-2">
          <h2 className="flex flex-wrap items-center gap-2 text-lg font-semibold text-foreground">
            {project.name}
            <SignalTierBadge tier={project.signalTier} basis={project.signalTierBasis} />
          </h2>
          <GateBadge result={project.overallGate} gateOutcomes={project.gateOutcomes} />
        </div>
        {(() => {
          const links = storedCompanyLinks({
            websiteUrl: project.websiteUrl,
            primaryLink: project.primaryLink,
            sourceUrls: project.claims.map((claim) => claim.sourceUrl),
          });
          const stageGate = project.gateOutcomes.find((gate) => gate.gate === "stage");
          const stage = stageGate?.result === "pass" ? stageGate.rationale : "Not on record";
          return (
            <>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {links.website ? (
                  <a href={links.website} target="_blank" rel="noopener noreferrer" className="inline-flex rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground">
                    Visit website
                  </a>
                ) : (
                  <span className="text-sm text-muted">No website found</span>
                )}
                {links.fallback && (
                  <a href={links.fallback.url} target="_blank" rel="noopener noreferrer" className="inline-flex rounded-md border border-border-c bg-white px-3 py-1.5 text-sm font-medium text-link hover:border-accent">
                    {links.fallback.label} · source page
                  </a>
                )}
                {links.linkedin && (
                  <a href={links.linkedin} target="_blank" rel="noopener noreferrer" className="inline-flex rounded-md border border-border-c bg-white px-3 py-1.5 text-sm font-medium text-link hover:border-accent">
                    Company LinkedIn
                  </a>
                )}
                {links.extras.map((link) => (
                  <a key={link.url} href={link.url} target="_blank" rel="noopener noreferrer" className="inline-flex rounded-md border border-border-c bg-white px-2.5 py-1 text-xs font-medium text-link hover:border-accent">
                    {link.label}
                  </a>
                ))}
              </div>
              <p className="mt-3 text-sm text-foreground">{project.description || "Product description not yet researched."}</p>
              <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted sm:grid-cols-3">
                <div>
                  <dt className="font-semibold uppercase tracking-wide">Sector</dt>
                  <dd className="text-foreground">{project.sectorTags[0] || project.sector || "Not on record"}</dd>
                </div>
                <div>
                  <dt className="font-semibold uppercase tracking-wide">Campus</dt>
                  <dd className="text-foreground">{project.universities.join(", ") || "Not on record"}</dd>
                </div>
                <div>
                  <dt className="font-semibold uppercase tracking-wide">Stage</dt>
                  <dd className="text-foreground">{stage}</dd>
                </div>
                <div>
                  <dt className="font-semibold uppercase tracking-wide">Founded</dt>
                  <dd className="text-foreground">Not on record</dd>
                </div>
                <div>
                  <dt className="font-semibold uppercase tracking-wide">Signal tier</dt>
                  <dd className="text-foreground">{project.signalTier || "Not on record"}</dd>
                </div>
              </dl>
            </>
          );
        })()}
        <ul className="mt-3 space-y-1.5">
          {project.founderLinks.length === 0 && <li className="text-xs text-muted">Founders not yet identified</li>}
          {project.founderLinks.map((founder) => (
            <FounderLine key={founder.personId} founder={founder} />
          ))}
        </ul>
        {project.sectorTags.length > 0 && (
          <p className="mt-2 flex flex-wrap gap-1">
            {project.sectorTags.map((tag) => (
              <span key={tag} className="sector-chip">{tag}</span>
            ))}
          </p>
        )}
        <FeedbackControls entityType="project" entityId={project.id} name={project.name} url={project.websiteUrl || project.primaryLink} />
      </div>

      {/* Above the fold: why look / founder edge / open question */}
      <section className="space-y-3 rounded-md border border-border-c bg-surface p-3">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Why look</h3>
          <p className="mt-0.5 text-sm text-foreground">{project.latestSignalNote ?? "No supporting evidence recorded yet."}</p>
        </div>
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Founder edge</h3>
          <p className="mt-0.5 text-sm text-foreground">
            {project.founders.length ? `${project.founders.join(", ")} — see Evidence below for what's attributed to them directly.` : "Not yet identified from evidence."}
          </p>
        </div>
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Open question</h3>
          <p className="mt-0.5 text-sm text-foreground">{strongestConcern ? strongestConcern.rationale : "No unresolved eligibility concerns on record."}</p>
        </div>
        <div className="flex flex-wrap gap-2 pt-1">
          <a href="#evidence" className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground">
            Research company
          </a>
          <a href="#pipeline" className="rounded-md border border-border-c px-3 py-1.5 text-xs text-foreground hover:bg-surface">
            Save / add to pipeline
          </a>
        </div>
      </section>

      {/* Overview */}
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Overview</h3>
        <ul className="mt-1 space-y-1">
          {project.gateOutcomes.map((g) => (
            <li key={g.gate} className="flex items-start gap-2 text-sm">
              <GateBadge result={g.result} />
              <span className="text-foreground">
                <span className="font-medium capitalize">{g.gate.replace(/_/g, " ")}:</span> {g.rationale}
              </span>
            </li>
          ))}
          {project.gateOutcomes.length === 0 && <li className="text-sm text-muted">Not yet screened.</li>}
        </ul>
      </section>

      {/* Priority / assessment */}
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Priority</h3>
        {project.qualityScore != null ? (
          <p className="mt-1 text-sm text-foreground">
            {project.qualityScore}/100 (coverage {Math.round((project.coverage ?? 0) * 100)}%)
          </p>
        ) : (
          <p className="mt-1 text-sm text-muted">Unassessed — {project.openQuestion ?? "no rubric dimensions rated yet."}</p>
        )}
        <div className="mt-2">
          <AssessmentForm projectId={project.id} history={project.assessmentHistory} />
        </div>
      </section>

      {/* Founders */}
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Founders</h3>
        <ul className="mt-1 space-y-1 text-sm text-foreground">
          {project.founderLinks.length === 0 && <li>None identified yet.</li>}
          {project.founderLinks.map((f) => (
            <li key={f.personId} className="flex flex-wrap items-center gap-2">
              <Link href={founderHref(f)} className="text-link hover:underline">
                {f.name}
              </Link>
              <EnrollmentBadge status={f.enrollmentStatus} label={f.enrollmentLabel} />
              <LeftSchoolBadge leftSchool={f.leftSchool} />
              <PersonLinkButton link={f.link} name={f.name} />
              <ProfileIconLinks links={f.profileLinks} name={f.name} />
              <span className="text-xs text-muted">{[f.school, f.program].filter(Boolean).join(" · ")}</span>
              {f.otherLinks.length > 0 && (
                <ul className="basis-full space-y-0.5">
                  {f.otherLinks.map((item) => {
                    let host = item.url;
                    try {
                      host = new URL(item.url).hostname.replace(/^www\./, "");
                    } catch {
                      host = item.url;
                    }
                    return (
                      <li key={item.url} className="text-xs text-muted">
                        <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-link underline">
                          {host}
                        </a>
                        {item.status === "unverified" ? " · unverified" : ""}
                        {item.excerpt ? ` — ${item.excerpt}` : ""}
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Sources</h3>
        <ul className="mt-1 space-y-1 text-sm">
          {Array.from(new Map(project.claims.filter((c) => c.sourceUrl).map((c) => [c.sourceUrl, c])).values()).map((c) => (
            <li key={c.sourceUrl}>
              <a href={c.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-link underline">
                {c.sourceName || c.label.replaceAll("_", " ")}
              </a>
            </li>
          ))}
          {project.claims.length === 0 && <li className="text-muted">No source pages on record yet.</li>}
        </ul>
      </section>

      {/* Evidence */}
      <section id="evidence">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Evidence ({project.claims.length})</h3>
        {strongestEvidence && (
          <div className="mt-1 rounded-md border border-border-c bg-surface p-2.5 text-sm">
            <p className="text-foreground">{strongestEvidence.excerpt}</p>
            <p className="mt-1 text-xs text-muted">
              {strongestEvidence.label.replace("_", " ")} · retrieved {strongestEvidence.retrievedAt.slice(0, 10)}
              {strongestEvidence.publishedDate ? ` · published ${strongestEvidence.publishedDate}` : ""} ·{" "}
              <a href={strongestEvidence.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline">
                source
              </a>
            </p>
          </div>
        )}
        <ul className="mt-1.5 space-y-2">
          {project.claims.slice(1).map((c) => (
            <li key={c.id} className="rounded-md border border-border-c p-2 text-xs">
              <p className="text-foreground">{c.excerpt}</p>
              <p className="mt-1 text-muted">
                {c.label.replace("_", " ")} · {c.claimType} · retrieved {c.retrievedAt.slice(0, 10)} ·{" "}
                <a href={c.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline">
                  source
                </a>
              </p>
            </li>
          ))}
          {project.claims.length === 0 && <li className="text-sm text-muted">No claims on record yet.</li>}
        </ul>
      </section>

      {/* Activity */}
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Activity ({project.signals.length})</h3>
        <ul className="mt-1 space-y-1.5">
          {project.signals.map((s) => (
            <li key={s.id} className="rounded-md border border-border-c p-2 text-xs">
              <p className="text-foreground">{s.currentObservation}</p>
              <p className="mt-0.5 text-muted">
                {s.signalType.replace(/_/g, " ")}
                {s.sourceDate ? ` · ${s.sourceDate}` : ""}
              </p>
            </li>
          ))}
          {project.signals.length === 0 && <li className="text-sm text-muted">No dated activity recorded yet.</li>}
        </ul>
      </section>

      {/* Notes */}
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Notes ({project.manualNotes.length})</h3>
        <div className="mt-1">
          <NotesSection entityType="project" entityId={project.id} notes={project.manualNotes} />
        </div>
      </section>

      {/* Pipeline */}
      <section id="pipeline">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Pipeline</h3>
        <PipelineForm projectId={project.id} pipeline={project.pipeline} />
      </section>
    </div>
  );
}
