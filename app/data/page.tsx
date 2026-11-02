import Link from "next/link";
import { paginateCorpus, corpusSortOf, CORPUS_PAGE_SIZE } from "@/lib/domain/corpus-explorer";
import { buildDirectoryFromDb } from "@/lib/domain/directory";
import { loadHeroStats } from "@/lib/domain/hero-stats";
import { DataTheme } from "@/components/data-theme";
import { CorpusRowMark } from "@/components/corpus-row-mark";

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
      <div className="border-b border-[color:var(--line,#E1E5EF)] pb-2">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <div className="min-w-0">
            <p className="scout-kicker">Corpus</p>
            <h1 className="mt-0.5 scout-display text-[28px] leading-none sm:text-[40px]">Full data</h1>
          </div>
          <a
            href="/data/export"
            className="shrink-0 font-mono text-[11px] font-semibold text-[color:var(--cobalt,#2F4FD8)] underline-offset-2 hover:underline"
            data-corpus-csv=""
          >
            Download CSV
          </a>
        </div>
        <p className="mt-1.5 font-mono text-[12px] tabular-nums text-[color:var(--fg-2,#3F465C)]">
          <span className="font-bold text-[color:var(--ember,#D96B1C)]">{result.total.toLocaleString("en-US")}</span>
          {" companies · page "}
          <span className="font-bold text-[color:var(--fg,#0B0E17)]">{result.page}</span>
          {" of "}
          {result.pageCount.toLocaleString("en-US")}
          {" · "}
          {CORPUS_PAGE_SIZE} per page
        </p>
      </div>

      <form
        method="get"
        action="/data"
        className="mt-2 flex flex-nowrap items-center gap-1.5 overflow-x-auto border-b border-[color:var(--line,#E1E5EF)] bg-[color:var(--bg,#FFFFFF)] pb-2 [-webkit-overflow-scrolling:touch]"
        data-corpus-filters=""
      >
        <label className="block min-w-[9.5rem] flex-[1_1_9.5rem]">
          <span className="sr-only">Search</span>
          <input
            name="q"
            defaultValue={q}
            placeholder="Search"
            className="h-8 w-full border border-[color:var(--line,#E1E5EF)] bg-[color:var(--bg,#FFFFFF)] px-2 font-mono text-[12px] text-[color:var(--fg,#0B0E17)]"
          />
        </label>
        <label className="min-w-[6.5rem] flex-none">
          <span className="sr-only">Sector</span>
          <select name="sector" defaultValue={sector || ""} className="h-8 w-full border border-[color:var(--line,#E1E5EF)] bg-[color:var(--bg,#FFFFFF)] px-1 font-mono text-[11px]">
            <option value="">Sector</option>
            {sectors.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-[6.5rem] flex-none">
          <span className="sr-only">Campus</span>
          <select name="campus" defaultValue={campus || ""} className="h-8 w-full border border-[color:var(--line,#E1E5EF)] bg-[color:var(--bg,#FFFFFF)] px-1 font-mono text-[11px]">
            <option value="">Campus</option>
            {campuses.slice(0, 40).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-[5.5rem] flex-none">
          <span className="sr-only">Sort</span>
          <select name="sort" defaultValue={sp.sort || "rank"} className="h-8 w-full border border-[color:var(--line,#E1E5EF)] bg-[color:var(--bg,#FFFFFF)] px-1 font-mono text-[11px]">
            <option value="rank">Rank</option>
            <option value="recent">Newest</option>
            <option value="name">Name</option>
            <option value="stage">Stage</option>
            <option value="signals">Signals</option>
            <option value="founded">Founded</option>
          </select>
        </label>
        <button
          type="submit"
          className="inline-flex h-8 flex-none items-center justify-center rounded-sm border border-[color:var(--cobalt,#2F4FD8)] bg-[color:var(--cobalt,#2F4FD8)] px-2.5 font-mono text-[11px] font-semibold text-white"
        >
          Apply
        </button>
      </form>

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
              <th className="c-th c-fund-h c-d-m">Funding</th>
              <th className="c-th c-d">Site</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[color:var(--line,#E1E5EF)]">
            {result.rows.map((row) => (
              <tr key={row.id} className="c-r align-top" data-corpus-row="">
                <td className="c-n">
                  <span className="c-mark">
                    <CorpusRowMark name={row.name} website={row.website} />
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
                <td className="c-fund c-d-m">{cell(row.fundingText)}</td>
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
            <Link href={hrefFor({ page: String(result.page + 1) })} className="inline-flex h-8 items-center border border-[color:var(--ember,#D96B1C)] bg-[color:var(--ember,#D96B1C)] px-3 font-mono text-[11px] font-semibold text-white">
              Next
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}
