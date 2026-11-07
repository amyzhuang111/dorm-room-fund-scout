import { FoundersDesk } from "@/components/founders-desk";
import Link from "next/link";
import { redirect } from "next/navigation";
import { loadFounderTable } from "@/lib/domain/founder-table";
import { filterFounderPeople } from "@/lib/domain/founder-people";
import { loadCorpusTotals } from "@/lib/domain/corpus-totals";
import { namedPersonTarget } from "@/lib/domain/person-href";
import { survivorId } from "@/lib/domain/entity-redirects";

export default async function FoundersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const named = namedPersonTarget(sp, (id) => survivorId("person", id));
  if (named) redirect(named);
  const query = sp.q ?? "";
  const campus = sp.campus || sp.university || "";
  const rows = loadFounderTable();
  const focused = filterFounderPeople(rows, { text: query, campus });
  const totals = loadCorpusTotals();
  return (
    <div className="px-3 py-3 sm:px-6 sm:py-8" data-founders-page="">
      <h1 className="page-title text-[22px] leading-7 sm:text-[inherit] sm:leading-[inherit]">Founders</h1>
      <p className="mt-1 text-[14px] leading-5 text-fg-2" data-founders-totals="">
        <span className="font-bold text-fg" data-count="founders-indexed">{rows.length.toLocaleString("en-US")}</span>
        {" named founders on record"}
      </p>
      <details className="mt-2 text-sm text-fg-2"><summary className="cursor-pointer py-2">About this directory</summary><p>Each row is a person stored as a founder. Company, campus, and signal fields appear only when they are stored on that record.</p>
      <Link href="/data/people" className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-link underline">Browse all {totals.peopleTotal.toLocaleString("en-US")} people, including unverified leads and class-year sources →</Link></details>
      <FoundersDesk initialCount={rows.length} initialRows={focused.slice(0, 40)} initialQuery={query} initialCampus={campus} />
    </div>
  );
}

