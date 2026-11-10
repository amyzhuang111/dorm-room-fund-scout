import Link from "next/link";
import { campusSlug, shortCampusLabel } from "@/lib/domain/campuses";
import { pinnedCampuses, promotedFounderCampuses, storedFounderCampuses } from "@/lib/domain/counted-membership";
import { listUniversities } from "@/lib/domain/queries";
import { CampusesTheme } from "@/components/campuses-theme";
import { loadCorpusTotals } from "@/lib/domain/corpus-totals";

function MembershipList({
  title,
  detail,
  rows,
}: {
  title: string;
  detail: string;
  rows: { id: string; label: string; href: string; note?: string }[];
}) {
  return (
    <div className="sample-paper min-h-[calc(100dvh-48px)]" data-campus-membership="">
      <CampusesTheme />
      <div className="mx-auto max-w-[800px] px-3 py-4 sm:px-5">
        <Link href="/campuses" className="text-sm text-[color:var(--cobalt,#2F4FD8)]">All campuses</Link>
        <h1 className="mt-2 text-[28px] font-semibold leading-tight">{title}</h1>
        <p className="mt-2 text-sm leading-6" data-campus-membership-count="">
          {rows.length.toLocaleString("en-US")} campuses in this list. {detail}
        </p>
        <ol className="mt-4 divide-y divide-[color:var(--line,#E1E5EF)] border-y border-[color:var(--line,#E1E5EF)]">
          {rows.map((row) => (
            <li key={row.id}>
              <Link href={row.href} className="flex min-h-11 items-center justify-between gap-3 py-2">
                <span className="font-semibold">{row.label}</span>
                {row.note ? <span className="text-right text-sm text-[color:var(--fg-2,#3F465C)]">{row.note}</span> : null}
              </Link>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

export default async function CampusesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  if (sp.pins === "1") {
    const pins = pinnedCampuses().map((university) => {
      const label = shortCampusLabel(university.id, university.name);
      return {
        id: university.id,
        label,
        href: `/campuses/${campusSlug(label)}`,
        note: university.coordSource === "public_campus" ? "Public campus coordinate" : "Coordinate stored on the row",
      };
    });
    return (
      <MembershipList
        title="Schools with a pin"
        detail="These campuses have coordinates. Two public campus coordinates are used when the stored row has none. This is not the promoted-founder ranking."
        rows={pins}
      />
    );
  }
  if (sp.membership === "stored-founder") {
    return (
      <MembershipList
        title="Stored-founder campuses"
        detail="A person with founder_status founder has an affiliation here. This is not the promoted-founder count."
        rows={storedFounderCampuses().map((campus) => ({
          id: campus.id,
          label: campus.name,
          href: campus.slug ? `/campuses/${campus.slug}` : "/campuses",
        }))}
      />
    );
  }
  if (sp.membership === "promoted-founders") {
    return (
      <MembershipList
        title="Promoted-founder campuses"
        detail="The promoted-founder count on file is above zero. This is a different list from stored founder status."
        rows={promotedFounderCampuses().map((university) => {
          const label = shortCampusLabel(university.id, university.name);
          return { id: university.id, label, href: `/campuses/${campusSlug(label)}` };
        })}
      />
    );
  }
  const rows = listUniversities()
    .map((university) => ({
      ...university,
      label: shortCampusLabel(university.id, university.name),
      slug: campusSlug(shortCampusLabel(university.id, university.name)),
    }))
  const withFounders = rows.filter((row) => row.founderCount > 0);
  const ranked = rows
    .filter((row) => row.pitchbook?.undergrad)
    .sort(
      (a, b) =>
        (a.pitchbook?.undergrad?.rank ?? 999) - (b.pitchbook?.undergrad?.rank ?? 999) ||
        a.label.localeCompare(b.label),
    );
  const unranked = rows
    .filter((row) => !row.pitchbook?.undergrad && row.founderCount > 0)
    .sort((a, b) => b.founderCount - a.founderCount || a.label.localeCompare(b.label));
  const totals = loadCorpusTotals();

  return (
    <div className="sample-paper min-h-[calc(100dvh-48px)]" data-campuses-index="">
      <CampusesTheme />
      <div className="mx-auto max-w-[1200px] px-3 py-3 sm:px-5 sm:py-6">
        <div className="border-b border-[color:var(--line,#E1E5EF)] pb-3 sm:pb-4" data-campuses-hero="">
          <h1 className="mt-1 scout-display text-[28px] leading-[1.05] sm:text-[48px]">Campuses</h1>
          <p
            className="mt-2 max-w-xl bg-[color:var(--bg,#FFFFFF)] font-mono text-[13px] leading-4 tabular-nums text-[color:var(--fg-2,#3F465C)] sm:mt-3 sm:text-[14px] sm:leading-5"
            data-campuses-stats=""
          >
            <span className="font-bold text-[color:var(--cobalt,#2F4FD8)]" data-count="campuses-with-founders">{withFounders.length.toLocaleString("en-US")}</span>
            {" of "}
            <span className="font-bold text-[color:var(--fg,#0B0E17)]" data-count="campuses-total">{totals.campusesTotal.toLocaleString("en-US")}</span>
            {" with founders"}
            <span className="mx-1.5 text-[color:var(--fg-3,#5C647A)]">·</span>
            <span className="font-bold text-[color:var(--fg,#0B0E17)]" data-count="founders-listed">{totals.foundersListed.toLocaleString("en-US")}</span>
            {" founders"}
            <span className="hidden sm:inline">
              <span className="mx-1.5 text-[color:var(--fg-3,#5C647A)]">·</span>
              <span className="font-bold text-[color:var(--fg,#0B0E17)]" data-count="investable-companies">{totals.investableCompanies.toLocaleString("en-US")}</span>
              {" investable companies"}
            </span>
          </p>
          <details className="mt-2 max-w-xl text-[13px] leading-5 text-[color:var(--fg-2,#3F465C)]"><summary className="cursor-pointer py-2">How campuses are ranked</summary><p>
            PitchBook ranks undergraduate alumni who founded venture-backed companies (Jan 2015–Aug 2026). “On file” counts founders in Campus Scout. {ranked.length.toLocaleString("en-US")} of the undergraduate top 100 are linked to a campus here.
          </p></details>
          <Link
            href="/companies?feed=leaderboard"
            className="mt-2 inline-flex h-11 min-h-11 items-center rounded-sm border border-[color:var(--cobalt,#2F4FD8)] bg-[color:var(--cobalt,#2F4FD8)] px-3.5 font-mono text-[14px] font-semibold text-white sm:mt-3"
          >
            Companies by campus
          </Link>
        </div>

        <div className="mt-3 grid gap-4 sm:mt-4 ">
          <div className="overflow-hidden border border-[color:var(--cobalt,#2F4FD8)]/25 bg-[color:var(--bg,#FFFFFF)]" data-campuses-table="">
            <div className="hidden grid-cols-[3rem_minmax(0,1.4fr)_minmax(0,1fr)_5.5rem_5.5rem_5rem] gap-2 border-b border-[color:var(--line,#E1E5EF)] bg-[color:var(--cobalt-haze,#E8ECFA)]/50 px-3 py-2.5 font-mono text-[10px] uppercase tracking-[0.1em] text-[color:var(--cobalt,#2F4FD8)] sm:grid">
              <span>#</span>
              <span>Campus</span>
              <span>Country</span>
              <span className="text-right">PitchBook</span>
              <span className="text-right">Companies</span>
              <span className="text-right">Sources</span>
            </div>
            <ol className="divide-y divide-[color:var(--line,#E1E5EF)]" data-campuses-cards="">
              {ranked.map((row) => {
                const track = row.pitchbook?.undergrad;
                return (
                <li key={row.id}>
                  <Link href={`/campuses/${row.slug}`} className="campus-index-row">
                    <span className="campus-rank">{String(track?.rank ?? 0).padStart(2, "0")}</span>
                    <span className="campus-name">{row.label}</span>
                    <span className="campus-country">{row.country?.trim() || "Not on record"} · {row.founderCount.toLocaleString("en-US")} on file</span>
                    <span className="campus-founders">{(track?.founderCount ?? 0).toLocaleString("en-US")}</span>
                    <span className="campus-meta">
                      <span>
                        <span className="sm-only-label">{row.companyCount.toLocaleString("en-US")} companies</span>
                        <span className="desk-only-num">{row.companyCount.toLocaleString("en-US")}</span>
                      </span>
                      <span>
                        <span className="sm-only-label">{row.sourcesConfigured.toLocaleString("en-US")} sources</span>
                        <span className="desk-only-num">{row.sourcesConfigured.toLocaleString("en-US")}</span>
                      </span>
                    </span>
                  </Link>
                </li>
                );
              })}
            </ol>
            {unranked.length > 0 ? (
              <div data-campuses-unranked="">
                <p className="border-t border-[color:var(--line,#E1E5EF)] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--fg-3,#5C647A)]">
                  Other campuses
                </p>
                <ol className="divide-y divide-[color:var(--line,#E1E5EF)]">
                  {unranked.map((row) => (
                    <li key={row.id}>
                      <Link href={`/campuses/${row.slug}`} className="campus-index-row">
                        <span className="campus-rank">-</span>
                        <span className="campus-name">{row.label}</span>
                        <span className="campus-country">{row.country?.trim() || "Not on record"} · {row.founderCount.toLocaleString("en-US")} on file</span>
                        <span className="campus-founders">-</span>
                        <span className="campus-meta">
                          <span>
                            <span className="sm-only-label">{row.companyCount.toLocaleString("en-US")} companies</span>
                            <span className="desk-only-num">{row.companyCount.toLocaleString("en-US")}</span>
                          </span>
                          <span>
                            <span className="sm-only-label">{row.sourcesConfigured.toLocaleString("en-US")} sources</span>
                            <span className="desk-only-num">{row.sourcesConfigured.toLocaleString("en-US")}</span>
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}
          </div>

        </div>
      </div>
    </div>
  );
}
