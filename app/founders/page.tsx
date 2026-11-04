import { FoundersDesk } from "@/components/founders-desk";
import { loadFounderTable } from "@/lib/domain/founder-table";
import { loadCorpusTotals } from "@/lib/domain/corpus-totals";

export default function FoundersPage() {
  const count = loadFounderTable().length;
  const totals = loadCorpusTotals();
  return (
    <div className="px-3 py-3 sm:px-6 sm:py-8" data-founders-page="">
      <h1 className="page-title text-[28px] leading-8 sm:text-[inherit] sm:leading-[inherit]">Founders</h1>
      <p className="mt-1 font-mono text-[13px] tabular-nums leading-4 text-fg-2 sm:mt-2 sm:text-[14px] sm:leading-5" data-founders-totals="">
        <span className="font-bold text-fg" data-count="founders-indexed">{count.toLocaleString("en-US")}</span>
        <span className="sm:hidden"> searchable</span>
        <span className="hidden sm:inline">{" searchable · "}</span>
        <span className="hidden sm:inline">
          <span className="font-bold text-fg" data-count="founders-listed">{totals.foundersListed.toLocaleString("en-US")}</span>
          {" listed on the map · "}
          <span className="font-bold text-fg" data-count="investable-companies">{totals.investableCompanies.toLocaleString("en-US")}</span>
          {" investable companies"}
        </span>
      </p>
      <FoundersDesk initialCount={count} />
    </div>
  );
}
