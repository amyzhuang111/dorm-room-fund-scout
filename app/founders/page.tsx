import { FoundersDesk } from "@/components/founders-desk";
import Link from "next/link";
import { redirect } from "next/navigation";
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
        {" in the full index"}
        {count !== totals.foundersIndexed ? ` · ${count.toLocaleString("en-US")} in this table` : ""}
        {" · "}{groups.toLocaleString("en-US")} projects
      </p>
      <details className="mt-2 text-sm text-fg-2"><summary className="cursor-pointer py-2">About this directory</summary><p>The table groups these people into {groups.toLocaleString("en-US")} project / team rows. A person can appear in more than one group.</p>
      <Link href="/data/people" className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-link underline">Browse all {totals.peopleTotal.toLocaleString("en-US")} people, including unverified leads and class-year sources →</Link></details>
      <FoundersDesk initialCount={count} initialRows={rows.slice(0, 150)} />
    </div>
  );
}

