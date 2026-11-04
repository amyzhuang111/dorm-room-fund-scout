import { FoundersDesk } from "@/components/founders-desk";
import Link from "next/link";
import { loadFounderTable, loadProjectRows } from "@/lib/domain/founder-table";
import { loadCorpusTotals } from "@/lib/domain/corpus-totals";

export default function FoundersPage() {
  const count = loadFounderTable().length;
  const groups = loadProjectRows().length;
  const totals = loadCorpusTotals();
  return (
    <div className="px-3 py-3 sm:px-6 sm:py-8" data-founders-page="">
      <h1 className="page-title text-[28px] leading-8 sm:text-[inherit] sm:leading-[inherit]">Founders</h1>
      <p className="mt-1 font-mono text-[13px] tabular-nums leading-4 text-fg-2 sm:mt-2 sm:text-[14px] sm:leading-5" data-founders-totals="">
        <span className="font-bold text-fg" data-count="founders-indexed">{count.toLocaleString("en-US")}</span>
        <span className="sm:hidden"> people in this desk</span>
        <span className="hidden sm:inline">{" people in this desk · "}</span>
        <span className="hidden sm:inline">
          <span className="font-bold text-fg" data-count="founders-listed">{totals.foundersListed.toLocaleString("en-US")}</span>
          {" listed on the map · "}
          <span className="font-bold text-fg" data-count="investable-companies">{totals.investableCompanies.toLocaleString("en-US")}</span>
          {" investable companies"}
        </span>
      </p>
      <p className="mt-3 text-sm text-fg-2">The table groups these people into {groups.toLocaleString("en-US")} project / team rows. A person can appear in more than one group.</p>
      <Link href="/data/people" className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-link underline">Browse all {totals.peopleTotal.toLocaleString("en-US")} people, including unverified leads and class-year sources →</Link>
      <FoundersDesk initialCount={count} />
    </div>
  );
}

