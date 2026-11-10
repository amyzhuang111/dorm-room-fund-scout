import type { Metadata } from "next";
import Link from "next/link";
import { paginateCorpus, corpusSortOf, CORPUS_PAGE_SIZE, loadCorpusFillRates } from "@/lib/domain/corpus-explorer";
import { buildDirectoryFromDb } from "@/lib/domain/directory";
import { loadHeroStats } from "@/lib/domain/hero-stats";
import { loadRecencyFunnel } from "@/lib/domain/recency-funnel";
import { DataTheme } from "@/components/data-theme";
import { CorpusRowMark } from "@/components/corpus-row-mark";
import { CampusSeal } from "@/components/campus-seal";
import { formatCorpusDate } from "@/lib/domain/corpus-totals";
import { CorpusFilters } from "@/components/corpus-filters";

export const metadata: Metadata = { title: "Data" };

export const dynamic = "force-dynamic";

/** Quiet blank - middot only (no em/en dashes, no "Not available" flood). */
function blank() {
  return (
    <span className="c-b text-[color:var(--fg-3,#5C647A)]" aria-label="not on file">
      ·
    </span>
  );
}

function cell(value: string | number | null | undefined) {
  if (value == null || value === "") return blank();
  return <span className="text-[color:var(--fg,#0B0E17)]">{value}</span>;
}

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
  const scope = sp.scope || undefined;
  const kind = sp.kind || undefined;
  const result = paginateCorpus({ q, sector, campus, sort, page, scope, kind });
  const { sectors: sectorFilters } = buildDirectoryFromDb({includeAll:true});
  // Keep select options tiny in RSC HTML (id + label only) — full university rows blow the 210 KB gate.
  const sectors = sectorFilters.map((s) => ({ id: s.id, label: s.label }));
  const campuses = loadHeroStats()
    .universities
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
      scope,
      kind,
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
    <div className="sample-paper mx-auto max-w-[1200px] px-3 py-2 pb-8 sm:px-5 sm:py-3" data-corpus-explorer="">
      <DataTheme />
      <div className="flex flex-wrap items-end justify-between gap-2 border-b border-[color:var(--line,#E1E5EF)] pb-2">
        <div>
          <p className="scout-kicker">Corpus</p>
          <h1 className="mt-0.5 scout-display text-[20px] leading-none sm:text-[26px]">Full data</h1>
          <p className="mt-1.5 font-mono text-[14px] tabular-nums text-[color:var(--fg-2,#3F465C)]">
            <span className="font-bold text-[color:var(--cobalt,#2F4FD8)]">{result.total.toLocaleString("en-US")}</span>
            {" records in this view · page "}
            <span className="font-bold text-[color:var(--fg,#0B0E17)]">{result.page}</span>
            {" of "}
            {result.pageCount.toLocaleString("en-US")}
            {" · "}
            {CORPUS_PAGE_SIZE} per page
          </p>
        </div>
        <a
          href={`/data/export?${new URLSearchParams(Object.entries({q,sector,campus,sort,scope,kind}).filter(([,v])=>v) as [string,string][]).toString()}`}
          className="hidden h-11 min-h-11 items-center rounded-sm border border-[color:var(--cobalt,#2F4FD8)] bg-[color:var(--cobalt,#2F4FD8)] px-3 font-mono text-[14px] font-semibold text-white sm:inline-flex"
          data-corpus-csv=""
        >
          Export this view
        </a>
        <a
          href={`/data/export?${new URLSearchParams(Object.entries({q,sector,campus,sort,scope,kind}).filter(([,v])=>v) as [string,string][]).toString()}`}
          className="inline-flex h-11 min-h-11 items-center font-mono text-[14px] font-semibold text-[color:var(--cobalt,#2F4FD8)] underline-offset-2 hover:underline sm:hidden"
          data-corpus-csv-mobile=""
        >
          CSV export
        </a>
      </div>

      <nav className="my-3 flex flex-wrap gap-4 text-sm font-semibold text-[color:var(--cobalt,#2F4FD8)]"><Link href="/data/people">All people & class years →</Link><Link href="/data?scope=scout">Scouting list</Link><Link href="/data">All records</Link></nav>
      <p className="hidden text-[13px] leading-5 text-fg-2 sm:block">Every stored company is here, including unverified leads. A source link does not verify every field.</p>
      <p
        className="mt-2 font-mono text-[13px] leading-5 text-[color:var(--fg-2,#5C4030)]"
        data-recency-funnel=""
      >
        <span className="font-semibold text-[color:var(--fg,#2A1A10)]">Scouting list</span>
        {" · "}
        <span data-count="recency-kept">{recency.investable.toLocaleString("en-US")}</span>
        {" eligible, the same count as Companies and the map. "}
        <span data-count="recency-excluded">{recency.excludedOlderAlumni.toLocaleString("en-US")}</span>
        {" older-alumni companies are left out. "}
        <span className="text-[color:var(--ember,#E85D04)]" data-count="recency-unverified">{recency.unverifiedRecency.toLocaleString("en-US")}</span>
        {" have unverified founder recency."}
      </p>

      <p
        className="mt-1 hidden font-mono text-[13px] leading-5 text-[color:var(--fg-2,#5C4030)] sm:block"
        data-corpus-fill-rates=""
      >
        <span className="font-semibold text-[color:var(--fg,#0B0E17)]">Full corpus coverage</span>
        {" · Stage: "}
        <span data-count="fill-stage">{fill.stage.toLocaleString("en-US")}</span>
        {" of "}
        <span data-count="fill-total">{fill.total.toLocaleString("en-US")}</span>
        {" · Sector: "}
        <span data-count="fill-sector">{fill.sector.toLocaleString("en-US")}</span>
        {" of "}
        {fill.total.toLocaleString("en-US")}
        {" · Founded: "}
        <span data-count="fill-founded">{fill.founded.toLocaleString("en-US")}</span>
        {" of "}
        {fill.total.toLocaleString("en-US")}
        {" · Funding: "}
        <span data-count="fill-funding">{fill.funding.toLocaleString("en-US")}</span>
        {" of "}
        {fill.total.toLocaleString("en-US")}
        {" · Website: "}
        <span data-count="fill-website">{fill.website.toLocaleString("en-US")}</span>
        {" of "}
        {fill.total.toLocaleString("en-US")}
      </p>

      <CorpusFilters
        q={q}
        sector={sector || ""}
        campus={campus || ""}
        sort={sp.sort || "rank"}
        scope={scope || ""}
        kind={kind || ""}
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
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--cobalt,#2F4FD8)]">Corpus on this page</p>
            <p className="mt-0.5 font-mono text-[13px] tabular-nums leading-4 text-[color:var(--fg,#0B0E17)]">
              <span className="text-[18px] font-bold text-[color:var(--cobalt,#2F4FD8)]">{result.total.toLocaleString("en-US")}</span>
              {" companies"}
              <span aria-hidden> · </span>
              <span className="font-bold text-[color:var(--fg,#0B0E17)]">{pageSignaled.toLocaleString("en-US")}</span>
              {" signaled"}
            </p>
            {pageCampusRanks[0] ? (
              <p className="mt-0.5 break-words font-mono text-[12px] tabular-nums leading-4 text-[color:var(--fg-2,#5C4030)]">
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
                <span className="max-w-[9rem] break-words text-[12px] font-semibold leading-4 text-[color:var(--fg,#2A1A10)]">{row.label}</span>
                <span className="font-mono text-[11px] font-bold tabular-nums text-[color:var(--cobalt,#2F4FD8)]">{row.companies.toLocaleString("en-US")}</span>
              </li>
            ))}
          </ol>
        ) : null}
      </div>

      {/* One table for all viewports: sticky Company + Campus + Stage core, horizontal scroll on mobile */}
      <div className="mt-2 overflow-x-auto border border-[color:var(--cobalt,#2F4FD8)]/25 bg-[color:var(--bg,#FFFFFF)] [-webkit-overflow-scrolling:touch] sm:mt-3" data-corpus-table="" data-corpus-cards="">
        <table className="c-table">
          <thead className="c-head">
            <tr>
              <th className="c-th c-th-n">Company</th>
              <th className="c-th c-th-m">Campus</th>
              <th className="c-th">Scouting status</th><th className="c-th">Evidence</th><th className="c-th">Stage</th>
              <th className="c-th">Sector</th>
              <th className="c-th c-d c-d-m">Founded</th>
              <th className="c-th c-d c-d-m">Signals</th>
              <th className="c-th c-d">Latest</th>
              <th className="c-th c-d">Program</th>
              <th className="c-th c-d">YC</th>
              <th className="c-th c-d">Team</th>
              <th className="c-th c-fund-h">Funding</th>
              <th className="c-th c-d">Site</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[color:var(--line,#E1E5EF)]">
            {result.rows.map((row) => (
              <tr key={row.id} className="c-r align-top" data-corpus-row="">
                <td className="c-n">
                  <span className="c-mark">
                    <CorpusRowMark name={row.name} website={row.website} logoUrl={row.logoUrl} />
                  </span>
                  <Link href={`/startup/${row.id}`} className="c-a min-h-11 min-w-11 inline-flex items-center">
                    {row.name}
                  </Link>
                </td>
                <td className="c-m c-m1">{cell(row.campus)}</td>
                <td className="c-m"><span>{row.scoutingStatus}</span><small className="block text-fg-3">{row.kind}</small></td>
                <td className="c-m"><span>{row.verification}</span>{row.sourceUrls[0] ? <a href={row.sourceUrls[0]} target="_blank" rel="noopener noreferrer" className="block c-link">Source{row.sourceUrls.length>1?` +${row.sourceUrls.length-1}`:''}</a> : <small className="block">No source URL</small>}</td>
                <td className="c-m">{cell(row.stage)}</td>
                <td className="c-m">{cell(row.sector)}</td>
                <td className="c-d c-d-m c-num">{cell(formatCorpusDate(row.foundedYear))}</td>
                <td className="c-d c-d-m c-sig">{row.signals.toLocaleString("en-US")}</td>
                <td className="c-d c-num">{cell(formatCorpusDate(row.latestSignalAt))}</td>
                <td className="c-d">{cell(row.primaryProgram)}</td>
                <td className="c-d">{cell(row.ycBatch)}</td>
                <td className="c-d c-num">{row.founderCount > 0 ? row.founderCount.toLocaleString("en-US") : blank()}</td>
                <td className="c-fund">{cell(row.fundingText)}</td>
                <td className="c-d">
                  {row.website ? (
                    <a href={row.website} target="_blank" rel="noopener noreferrer" className="c-link">
                      Link
                    </a>
                  ) : (
                    blank()
                  )}
                </td>
              </tr>
            ))}
            {result.rows.length === 0 ? (
              <tr>
                <td colSpan={14} className="px-2.5 py-6 text-center text-[color:var(--fg-3,#5C647A)]">
                  No companies match these filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="font-mono text-[14px] tabular-nums text-[color:var(--fg-3,#5C647A)]">
          Showing {(result.total === 0 ? 0 : (result.page - 1) * result.pageSize + 1).toLocaleString("en-US")}
          {" to "}
          {Math.min(result.page * result.pageSize, result.total).toLocaleString("en-US")}
          {" of "}
          {result.total.toLocaleString("en-US")}
        </p>
        <div className="flex items-center gap-2">
          {result.page > 1 ? (
            <Link href={hrefFor({ page: String(result.page - 1) })} className="inline-flex h-11 min-h-11 items-center border border-[color:var(--line-strong,#C5CAD8)] px-3 font-mono text-[11px] font-semibold">
              Previous
            </Link>
          ) : null}
          {result.page < result.pageCount ? (
            <Link href={hrefFor({ page: String(result.page + 1) })} className="inline-flex h-11 min-h-11 items-center border border-[color:var(--cobalt,#2F4FD8)] bg-[color:var(--cobalt,#2F4FD8)] px-3 font-mono text-[14px] font-semibold text-white">
              Next
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}

