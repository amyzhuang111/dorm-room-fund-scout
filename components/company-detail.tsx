import type { ProjectDetail } from "@/lib/domain/queries";
import { publicLink } from "@/lib/domain/company-link";
import { GateBadge } from "./badges";
import { PipelineForm } from "./pipeline-form";
import { NotesSection } from "./notes-section";
import { AssessmentForm } from "./assessment-form";
import { FeedbackControls } from "./feedback-controls";

export function CompanyDetail({ project }: { project: ProjectDetail }) {
  const concernReasons = project.gateOutcomes.filter((g) => g.result !== "pass");
  const strongestEvidence = project.claims[0];
  const strongestConcern = concernReasons[0];

  return (
    <div className="space-y-5 p-4">
      {/* Header */}
      <div>
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-lg font-semibold text-foreground">{project.name}</h2>
          <GateBadge result={project.overallGate} gateOutcomes={project.gateOutcomes} />
        </div>
        <p className="mt-1 text-sm text-foreground">{project.description || "Product description not yet researched."}</p>
        <p className="mt-1 text-xs text-muted">
          {project.founderLinks.length === 0
            ? "Founders not yet identified"
            : project.founderLinks.map((f, i) => (
                <span key={f.name}>
                  {i > 0 ? ", " : ""}
                  {f.name}
                  {f.linkedinUrl && (
                    <>
                      {" "}
                      <a href={f.linkedinUrl} target="_blank" rel="noopener noreferrer" className="text-accent underline">
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
          {" · "}
          {project.universities.join(", ") || "University unknown"}
        </p>
        {(() => {
          const link = publicLink(project.websiteUrl, project.primaryLink, project.primaryLinkKind);
          if (!link) return <p className="mt-1 text-xs text-muted">No public page on record</p>;
          return (
            <a href={link.url} target="_blank" rel="noopener noreferrer" className="link-chip mt-2 max-w-full truncate">
              {link.kind === "official" ? link.url.replace(/^https?:\/\//, "") : `${link.label} · ${link.url.replace(/^https?:\/\//, "")}`}
            </a>
          );
        })()}
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
      <section className="space-y-3 rounded-md border border-border-c bg-surface-2 p-3">
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
            <li key={f.name}>
              {f.name}
              {f.linkedinUrl ? (
                <a href={f.linkedinUrl} target="_blank" rel="noopener noreferrer" className="ml-2 text-xs text-accent underline">
                  LinkedIn
                </a>
              ) : (
                <span className="ml-2 text-xs text-muted">No LinkedIn on record</span>
              )}
            </li>
          ))}
        </ul>
      </section>

      {/* Evidence */}
      <section id="evidence">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Evidence ({project.claims.length})</h3>
        {strongestEvidence && (
          <div className="mt-1 rounded-md border border-border-c bg-surface-2 p-2.5 text-sm">
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
