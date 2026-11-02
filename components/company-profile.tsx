import type { ReactNode } from "react";
import Link from "next/link";
import type { CompanyProfile, FundingRound, InvestorFact, SourcedValue } from "@/lib/domain/company-profile";
import { displayedFunding, formatRound, latestRound } from "@/lib/domain/company-profile";
import type { NamedFounder } from "@/lib/domain/queries";
import { PersonLinkButton, ProfileIconLinks } from "./person-link";

function founderHref(founder: NamedFounder): string {
  const params = new URLSearchParams({
    founder: founder.personId,
    enroll: "current_student,recent_grad,older_alumni",
  });
  if (founder.founderStatus === "potential") params.set("pool", "potential");
  return `/founder/discover?${params.toString()}`;
}

function roleLabel(role: string | null): string {
  if (!role) return "Founder";
  return role.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function FactSource({ fact }: { fact: { sourceUrl: string; excerpt: string } }) {
  return (
    <a href={fact.sourceUrl} target="_blank" rel="noopener noreferrer" title={fact.excerpt} className="ml-1 text-[10px] font-medium text-link hover:underline">
      source
    </a>
  );
}

function FactValue({ fact, unknown = "Not available" }: { fact: SourcedValue | null; unknown?: string | null }) {
  if (!fact) return unknown == null ? null : <span className="text-muted">{unknown}</span>;
  return (
    <span className="text-foreground">
      {fact.text}
      <FactSource fact={fact} />
    </span>
  );
}

function RoundValue({ round, unknown = "Not available" }: { round: FundingRound | null; unknown?: string | null }) {
  if (!round) return unknown == null ? null : <span className="text-muted">{unknown}</span>;
  const text = formatRound(round);
  if (!text) return unknown == null ? null : <span className="text-muted">{unknown}</span>;
  return (
    <span className="text-foreground">
      {text}
      <FactSource fact={round} />
    </span>
  );
}

function investorLabel(investor: InvestorFact): string {
  const notes = [investor.batch, investor.kind === "lead" ? "led the round" : null].filter(Boolean);
  return notes.length ? `${investor.name} · ${notes.join(" · ")}` : investor.name;
}

const ROUND_ORDER = ["Pre-seed", "Seed", "Series A", "Series B", "Series C", "Series D"];

function groupInvestors(investors: InvestorFact[]): { round: string; investors: InvestorFact[] }[] {
  const byRound = new Map<string, InvestorFact[]>();
  const accelerators: InvestorFact[] = [];
  const unnamedRound: InvestorFact[] = [];
  for (const investor of investors) {
    if (investor.round) {
      const list = byRound.get(investor.round) ?? [];
      list.push(investor);
      byRound.set(investor.round, list);
    } else if (investor.kind === "accelerator") {
      accelerators.push(investor);
    } else {
      unnamedRound.push(investor);
    }
  }
  const groups = [...byRound.entries()]
    .sort((a, b) => {
      const ai = ROUND_ORDER.indexOf(a[0]);
      const bi = ROUND_ORDER.indexOf(b[0]);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    })
    .map(([round, rows]) => ({ round, investors: rows }));
  if (unnamedRound.length) groups.push({ round: "Investors", investors: unnamedRound });
  if (accelerators.length) groups.push({ round: "Accelerators", investors: accelerators });
  return groups;
}

export function CompanyProfileCard({ profile, founders, compact = false }: { profile: CompanyProfile; founders: NamedFounder[]; compact?: boolean }) {
  const round = latestRound(profile);
  const cells: { label: string; value: ReactNode }[] = [
    ...(!compact && profile.operatingStatus ? [{ label: "Status", value: <FactValue fact={profile.operatingStatus} /> }] : []),
    ...(profile.foundedYear || !compact ? [{ label: "Founded", value: <FactValue fact={profile.foundedYear} unknown={compact ? null : "Not available"} /> }] : []),
    ...((displayedFunding(profile) || !compact) ? [{ label: "Funding", value: <FactValue fact={displayedFunding(profile)} unknown={compact ? null : "Not available"} /> }] : []),
    ...((round || !compact) ? [{ label: "Latest round", value: <RoundValue round={round} unknown={compact ? null : "Not available"} /> }] : []),
    ...(!compact
      ? [
          { label: "HQ", value: <FactValue fact={profile.hq} /> },
          { label: "Team size", value: <FactValue fact={profile.teamSize} /> },
          {
            label: "Website",
            value: profile.website ? (
              <span>
                <a href={profile.website.text} target="_blank" rel="noopener noreferrer" className="text-link hover:underline">
                  {profile.website.text.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
                </a>
                <FactSource fact={profile.website} />
              </span>
            ) : (
              <span className="text-muted">Not available</span>
            ),
          },
        ]
      : []),
  ];

  if (compact && !profile.foundedYear && !displayedFunding(profile) && !round && profile.investors.length === 0 && profile.rounds.length === 0) return null;
  // Compact: hide the whole card when every funding fact is empty (no "Not available" walls).
  if (compact && !profile.foundedYear && !displayedFunding(profile) && !round && profile.investors.length === 0) return null;

  return (
    <section className="mt-3 rounded-md border border-border-c bg-surface p-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{compact ? "Funding" : "Profile"}</h3>
      {!compact && (
      <p className="mt-1 text-sm text-foreground">
        {profile.description ? (
          <>
            {profile.description.text}
            <FactSource fact={profile.description} />
          </>
        ) : (
          <span className="text-muted">Not available</span>
        )}
      </p>
      )}
      {!compact && (
      <div className="mt-3">
        <h4 className="text-[10px] font-semibold uppercase tracking-wide text-muted">Founders</h4>
        {founders.length === 0 ? (
          <p className="mt-0.5 text-xs text-muted">Not available</p>
        ) : (
          <ul className="mt-1 space-y-1">
            {founders.map((founder) => (
              <li key={founder.personId} className="flex flex-wrap items-center gap-1.5 text-xs text-foreground">
                <Link href={founderHref(founder)} className="font-medium text-link hover:underline">
                  {founder.name}
                </Link>
                <span className="text-muted">{roleLabel(founder.role)}</span>
                <PersonLinkButton link={founder.link} name={founder.name} />
                <ProfileIconLinks links={founder.profileLinks} name={founder.name} />
              </li>
            ))}
          </ul>
        )}
      </div>
      )}
      {(!compact || profile.investors.length > 0) && (
      <div className={compact ? "mt-1" : "mt-3"}>
        <h4 className="text-[10px] font-semibold uppercase tracking-wide text-muted">Who funded</h4>
        {profile.investors.length === 0 ? (
          compact ? null : <p className="mt-0.5 text-xs text-muted">Not available</p>
        ) : (
          <div className="mt-1 space-y-1.5">
            {groupInvestors(profile.investors).map((group) => (
              <div key={group.round}>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">{group.round}</p>
                <ul className="space-y-0.5 text-xs text-foreground">
                  {group.investors.map((investor) => (
                    <li key={`${group.round}-${investor.name}-${investor.sourceUrl}`}>
                      {investorLabel(investor)}
                      <FactSource fact={investor} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
      )}
      {cells.length > 0 ? (
      <dl className={`${compact ? "mt-1.5" : "mt-3"} grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-3`}>
        {cells.map((cell) => (
          <div key={cell.label}>
            <dt className="font-semibold uppercase tracking-wide text-muted">{cell.label}</dt>
            <dd className="mt-0.5">{cell.value}</dd>
          </div>
        ))}
      </dl>
      ) : null}
      {profile.rounds.length > 1 && (
        <div className="mt-3">
          <h4 className="text-[10px] font-semibold uppercase tracking-wide text-muted">Other announced rounds</h4>
          <ul className="mt-1 space-y-0.5 text-xs text-foreground">
            {profile.rounds.slice(1).map((item) => (
              <li key={`${item.stage}-${item.amountText}-${item.sourceUrl}`}>
                {formatRound(item)}
                <FactSource fact={item} />
              </li>
            ))}
          </ul>
        </div>
      )}
      {!compact && profile.companyLinkedin && (
        <p className="mt-2 text-xs">
          <a href={profile.companyLinkedin.text} target="_blank" rel="noopener noreferrer" className="text-link hover:underline">
            Company LinkedIn
          </a>
          <FactSource fact={profile.companyLinkedin} />
        </p>
      )}
    </section>
  );
}
