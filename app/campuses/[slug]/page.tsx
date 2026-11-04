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

const TABS = ["founders", "companies", "signals", "network"] as const;

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
    <div className="max-w-full overflow-x-clip px-4 py-6 sm:px-6 sm:py-8" data-campus-page="">
      <div className="flex max-w-full flex-wrap items-start justify-between gap-4 sm:gap-6">
        <div>
          <p className="text-[14px] text-fg">
            <Link href="/campuses" className="inline-flex min-h-11 min-w-11 items-center hover:underline">Campuses</Link>
            <span> / </span>
            <span>{label}</span>
          </p>
          <h1 className="page-title">{university.name}</h1>
          <p className="mt-2 text-[14px] text-fg">{university.country ?? "Country not recorded"}</p>
        </div>
        <div className="flex flex-wrap items-start gap-3">
          {[
            { n: university.founderCount, label: "Founders" },
            { n: topTier, label: "Top tier" },
            { n: signalsWeek, label: SIGNALS_THIS_WEEK_LABEL },
          ].map((stat) => (
            <div key={stat.label} className="min-w-0 flex-1 basis-[9rem] rounded border border-line bg-raised px-3 py-3 sm:min-w-[148px] sm:flex-none sm:basis-auto sm:px-4">
              <span className="hero-num block text-[40px] leading-none md:text-[48px]">{stat.n.toLocaleString("en-US")}</span>
              <span className="mt-2 block text-[14px] text-fg">{stat.label}</span>
            </div>
          ))}
          <ShortlistCampusButton id={university.id} />
        </div>
      </div>
      <div className="mt-8 flex gap-3 overflow-x-auto border-b border-line [-webkit-overflow-scrolling:touch] sm:gap-5">
        {TABS.map((item) => (
          <Link key={item} href={`/campuses/${slug}?tab=${item}`} className={`subtab capitalize min-h-11 min-w-11 ${tab === item ? "is-active" : ""}`}>
            {item}
          </Link>
        ))}
      </div>
      <div className="mt-8 grid max-w-full gap-x-6 gap-y-8 lg:grid-cols-12">
        <div className="min-w-0 max-w-full lg:col-span-8">
          {tab === "founders" && <FoundersDesk campusId={university.id} campusLocked initialCount={founders.length} />}
          {tab === "companies" && (
            <ul>
              {affiliated.map((company) => (
                <li key={company.id} className="flex min-h-11 items-center justify-between gap-3 border-b border-line py-1">
                  <Link href={`/startup/${company.id}`} className="inline-flex min-h-11 min-w-0 items-center truncate text-[14px] text-fg">{company.name}</Link>
                  <span className="num shrink-0 text-[14px] text-fg-2">{company.people.toLocaleString("en-US")}</span>
                </li>
              ))}
              {affiliated.length === 0 && <li className="text-[14px] text-fg-2">No affiliated companies are stored for {label}.</li>}
            </ul>
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
