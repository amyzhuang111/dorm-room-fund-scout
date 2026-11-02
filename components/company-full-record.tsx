import Link from "next/link";
import type { ReactNode } from "react";
import type { ProjectDetail } from "@/lib/domain/queries";
import { formatCampusList } from "@/lib/domain/campuses";
import { displayedFunding, formatRound } from "@/lib/domain/company-profile";
import { storedCompanyLinks } from "@/lib/domain/company-link";
import { PersonLinkButton, ProfileIconLinks } from "./person-link";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="border-b border-[color:var(--line,#E1E5EF)] py-3 sm:grid sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-3 sm:py-2.5">
      <dt className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--cobalt,#2F4FD8)]">{label}</dt>
      <dd className="mt-1.5 break-words text-[14px] leading-5 text-[color:var(--fg,#0B0E17)] sm:mt-0 sm:text-[13px]">{children}</dd>
    </div>
  );
}

function isEmpty(value: unknown): boolean {
  return value == null || value === "" || (Array.isArray(value) && value.length === 0);
}

/** Every stored company field; missing ones collapse into one Not yet sourced line. */
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
  const sectorText = (project.sectorTags.length ? project.sectorTags : [project.sector]).filter(Boolean).join(" · ");
  const otherLinks = [links.fallback, ...links.extras].filter(Boolean);
  const website = links.website || profile.website?.text || null;
  const companyLi = links.linkedin || profile.companyLinkedin?.text || null;
  const stage = profile.rounds[0]?.stage ?? null;

  const missing: string[] = [];
  if (isEmpty(campus)) missing.push("Campus");
  if (isEmpty(sectorText)) missing.push("Sector");
  if (isEmpty(stage)) missing.push("Stage");
  if (isEmpty(profile.foundedYear)) missing.push("Founded");
  if (isEmpty(profile.hq)) missing.push("HQ");
  if (isEmpty(profile.operatingStatus)) missing.push("Status");
  if (isEmpty(profile.teamSize)) missing.push("Team size");
  if (isEmpty(profile.description)) missing.push("Description");
  if (isEmpty(funding)) missing.push("Funding");
  if (isEmpty(profile.rounds)) missing.push("Funding rounds");
  if (isEmpty(profile.investors)) missing.push("Investors");
  if (isEmpty(yc)) missing.push("YC batch");
  if (isEmpty(website)) missing.push("Website");
  if (isEmpty(companyLi)) missing.push("Company LinkedIn");
  if (isEmpty(otherLinks)) missing.push("Other links");
  if (isEmpty(project.founderLinks)) missing.push("Founders");
  if (isEmpty(project.signals)) missing.push("Signals");

  return (
    <section
      className="relative mb-6 overflow-hidden border border-[color:var(--cobalt,#2F4FD8)]/30 bg-[color:var(--bg,#FFFFFF)] pb-2 before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-[color:var(--cobalt,#2F4FD8)] sm:mb-0"
      data-company-full-record=""
    >
      <div className="border-b border-[color:var(--line,#E1E5EF)] bg-[color:var(--cobalt-haze,#E8ECFA)]/35 px-3.5 py-3.5">
        <p className="scout-kicker">Full record</p>
        <p className="mt-1 scout-display text-[28px] leading-none sm:text-[24px]">Every field on file</p>
        <p className="mt-1.5 font-mono text-[11px] text-[color:var(--fg-2,#3F465C)]">
          Sourced values only · empty fields listed once below
        </p>
      </div>
      <dl className="px-3.5">
        <Field label="Name">{project.name || "Not available"}</Field>
        {!isEmpty(campus) ? <Field label="Campus">{campus}</Field> : null}
        {!isEmpty(sectorText) ? <Field label="Sector">{sectorText}</Field> : null}
        {!isEmpty(stage) ? <Field label="Stage">{stage}</Field> : null}
        {!isEmpty(profile.foundedYear) ? <Field label="Founded">{profile.foundedYear?.text}</Field> : null}
        {!isEmpty(profile.hq) ? <Field label="HQ">{profile.hq?.text}</Field> : null}
        {!isEmpty(profile.operatingStatus) ? <Field label="Status">{profile.operatingStatus?.text}</Field> : null}
        {!isEmpty(profile.teamSize) ? <Field label="Team size">{profile.teamSize?.text}</Field> : null}
        {!isEmpty(profile.description) ? <Field label="Description">{profile.description?.text}</Field> : null}
        {!isEmpty(funding) ? <Field label="Funding">{funding?.text}</Field> : null}
        {!isEmpty(profile.rounds) ? (
          <Field label="Funding rounds">
            <ul className="space-y-1.5">
              {profile.rounds.map((round, i) => (
                <li key={`${round.sourceUrl}-${i}`} className="leading-5">
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
          </Field>
        ) : null}
        {!isEmpty(profile.investors) ? (
          <Field label="Investors">
            <ul className="space-y-1.5">
              {profile.investors.map((inv, i) => (
                <li key={`${inv.name}-${i}`} className="break-words">
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
          </Field>
        ) : null}
        {!isEmpty(yc) ? (
          <Field label="YC batch">
            <ul className="space-y-1">
              {yc.map((i, idx) => (
                <li key={`${i.name}-${i.batch ?? ""}-${idx}`} className="break-words">
                  {[i.name, i.batch].filter(Boolean).join(" · ")}
                </li>
              ))}
            </ul>
          </Field>
        ) : null}
        {!isEmpty(website) ? (
          <Field label="Website">
            <a href={website!} target="_blank" rel="noopener noreferrer" className="break-all text-[color:var(--cobalt,#2F4FD8)] underline">
              {website}
            </a>
          </Field>
        ) : null}
        {!isEmpty(companyLi) ? (
          <Field label="Company LinkedIn">
            <a href={companyLi!} target="_blank" rel="noopener noreferrer" className="break-all text-[color:var(--cobalt,#2F4FD8)] underline">
              {companyLi}
            </a>
          </Field>
        ) : null}
        {!isEmpty(otherLinks) ? (
          <Field label="Other links">
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
          </Field>
        ) : null}
        {!isEmpty(project.founderLinks) ? (
          <Field label="Founders">
            <ul className="space-y-2.5">
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
          </Field>
        ) : null}
        {!isEmpty(project.signals) ? (
          <Field label="Signals">
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
          </Field>
        ) : null}
        {missing.length > 0 ? (
          <div className="border-b border-[color:var(--line,#E1E5EF)] py-3 last:border-b-0" data-not-yet-sourced="">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--fg-3,#5C647A)]">Not yet sourced</p>
            <p className="mt-1.5 text-[13px] leading-5 text-[color:var(--fg-2,#3F465C)]">
              {missing.join(" · ")}
            </p>
          </div>
        ) : null}
      </dl>
    </section>
  );
}
