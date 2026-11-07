import { FoundersDesk } from "@/components/founders-desk";
import Link from "next/link";
import { loadFounderTable } from "@/lib/domain/founder-table";
import { loadCorpusTotals } from "@/lib/domain/corpus-totals";

export default function FoundersPage() {
  const rows = loadFounderTable();
  const totals = loadCorpusTotals();
  return (
    <div className="px-3 py-3 sm:px-6 sm:py-8" data-founders-page="">
      <link rel="preload" as="fetch" href="/data/founder-table.json" />
      <h1 className="page-title text-[28px] leading-8 sm:text-[inherit] sm:leading-[inherit]">Founders</h1>
      <p className="mt-1 text-[14px] leading-5 text-fg-2" data-founders-totals="">
        <span className="font-bold text-fg" data-count="founders-indexed">{rows.length.toLocaleString("en-US")}</span>
        {" named founders on record"}
      </p>
      <details className="mt-2 text-sm text-fg-2"><summary className="cursor-pointer py-2">About this directory</summary><p>Each row is a person stored as a founder. Company, campus, and signal fields appear only when they are stored on that record.</p>
      <Link href="/data/people" className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-link underline">Browse all {totals.peopleTotal.toLocaleString("en-US")} people, including unverified leads and class-year sources →</Link></details>
      <FoundersDesk initialCount={rows.length} initialRows={rows.slice(0, 40)} />
    </div>
  );
}

