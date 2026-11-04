import { FoundersDesk } from "@/components/founders-desk";
import { loadCorpusTotals } from "@/lib/domain/corpus-totals";

export default function FoundersPage() {
  const totals = loadCorpusTotals();
  const count = totals.foundersIndexed;
  return (
    <div className="px-3 py-3 sm:px-6 sm:py-6" data-founders-page="">
      <h1 className="text-[28px] font-semibold leading-none tracking-tight text-[color:var(--fg,#0B0E17)] sm:text-[32px]">Founders</h1>
      <p
        className="mt-2 text-[14px] leading-5 text-[color:var(--fg-2,#3F465C)]"
        data-hero-stat=""
        data-founders-totals=""
        data-founders-searchable-note=""
      >
        <span className="font-mono font-semibold tabular-nums text-[color:var(--fg,#0B0E17)]" data-count="founders-indexed">{count.toLocaleString("en-US")}</span>
        {" searchable · "}
        <span className="font-mono font-semibold tabular-nums text-[color:var(--fg,#0B0E17)]" data-count="investable-companies">{totals.investableCompanies.toLocaleString("en-US")}</span>
        {" investable companies"}
        <span className="hidden sm:inline">
          {" · "}
          <span className="font-mono font-semibold tabular-nums text-[color:var(--fg,#0B0E17)]" data-count="founders-listed">{totals.foundersListed.toLocaleString("en-US")}</span>
          {" on the map"}
        </span>
      </p>
      <FoundersDesk initialCount={count} />
    </div>
  );
}
