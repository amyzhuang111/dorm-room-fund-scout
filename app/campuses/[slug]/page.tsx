import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ClassYearChart } from "@/components/class-year-chart";
import { FoundersDesk } from "@/components/founders-desk";
import { ShortlistCampusButton } from "@/components/shortlist-campus";
import { campusSlug, resolveCampusSlug, shortCampusLabel } from "@/lib/domain/campuses";
import { loadFounderTable } from "@/lib/domain/founder-table";
import { SIGNALS_THIS_WEEK_LABEL, signalsThisWeek } from "@/lib/domain/hero-stats";
import { listSignalsForUniversity, listSources, listUniversities, type UniversitySummary } from "@/lib/domain/queries";
import { getDb } from "@/lib/db/client";
import { PITCHBOOK_SOURCE_URL } from "@/lib/domain/pitchbook-model";
import { listUnverifiedCompanies } from "@/lib/domain/unverified-companies";

const TABS = ["founders", "companies", "signals", "network"] as const;

function PitchbookLine({ university }: { university: UniversitySummary }) {
  const undergrad = university.pitchbook?.undergrad ?? null;
  const grad = university.pitchbook?.grad ?? null;
  const mba = university.pitchbook?.mba ?? null;
  if (!undergrad && !grad && !mba) {
    return (
      <p className="mt-2 max-w-xl text-[13px] leading-5 text-fg-2" data-pitchbook-undergrad="">
        Not on the PitchBook 2026 undergraduate, graduate, or MBA lists. {university.founderCount.toLocaleString("en-US")} founders on file in this scan.
      </p>
    );
  }
  return (
    <p className="mt-2 max-w-xl text-[13px] leading-5 text-fg-2" data-pitchbook-undergrad="">
      {undergrad ? (
        <>
          PitchBook 2026 undergraduate rank {undergrad.rank}: {undergrad.founderCount.toLocaleString("en-US")} alumni who founded a company that raised venture capital from January 2015 through August 2026.
        </>
      ) : (
        <>Not on the PitchBook 2026 undergraduate list.</>
      )}
      {grad ? ` Graduate list rank ${grad.rank}, ${grad.founderCount.toLocaleString("en-US")} founders.` : ""}
      {mba ? ` MBA list rank ${mba.rank}, ${mba.founderCount.toLocaleString("en-US")} founders.` : ""}
      {" "}
      <a href={PITCHBOOK_SOURCE_URL} target="_blank" rel="noopener noreferrer" className="underline">
        PitchBook university rankings
      </a>
    </p>
  );
}

function resolveUniversity(slug: string): UniversitySummary | undefined {
  const universities = listUniversities();
  const configured = resolveCampusSlug(slug);
  if (configured) {
    const match = universities.find((university) => university.id === configured);
    if (match) return match;
  }
  return universities.find(
    (university) =>
      university.id === slug ||
      campusSlug(shortCampusLabel(university.id, university.name)) === slug ||
      campusSlug(university.name) === slug,
  );
}


