import { FoundersDesk } from "@/components/founders-desk";
import Link from "next/link";
import { loadProjectRows } from "@/lib/domain/founder-table";
import { loadCorpusTotals } from "@/lib/domain/corpus-totals";
import { buildFounderIndex } from "@/lib/domain/founder-index-build";
import { loadDirectory } from "@/lib/domain/directory";
import { filterWorkspace, workspaceFilters, workspaceFounders } from "@/lib/domain/scout-workspace";
import { founderProjectRows } from "@/lib/domain/founder-view";

export default async function FoundersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const params = new URLSearchParams(Object.entries(sp).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
  const filters = workspaceFilters(params);
  const scoped = Boolean(filters.campus || filters.q || filters.sector || filters.region || filters.status || filters.stage || filters.network || filters.missing);
  const founders = workspaceFounders(buildFounderIndex(), filterWorkspace(loadDirectory().cards, filters), filters);
  const allowedIds = founders.map(founder => founder.id);
  const count = allowedIds.length;
  const rows = founderProjectRows(loadProjectRows(), allowedIds);
  const groups = rows.length;
  const totals = loadCorpusTotals();
  return (
    <div className="px-3 py-3 sm:px-6 sm:py-8" data-founders-page="">
      <link rel="preload" as="fetch" href="/data/founder-table.json" />
      <h1 className="page-title text-[28px] leading-8 sm:text-[inherit] sm:leading-[inherit]">Founders</h1>
      <p className="mt-1 font-mono text-[13px] tabular-nums leading-4 text-fg-2 sm:mt-2 sm:text-[14px] sm:leading-5" data-founders-totals="">
        <span className="font-bold text-fg" data-count="founders-indexed">{count.toLocaleString("en-US")}</span>
        {scoped ? " matching founders · " : " indexed founders · "}{groups.toLocaleString("en-US")} project / team rows
      </p>
      {scoped && <Link href="/founders" className="inline-flex min-h-11 items-center text-sm text-link underline">Clear filters · All founders</Link>}
      <details className="mt-2 text-sm text-fg-2"><summary className="cursor-pointer py-2">About this directory</summary><p>The table groups these people into {groups.toLocaleString("en-US")} project / team rows. A person can appear in more than one group.</p>
      <Link href="/data/people" className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-link underline">Browse all {totals.peopleTotal.toLocaleString("en-US")} people, including unverified leads and class-year sources →</Link></details>
      <FoundersDesk key={params.toString()} initialCount={count} initialRows={rows.slice(0, 150)} allowedFounderIds={allowedIds} />
    </div>
  );
}

