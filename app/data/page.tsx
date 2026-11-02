import Link from "next/link";
import { paginateCorpus, corpusSortOf, CORPUS_PAGE_SIZE } from "@/lib/domain/corpus-explorer";
import { buildDirectoryFromDb } from "@/lib/domain/directory";
import { loadHeroStats } from "@/lib/domain/hero-stats";
import { DataTheme } from "@/components/data-theme";

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
      <div className="flex flex-wrap items-end justify-between gap-2 border-b border-[color:var(--line,#E1E5EF)] pb-2">
        <div>
          <p className="scout-kicker">Corpus</p>
          <h1 className="mt-0.5 scout-display text-[28px] leading-none sm:text-[40px]">Full data</h1>
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
        <a
          href="/data/export"
          className="inline-flex h-8 items-center rounded-sm border border-[color:var(--ember,#D96B1C)] bg-[color:var(--ember,#D96B1C)] px-3 font-mono text-[11px] font-semibold text-white"
          data-corpus-csv=""
        >
          Download CSV
        </a>
      </div>

      <form
        method="get"
        action="/data"
        className="mt-2 space-y-2.5 border border-[color:var(--line,#E1E5EF)] bg-[color:var(--bg,#FFFFFF)] p-3 sm:p-2 sm:flex sm:flex-wrap sm:items-end sm:space-y-0 sm:gap-1.5"
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

      {/* One table for all viewports: sticky Company + Campus + Stage core, horizontal scroll on mobile */}
      <div className="mt-3 overflow-x-auto border border-[color:var(--cobalt,#2F4FD8)]/25 bg-[color:var(--bg,#FFFFFF)] [-webkit-overflow-scrolling:touch]" data-corpus-table="" data-corpus-cards="">
        <table className="min-w-[52rem] w-full border-collapse text-left text-[12px] leading-4 sm:min-w-full sm:text-[11px]">
          <thead className="bg-[color:var(--cobalt-haze,#E8ECFA)]/50 font-mono text-[9px] uppercase tracking-[0.08em] text-[color:var(--cobalt,#2F4FD8)]">
            <tr>
              <th className="sticky left-0 z-[2] whitespace-nowrap border-b border-[color:var(--line,#E1E5EF)] bg-[color:var(--cobalt-haze,#E8ECFA)] px-2.5 py-2 font-semibold">Company</th>
              <th className="sticky left-[7.5rem] z-[2] whitespace-nowrap border-b border-[color:var(--line,#E1E5EF)] bg-[color:var(--cobalt-haze,#E8ECFA)] px-2.5 py-2 font-semibold sm:static sm:bg-transparent">Campus</th>
              <th className="min-w-[5.5rem] border-b border-[color:var(--line,#E1E5EF)] px-2.5 py-2 font-semibold">Stage</th>
              <th className="whitespace-nowrap border-b border-[color:var(--line,#E1E5EF)] px-2.5 py-2 font-semibold">Sector</th>
              <th className="c-d whitespace-nowrap border-b border-[color:var(--line,#E1E5EF)] px-2.5 py-2 font-semibold">Founded</th>
              <th className="c-d whitespace-nowrap border-b border-[color:var(--line,#E1E5EF)] px-2.5 py-2 font-semibold">Signals</th>
              <th className="c-d whitespace-nowrap border-b border-[color:var(--line,#E1E5EF)] px-2.5 py-2 font-semibold">Latest</th>
              <th className="c-d whitespace-nowrap border-b border-[color:var(--line,#E1E5EF)] px-2.5 py-2 font-semibold">Program</th>
              <th className="c-d whitespace-nowrap border-b border-[color:var(--line,#E1E5EF)] px-2.5 py-2 font-semibold">YC</th>
              <th className="c-d whitespace-nowrap border-b border-[color:var(--line,#E1E5EF)] px-2.5 py-2 font-semibold">Founders</th>
              <th className="c-d whitespace-nowrap border-b border-[color:var(--line,#E1E5EF)] px-2.5 py-2 font-semibold">Funding</th>
              <th className="c-d whitespace-nowrap border-b border-[color:var(--line,#E1E5EF)] px-2.5 py-2 font-semibold">Site</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[color:var(--line,#E1E5EF)]">
            {result.rows.map((row) => (
              <tr key={row.id} className="align-top hover:bg-[color:var(--cobalt-haze,#E8ECFA)]/30" data-corpus-row="">
                <td
                  className="c-n sticky left-0 z-[1] max-w-[7.5rem] bg-[color:var(--bg,#FFFFFF)] px-2.5 py-2 font-semibold tracking-tight shadow-[2px_0_0_0_color:var(--line,#E1E5EF)] sm:max-w-none"
                  data-i={(row.name.trim()[0] || "?").toUpperCase()}
                >
                  <Link href={`/startup/${row.id}`} className="min-w-0 font-bold text-[color:var(--fg,#0B0E17)] underline-offset-2 hover:text-[color:var(--ember,#D96B1C)] hover:underline">
                    {row.name}
                  </Link>
                </td>
                <td className="c-m sticky left-[7.5rem] z-[1] max-w-[6.5rem] bg-[color:var(--bg,#FFFFFF)] px-2.5 py-2 shadow-[2px_0_0_0_color:var(--line,#E1E5EF)] sm:static sm:max-w-none sm:shadow-none">
                  {cell(row.campus)}
                </td>
                <td className="c-m min-w-[5.5rem] px-2.5 py-2">{cell(row.stage)}</td>
                <td className="c-m px-2.5 py-2">{cell(row.sector)}</td>
                <td className="c-d px-2.5 py-2 font-mono tabular-nums">{cell(row.foundedYear)}</td>
                <td className="c-d px-2.5 py-2 font-mono font-bold tabular-nums text-[color:var(--ember,#D96B1C)]">{row.signals.toLocaleString("en-US")}</td>
                <td className="c-d px-2.5 py-2 font-mono tabular-nums">{cell(row.latestSignalAt)}</td>
                <td className="c-d px-2.5 py-2">{cell(row.primaryProgram)}</td>
                <td className="c-d px-2.5 py-2">{cell(row.ycBatch)}</td>
                <td className="c-d px-2.5 py-2 font-mono tabular-nums">{row.founderCount > 0 ? row.founderCount.toLocaleString("en-US") : blank()}</td>
                <td className="c-d px-2.5 py-2">{cell(row.fundingText)}</td>
                <td className="c-d px-2.5 py-2">
                  {row.website ? (
                    <a href={row.website} target="_blank" rel="noopener noreferrer" className="text-[color:var(--cobalt,#2F4FD8)] underline">
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
