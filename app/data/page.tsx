import Link from "next/link";
import { paginateCorpus, corpusSortOf, CORPUS_PAGE_SIZE } from "@/lib/domain/corpus-explorer";
import { buildDirectoryFromDb } from "@/lib/domain/directory";
import { loadHeroStats } from "@/lib/domain/hero-stats";

export const dynamic = "force-dynamic";

function cell(value: string | number | null | undefined) {
  if (value == null || value === "") {
    return <span className="text-[color:var(--fg-3,#5C647A)]">Not available</span>;
  }
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
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[color:var(--line,#E1E5EF)] pb-3">
        <div>
          <p className="scout-kicker">Corpus</p>
          <h1 className="mt-1 scout-display text-[32px] leading-none sm:text-[44px]">Full data</h1>
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
          className="inline-flex h-9 items-center rounded-sm border border-[color:var(--ember,#D96B1C)] bg-[color:var(--ember,#D96B1C)] px-3.5 font-mono text-[11px] font-semibold text-white"
          data-corpus-csv=""
        >
          Download CSV
        </a>
      </div>

      <form method="get" action="/data" className="mt-3 grid grid-cols-2 gap-2 border border-[color:var(--line,#E1E5EF)] bg-[color:var(--bg,#FFFFFF)] p-2.5 sm:grid-cols-[1fr_auto_auto_auto_auto] sm:p-3" data-corpus-filters="">
        <label className="col-span-2 block min-w-0 sm:col-span-1">
          <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-[color:var(--fg-3,#5C647A)]">Search</span>
          <input
            name="q"
            defaultValue={q}
            placeholder="Name or founder"
            className="mt-1 h-9 w-full border border-[color:var(--line,#E1E5EF)] bg-[color:var(--bg,#FFFFFF)] px-2 font-mono text-[12px] text-[color:var(--fg,#0B0E17)]"
          />
        </label>
        <label className="block">
          <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-[color:var(--fg-3,#5C647A)]">Sector</span>
          <select name="sector" defaultValue={sector || ""} className="mt-1 h-9 w-full min-w-[9rem] border border-[color:var(--line,#E1E5EF)] bg-[color:var(--bg,#FFFFFF)] px-2 font-mono text-[12px]">
            <option value="">All sectors</option>
            {sectors.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-[color:var(--fg-3,#5C647A)]">Campus</span>
          <select name="campus" defaultValue={campus || ""} className="mt-1 h-9 w-full min-w-[9rem] border border-[color:var(--line,#E1E5EF)] bg-[color:var(--bg,#FFFFFF)] px-2 font-mono text-[12px]">
            <option value="">All campuses</option>
            {campuses.slice(0, 40).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-[color:var(--fg-3,#5C647A)]">Sort</span>
          <select name="sort" defaultValue={sp.sort || "rank"} className="mt-1 h-9 w-full min-w-[8rem] border border-[color:var(--line,#E1E5EF)] bg-[color:var(--bg,#FFFFFF)] px-2 font-mono text-[12px]">
            <option value="rank">Rank</option>
            <option value="recent">Newest signal</option>
            <option value="name">Name</option>
            <option value="stage">Stage</option>
            <option value="signals">Signal count</option>
            <option value="founded">Founded year</option>
          </select>
        </label>
        <div className="col-span-2 flex items-end sm:col-span-1">
          <button type="submit" className="inline-flex h-9 w-full items-center justify-center rounded-sm border border-[color:var(--cobalt,#2F4FD8)] bg-[color:var(--cobalt,#2F4FD8)] px-3 font-mono text-[11px] font-semibold text-white sm:w-auto">
            Apply
          </button>
        </div>
      </form>

      <div className="mt-3 overflow-x-auto border border-[color:var(--cobalt,#2F4FD8)]/25 bg-[color:var(--bg,#FFFFFF)] [-webkit-overflow-scrolling:touch]" data-corpus-table="">
        <table className="min-w-full border-collapse text-left text-[12px]">
          <thead className="bg-[color:var(--cobalt-haze,#E8ECFA)]/50 font-mono text-[10px] uppercase tracking-[0.08em] text-[color:var(--cobalt,#2F4FD8)]">
            <tr>
              {["Company", "Campus", "Sector", "Stage", "Founded", "Signals", "Latest", "Program", "YC", "Founders", "Funding", "Site"].map((h) => (
                <th
                  key={h}
                  className={`whitespace-nowrap border-b border-[color:var(--line,#E1E5EF)] px-2.5 py-2 font-semibold ${h === "Company" ? "sticky left-0 z-[1] bg-[color:var(--cobalt-haze,#E8ECFA)]" : ""}`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[color:var(--line,#E1E5EF)]">
            {result.rows.map((row) => (
              <tr key={row.id} className="align-top hover:bg-[color:var(--cobalt-haze,#E8ECFA)]/30" data-corpus-row="">
                <td className="sticky left-0 z-[1] bg-[color:var(--bg,#FFFFFF)] px-2.5 py-2 font-semibold tracking-tight shadow-[2px_0_0_0_color:var(--line,#E1E5EF)]">
                  <Link href={`/startup/${row.id}`} className="text-[color:var(--fg,#0B0E17)] underline-offset-2 hover:text-[color:var(--ember,#D96B1C)] hover:underline">
                    {row.name}
                  </Link>
                </td>
                <td className="px-2.5 py-2">{cell(row.campus)}</td>
                <td className="px-2.5 py-2">{cell(row.sector)}</td>
                <td className="px-2.5 py-2">{cell(row.stage)}</td>
                <td className="px-2.5 py-2 font-mono tabular-nums">{cell(row.foundedYear)}</td>
                <td className="px-2.5 py-2 font-mono font-bold tabular-nums text-[color:var(--ember,#D96B1C)]">{row.signals.toLocaleString("en-US")}</td>
                <td className="px-2.5 py-2 font-mono tabular-nums">{cell(row.latestSignalAt)}</td>
                <td className="px-2.5 py-2">{cell(row.primaryProgram)}</td>
                <td className="px-2.5 py-2">{cell(row.ycBatch)}</td>
                <td className="px-2.5 py-2 font-mono tabular-nums">{row.founderCount > 0 ? row.founderCount.toLocaleString("en-US") : cell(null)}</td>
                <td className="px-2.5 py-2">{cell(row.fundingText)}</td>
                <td className="px-2.5 py-2">
                  {row.website ? (
                    <a href={row.website} target="_blank" rel="noopener noreferrer" className="text-[color:var(--cobalt,#2F4FD8)] underline">
                      Link
                    </a>
                  ) : (
                    cell(null)
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
