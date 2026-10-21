import Link from "next/link";
import { notFound } from "next/navigation";
import { CampusMiniGlobe } from "@/components/campus-mini-globe";
import { DataTable } from "@/components/data-table";
import { GlobeLibraryBoot } from "@/components/map-boot";
import { ShortlistCampusButton } from "@/components/shortlist-campus";
import { campusSlug, resolveCampusSlug, shortCampusLabel } from "@/lib/domain/campuses";
import { loadFounderTable } from "@/lib/domain/founder-table";
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

function activity(universityId: string): { weeks: number[]; signals30: number } {
  const weeks = Array.from({ length: 52 }, () => 0);
  let signals30 = 0;
  try {
    const rows = getDb()
      .prepare(
        `SELECT s.created_at as at
           FROM signals s
           JOIN person_project_roles ppr ON ppr.project_id = s.project_id
           JOIN affiliations a ON a.person_id = ppr.person_id
          WHERE a.university_id = ? AND s.created_at IS NOT NULL`,
      )
      .all(universityId) as { at: string }[];
    const now = Date.now();
    const weekMs = 7 * 24 * 60 * 60 * 1000;
    for (const row of rows) {
      const iso = row.at.includes("T") ? row.at : `${row.at.replace(" ", "T")}Z`;
      const time = Date.parse(iso);
      if (Number.isNaN(time) || time > now) continue;
      const age = now - time;
      if (age <= 30 * 24 * 60 * 60 * 1000) signals30 += 1;
      const index = Math.floor(age / weekMs);
      if (index >= 0 && index < 52) weeks[51 - index] += 1;
    }
  } catch {
    return { weeks, signals30: 0 };
  }
  return { weeks, signals30 };
}

function companies(universityId: string): { id: string; name: string }[] {
  try {
    return getDb()
      .prepare(
        `SELECT p.id as id, p.name as name
           FROM projects p
           JOIN person_project_roles ppr ON ppr.project_id = p.id
           JOIN affiliations a ON a.person_id = ppr.person_id
          WHERE a.university_id = ? AND p.kind = 'company'
          GROUP BY p.id
          ORDER BY p.name
          LIMIT 24`,
      )
      .all(universityId) as { id: string; name: string }[];
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
  const { weeks, signals30 } = activity(university.id);
  const affiliated = companies(university.id);
  const sources = listSources().filter((source) => source.campuses.includes(university.id));
  const signals = tab === "signals" ? listSignalsForUniversity(university.id) : [];
  const peak = Math.max(1, ...weeks);

  return (
    <div className="mx-auto max-w-[1200px] px-5 py-8 sm:px-12">
      <GlobeLibraryBoot />
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="micro">Campus</p>
          <h1 className="page-title">{university.name}</h1>
          <p className="num mt-2 text-[13px] text-fg-2">{university.country ?? "Country not recorded"}</p>
        </div>
        <div className="flex items-end gap-8">
          <p><span className="stat-num">{university.founderCount.toLocaleString("en-US")}</span><span className="micro">Founders</span></p>
          <p><span className="stat-num">{topTier.toLocaleString("en-US")}</span><span className="micro">S / S+</span></p>
          <p><span className="stat-num">{signals30.toLocaleString("en-US")}</span><span className="micro">Signals 30d</span></p>
          <ShortlistCampusButton id={university.id} />
        </div>
      </div>
      <div className="mt-8 flex gap-5 border-b border-line">
        {TABS.map((item) => (
          <Link key={item} href={`/campuses/${slug}?tab=${item}`} className={`subtab capitalize ${tab === item ? "is-active" : ""}`}>
            {item}
          </Link>
        ))}
      </div>
      <div className="mt-8 grid gap-8 lg:grid-cols-12">
        <div className="lg:col-span-8">
          {tab === "founders" && (
            <>
              <p className="micro">Activity · 52 weeks</p>
              <div className="mt-3 flex h-[240px] items-end gap-0.5" aria-label="Signals by week">
                {weeks.map((count, index) => (
                  <div
                    key={index}
                    className="w-1"
                    title={`${count} signal${count === 1 ? "" : "s"}`}
                    style={{
                      height: `${(count / peak) * 100}%`,
                      minHeight: count > 0 ? 4 : 0,
                      background: index === weeks.length - 1 ? "var(--ember)" : "var(--cobalt)",
                    }}
                  />
                ))}
              </div>
              <div className="mt-8">
                <DataTable rows={founders} campusLocked />
              </div>
            </>
          )}
          {tab === "companies" && (
            <ul className="divide-y divide-line">
              {affiliated.map((company) => (
                <li key={company.id} className="py-2">
                  <Link href={`/startup/${company.id}`} className="text-[14px] text-fg">{company.name}</Link>
                </li>
              ))}
              {affiliated.length === 0 && <li className="text-[14px] text-fg-3">No affiliated companies are stored for {label}.</li>}
            </ul>
          )}
          {tab === "signals" && (
            <ul className="divide-y divide-line">
              {signals.map((signal) => (
                <li key={signal.id} className="py-3">
                  <p className="text-[15px] font-medium">{signal.project_name}</p>
                  <p className="mt-1 text-[14px] text-fg-2">{signal.current_observation}</p>
                  <p className="num mt-1 text-[12px] text-fg-3">{signal.signal_type}{signal.source_date ? ` · ${signal.source_date}` : ""}</p>
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
          <CampusMiniGlobe university={university} />
          <div>
            <p className="micro">Affiliated companies</p>
            <p className="mt-1 text-[12px] text-fg-3">Listed from campus affiliations. Headquarters arcs are not stored as a ranked feeder list.</p>
            <ul className="mt-2">
              {affiliated.slice(0, 8).map((company) => (
                <li key={company.id}>
                  <Link href={`/startup/${company.id}`} className="block h-8 truncate text-[14px] leading-8">{company.name}</Link>
                </li>
              ))}
              {affiliated.length === 0 && <li className="text-[13px] text-fg-3">None recorded.</li>}
            </ul>
          </div>
          <div>
            <p className="micro">Sources</p>
            <ul className="mt-2 space-y-2">
              {sources.slice(0, 8).map((source) => (
                <li key={source.id} className="num text-[12px] text-fg-2">
                  {source.name}
                  <span className="text-fg-3"> · {source.lastSuccessAt?.slice(0, 10) ?? source.lastAttemptAt?.slice(0, 10) ?? "not checked"}</span>
                </li>
              ))}
              {sources.length === 0 && <li className="text-[13px] text-fg-3">No sources list this campus.</li>}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
