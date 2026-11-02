import Link from "next/link";
import type { ReactNode } from "react";
import type { NamedFounder, ProjectDetail } from "@/lib/domain/queries";
import { formatCampusList } from "@/lib/domain/campuses";
import { displayedFunding, formatRound } from "@/lib/domain/company-profile";
import { storedCompanyLinks } from "@/lib/domain/company-link";
import { isBoilerplateDescription } from "@/lib/domain/sectors";
import { PersonLinkButton, ProfileIconLinks } from "./person-link";
import { CampusSeal } from "@/components/campus-seal";

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

/** X (twitter) + LinkedIn only - never invent other socials. Shows every stored LinkedIn (confirmed / likely / unverified). */
function FounderSocial({ founder }: { founder: NamedFounder }) {
  const xLinks = founder.profileLinks.filter((l) => l.type === "twitter");
  const linkedIn =
    founder.link &&
    (founder.link.kind === "linkedin" || founder.link.kind === "likely" || founder.link.kind === "unverified")
      ? founder.link
      : founder.linkedinUrl
        ? { kind: "linkedin" as const, url: founder.linkedinUrl, label: "LinkedIn" }
        : founder.linkedinCandidates?.[0]?.url
          ? {
              kind: (founder.linkedinCandidates[0].confidence === "likely" ? "likely" : "unverified") as "likely" | "unverified",
              url: founder.linkedinCandidates[0].url,
              label: founder.linkedinCandidates[0].confidence === "likely" ? "LinkedIn" : "LinkedIn (unverified)",
            }
          : null;
  if (!linkedIn && xLinks.length === 0) return null;
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-2" data-founder-social="">
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

  const keyStats = (
    [
      campus ? { label: "Campus", value: campus } : null,
      stage ? { label: "Stage", value: stage } : null,
      signalCount > 0 ? { label: "Signals", value: signalCount.toLocaleString("en-US"), suffix: "on record" } : null,
      founded ? { label: "Founded", value: founded } : null,
      funding?.text ? { label: "Funding", value: funding.text } : null,
      sectorText ? { label: "Sector", value: sectorText } : null,
    ].filter(Boolean) as { label: string; value: string; suffix?: string }[]
  ).slice(0, 3);

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
      className="relative mb-6 scroll-mt-16 border border-[color:var(--cobalt,#2F4FD8)]/30 bg-[color:var(--bg,#FFFFFF)] pb-3 before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-[color:var(--cobalt,#2F4FD8)] sm:mb-0 sm:scroll-mt-0"
      data-company-full-record=""
    >
      <div className="border-b border-[color:var(--line,#E1E5EF)] px-3.5 py-3 pl-4 sm:py-3.5">
        <p className="scout-kicker">Full record</p>
        <p className="mt-1 text-[28px] font-bold leading-[1.05] tracking-tight text-[color:var(--fg,#0B0E17)] sm:text-[24px]" data-full-record-title="">
          {project.name || "Company"}
        </p>
        {/* r48: desk Links action path — website CTA in the title band on mobile */}
        {website ? (
          <p className="mt-2 sm:hidden" data-full-record-scout-link="">
            <a
              href={website}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-9 items-center rounded-sm border border-[color:var(--cobalt,#2F4FD8)] bg-[color:var(--cobalt,#2F4FD8)] px-3 font-mono text-[11px] font-semibold text-white"
            >
              Open website
            </a>
            {yc.length ? (
              <span className="ml-2 font-mono text-[11px] text-[color:var(--fg-2,#3F465C)]">
                {yc.map((i) => [i.name, i.batch].filter(Boolean).join(" · ")).join(" · ")}
              </span>
            ) : null}
          </p>
        ) : yc.length ? (
          <p className="mt-1.5 font-mono text-[11px] text-[color:var(--fg-2,#3F465C)] sm:hidden" data-full-record-capital-peek="">
            {yc.map((i) => [i.name, i.batch].filter(Boolean).join(" · ")).join(" · ")}
          </p>
        ) : null}
      </div>

      {/* Lead: mobile order keyStats → founders → pitch; desk keeps DOM founders → pitch → stats */}
      <div className="flex flex-col sm:contents" data-full-record-lead="">
      {!isEmpty(project.founderLinks) ? (
        <div className="order-2 border-b border-[color:var(--line,#E1E5EF)] px-3.5 py-2.5 pl-4 sm:order-none sm:py-3.5" data-full-record-founders-lead="">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--ember,#D96B1C)]">Founders</p>
          <ul className="mt-1.5 space-y-2 sm:mt-2.5 sm:space-y-3">
            {project.founderLinks.map((f) => (
              <li key={f.personId} className="flex gap-2.5 sm:gap-3">
                <div
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[color:var(--line,#E1E5EF)] bg-[color:var(--cobalt-haze,#E8ECFA)]/55 font-mono text-[11px] font-bold text-[color:var(--cobalt,#2F4FD8)] sm:h-11 sm:w-11 sm:text-[12px]"
                  aria-hidden
                >
                  {monogram(f.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/founder/discover?founder=${encodeURIComponent(f.personId)}`}
                    className="text-[14px] font-semibold tracking-tight text-[color:var(--fg,#0B0E17)] underline-offset-2 hover:underline sm:text-[15px]"
                  >
                    {f.name}
                  </Link>
                  <p className="mt-0.5 font-mono text-[11px] leading-4 text-[color:var(--fg-2,#3F465C)]">
                    {/* Mobile: short campus · role; desk keeps full provenance line */}
                    <span className="sm:hidden">
                      {[f.role?.replaceAll("_", " "), (f.school || "").replace(/^University of (?:California, )?/, "").replace(/ University$/, "") || null].filter(Boolean).join(" · ") || "Role not on record"}
                    </span>
                    <span className="hidden sm:inline">
                      {[f.role?.replaceAll("_", " "), f.school, f.program, f.enrollmentLabel].filter(Boolean).join(" · ") || "Role not on record"}
                    </span>
                  </p>
                  <div className="max-sm:[&_a]:inline-flex max-sm:[&_a]:min-h-9 max-sm:[&_a]:min-w-9 max-sm:[&_a]:items-center">
                    <FounderSocial founder={f} />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {pitch ? (
        <div className="order-3 border-b border-[color:var(--line,#E1E5EF)] px-3.5 py-2.5 pl-4 sm:order-none sm:py-3" data-full-record-pitch="">
          <p className="text-[14px] leading-5 text-[color:var(--fg-2,#3F465C)]">{pitch}</p>
        </div>
      ) : null}

      {keyStats.length > 0 ? (
        <div
          className={`order-1 grid gap-px border-b border-[color:var(--line,#E1E5EF)] bg-[color:var(--line,#E1E5EF)] sm:order-none ${
            keyStats.length >= 3 ? "grid-cols-3" : keyStats.length === 2 ? "grid-cols-2" : "grid-cols-1"
          }`}
          data-full-record-key-stats=""
        >
          {keyStats.map((stat) => (
            <div key={stat.label} className="bg-[color:var(--bg,#FFFFFF)] px-3 py-2.5">
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--fg-3,#5C647A)] sm:text-[9px]">{stat.label}</p>
              <p className="mt-1 flex min-w-0 flex-wrap items-baseline gap-1 text-[15px] font-semibold leading-5 tracking-tight text-[color:var(--fg,#0B0E17)] sm:text-[13px]">
                {stat.label === "Campus" ? <CampusSeal label={stat.value} size="sm" /> : null}
                <span className="min-w-0 break-words [overflow-wrap:anywhere]">{stat.value}</span>
                {stat.suffix ? (
                  <span className="whitespace-nowrap font-mono text-[10px] font-medium text-[color:var(--fg-3,#5C647A)]">{stat.suffix}</span>
                ) : null}
              </p>
            </div>
          ))}
        </div>
      ) : null}
      </div>

      <div className="flex flex-col space-y-3 px-3.5 py-3 pl-4 sm:block sm:space-y-3 sm:py-3.5" data-full-record-groups="">
        {hasIdentity ? (
          <div className="order-2 sm:order-none">
          <Group title="Identity">
            {/* Mobile: skip fields already shown in keyStats to cut empty repeat hierarchy */}
            {!isEmpty(campus) ? (
              <div className={keyStats.some((s) => s.label === "Campus") ? "hidden sm:contents" : undefined}>
                <Field label="Campus">{campus}</Field>
              </div>
            ) : null}
            {!isEmpty(sectorText) ? (
              <div className={keyStats.some((s) => s.label === "Sector") ? "hidden sm:contents" : undefined}>
                <Field label="Sector">{sectorText}</Field>
              </div>
            ) : null}
            {!isEmpty(stage) ? (
              <div className={keyStats.some((s) => s.label === "Stage") ? "hidden sm:contents" : undefined}>
                <Field label="Stage">{stage}</Field>
              </div>
            ) : null}
            {!isEmpty(profile.foundedYear) ? (
              <div className={keyStats.some((s) => s.label === "Founded") ? "hidden sm:contents" : undefined}>
                <Field label="Founded">{profile.foundedYear?.text}</Field>
              </div>
            ) : null}
            {!isEmpty(profile.hq) ? <Field label="HQ">{profile.hq?.text}</Field> : null}
            {!isEmpty(profile.operatingStatus) ? <Field label="Status">{profile.operatingStatus?.text}</Field> : null}
            {!isEmpty(profile.teamSize) ? <Field label="Team size">{profile.teamSize?.text}</Field> : null}
            {!isEmpty(profile.description) && !pitch ? <Field label="Description">{profile.description?.text}</Field> : null}
            {!isEmpty(profile.description) && pitch && (profile.description?.text || "").trim() !== pitch ? (
              <Field label="Description">{profile.description?.text}</Field>
            ) : null}
          </Group>
          </div>
        ) : null}

        {hasCapital ? (
          <div className="order-1 sm:order-none" data-full-record-capital-first="">
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
          </div>
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
