import Link from "next/link";
import { campusSlug, shortCampusLabel } from "@/lib/domain/campuses";
import { listUniversities } from "@/lib/domain/queries";
import { CampusesTheme } from "@/components/campuses-theme";
import { loadCorpusTotals } from "@/lib/domain/corpus-totals";

export default function CampusesPage() {
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
  const lead = ranked[0];

  return (
    <div className="sample-paper min-h-[calc(100dvh-48px)]" data-campuses-index="">
      <CampusesTheme />
      <div className="mx-auto max-w-[1200px] px-3 py-3 sm:px-5 sm:py-6">
        <div className="border-b border-[color:var(--line,#E1E5EF)] pb-3 sm:pb-4" data-campuses-hero="">
          <p className="scout-kicker">Explore</p>
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
          <p className="mt-2 max-w-xl text-[13px] leading-5 text-[color:var(--fg-2,#3F465C)]">
            Order is the PitchBook 2026 undergraduate rank: alumni who founded a company that raised venture capital from January 2015 through August 2026. The PitchBook column is that published count. On file is this scan. {ranked.length.toLocaleString("en-US")} of the undergraduate top 100 are linked to a campus here.
          </p>
          <Link
            href="/companies?feed=leaderboard"
            className="mt-2 inline-flex h-11 min-h-11 items-center rounded-sm border border-[color:var(--cobalt,#2F4FD8)] bg-[color:var(--cobalt,#2F4FD8)] px-3.5 font-mono text-[14px] font-semibold text-white sm:mt-3"
          >
            Companies by campus
          </Link>
        </div>

        <div className="mt-3 grid gap-4 sm:mt-4 lg:grid-cols-[minmax(0,1fr)_minmax(240px,280px)]">
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
                  Not on the PitchBook undergraduate list · founders on file
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

          <aside className="hidden lg:block">
            <div className="sticky top-16 space-y-3">
              <div className="relative overflow-hidden border border-[color:var(--ember,#D96B1C)]/40 bg-[color:var(--bg,#FFFFFF)] px-3.5 py-3.5 pl-4 before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-[color:var(--ember,#D96B1C)]">
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--ember,#D96B1C)]">On this desk</p>
                <p className="mt-2 scout-figure text-[40px] leading-none">{withFounders.length.toLocaleString("en-US")}</p>
                <p className="mt-1 text-[13px] font-semibold tracking-tight text-[color:var(--fg,#0B0E17)]">campuses with founders</p>
                <p className="mt-3 font-mono text-[14px] tabular-nums text-[color:var(--fg-2,#3F465C)]">
                  <span className="font-bold text-[color:var(--ember,#D96B1C)]">{totals.foundersListed.toLocaleString("en-US")}</span>
                  {" founders listed · "}
                  <span className="font-bold text-[color:var(--fg,#0B0E17)]">{totals.investableCompanies.toLocaleString("en-US")}</span>
                  {" investable companies"}
                </p>
                <p className="mt-2 font-mono text-[11px] text-[color:var(--fg-3,#5C647A)]">
                  Lead: {lead?.label ?? "n/a"} · PitchBook #{lead?.pitchbook?.undergrad?.rank ?? "n/a"} · {(lead?.pitchbook?.undergrad?.founderCount ?? 0).toLocaleString("en-US")} undergraduate founders
                </p>
              </div>
              <p className="font-mono text-[11px] leading-5 text-[color:var(--fg-3,#5C647A)]">
                Rank is the PitchBook undergraduate list, not founders on file. A deeper scan does not move a school up.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
