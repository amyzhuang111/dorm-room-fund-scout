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
    .sort((a, b) => b.founderCount - a.founderCount || a.label.localeCompare(b.label));
  const withFounders = rows.filter((row) => row.founderCount > 0);
  const totals = loadCorpusTotals();
  const top = withFounders.slice(0, 10);

  return (
    <div className="sample-paper min-h-[calc(100dvh-48px)]" data-campuses-index="">
      <CampusesTheme />
      <div className="mx-auto max-w-[1200px] px-3 py-4 sm:px-5 sm:py-6">
        <div className="border-b border-[color:var(--line,#E1E5EF)] pb-4" data-campuses-hero="">
          <p className="scout-kicker">Explore</p>
          <h1 className="mt-1 scout-display text-[36px] leading-[1.05] sm:text-[48px]">Campuses</h1>
          <p
            className="mt-3 max-w-xl bg-[color:var(--bg,#FFFFFF)] font-mono text-[14px] leading-5 tabular-nums text-[color:var(--fg-2,#3F465C)]"
            data-campuses-stats=""
          >
            <span className="font-bold text-[color:var(--cobalt,#2F4FD8)]" data-count="campuses-with-founders">{withFounders.length.toLocaleString("en-US")}</span>
            {" of "}
            <span className="font-bold text-[color:var(--fg,#0B0E17)]" data-count="campuses-total">{totals.campusesTotal.toLocaleString("en-US")}</span>
            {" campuses with promoted founders"}
            <span className="mx-1.5 text-[color:var(--fg-3,#5C647A)]">·</span>
            <span className="font-bold text-[color:var(--fg,#0B0E17)]" data-count="founders-listed">{totals.foundersListed.toLocaleString("en-US")}</span>
            {" founders listed"}
            <span className="mx-1.5 text-[color:var(--fg-3,#5C647A)]">·</span>
            <span className="font-bold text-[color:var(--fg,#0B0E17)]" data-count="investable-companies">{totals.investableCompanies.toLocaleString("en-US")}</span>
            {" investable companies"}
          </p>
          <Link
            href="/companies?feed=leaderboard"
            className="mt-3 inline-flex h-11 min-h-11 items-center rounded-sm border border-[color:var(--cobalt,#2F4FD8)] bg-[color:var(--cobalt,#2F4FD8)] px-3.5 font-mono text-[14px] font-semibold text-white"
          >
            Companies by campus
          </Link>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(240px,280px)]">
          <div className="overflow-hidden border border-[color:var(--cobalt,#2F4FD8)]/25 bg-[color:var(--bg,#FFFFFF)]" data-campuses-table="">
            <div className="hidden grid-cols-[3rem_minmax(0,1.4fr)_minmax(0,1fr)_5.5rem_5.5rem_5rem] gap-2 border-b border-[color:var(--line,#E1E5EF)] bg-[color:var(--cobalt-haze,#E8ECFA)]/50 px-3 py-2.5 font-mono text-[10px] uppercase tracking-[0.1em] text-[color:var(--cobalt,#2F4FD8)] sm:grid">
              <span>#</span>
              <span>Campus</span>
              <span>Country</span>
              <span className="text-right">Founders</span>
              <span className="text-right">Companies</span>
              <span className="text-right">Sources</span>
            </div>
            <ol className="divide-y divide-[color:var(--line,#E1E5EF)]" data-campuses-cards="">
              {withFounders.map((row, i) => (
                <li key={row.id}>
                  <Link href={`/campuses/${row.slug}`} className="campus-index-row">
                    <span className="campus-rank">{String(i + 1).padStart(2, "0")}</span>
                    <span className="campus-name">{row.label}</span>
                    <span className="campus-country">{row.country?.trim() || "Not on record"}</span>
                    <span className="campus-founders">{row.founderCount.toLocaleString("en-US")}</span>
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
                  Lead: {top[0]?.label ?? "n/a"} · {top[0] ? top[0].founderCount.toLocaleString("en-US") : "0"} founders
                </p>
              </div>
              <p className="font-mono text-[11px] leading-5 text-[color:var(--fg-3,#5C647A)]">
                Open a campus for founders, companies, and sources on that desk.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
