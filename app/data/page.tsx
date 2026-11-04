import type { Metadata } from "next";
import Link from "next/link";
import { paginateCorpus, corpusSortOf, CORPUS_PAGE_SIZE, loadCorpusFillRates } from "@/lib/domain/corpus-explorer";
import { buildDirectoryFromDb } from "@/lib/domain/directory";
import { loadHeroStats } from "@/lib/domain/hero-stats";
import { loadRecencyFunnel } from "@/lib/domain/recency-funnel";
import { DataTheme } from "@/components/data-theme";
import { CorpusRowMark } from "@/components/corpus-row-mark";
import { CampusSeal } from "@/components/campus-seal";
import { formatCorpusDate, loadCorpusTotals } from "@/lib/domain/corpus-totals";
import { CorpusFilters } from "@/components/corpus-filters";
import { directoryRank } from "@/lib/domain/directory-rank";
import { ellipsisAtBoundary, WRAP_FULL } from "@/lib/display/ellipsis";

export const metadata: Metadata = { title: "Data" };

export const dynamic = "force-dynamic";

export default async function DataExplorerPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page || "1") || 1);
  const sort = corpusSortOf(sp.sort);
  const q = (sp.q || "").trim();
  const sector = sp.sector || undefined;
  const campus = sp.campus || undefined;
  const result = paginateCorpus({ q, sector, campus, sort, page });
  const corpusTotals = loadCorpusTotals();
  const unfiltered = !q && !sector && !campus;
  const universeTotal = unfiltered ? corpusTotals.investableCompanies : result.total;
  const { sectors: sectorFilters } = buildDirectoryFromDb();
  // Keep select options tiny in RSC HTML (id + label only) — full university rows blow the 210 KB gate.
  const sectors = sectorFilters.map((s) => ({ id: s.id, label: s.label }));
  const campuses = loadHeroStats()
    .universities.slice(0, 20)
    .map((c) => ({ id: c.id, name: c.name }));
  const recency = loadRecencyFunnel();
  const fill = loadCorpusFillRates();

  const pageCampusRanks = (() => {
    const map = new Map<string, { label: string; companies: number; signaled: number }>();
    for (const row of result.rows) {
      const label = (row.campus || "").trim();
      if (!label) continue;
      const cur = map.get(label) ?? { label, companies: 0, signaled: 0 };
      cur.companies += 1;
      if (row.signals > 0) cur.signaled += 1;
      map.set(label, cur);
    }
    return [...map.values()]
      .sort((a, b) => b.companies - a.companies || b.signaled - a.signaled || a.label.localeCompare(b.label))
      .slice(0, 5);
  })();
  const pageSignaled = result.rows.filter((row) => row.signals > 0).length;
  const foldCampusRanks = pageCampusRanks.slice(0, 3);

  const hrefFor = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    const merged = {
      q: q || undefined,
      sector,
      campus,
      sort: sp.sort || undefined,
      page: String(result.page),
      ...patch,
    };
    for (const [k, v] of Object.entries(merged)) {
      if (v) next.set(k, v);
    }
    const s = next.toString();
    return s ? `/data?${s}` : "/data";
  };

  return (
    <div className="sample-paper mx-auto max-w-[1200px] px-3 py-3 pb-8 sm:px-5 sm:py-4" data-corpus-explorer="">
      <DataTheme />
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[color:var(--line,#E1E5EF)] pb-3">
        <div className="min-w-0">
          <h1 className="text-[28px] font-semibold leading-none tracking-tight text-[color:var(--fg,#0B0E17)] sm:text-[32px]">Full data</h1>
          <p className="mt-2 text-[14px] leading-5 text-[color:var(--fg-2,#3F465C)]" data-hero-stat="" data-corpus-explain="">
            <span className="font-mono font-semibold tabular-nums text-[color:var(--fg,#0B0E17)]">{universeTotal.toLocaleString("en-US")}</span>
            {" vetted companies · page "}
            <span className="font-mono font-semibold tabular-nums text-[color:var(--fg,#0B0E17)]">{result.page}</span>
            {" of "}
            <span className="font-mono tabular-nums">{result.pageCount.toLocaleString("en-US")}</span>
            {" · "}
            {CORPUS_PAGE_SIZE}
            {" per page"}
          </p>
        </div>
        <a
          href="/data/export"
          className="hidden h-10 min-h-10 items-center rounded-md border border-[color:var(--line-strong,#C5CAD8)] bg-[color:var(--bg,#FFFFFF)] px-3 text-[14px] font-semibold text-[color:var(--fg,#0B0E17)] hover:border-[color:var(--fg-2,#3F465C)] sm:inline-flex"
          data-corpus-csv=""
        >
          Download CSV
        </a>
        <a
          href="/data/export"
          className="inline-flex h-10 min-h-10 items-center text-[14px] font-semibold text-[color:var(--fg,#0B0E17)] underline-offset-2 hover:underline sm:hidden"
          data-corpus-csv-mobile=""
        >
          CSV export
        </a>
      </div>

      <p
        className="mt-2 hidden text-[13px] leading-5 text-[color:var(--fg-3,#5C647A)] sm:block"
        data-recency-funnel=""
        data-corpus-fill-rates=""
      >
        <span data-count="recency-kept">{recency.investable.toLocaleString("en-US")}</span>
        {" vetted · "}
        <span data-count="recency-excluded">{recency.excludedOlderAlumni.toLocaleString("en-US")}</span>
        {" older alumni out · "}
        <span data-count="recency-unverified">{recency.unverifiedRecency.toLocaleString("en-US")}</span>
        {" unchecked · on file Stage "}
        <span className="font-mono tabular-nums" data-count="fill-stage">{fill.stage.toLocaleString("en-US")}</span>
        {"/"}
        <span className="font-mono tabular-nums" data-count="fill-total">{fill.total.toLocaleString("en-US")}</span>
        {" · Sector "}
        <span className="font-mono tabular-nums" data-count="fill-sector">{fill.sector.toLocaleString("en-US")}</span>
        {" · Founded "}
        <span className="font-mono tabular-nums" data-count="fill-founded">{fill.founded.toLocaleString("en-US")}</span>
        {" · Funding "}
        <span className="font-mono tabular-nums" data-count="fill-funding">{fill.funding.toLocaleString("en-US")}</span>
        {" · Site "}
        <span className="font-mono tabular-nums" data-count="fill-website">{fill.website.toLocaleString("en-US")}</span>
      </p>

      <CorpusFilters
        q={q}
        sector={sector || ""}
        campus={campus || ""}
        sort={sp.sort || "rank"}
        sectors={sectors}
        campuses={campuses}
      />

      {/* r49 mobile: compact corpus summary + top ranks above table; keep a few rows in fold. */}
      <div className="mt-2 hidden" data-corpus-campus-ranks="">
        <div
          className="flex items-center gap-2 border border-[color:var(--cobalt,#2F4FD8)]/25 bg-[color:var(--cobalt-haze,#E8ECFA)]/35 px-2 py-1.5"
          data-corpus-campus-lead=""
          data-mobile-list-mast=""
        >
          {pageCampusRanks[0] ? <CampusSeal label={pageCampusRanks[0].label} size="md" /> : null}
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--cobalt,#2F4FD8)]">On this page</p>
            <p className="mt-0.5 font-mono text-[13px] tabular-nums leading-4 text-[color:var(--fg,#0B0E17)]">
              <span className="text-[18px] font-bold text-[color:var(--cobalt,#2F4FD8)]">{universeTotal.toLocaleString("en-US")}</span>
              {" companies"}
              <span aria-hidden> · </span>
              <span className="font-bold text-[color:var(--fg,#0B0E17)]">{pageSignaled.toLocaleString("en-US")}</span>
              {" signaled"}
            </p>
            {pageCampusRanks[0] ? (
              <p className="mt-0.5 truncate font-mono text-[11px] tabular-nums text-[color:var(--fg-2,#3F465C)]">
                <span className="font-semibold text-[color:var(--fg,#0B0E17)]">{pageCampusRanks[0].label}</span>
                {" leads · "}
                <span className="font-bold text-[color:var(--cobalt,#2F4FD8)]">{pageCampusRanks[0].companies.toLocaleString("en-US")}</span>
                {" rows · "}
                <span className="font-bold text-[color:var(--fg,#0B0E17)]">{pageCampusRanks[0].signaled.toLocaleString("en-US")}</span>
                {" signaled"}
              </p>
            ) : null}
          </div>
        </div>
        {foldCampusRanks.length ? (
          <ol className="mt-1 flex gap-1.5 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" data-corpus-campus-rank-strip="">
            {foldCampusRanks.map((row, i) => (
              <li
                key={row.label}
                className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-sm border border-[color:var(--cobalt,#2F4FD8)]/25 bg-[color:var(--bg,#FFFFFF)] px-2"
              >
                <span className="font-mono text-[10px] font-bold tabular-nums text-[color:var(--cobalt,#2F4FD8)]">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <CampusSeal label={row.label} size="sm" />
                <span className="max-w-[4.5rem] truncate text-[11px] font-semibold text-[color:var(--fg,#0B0E17)]">{row.label}</span>
                <span className="font-mono text-[11px] font-bold tabular-nums text-[color:var(--cobalt,#2F4FD8)]">{row.companies.toLocaleString("en-US")}</span>
              </li>
            ))}
          </ol>
        ) : null}
      </div>

      {/* YC-directory card language: logo, name, pitch, campus, year, stage, sector, backers, tier. */}
      <ul className="mt-3 divide-y divide-[color:var(--line,#E1E5EF)] border-t border-[color:var(--line,#E1E5EF)] sm:mt-4" data-corpus-table="" data-corpus-cards="">
        {result.rows.map((row) => {
          const whyBits = [row.signalLabel, row.stage, row.sector, row.primaryProgram].filter(Boolean) as string[];
          const pitch = whyBits.length
            ? whyBits.slice(0, 3).join(" · ")
            : row.fundingText || null;
          const desk = directoryRank({
            signals: row.signals,
            signalKind: null,
            signalLabel: (row.signalLabel as "Funding" | "Launch" | "Award" | "Acquisition" | null) ?? null,
            founders: [],
            programs: [row.primaryProgram, row.ycBatch].filter(Boolean) as string[],
            stage: row.stage,
            operatingStatus: null,
            school: row.campus,
            schoolId: null,
            foundedYear: row.foundedYear,
            primaryProgram: row.primaryProgram,
          });
          const tierLabel = desk.tier === 0 ? "Core" : desk.tier === 1 ? "Watch" : "Listed";
          const backers = [row.primaryProgram, row.ycBatch].filter(Boolean) as string[];
          const uniqueBackers = [...new Set(backers)].slice(0, 3);
          return (
            <li key={row.id} className="list-none" data-corpus-row="">
              <Link
                href={`/startup/${row.id}`}
                className="group flex min-h-11 items-start gap-3 px-1 py-4 transition-colors duration-150 ease-out sm:gap-3.5 sm:px-2 sm:py-5 lg:hover:bg-[color:var(--bg-2,#F7F8FC)]"
              >
                <span className="mt-0.5 shrink-0">
                  <CorpusRowMark name={row.name} website={row.website} logoUrl={row.logoUrl} campus={row.campus} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <p className="break-words text-[17px] font-semibold leading-snug tracking-tight text-[color:var(--fg,#0B0E17)] sm:text-[18px] sm:leading-6">
                      {row.name}
                    </p>
                    {row.campus ? (
                      <span className="text-[13px] text-[color:var(--fg-3,#5C647A)]" data-field="campus">
                        {row.campus}
                      </span>
                    ) : null}
                  </div>
                  {pitch ? (
                    <p className="mt-1 max-w-2xl text-[14px] leading-5 text-[color:var(--fg-2,#3F465C)]" data-why-here="" data-card-pitch="">
                      {ellipsisAtBoundary(pitch, 140)}
                    </p>
                  ) : (
                    <p className="sr-only" data-why-here="" data-why-blank="1">
                      Why it&apos;s here blank
                    </p>
                  )}
                  <span className="mt-2.5 flex flex-wrap items-center gap-1.5" data-card-chips="">
                    <span className="inline-flex h-6 items-center rounded-full border border-[color:var(--line,#E1E5EF)] bg-[color:var(--bg,#FFFFFF)] px-2 text-[12px] font-medium text-[color:var(--fg,#0B0E17)]" data-card-tier-chip="">
                      {tierLabel}
                    </span>
                    {row.foundedYear != null ? (
                      <span className="inline-flex h-6 items-center rounded-full border border-[color:var(--line,#E1E5EF)] bg-[color:var(--bg,#FFFFFF)] px-2 font-mono text-[12px] tabular-nums text-[color:var(--fg-2,#3F465C)]" data-card-year="">
                        {formatCorpusDate(row.foundedYear)}
                      </span>
                    ) : null}
                    {row.stage ? (
                      <span className="inline-flex h-6 items-center rounded-full border border-[color:var(--line,#E1E5EF)] bg-[color:var(--bg,#FFFFFF)] px-2 text-[12px] text-[color:var(--fg-2,#3F465C)]" data-field="stage">
                        {row.stage}
                      </span>
                    ) : null}
                    {row.sector ? (
                      <span className="inline-flex h-6 items-center rounded-full border border-[color:var(--line,#E1E5EF)] bg-[color:var(--bg,#FFFFFF)] px-2 text-[12px] uppercase tracking-[0.04em] text-[color:var(--fg-2,#3F465C)]" data-field="sector">
                        {row.sector}
                      </span>
                    ) : null}
                    {uniqueBackers.map((backer) => (
                      <span
                        key={backer}
                        className={`inline-flex h-6 max-w-[12rem] items-center rounded-full border border-[color:var(--line,#E1E5EF)] bg-[color:var(--bg-2,#F7F8FC)] px-2 text-[12px] text-[color:var(--fg,#0B0E17)] ${WRAP_FULL}`}
                        data-card-backer=""
                        title={backer}
                      >
                        {backer}
                      </span>
                    ))}
                    {row.signals > 0 ? (
                      <span className="inline-flex h-6 items-center rounded-full border border-[color:var(--line,#E1E5EF)] bg-[color:var(--bg,#FFFFFF)] px-2 font-mono text-[12px] tabular-nums text-[color:var(--fg-2,#3F465C)]">
                        {row.signals.toLocaleString("en-US")} signals
                      </span>
                    ) : null}
                  </span>
                </div>
              </Link>
            </li>
          );
        })}
        {result.rows.length === 0 ? (
          <li className="px-2.5 py-6 text-center text-[14px] text-[color:var(--fg-3,#5C647A)]">No companies match these filters.</li>
        ) : null}
      </ul>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[14px] tabular-nums text-[color:var(--fg-3,#5C647A)]">
          Showing {(result.total === 0 ? 0 : (result.page - 1) * result.pageSize + 1).toLocaleString("en-US")}
          {" to "}
          {Math.min(result.page * result.pageSize, result.total).toLocaleString("en-US")}
          {" of "}
          {universeTotal.toLocaleString("en-US")}
        </p>
        <div className="flex items-center gap-2">
          {result.page > 1 ? (
            <Link href={hrefFor({ page: String(result.page - 1) })} className="inline-flex h-10 min-h-10 items-center border border-[color:var(--line-strong,#C5CAD8)] px-3 text-[14px] font-semibold">
              Previous
            </Link>
          ) : null}
          {result.page < result.pageCount ? (
            <Link href={hrefFor({ page: String(result.page + 1) })} className="inline-flex h-10 min-h-10 items-center border border-[color:var(--fg,#0B0E17)] bg-[color:var(--fg,#0B0E17)] px-3 text-[14px] font-semibold text-white">
              Next
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}
