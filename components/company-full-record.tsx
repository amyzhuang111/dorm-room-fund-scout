import Link from "next/link";
import type { ReactNode } from "react";
import type { ProjectDetail } from "@/lib/domain/queries";
import { formatCampusList } from "@/lib/domain/campuses";
import { displayedFunding, formatRound } from "@/lib/domain/company-profile";
import { storedCompanyLinks } from "@/lib/domain/company-link";
import { PersonLinkButton, ProfileIconLinks } from "./person-link";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="border-b border-[color:var(--line,#E1E5EF)] py-2.5 sm:grid sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-3">
      <dt className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--cobalt,#2F4FD8)]">{label}</dt>
      <dd className="mt-1 text-[13px] leading-5 text-[color:var(--fg,#0B0E17)] sm:mt-0">{children}</dd>
    </div>
  );
}

function Available({ value, children }: { value: unknown; children?: React.ReactNode }) {
  const empty =
    value == null ||
    value === "" ||
    (Array.isArray(value) && value.length === 0);
  if (empty) return <span className="text-[color:var(--fg-3,#5C647A)]">Not available</span>;
  return <>{children ?? String(value)}</>;
}

/** Every stored company field with Not available when missing. Real DB values only. */
export function CompanyFullRecord({ project }: { project: ProjectDetail }) {
  const profile = project.profile;
  const funding = displayedFunding(profile);
  const links = storedCompanyLinks({
    websiteUrl: project.websiteUrl,
    primaryLink: project.primaryLink,
    sourceUrls: [profile.companyLinkedin?.text, ...project.claims.map((c) => c.sourceUrl)],
  });
  const yc = profile.investors.filter((i) => /y combinator/i.test(i.name));
  const campus = formatCampusList(project.universities);

  return (
    <section className="relative overflow-hidden border border-[color:var(--cobalt,#2F4FD8)]/30 bg-[color:var(--bg,#FFFFFF)] before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-[color:var(--cobalt,#2F4FD8)]" data-company-full-record="">
      <div className="border-b border-[color:var(--line,#E1E5EF)] px-3.5 py-3">
        <p className="scout-kicker">Full record</p>
        <p className="mt-1 text-[15px] font-semibold tracking-tight text-[color:var(--fg,#0B0E17)]">Every field stored for this company</p>
      </div>
      <dl className="px-3.5">
        <Field label="Name"><Available value={project.name}>{project.name}</Available></Field>
        <Field label="Campus"><Available value={campus || null}>{campus}</Available></Field>
        <Field label="Sector">
          <Available value={project.sectorTags[0] || project.sector}>
            {(project.sectorTags.length ? project.sectorTags : [project.sector]).filter(Boolean).join(" · ")}
          </Available>
        </Field>
        <Field label="Stage">
          <Available value={profile.rounds[0]?.stage ?? null}>{profile.rounds[0]?.stage}</Available>
        </Field>
        <Field label="Founded">
          <Available value={profile.foundedYear}>{profile.foundedYear?.text}</Available>
        </Field>
        <Field label="HQ"><Available value={profile.hq}>{profile.hq?.text}</Available></Field>
        <Field label="Status">
          <Available value={profile.operatingStatus}>{profile.operatingStatus?.text}</Available>
        </Field>
        <Field label="Team size"><Available value={profile.teamSize}>{profile.teamSize?.text}</Available></Field>
        <Field label="Description">
          <Available value={profile.description}>{profile.description?.text}</Available>
        </Field>
        <Field label="Funding"><Available value={funding}>{funding?.text}</Available></Field>
        <Field label="Funding rounds">
          <Available value={profile.rounds}>
            <ul className="space-y-1">
              {profile.rounds.map((round, i) => (
                <li key={`${round.sourceUrl}-${i}`}>
                  {formatRound(round) || "Round on record"}
                  {round.sourceUrl ? (
                    <>
                      {" · "}
                      <a href={round.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-[color:var(--cobalt,#2F4FD8)] underline">
                        source
                      </a>
                    </>
                  ) : null}
                </li>
              ))}
            </ul>
          </Available>
        </Field>
        <Field label="Investors">
          <Available value={profile.investors}>
            <ul className="space-y-1">
              {profile.investors.map((inv, i) => (
                <li key={`${inv.name}-${i}`}>
                  {inv.name}
                  {inv.batch ? ` · ${inv.batch}` : ""}
                  {inv.round ? ` · ${inv.round}` : ""}
                  {inv.sourceUrl ? (
                    <>
                      {" · "}
                      <a href={inv.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-[color:var(--cobalt,#2F4FD8)] underline">
                        source
                      </a>
                    </>
                  ) : null}
                </li>
              ))}
            </ul>
          </Available>
        </Field>
        <Field label="YC batch">
          <Available value={yc}>
            {yc.map((i) => [i.name, i.batch].filter(Boolean).join(" · ")).join(" · ")}
          </Available>
        </Field>
        <Field label="Website">
          <Available value={links.website || profile.website}>
            {links.website || profile.website?.text ? (
              <a href={links.website || profile.website!.text} target="_blank" rel="noopener noreferrer" className="text-[color:var(--cobalt,#2F4FD8)] underline">
                {links.website || profile.website!.text}
              </a>
            ) : null}
          </Available>
        </Field>
        <Field label="Company LinkedIn">
          <Available value={links.linkedin || profile.companyLinkedin}>
            {(links.linkedin || profile.companyLinkedin?.text) && (
              <a href={links.linkedin || profile.companyLinkedin!.text} target="_blank" rel="noopener noreferrer" className="text-[color:var(--cobalt,#2F4FD8)] underline">
                {links.linkedin || profile.companyLinkedin!.text}
              </a>
            )}
          </Available>
        </Field>
        <Field label="Other links">
          <Available value={[links.fallback, ...links.extras].filter(Boolean)}>
            <ul className="space-y-1">
              {links.fallback ? (
                <li>
                  <a href={links.fallback.url} target="_blank" rel="noopener noreferrer" className="text-[color:var(--cobalt,#2F4FD8)] underline">
                    {links.fallback.label}
                  </a>
                </li>
              ) : null}
              {links.extras.map((l) => (
                <li key={l.url}>
                  <a href={l.url} target="_blank" rel="noopener noreferrer" className="text-[color:var(--cobalt,#2F4FD8)] underline">
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </Available>
        </Field>
        <Field label="Founders">
          <Available value={project.founderLinks}>
            <ul className="space-y-2">
              {project.founderLinks.map((f) => (
                <li key={f.personId}>
                  <Link href={`/founder/discover?founder=${encodeURIComponent(f.personId)}`} className="font-semibold text-[color:var(--fg,#0B0E17)] underline-offset-2 hover:underline">
                    {f.name}
                  </Link>
                  <span className="text-[color:var(--fg-2,#3F465C)]">
                    {" · "}
                    {[f.role?.replaceAll("_", " "), f.school, f.program, f.enrollmentLabel]
                      .filter(Boolean)
                      .join(" · ") || "role not on record"}
                  </span>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <PersonLinkButton link={f.link} name={f.name} />
                    <ProfileIconLinks links={f.profileLinks} name={f.name} />
                  </div>
                </li>
              ))}
            </ul>
          </Available>
        </Field>
        <Field label="Signals">
          <Available value={project.signals}>
            <ul className="space-y-2" data-full-record-signals="">
              {project.signals.map((s) => (
                <li key={s.id} className="rounded-sm border border-[color:var(--line,#E1E5EF)] px-2.5 py-2">
                  <p className="font-medium tracking-tight">{s.currentObservation}</p>
                  <p className="mt-0.5 font-mono text-[11px] tabular-nums text-[color:var(--fg-3,#5C647A)]">
                    {s.signalType.replaceAll("_", " ")}
                    {s.sourceDate ? ` · ${s.sourceDate}` : " · date Not available"}
                    {s.sourceUrl ? (
                      <>
                        {" · "}
                        <a href={s.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-[color:var(--cobalt,#2F4FD8)] underline">
                          source
                        </a>
                      </>
                    ) : (
                      " · source Not available"
                    )}
                  </p>
                  {s.significanceNote ? <p className="mt-1 text-[12px] text-[color:var(--fg-2,#3F465C)]">{s.significanceNote}</p> : null}
                </li>
              ))}
            </ul>
          </Available>
        </Field>
      </dl>
    </section>
  );
}
