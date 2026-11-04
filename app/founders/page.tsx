import { FoundersDesk } from "@/components/founders-desk";
import { loadCorpusTotals } from "@/lib/domain/corpus-totals";

export default function FoundersPage() {
  const totals = loadCorpusTotals();
  const count = totals.foundersIndexed;
  return (
    <div className="px-3 py-2 sm:px-6 sm:py-8" data-founders-page="">
      <h1 className="page-title text-[24px] leading-7 sm:text-[inherit] sm:leading-[inherit]">Founders</h1>
      <p
        className="mt-0.5 font-mono text-[11px] font-semibold tabular-nums tracking-wide text-[color:var(--cobalt,#2F4FD8)] sm:mt-1 sm:text-[12px]"
        data-hero-stat=""
        data-founders-totals=""
      >
        <span className="font-bold" data-count="founders-indexed">{count.toLocaleString("en-US")}</span>
        {" searchable · "}
        <span className="font-bold" data-count="investable-companies">{totals.investableCompanies.toLocaleString("en-US")}</span>
        {" investable companies"}
        <span className="hidden sm:inline">
          {" · "}
          <span className="font-bold" data-count="founders-listed">{totals.foundersListed.toLocaleString("en-US")}</span>
          {" listed on the map"}
        </span>
      </p>
      <p className="mt-0.5 max-w-2xl text-[12px] leading-5 text-fg-3 sm:mt-1 sm:text-[13px]" data-founders-searchable-note="">
        One row per company; count can sit below searchable.
      </p>
      <FoundersDesk initialCount={count} />
    </div>
  );
}
