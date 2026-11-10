import { FoundersDesk } from "@/components/founders-desk";
import Link from "next/link";
import { redirect } from "next/navigation";
import { COUNTED_HREFS } from "@/lib/domain/counted-hrefs";
import { loadFounderTable, loadProjectRows } from "@/lib/domain/founder-table";
import { loadCorpusTotals } from "@/lib/domain/corpus-totals";

export default async function FoundersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const named = (sp.founder || sp.person || "").trim();
  if (named) redirect(`/founders/${encodeURIComponent(named)}`);
  const count = loadFounderTable().length;
  const rows = loadProjectRows();
  const groups = rows.length;
  const totals = loadCorpusTotals();
  return (
    <div className="px-3 py-3 sm:px-6 sm:py-8" data-founders-page="">
      <link rel="preload" as="fetch" href="/data/founder-table.json" />
      <h1 className="page-title text-[28px] leading-8 sm:text-[inherit] sm:leading-[inherit]">Founders</h1>
      <p className="mt-1 font-mono text-[13px] tabular-nums leading-4 text-fg-2 sm:mt-2 sm:text-[14px] sm:leading-5" data-founders-totals="">
        <span className="font-bold text-fg" data-count="founders-indexed">{totals.foundersIndexed.toLocaleString("en-US")}</span>
        {" in the full index. "}
        {count === totals.foundersIndexed
          ? "This table lists that index."
          : `This table lists ${count.toLocaleString("en-US")} people, which is not the same set.`}
        {` ${groups.toLocaleString("en-US")} project groups. A person can appear in more than one group, so the group count is not the person count.`}
      </p>
      <p className="mt-2 text-sm text-fg-2">
        <Link href={COUNTED_HREFS.eligibleCompanyPeople} className="font-semibold text-link underline" data-count="founders-listed">
          {totals.foundersListed.toLocaleString("en-US")} people with a role on eligible companies
        </Link>
        {" are a different list."}
      </p>
      <details className="mt-2 text-sm text-fg-2"><summary className="cursor-pointer py-2">About this directory</summary><p>The table groups these people into {groups.toLocaleString("en-US")} project / team rows. A person can appear in more than one group.</p>
      <Link href="/data/people" className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-link underline">Browse all {totals.peopleTotal.toLocaleString("en-US")} people, including unverified leads and class-year sources →</Link></details>
      <FoundersDesk initialCount={count} initialRows={rows.slice(0, 150)} />
    </div>
  );
}

