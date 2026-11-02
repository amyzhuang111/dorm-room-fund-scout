import Link from "next/link";
import type { ReactNode } from "react";
import type { NamedFounder, ProjectDetail } from "@/lib/domain/queries";
import { formatCampusList } from "@/lib/domain/campuses";
import { displayedFunding, formatRound } from "@/lib/domain/company-profile";
import { storedCompanyLinks } from "@/lib/domain/company-link";
import { isBoilerplateDescription } from "@/lib/domain/sectors";
import { PersonLinkButton, ProfileIconLinks } from "./person-link";

function isEmpty(value: unknown): boolean {
  return value == null || value === "" || (Array.isArray(value) && value.length === 0);
}

function oneLinePitch(raw: string | null | undefined): string | null {
  const text = (raw || "").replace(/\s+/g, " ").trim();
  if (!text || isBoilerplateDescription(text)) return null;
  const first = (text.split(/(?<=[.!?])\s+/)[0] || text).trim();
  if (first.length <= 140) return first;
  const cut = first.slice(0, 140);
  const sp = cut.lastIndexOf(" ");
  return `${(sp > 80 ? cut.slice(0, sp) : cut).trim()}...`;
}

function monogram(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] || ""}${parts[parts.length - 1]![0] || ""}`.toUpperCase();
}

/** X (twitter) + LinkedIn only - never invent other socials. */
function FounderSocial({ founder }: { founder: NamedFounder }) {
  const xLinks = founder.profileLinks.filter((l) => l.type === "twitter");
  const linkedIn =
    founder.link && (founder.link.kind === "linkedin" || founder.link.kind === "likely")
      ? founder.link
      : founder.linkedinUrl
        ? { kind: "linkedin" as const, url: founder.linkedinUrl, label: "LinkedIn" }
        : null;
  if (!linkedIn && xLinks.length === 0) return null;
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-2">
      {linkedIn ? <PersonLinkButton link={linkedIn} name={founder.name} /> : null}
      {xLinks.length ? <ProfileIconLinks links={xLinks} name={founder.name} /> : null}
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="overflow-hidden border border-[color:var(--line,#E1E5EF)] bg-[color:var(--bg,#FFFFFF)]" data-full-record-group={title}>
      <div className="border-b border-[color:var(--line,#E1E5EF)] bg-[color:var(--cobalt-haze,#E8ECFA)]/30 px-3 py-2">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--cobalt,#2F4FD8)]">{title}</p>
      </div>
      <dl className="px-3">{children}</dl>
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="border-b border-[color:var(--line,#E1E5EF)] py-2.5 last:border-b-0 sm:grid sm:grid-cols-[8.5rem_minmax(0,1fr)] sm:gap-3 sm:py-2">
      <dt className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--fg-3,#5C647A)]">{label}</dt>
      <dd className="mt-1 break-words text-[14px] leading-5 text-[color:var(--fg,#0B0E17)] sm:mt-0 sm:text-[13px]">{children}</dd>
    </div>
  );
}

/** Every stored company field; lead with founders + pitch + key stats, then grouped cards. */
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
  const pitch = oneLinePitch(profile.description?.text || project.description);
  const founded = profile.foundedYear?.text ?? null;
  const signalCount = project.signals.length;

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

  const keyStats = [
    campus ? { label: "Campus", value: campus } : null,
    stage ? { label: "Stage", value: stage } : funding?.text ? { label: "Funding", value: funding.text } : null,
    signalCount > 0
      ? { label: "Signals", value: `${signalCount.toLocaleString("en-US")} on record` }
      : founded
        ? { label: "Founded", value: founded }
        : sectorText
          ? { label: "Sector", value: sectorText }
          : null,
  ].filter(Boolean) as { label: string; value: string }[];

  const hasIdentity =
    !isEmpty(campus) ||
    !isEmpty(sectorText) ||
    !isEmpty(stage) ||
    !isEmpty(profile.foundedYear) ||
    !isEmpty(profile.hq) ||
    !isEmpty(profile.operatingStatus) ||
    !isEmpty(profile.teamSize);
  const hasCapital = !isEmpty(funding) || !isEmpty(profile.rounds) || !isEmpty(profile.investors) || !isEmpty(yc);
  const hasLinks = !isEmpty(website) || !isEmpty(companyLi) || !isEmpty(otherLinks);

  return (
    <section
      className="relative mb-6 border border-[color:var(--cobalt,#2F4FD8)]/30 bg-[color:var(--bg,#FFFFFF)] pb-3 before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-[color:var(--cobalt,#2F4FD8)] sm:mb-0"
      data-company-full-record=""
    >
      <div className="border-b border-[color:var(--line,#E1E5EF)] px-3.5 py-3.5 pl-4">
        <p className="scout-kicker">Full record</p>
        <p className="mt-1 text-[22px] font-bold leading-tight tracking-tight text-[color:var(--fg,#0B0E17)] sm:text-[24px]">
          {project.name || "Company"}
        </p>
        {pitch ? (
          <p className="mt-2 text-[14px] leading-5 text-[color:var(--fg-2,#3F465C)]" data-full-record-pitch="">
            {pitch}
          </p>
        ) : null}
      </div>

      {/* Lead: founders above the fold */}
      {!isEmpty(project.founderLinks) ? (
        <div className="border-b border-[color:var(--line,#E1E5EF)] px-3.5 py-3.5 pl-4" data-full-record-founders-lead="">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--ember,#D96B1C)]">Founders</p>
          <ul className="mt-2.5 space-y-3">
            {project.founderLinks.map((f) => (
              <li key={f.personId} className="flex gap-3">
                <div
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-[color:var(--line,#E1E5EF)] bg-[color:var(--cobalt-haze,#E8ECFA)]/55 font-mono text-[12px] font-bold text-[color:var(--cobalt,#2F4FD8)]"
                  aria-hidden
                >
                  {monogram(f.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/founder/discover?founder=${encodeURIComponent(f.personId)}`}
                    className="text-[15px] font-semibold tracking-tight text-[color:var(--fg,#0B0E17)] underline-offset-2 hover:underline"
                  >
                    {f.name}
                  </Link>
                  <p className="mt-0.5 font-mono text-[11px] leading-4 text-[color:var(--fg-2,#3F465C)]">
                    {[f.role?.replaceAll("_", " "), f.school, f.program, f.enrollmentLabel].filter(Boolean).join(" · ") || "Role not on record"}
                  </p>
                  <FounderSocial founder={f} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {keyStats.length > 0 ? (
        <div className="grid grid-cols-3 gap-px border-b border-[color:var(--line,#E1E5EF)] bg-[color:var(--line,#E1E5EF)]" data-full-record-key-stats="">
          {keyStats.map((stat) => (
            <div key={stat.label} className="bg-[color:var(--bg,#FFFFFF)] px-3 py-2.5">
              <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-[color:var(--fg-3,#5C647A)]">{stat.label}</p>
              <p className="mt-1 break-words text-[13px] font-semibold leading-4 tracking-tight text-[color:var(--fg,#0B0E17)]">{stat.value}</p>
            </div>
          ))}
        </div>
      ) : null}

      <div className="space-y-3 px-3.5 py-3.5 pl-4">
        {hasIdentity ? (
          <Group title="Identity">
            {!isEmpty(campus) ? <Field label="Campus">{campus}</Field> : null}
            {!isEmpty(sectorText) ? <Field label="Sector">{sectorText}</Field> : null}
            {!isEmpty(stage) ? <Field label="Stage">{stage}</Field> : null}
            {!isEmpty(profile.foundedYear) ? <Field label="Founded">{profile.foundedYear?.text}</Field> : null}
            {!isEmpty(profile.hq) ? <Field label="HQ">{profile.hq?.text}</Field> : null}
            {!isEmpty(profile.operatingStatus) ? <Field label="Status">{profile.operatingStatus?.text}</Field> : null}
            {!isEmpty(profile.teamSize) ? <Field label="Team size">{profile.teamSize?.text}</Field> : null}
            {!isEmpty(profile.description) && !pitch ? <Field label="Description">{profile.description?.text}</Field> : null}
            {!isEmpty(profile.description) && pitch && (profile.description?.text || "").trim() !== pitch ? (
              <Field label="Description">{profile.description?.text}</Field>
            ) : null}
          </Group>
        ) : null}

        {hasCapital ? (
          <Group title="Capital">
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
          </Group>
        ) : null}

        {hasLinks ? (
          <Group title="Links">
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
          </Group>
        ) : null}

        {!isEmpty(project.signals) ? (
          <Group title="Signals">
            <div className="py-2" data-full-record-signals="">
              <ul className="space-y-2">
                {project.signals.map((s) => (
                  <li key={s.id} className="rounded-sm border border-[color:var(--line,#E1E5EF)] px-2.5 py-2">
                    <p className="font-medium tracking-tight">{s.currentObservation}</p>
                    <p className="mt-0.5 font-mono text-[11px] tabular-nums text-[color:var(--fg-3,#5C647A)]">
                      {s.signalType.replaceAll("_", " ")}
                      {s.sourceDate ? ` · ${s.sourceDate}` : ""}
                      {s.sourceUrl ? (
                        <>
                          {" · "}
                          <a href={s.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-[color:var(--cobalt,#2F4FD8)] underline">
                            source
                          </a>
                        </>
                      ) : null}
                    </p>
                    {s.significanceNote ? <p className="mt-1 text-[12px] text-[color:var(--fg-2,#3F465C)]">{s.significanceNote}</p> : null}
                  </li>
                ))}
              </ul>
            </div>
          </Group>
        ) : null}

        {missing.length > 0 ? (
          <div className="border border-[color:var(--line,#E1E5EF)] px-3 py-2.5" data-not-yet-sourced="">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--fg-3,#5C647A)]">Not yet sourced</p>
            <p className="mt-1.5 text-[13px] leading-5 text-[color:var(--fg-2,#3F465C)]">{missing.join(" · ")}</p>
          </div>
        ) : null}
      </div>
    </section>
  );
}
