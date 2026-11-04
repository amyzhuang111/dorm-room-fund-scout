import { FoundersDesk } from "@/components/founders-desk";
import { loadCorpusTotals } from "@/lib/domain/corpus-totals";

export default function FoundersPage() {
  const totals = loadCorpusTotals();
  const count = totals.foundersIndexed;
  return (
    <div className="px-3 py-3 sm:px-6 sm:py-8" data-founders-page="">
      <h1 className="page-title text-[28px] leading-8 sm:text-[inherit] sm:leading-[inherit]">Founders</h1>
      <p
        className="mt-1 font-mono text-[11px] font-semibold tabular-nums tracking-wide text-[color:var(--cobalt,#2F4FD8)] sm:text-[12px]"
        data-hero-stat=""
      >
        {count.toLocaleString("en-US")} searchable · {totals.investableCompanies.toLocaleString("en-US")} investable companies · live corpus
      </p>
      <p className="mt-1 font-mono text-[13px] tabular-nums leading-6 text-fg-2 sm:text-[14px]" data-founders-totals="">
        <span className="font-bold text-fg" data-count="founders-indexed">{count.toLocaleString("en-US")}</span>
        {" searchable in this table"}
        <span className="hidden sm:inline">
          {" · "}
          <span className="font-bold text-fg" data-count="founders-listed">{totals.foundersListed.toLocaleString("en-US")}</span>
          {" listed on the map · "}
          <span className="font-bold text-fg" data-count="investable-companies">{totals.investableCompanies.toLocaleString("en-US")}</span>
          {" investable companies"}
        </span>
      </p>
      <p className="mt-1 max-w-2xl text-[12px] leading-5 text-fg-3 sm:text-[13px]" data-founders-searchable-note="">
        One row per company those founders map to. Row count can sit below the searchable total.
      </p>
      <FoundersDesk initialCount={count} />
    </div>
  );
}
