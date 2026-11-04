import { FoundersDesk } from "@/components/founders-desk";
import { loadFounderTable } from "@/lib/domain/founder-table";
import { loadCorpusTotals } from "@/lib/domain/corpus-totals";

export default function FoundersPage() {
  const count = loadFounderTable().length;
  const totals = loadCorpusTotals();
  return (
    <div className="px-3 py-6 sm:px-6 sm:py-8" data-founders-page="">
      <h1 className="page-title">Founders</h1>
      <p className="mt-2 font-mono text-[14px] tabular-nums text-fg-2" data-founders-totals="">
        <span className="font-bold text-fg" data-count="founders-indexed">{count.toLocaleString("en-US")}</span>
        {" searchable · "}
        <span className="font-bold text-fg" data-count="founders-listed">{totals.foundersListed.toLocaleString("en-US")}</span>
        {" listed on the map · "}
        <span className="font-bold text-fg" data-count="investable-companies">{totals.investableCompanies.toLocaleString("en-US")}</span>
        {" investable companies"}
      </p>
      <FoundersDesk initialCount={count} />
    </div>
  );
}