function companies(universityId: string): { id: string; name: string; people: number }[] {
  try {
    return getDb()
      .prepare(
        `SELECT p.id as id, p.name as name, COUNT(DISTINCT a.person_id) as people
           FROM projects p
           JOIN person_project_roles ppr ON ppr.project_id = p.id
           JOIN affiliations a ON a.person_id = ppr.person_id
          WHERE a.university_id = ? AND p.kind = 'company'
          GROUP BY p.id
          ORDER BY people DESC, p.name COLLATE NOCASE`,
      )
      .all(universityId) as { id: string; name: string; people: number }[];
  } catch {
    return [];
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const university = resolveUniversity(slug);
  return { title: university ? shortCampusLabel(university.id, university.name) : "Campus" };
}

export default async function CampusPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const university = resolveUniversity(slug);
  if (!university) notFound();
  const label = shortCampusLabel(university.id, university.name);
  const unverifiedHere = listUnverifiedCompanies({ campus: university.id, pageSize: 1 }).total;
  const tab = TABS.includes(sp.tab as (typeof TABS)[number]) ? (sp.tab as (typeof TABS)[number]) : "founders";
  const founders = loadFounderTable(university.id);
  const topTier = founders.filter((row) => row.tier === "S" || row.tier === "S+").length;
  const signalsWeek = signalsThisWeek(university.id);
  const yearCounts = [...founders.reduce((counts, row) => {
    if (row.year == null) return counts;
    counts.set(row.year, (counts.get(row.year) ?? 0) + 1);
    return counts;
  }, new Map<number, number>())].map(([year, count]) => ({ year, count }));
  const affiliated = companies(university.id);
  const sources = listSources().filter((source) => source.campuses.includes(university.id));
  const signals = tab === "signals" ? listSignalsForUniversity(university.id) : [];
  const shownCompanies = affiliated.slice(0, 8);
  const moreCompanies = Math.max(0, affiliated.length - shownCompanies.length);

  return (
    <div className="max-w-full overflow-x-clip px-3 py-3 sm:px-6 sm:py-8" data-campus-page="">
      <div className="flex max-w-full flex-wrap items-start justify-between gap-3 sm:gap-6">
        <div className="min-w-0 flex-1">
          <p className="text-[14px] text-fg">
            <Link href="/campuses" className="inline-flex min-h-11 min-w-11 items-center hover:underline">Campuses</Link>
            <span> / </span>
            <span>{label}</span>
          </p>
          <h1 className="page-title text-[24px] leading-7 sm:text-[inherit] sm:leading-[inherit]">{university.name}</h1>
          <p className="mt-1 hidden text-[14px] text-fg sm:mt-2 sm:block">{university.country ?? "Country not recorded"}</p>
          <PitchbookLine university={university} />
          <p className="mt-2 font-mono text-[13px] tabular-nums leading-4 text-fg-2 sm:hidden" data-campus-stats-mobile="">
            <span className="font-bold text-fg">{university.founderCount.toLocaleString("en-US")}</span> founders on file ·{" "}
            <span className="font-bold text-fg">{topTier.toLocaleString("en-US")}</span> top tier ·{" "}
            <span className="font-bold text-fg">{signalsWeek.toLocaleString("en-US")}</span> {SIGNALS_THIS_WEEK_LABEL.toLowerCase()}
          </p>
        </div>
        <div className="hidden flex-wrap items-start gap-3 sm:flex">
          {[
            { n: university.founderCount, label: "Founders on file" },
            { n: topTier, label: "Top tier" },
            { n: signalsWeek, label: SIGNALS_THIS_WEEK_LABEL },
          ].map((stat) => (
            <div key={stat.label} className="min-w-[148px] rounded border border-line bg-raised px-4 py-3">
              <span className="hero-num block text-[40px] leading-none md:text-[48px]">{stat.n.toLocaleString("en-US")}</span>
              <span className="mt-2 block text-[14px] text-fg">{stat.label}</span>
            </div>
          ))}
          <ShortlistCampusButton id={university.id} />
        </div>
      </div>
      <div className="mt-3 flex gap-3 overflow-x-auto border-b border-line [-webkit-overflow-scrolling:touch] sm:mt-8 sm:gap-5">
        {TABS.map((item) => (
          <Link key={item} href={`/campuses/${slug}?tab=${item}`} className={`subtab capitalize min-h-11 min-w-11 ${tab === item ? "is-active" : ""}`}>
            {item}
          </Link>
        ))}
      </div>
      <div className="mt-3 grid max-w-full gap-x-6 gap-y-4 sm:mt-8 sm:gap-y-8 lg:grid-cols-12">
        <div className="min-w-0 max-w-full lg:col-span-8">
          {tab === "founders" && (
            <>
              {founders.length === 0 ? (
                <p className="text-[14px] leading-5 text-fg-2" data-campus-empty-roster="">
                  This scan has no founders on file for {label}.
                  {university.pitchbook?.undergrad || university.pitchbook?.grad || university.pitchbook?.mba
                    ? " The PitchBook count above is the published alumni total, not a roster stored here."
                    : ""}
                </p>
              ) : null}
              <link rel="preload" as="fetch" href="/data/founder-table.json" />
              <FoundersDesk campusId={university.id} campusLocked initialCount={founders.length} />
            </>
          )}
          {tab === "companies" && (
            <>
            <ul>
              {affiliated.map((company) => (
                <li key={company.id} className="flex min-h-11 items-center justify-between gap-3 border-b border-line py-1">
                  <Link href={`/startup/${company.id}`} className="inline-flex min-h-11 min-w-0 items-center truncate text-[14px] text-fg">{company.name}</Link>
                  <span className="num shrink-0 text-[14px] text-fg-2">{company.people.toLocaleString("en-US")}</span>
                </li>
              ))}
              {affiliated.length === 0 && <li className="text-[14px] text-fg-2">No eligible companies are stored for {label}.</li>}
            </ul>
            {unverifiedHere > 0 && (
              <p className="mt-4 text-[14px] text-fg-2" data-campus-unverified="">
                {unverifiedHere.toLocaleString("en-US")} more {unverifiedHere === 1 ? "company is" : "companies are"} reported at {label}, but their
                founders are not confirmed as current students or recent graduates.{" "}
                <Link href={`/companies?unverified=1&campus=${university.id}`} className="text-link underline">
                  View unverified companies
                </Link>
              </p>
            )}
            </>
          )}
          {tab === "signals" && (
            <ul className="divide-y divide-line">
              {signals.map((signal) => (
                <li key={signal.id} className="py-3">
                  <p className="text-[15px] font-medium">{signal.project_name}</p>
                  <p className="mt-1 text-[14px] text-fg-2">{signal.current_observation}</p>
                  <p className="mt-1 text-[14px] text-fg-2">{signal.signal_type}{signal.source_date ? ` · ${signal.source_date}` : ""}</p>
                </li>
              ))}
              {signals.length === 0 && <li className="text-[14px] text-fg-3">No signals are stored for {label}.</li>}
            </ul>
          )}
          {tab === "network" && (
            <p className="text-[15px] leading-6 text-fg-2">
              The shared network map includes {label}. <Link href="/map/network" className="text-cobalt">Open the network →</Link>
            </p>
          )}
        </div>
        <aside className="space-y-6 lg:sticky lg:top-20 lg:col-span-4 lg:self-start">
          {yearCounts.length > 0 && <ClassYearChart years={yearCounts} founders={university.founderCount} />}
          <div>
            <p className="text-[14px] font-medium" title="Listed from campus affiliations. Headquarters arcs are not stored as a ranked feeder list.">
              Affiliated companies
            </p>
            <ul className="mt-2">
              {shownCompanies.map((company) => (
                <li key={company.id} className="flex h-8 items-center justify-between gap-3">
                  <Link href={`/startup/${company.id}`} className="min-w-0 truncate text-[14px] leading-8">{company.name}</Link>
                  <span className="num shrink-0 text-[14px] text-fg-2">{company.people.toLocaleString("en-US")}</span>
                </li>
              ))}
              {moreCompanies > 0 && (
                <li>
                  <Link href={`/campuses/${slug}?tab=companies`} className="inline-flex min-h-11 items-center text-[14px] text-fg-2">
                    +{moreCompanies.toLocaleString("en-US")} more
                  </Link>
                </li>
              )}
              {affiliated.length === 0 && <li className="text-[14px] text-fg-2">None recorded.</li>}
            </ul>
          </div>
          <div>
            <p className="text-[14px] font-medium">Sources</p>
            <ul className="mt-2 space-y-2">
              {sources.slice(0, 8).map((source) => (
                <li key={source.id} className="text-[14px] text-fg-2">
                  {source.name}
                  <span> · {source.lastSuccessAt?.slice(0, 10) ?? source.lastAttemptAt?.slice(0, 10) ?? "not checked"}</span>
                </li>
              ))}
              {sources.length === 0 && <li className="text-[14px] text-fg-2">No sources list this campus.</li>}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
