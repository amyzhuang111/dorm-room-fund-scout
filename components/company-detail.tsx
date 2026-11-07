"use client";

import { plainText } from "@/lib/display/plain-text";
import Link from "next/link";
import type { NamedFounder, ProjectDetail } from "@/lib/domain/queries";
import type { StartupCard } from "@/lib/domain/startup-card";
import { eligibilityLines } from "@/lib/domain/claim-scope";
import { EnrollmentBadge, GateBadge, LeftSchoolBadge, SameSchoolBadge, SignalTierBadge, VerificationBadge } from "./badges";
import { EntityMarks, PipelineStageEditor } from "./entity-marks";
import { NotesSection } from "./notes-section";
import { AssessmentForm } from "./assessment-form";
import { FeedbackControls } from "./feedback-controls";
import { PersonLinkButton, ProfileIconLinks } from "./person-link";
import { CompanyFullRecord } from "./company-full-record";
import { InTheNews } from "./in-the-news";

function normalizeOpenQuestion(raw: string): string {
  // Dedupe gate merge tails ("Also recorded: …") when the extra restates the primary.
  const text = raw.replace(/\s+/g, " ").trim();
  const parts = text.split(/\s*Also recorded:\s*/i);
  if (parts.length < 2) return text;
  const primary = parts[0]!.trim();
  const extras = parts.slice(1).map((p) => p.trim()).filter(Boolean);
  const keep: string[] = [];
  const norm = (s: string) => s.toLowerCase().replace(/[—–·|]/g, " ").replace(/\s+/g, " ").trim();
  const seen = new Set([norm(primary)]);
  for (const e of extras) {
    const n = norm(e);
    if (!n || seen.has(n)) continue;
    // Near-duplicate: >70% shared tokens with primary
    const a = new Set(n.split(" "));
    const b = new Set(norm(primary).split(" "));
    const inter = [...a].filter((x) => b.has(x)).length;
    const union = new Set([...a, ...b]).size || 1;
    if (inter / union >= 0.7) continue;
    keep.push(e);
    seen.add(n);
  }
  if (!keep.length) return primary;
  return `${primary} Also recorded: ${keep.join(" · ")}`;
}

function whyLookText(project: ProjectDetail): string {
  const note = project.latestSignalNote?.replace(/\s+/g, " ").trim();
  if (note) return note;
  const round = project.profile.rounds[0];
  if (round) {
    const bits = [round.stage, round.amountText, round.date, round.leads.join(", ")].filter(Boolean);
    if (bits.length) return bits.join(" · ");
  }
  const investor = project.profile.investors[0];
  if (investor) {
    const bits = [investor.name, investor.round, investor.batch].filter(Boolean);
    if (bits.length) return bits.join(" · ");
  }
  const funding = project.profile.funding?.text?.replace(/\s+/g, " ").trim();
  if (funding) return funding;
  const pitch = (project.profile.description?.text || project.description || "").replace(/\s+/g, " ").trim();
  if (pitch) return pitch;
  return "No supporting evidence recorded yet.";
}

function openQuestionText(project: ProjectDetail, raw: string): string {
  const text = normalizeOpenQuestion(raw);
  const generic = text.startsWith("No dated affiliation evidence yet");
  const datedRound = project.profile.rounds.some((round) => Boolean(round.date && !round.date.endsWith("-00")));
  if (generic && (datedRound || project.latestSignalNote)) {
    return "The campus affiliation still has no date. A round or signal date is not an enrollment date.";
  }
  return text;
}

function founderHref(founder: NamedFounder): string {
  const params = new URLSearchParams({
    founder: founder.personId,
    enroll: "current_student,recent_grad,older_alumni",
  });
  if (founder.founderStatus === "potential") params.set("pool", "potential");
  return `/founder/discover?${params.toString()}`;
}

