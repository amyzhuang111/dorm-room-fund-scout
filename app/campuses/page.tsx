import type { Metadata } from "next";
import Link from "next/link";
import { campusSlug, shortCampusLabel } from "@/lib/domain/campuses";
import { countFoundersListed, loadDirectory } from "@/lib/domain/directory";
import { loadFounderTable } from "@/lib/domain/founder-table";
import { listUniversities } from "@/lib/domain/queries";
import { CampusesTheme } from "@/components/campuses-theme";

export const metadata: Metadata = { title: "Campuses" };

/** Below this, a founder count mostly measures how many sources were scanned. */
const SCAN_FLOOR = 10;

function perSource(founders: number, sources: number): number {
  if (sources <= 0) return 0;
  return founders / sources;
}

export default function CampusesPage() {
  const rows = listUniversities().map((university) => ({
    ...university,
    label: shortCampusLabel(university.id, university.name),
    slug: campusSlug(shortCampusLabel(university.id, university.name)),
  }));
  const withFounders = rows.filter((row) => row.founderCount > 0);
  const plotted = rows.filter((row) => row.lat != null && row.lon != null);
  const ranked = withFounders
    .filter((row) => row.sourcesConfigured >= SCAN_FLOOR)
    .sort(
      (a, b) =>
        perSource(b.founderCount, b.sourcesConfigured) - perSource(a.founderCount, a.sourcesConfigured) ||
        b.founderCount - a.founderCount ||
        a.label.localeCompare(b.label),
    );
  const partial = withFounders
    .filter((row) => row.sourcesConfigured < SCAN_FLOOR)
    .sort((a, b) => b.founderCount - a.founderCount || a.label.localeCompare(b.label));
  const totalFounders = withFounders.reduce((n, row) => n + row.founderCount, 0);
  const totalCompanies = withFounders.reduce((n, row) => n + row.companyCount, 0);
  const vettedCompanies = loadDirectory().cards.length;
  const vettedFounders = countFoundersListed();
  const indexPeople = loadFounderTable().length;
  const top = ranked[0];

  return (
    <div className="sample-paper min-h-[calc(100dvh-48px)]" data-campuses-index="">
      <CampusesTheme />
      <div className="mx-auto max-w-[1200px] px-3 py-4 sm:px-5 sm:py-6">
        <div className="border-b border-[color:var(--line,#E1E5EF)] pb-4" data-campuses-hero="">
          <p className="scout-kicker">Explore</p>
          <h1 className="mt-1 scout-display text-[36px] leading-[1.05] sm:text-[48px]">Campuses</h1>
          <p
            className="mt-3 max-w-xl bg-[color:var(--bg,#FFFFFF)] font-mono text-[12px] leading-5 tabular-nums text-[color:var(--fg-2,#3F465C)]"
            data-campuses-stats=""
          >
            <span className="font-bold text-[color:var(--cobalt,#2F4FD8)]">{withFounders.length.toLocaleString("en-US")}</span>
            {" campuses with promoted founders"}
            <span className="mx-1.5 text-[color:var(--fg-3,#5C647A)]">·</span>
            <span className="font-bold text-[color:var(--fg,#0B0E17)]">{totalFounders.toLocaleString("en-US")}</span>
            {" promoted founders, counted once per campus"}
            <span className="mx-1.5 text-[color:var(--fg-3,#5C647A)]">·</span>
            <span className="font-bold text-[color:var(--fg,#0B0E17)]">{totalCompanies.toLocaleString("en-US")}</span>
            {" companies linked to a campus"}
          </p>
          <p className="mt-2 max-w-xl text-[13px] leading-5 text-[color:var(--fg-2,#3F465C)]">
            The map plots {plotted.length.toLocaleString("en-US")} schools with a pin, including schools with no promoted founder. This page is the {withFounders.length.toLocaleString("en-US")} campuses that have one. The company list is {vettedCompanies.toLocaleString("en-US")} vetted companies, with {vettedFounders.toLocaleString("en-US")} founders on those companies. The founder index is {indexPeople.toLocaleString("en-US")} people, including hackathon teams. Rank below is founders per source, and only for campuses with at least {SCAN_FLOOR} sources.
          </p>
          <Link
            href="/companies?feed=leaderboard"
            className="mt-3 inline-flex h-9 items-center rounded-sm border border-[color:var(--cobalt,#2F4FD8)] bg-[color:var(--cobalt,#2F4FD8)] px-3.5 font-mono text-[11px] font-semibold text-white"
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
              <span className="text-right">Per source</span>
              <span className="text-right">Companies</span>
              <span className="text-right">Sources</span>
            </div>
            <ol className="divide-y divide-[color:var(--line,#E1E5EF)]" data-campuses-cards="">
              {ranked.map((row, i) => (
                <li key={row.id}>
                  <Link href={`/campuses/${row.slug}`} className="campus-index-row">
                    <span className="campus-rank">{String(i + 1).padStart(2, "0")}</span>
                    <span className="campus-name">{row.label}</span>
                    <span className="campus-country">{row.country?.trim() || "Not on record"} · {row.founderCount.toLocaleString("en-US")} founders</span>
                    <span className="campus-founders">{perSource(row.founderCount, row.sourcesConfigured).toFixed(1)}</span>
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
            {partial.length > 0 ? (
              <div data-campuses-partial="">
                <p className="border-t border-[color:var(--line,#E1E5EF)] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--fg-3,#5C647A)]">
                  Partial scan · fewer than {SCAN_FLOOR} sources · not ranked
                </p>
                <ol className="divide-y divide-[color:var(--line,#E1E5EF)]">
                  {partial.map((row) => (
                    <li key={row.id}>
                      <Link href={`/campuses/${row.slug}`} className="campus-index-row">
                        <span className="campus-rank">—</span>
                        <span className="campus-name">{row.label}</span>
                        <span className="campus-country">{row.country?.trim() || "Not on record"} · {row.founderCount.toLocaleString("en-US")} founders</span>
                        <span className="campus-founders">—</span>
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
                <p className="mt-3 font-mono text-[12px] tabular-nums text-[color:var(--fg-2,#3F465C)]">
                  <span className="font-bold text-[color:var(--ember,#D96B1C)]">{ranked.length.toLocaleString("en-US")}</span>
                  {" ranked · "}
                  <span className="font-bold text-[color:var(--fg,#0B0E17)]">{partial.length.toLocaleString("en-US")}</span>
                  {" partial scans"}
                </p>
                <p className="mt-2 font-mono text-[11px] text-[color:var(--fg-3,#5C647A)]">
                  Lead: {top?.label ?? "n/a"} · {top ? perSource(top.founderCount, top.sourcesConfigured).toFixed(1) : "0"} founders per source
                </p>
              </div>
              <p className="font-mono text-[11px] leading-5 text-[color:var(--fg-3,#5C647A)]">
                Rank is founders per source among campuses with at least {SCAN_FLOOR} sources. A deeper scan is not a higher rank.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
