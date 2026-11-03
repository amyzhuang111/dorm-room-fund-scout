import Link from "next/link";
import { paginateCorpus, corpusSortOf, CORPUS_PAGE_SIZE } from "@/lib/domain/corpus-explorer";
import { buildDirectoryFromDb } from "@/lib/domain/directory";
import fs from "node:fs";
import path from "node:path";
import { loadHeroStats } from "@/lib/domain/hero-stats";

function loadRecencyFunnel() {
  try {
    const snap = JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", "corpus-snapshot.json"), "utf8"));
    return {
      investable: Number(snap.investableCompanies ?? 0),
      excludedOlderAlumni: Number(snap.excludedOlderAlumni ?? 0),
      unverifiedRecency: Number(snap.unverifiedRecency ?? 0),
    };
  } catch {
    return { investable: 0, excludedOlderAlumni: 0, unverifiedRecency: 0 };
  }
}
import { DataTheme } from "@/components/data-theme";
import { CorpusRowMark } from "@/components/corpus-row-mark";
import { CampusSeal } from "@/components/campus-seal";

export const dynamic = "force-dynamic";

/** Quiet blank - middot only (no em/en dashes, no "Not available" flood). */
function blank() {
  return <span className="c-b text-[color:var(--fg-3,#5C647A)]">·</span>;
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
  const result = paginateCorpus({ q, sector, campus, sort, page });
  const { sectors } = buildDirectoryFromDb();
  const campuses = loadHeroStats().universities;
  const recency = loadRecencyFunnel();

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
      <div className="flex flex-wrap items-end justify-between gap-2 border-b border-[color:var(--line,#E1E5EF)] pb-2">
        <div>
          <p className="scout-kicker">Corpus</p>
          <h1 className="mt-0.5 scout-display text-[28px] leading-none sm:text-[40px]">Full data</h1>
          <p className="mt-1.5 font-mono text-[12px] tabular-nums text-[color:var(--fg-2,#3F465C)]">
            <span className="font-bold text-[color:var(--cobalt,#2F4FD8)]">{result.total.toLocaleString("en-US")}</span>
            {" companies · page "}
            <span className="font-bold text-[color:var(--fg,#0B0E17)]">{result.page}</span>
            {" of "}
            {result.pageCount.toLocaleString("en-US")}
            {" · "}
            {CORPUS_PAGE_SIZE} per page
          </p>
        </div>
        <a
          href="/data/export"
          className="hidden h-8 items-center rounded-sm border border-[color:var(--cobalt,#2F4FD8)] bg-[color:var(--cobalt,#2F4FD8)] px-3 font-mono text-[11px] font-semibold text-white sm:inline-flex"
          data-corpus-csv=""
        >
          Download CSV
        </a>
        <a
          href="/data/export"
          className="inline-flex h-9 items-center font-mono text-[12px] font-semibold text-[color:var(--cobalt,#2F4FD8)] underline-offset-2 hover:underline sm:hidden"
          data-corpus-csv-mobile=""
        >
          CSV export
        </a>
      </div>

      <p
        className="mt-2 rounded-sm border border-dashed border-[color:var(--line,#E1E5EF)] bg-[color:var(--bg-2,#F7F8FC)] px-2.5 py-2 font-mono text-[11px] leading-5 text-[color:var(--fg-2,#3F465C)]"
        data-recency-funnel=""
      >
        <span className="font-semibold text-[color:var(--fg,#0B0E17)]">Recency gate</span>
        {" · "}
        <span data-count="recency-kept">{recency.investable.toLocaleString("en-US")}</span>
        {" kept (this table) · "}
        <span data-count="recency-excluded">{recency.excludedOlderAlumni.toLocaleString("en-US")}</span>
        {" excluded older alumni · "}
        <span className="text-[color:var(--ember,#D96B1C)]" data-count="recency-unverified">{recency.unverifiedRecency.toLocaleString("en-US")}</span>
        {" unverified recency (not counted as verified)"}
      </p>

      <form
        method="get"
        action="/data"
        className="mt-2 space-y-2 border-b border-[color:var(--line,#E1E5EF)] bg-[color:var(--bg,#FFFFFF)] pb-2.5 sm:flex sm:flex-wrap sm:items-end sm:gap-1.5 sm:space-y-0 sm:pb-2"
        data-corpus-filters=""
      >
        <label className="block min-w-0 sm:flex-[1_1_10rem]">
          <span className="sr-only">Search</span>
          <input
            name="q"
            defaultValue={q}
            placeholder="Search name or founder"
            className="h-10 w-full border border-[color:var(--line,#E1E5EF)] bg-[color:var(--bg,#FFFFFF)] px-2 font-mono text-[13px] text-[color:var(--fg,#0B0E17)] sm:h-8 sm:text-[12px]"
          />
        </label>
        <div className="grid grid-cols-2 gap-2 sm:contents">
          <label className="min-w-0 sm:min-w-[7.5rem] sm:flex-none">
            <span className="sr-only">Sector</span>
            <select name="sector" defaultValue={sector || ""} className="h-10 w-full border border-[color:var(--line,#E1E5EF)] bg-[color:var(--bg,#FFFFFF)] px-1.5 font-mono text-[12px] sm:h-8 sm:text-[11px]">
              <option value="">All sectors</option>
              {sectors.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label className="min-w-0 sm:min-w-[7.5rem] sm:flex-none">
            <span className="sr-only">Campus</span>
            <select name="campus" defaultValue={campus || ""} className="h-10 w-full border border-[color:var(--line,#E1E5EF)] bg-[color:var(--bg,#FFFFFF)] px-1.5 font-mono text-[12px] sm:h-8 sm:text-[11px]">
              <option value="">All campuses</option>
              {campuses.slice(0, 40).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex gap-2 sm:contents">
          <label className="min-w-0 flex-1 sm:min-w-[6.5rem] sm:flex-none">
            <span className="sr-only">Sort</span>
            <select name="sort" defaultValue={sp.sort || "rank"} className="h-10 w-full border border-[color:var(--line,#E1E5EF)] bg-[color:var(--bg,#FFFFFF)] px-1.5 font-mono text-[12px] sm:h-8 sm:text-[11px]">
              <option value="rank">Rank</option>
              <option value="recent">Newest signal</option>
              <option value="name">Name</option>
              <option value="stage">Stage</option>
              <option value="signals">Signal count</option>
              <option value="founded">Founded year</option>
            </select>
          </label>
          <button
            type="submit"
            className="inline-flex h-10 flex-none items-center justify-center rounded-sm border border-[color:var(--cobalt,#2F4FD8)] bg-[color:var(--cobalt,#2F4FD8)] px-4 font-mono text-[12px] font-semibold text-white sm:h-8 sm:px-3 sm:text-[11px]"
          >
            Apply
          </button>
        </div>
      </form>

      {/* r49 mobile: compact corpus summary + top ranks above table; keep a few rows in fold. */}
      <div className="mt-2 sm:hidden" data-corpus-campus-ranks="">
        <div
          className="flex items-center gap-2.5 border border-[color:var(--cobalt,#2F4FD8)]/25 bg-[color:var(--cobalt-haze,#E8ECFA)]/35 px-2.5 py-2"
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
          <ol className="mt-1.5 divide-y divide-[color:var(--line,#E1E5EF)] overflow-hidden border border-[color:var(--cobalt,#2F4FD8)]/25 bg-[color:var(--bg,#FFFFFF)] px-2.5">
            {foldCampusRanks.map((row, i) => (
              <li key={row.label} className="flex items-center gap-2 py-1.5">
                <span className="w-5 shrink-0 text-right font-mono text-[12px] font-bold tabular-nums text-[color:var(--cobalt,#2F4FD8)]">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <CampusSeal label={row.label} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold leading-4 tracking-tight text-[color:var(--fg,#0B0E17)]">{row.label}</p>
                  <p className="font-mono text-[11px] tabular-nums leading-4 text-[color:var(--fg-2,#3F465C)]">
                    <span className="font-bold text-[color:var(--cobalt,#2F4FD8)]">{row.companies.toLocaleString("en-US")}</span>
                    {" cos"}
                    <span aria-hidden> · </span>
                    <span className="font-bold text-[color:var(--fg,#0B0E17)]">{row.signaled.toLocaleString("en-US")}</span>
                    {" signaled"}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        ) : null}
      </div>

      {/* One table for all viewports: sticky Company + Campus + Stage core, horizontal scroll on mobile */}
      <div className="mt-3 overflow-x-auto border border-[color:var(--cobalt,#2F4FD8)]/25 bg-[color:var(--bg,#FFFFFF)] [-webkit-overflow-scrolling:touch]" data-corpus-table="" data-corpus-cards="">
        <table className="c-table">
          <thead className="c-head">
            <tr>
              <th className="c-th c-th-n">Company</th>
              <th className="c-th c-th-m">Campus</th>
              <th className="c-th">Stage</th>
              <th className="c-th">Sector</th>
              <th className="c-th c-d c-d-m">Founded</th>
              <th className="c-th c-d c-d-m">Signals</th>
              <th className="c-th c-d">Latest</th>
              <th className="c-th c-d">Program</th>
              <th className="c-th c-d">YC</th>
              <th className="c-th c-d">Founders</th>
              <th className="c-th c-fund-h">Funding</th>
              <th className="c-th c-d">Site</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[color:var(--line,#E1E5EF)]">
            {result.rows.map((row) => (
              <tr key={row.id} className="c-r align-top" data-corpus-row="">
                <td className="c-n">
                  <span className="c-mark">
                    {row.logoUrl ? (
                      <CorpusRowMark name={row.name} website={row.website} logoUrl={row.logoUrl} />
                    ) : row.campus ? (
                      <CampusSeal label={row.campus} size="sm" />
                    ) : (
                      <CorpusRowMark name={row.name} website={row.website} />
                    )}
                  </span>
                  <Link href={`/startup/${row.id}`} className="c-a">
                    {row.name}
                  </Link>
                </td>
                <td className="c-m c-m1">{cell(row.campus)}</td>
                <td className="c-m">{cell(row.stage)}</td>
                <td className="c-m">{cell(row.sector)}</td>
                <td className="c-d c-d-m c-num">{cell(row.foundedYear)}</td>
                <td className="c-d c-d-m c-sig">{row.signals.toLocaleString("en-US")}</td>
                <td className="c-d c-num">{cell(row.latestSignalAt)}</td>
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
                <td colSpan={12} className="px-2.5 py-6 text-center text-[color:var(--fg-3,#5C647A)]">
                  No companies match these filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="font-mono text-[11px] tabular-nums text-[color:var(--fg-3,#5C647A)]">
          Showing {(result.total === 0 ? 0 : (result.page - 1) * result.pageSize + 1).toLocaleString("en-US")}
          {" to "}
          {Math.min(result.page * result.pageSize, result.total).toLocaleString("en-US")}
          {" of "}
          {result.total.toLocaleString("en-US")}
        </p>
        <div className="flex items-center gap-2">
          {result.page > 1 ? (
            <Link href={hrefFor({ page: String(result.page - 1) })} className="inline-flex h-8 items-center border border-[color:var(--line-strong,#C5CAD8)] px-3 font-mono text-[11px] font-semibold">
              Previous
            </Link>
          ) : null}
          {result.page < result.pageCount ? (
            <Link href={hrefFor({ page: String(result.page + 1) })} className="inline-flex h-8 items-center border border-[color:var(--cobalt,#2F4FD8)] bg-[color:var(--cobalt,#2F4FD8)] px-3 font-mono text-[11px] font-semibold text-white">
              Next
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}