export function CompanyDetail({ project, initialCard }: { project: ProjectDetail; initialCard?: StartupCard | null }) {
  const personConcerns = eligibilityLines(project.founderLinks.map((founder) => ({
    name: founder.name,
    year: founder.graduationYear,
    status: founder.enrollmentStatus,
    basis: founder.enrollmentBasis,
    evidence: founder.enrollmentEvidence,
    sourceUrl: founder.enrollmentSourceUrl,
    leftSchool: founder.leftSchool,
    roleClaimState: founder.roleClaimState,
    roleClaimUrl: founder.roleClaimUrl,
    roleClaimExcerpt: founder.roleClaimExcerpt,
    affiliationSaysCurrentStudent: /current student|current_student/i.test(`${founder.enrollmentStatus ?? ""} ${founder.enrollmentEvidence ?? ""}`),
    affiliationSourceUrl: founder.enrollmentSourceUrl,
  })));
  const gateConcerns = project.gateOutcomes.filter((g) => g.result !== "pass").map((gate) => openQuestionText(project, gate.rationale));
  const concernReasons = [...personConcerns, ...gateConcerns];
  const strongestEvidence = project.claims[0];

  const openQ = concernReasons.length ? concernReasons.join(" ") : "No unresolved eligibility concerns on record.";
  const whyLook = (
      <section className="dossier-brief relative space-y-1.5 overflow-visible rounded-none border border-[color:var(--line,#E1E5EF)] border-l-2 border-l-[color:var(--cobalt,#2F4FD8)] bg-[color:var(--bg,#FFFFFF)] p-2 sm:space-y-2 sm:p-2.5" data-why-look-section="">
        <div>
          <h3 className="font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-[color:var(--cobalt,#2F4FD8)]">Why look</h3>
          <p className="mt-0.5 text-[13px] leading-snug text-[color:var(--fg,#0B0E17)]">{whyLookText(project)}</p>
        </div>
        <div>
          <h3 className="font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-[color:var(--cobalt,#2F4FD8)]">Founder edge</h3>
          <p className="mt-0.5 text-[13px] leading-snug text-[color:var(--fg,#0B0E17)]">
            <span className="sm:hidden">
              {project.founders.length ? "Attributed evidence lives under Evidence below." : "Not yet identified from evidence."}
            </span>
            <span className="hidden sm:inline">
              {project.founders.length ? `${project.founders.join(" · ")} · see Evidence below for what's attributed to them directly.` : "Not yet identified from evidence."}
            </span>
          </p>
        </div>
        <div>
          <h3 className="font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-[color:var(--cobalt,#2F4FD8)]">Open question</h3>
          <p className="mt-0.5 text-[13px] leading-snug text-[color:var(--fg,#0B0E17)]">{plainText(openQ)}</p>
        </div>
        {/* r48: port desk scout actions onto mobile why-look (action path was desk-only). */}
        <div className="flex flex-wrap gap-2 pt-1" data-scout-actions="">
          <a href="#evidence" className="inline-flex min-h-9 items-center rounded-md bg-[color:var(--cobalt,#2F4FD8)] px-3 py-1.5 text-xs font-medium text-white sm:min-h-0 sm:bg-accent sm:text-accent-foreground">
            Research company
          </a>
          <a href="#pipeline" className="inline-flex min-h-9 items-center rounded-md border border-[color:var(--ember,#D96B1C)]/50 px-3 py-1.5 text-xs font-medium text-[color:var(--ember,#D96B1C)] hover:bg-[color:var(--ember,#D96B1C)]/10 sm:min-h-0">
            Save / add to pipeline
          </a>
        </div>
      </section>
  );

  return (
    <div className="space-y-3 p-2.5 sm:space-y-5 sm:p-4">


      {/* r45: Full record lead (founders / identity / CONFIRMED) stays at the top. */}
      <div data-full-record-top="">
        <CompanyFullRecord project={project} directoryCard={initialCard}>{whyLook}</CompanyFullRecord>
      </div>
      <nav className="record-sections" aria-label="Company sections"><a href="#evidence">Evidence & sources</a><a href="#pipeline">Pipeline</a><Link href="/work/shortlist">Saved companies</Link></nav>


      <div className="flex flex-wrap items-center gap-2" data-company-verification="">
        <VerificationBadge status={project.verificationStatus} verifiedAt={project.lastVerifiedAt} note={project.verificationNote} scope="company" />
        <SignalTierBadge tier={project.signalTier} basis={project.signalTierBasis} />
        {project.sameSchoolCofounders ? <SameSchoolBadge /> : null}
        <GateBadge result={project.overallGate} gateOutcomes={project.gateOutcomes} />
      </div>
      <details className="record-review-controls"><summary>Review decisions & notes</summary><FeedbackControls entityType="project" entityId={project.id} name={project.name} url={project.websiteUrl || project.primaryLink} /></details>
      <InTheNews items={project.news} moreHref={`/news?q=${encodeURIComponent(project.name)}`} />

      {/* Overview */}
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Overview</h3>
        <ul className="mt-1 space-y-1">
          {project.gateOutcomes.map((g) => (
            <li key={g.gate} className="flex items-start gap-2 text-sm">
              <GateBadge result={g.result} />
              <span className="text-foreground">
                <span className="font-medium capitalize">{g.gate.replace(/_/g, " ")}:</span> {plainText(openQuestionText(project, g.rationale))}
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
            {project.sameSchoolBonus > 0 ? ` Includes +${project.sameSchoolBonus} for same-school co-founders.` : ""}
          </p>
        ) : (
          <p className="mt-1 text-sm text-muted">Unassessed · {project.openQuestion ?? "no rubric dimensions rated yet."}</p>
        )}
        <div className="mt-2">
          <AssessmentForm projectId={project.id} history={project.assessmentHistory} />
        </div>
      </section>

      {project.hotspots.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Hotspots</h3>
          <ul className="mt-1 space-y-1 text-sm">
            {project.hotspots.map((hotspot) => (
              <li key={hotspot.id} className="flex flex-wrap items-center gap-2">
                <Link href={hotspot.href} className="text-link hover:underline">
                  {hotspot.place}
                </Link>
                <SignalTierBadge tier={hotspot.tier} />
                <span className="text-xs text-muted">{[hotspot.campus, hotspot.type].filter(Boolean).join(" · ")}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {project.founderLinks.length > 0 ? (
      <details data-company-founders="" className="record-review-controls"><summary>Founder evidence & review controls</summary>
        <h3 className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--cobalt,#2F4FD8)]">Founders</h3>
        <ul className="mt-1 space-y-1 text-sm text-foreground">
          {project.founderLinks.map((f) => (
            <li key={f.personId} className="flex flex-wrap items-center gap-2">
              <Link href={founderHref(f)} className="text-link hover:underline">
                {f.name}
              </Link>
              {f.role ? <span className="text-xs text-muted">{f.role.replaceAll("_", " ")}</span> : null}
              <EntityMarks entityType="person" entityId={f.personId} name={f.name} campusName={f.school ?? project.universities[0]} websiteUrl={f.linkedinUrl} />
              <EnrollmentBadge status={f.enrollmentStatus} label={f.enrollmentLabel} basis={f.enrollmentBasis} evidence={f.enrollmentEvidence} sourceUrl={f.enrollmentSourceUrl} leftSchool={f.leftSchool} />
              {!f.roleClaimUrl && !f.roleClaimState ? <span className="text-xs text-muted">Role has no source claim</span> : f.roleClaimState === "unverified" ? <span className="text-xs text-muted">Role claim unverified</span> : null}
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
                        {item.excerpt ? ` · ${plainText(item.excerpt)}` : ""}
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </details> ) : null}


      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Sources</h3>
        <ul className="mt-1 space-y-1 text-sm">
          {Array.from(new Map(project.claims.filter((c) => c.sourceUrl).map((c) => [c.sourceUrl, c])).values()).map((c) => (
            <li key={c.sourceUrl}>
              <a href={c.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-link underline">
                {plainText(c.sourceName) || c.label.replaceAll("_", " ")}
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
            <p className="text-foreground">{plainText(strongestEvidence.excerpt)}</p>
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
              <p className="text-foreground">{plainText(c.excerpt)}</p>
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
        <div className="mt-1">
          <PipelineStageEditor entityType="project" entityId={project.id} name={project.name} campusName={project.universities[0]} websiteUrl={project.websiteUrl} />
        </div>
      </section>
    </div>
  );
}
