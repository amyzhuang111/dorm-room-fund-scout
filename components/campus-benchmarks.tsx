import { formatHitRate, HIT_RATE_SENTENCE } from "@/lib/domain/campus-hit-rate-model";
import type { CampusHitRate } from "@/lib/domain/campus-hit-rate-model";
import { formatCapitalUsd, PITCHBOOK_SOURCE_URL, PITCHBOOK_TITLE, type PitchbookCampus, type PitchbookTrack } from "@/lib/domain/pitchbook-model";
import { nounFor } from "@/lib/display/plural";

function trackLine(label: string, track: PitchbookTrack) {
  return `${label}: #${track.rank} · ${track.founderCount.toLocaleString("en-US")} ${nounFor(track.founderCount, "founder")} · ${track.companyCount.toLocaleString("en-US")} ${nounFor(track.companyCount, "company", "companies")} · ${formatCapitalUsd(track.capitalRaisedUsd)}`;
}

export function CampusBenchmarks({ pitchbook, hitRate }: { pitchbook: PitchbookCampus | null; hitRate: CampusHitRate | null }) {
  const undergrad = pitchbook?.undergrad ?? null;
  return (
    <div className="mt-3 space-y-2">
      <section className="rounded-md border border-border-c bg-white p-2.5 text-foreground">
        <h3 className="text-xs font-semibold text-foreground">{PITCHBOOK_TITLE}</h3>
        {undergrad ? (
            <>
              <p className="mt-1 text-sm tabular-nums text-foreground">
                {undergrad.founderCount.toLocaleString("en-US")} {nounFor(undergrad.founderCount, "founder")} · {undergrad.companyCount.toLocaleString("en-US")} companies · {formatCapitalUsd(undergrad.capitalRaisedUsd)} raised
              </p>
              <p className="mt-0.5 text-xs text-foreground">
                Undergraduate rank #{undergrad.rank}
                {undergrad.enrollmentBand ? ` · enrollment band ${undergrad.enrollmentBand}` : ""}
              </p>
              {pitchbook?.perThousand != null && (
                <p className="mt-0.5 text-xs tabular-nums text-foreground">
                  {pitchbook.perThousand.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} founders per 1,000 undergraduates
                  {pitchbook.undergrads != null ? ` (${pitchbook.undergrads.toLocaleString("en-US")}${pitchbook.enrollmentYear ? `, ${pitchbook.enrollmentYear}` : ""})` : ""}
                </p>
              )}
            </>
        ) : (
          <p className="mt-1 text-xs text-muted">Not on the PitchBook undergraduate top 100.</p>
        )}
        {pitchbook?.grad && <p className="mt-1 text-xs text-foreground">{trackLine("Graduate list", pitchbook.grad)}</p>}
        {pitchbook?.mba && <p className="mt-1 text-xs text-foreground">{trackLine("MBA list", pitchbook.mba)}</p>}
        <p className="mt-1 text-[11px] text-muted">
          VC-backed alumni founders, January 2015-August 2026.{" "}
          <a href={PITCHBOOK_SOURCE_URL} target="_blank" rel="noopener noreferrer" className="text-link underline">
            PitchBook university rankings
          </a>
        </p>
      </section>
      {hitRate && (
        <section className={`rounded-md border border-border-c bg-white p-2.5 ${hitRate.reliable ? "text-foreground" : "text-muted"}`}>
          <h3 className="text-xs font-semibold text-foreground">Campus hit rate</h3>
          <p className="mt-1 text-[13px] font-medium leading-snug text-foreground">{HIT_RATE_SENTENCE}</p>
          <p className={`mt-1 text-sm tabular-nums ${hitRate.reliable ? "text-foreground" : "text-muted"}`}>
            {formatHitRate(hitRate.hitRate)}× the comparison group{" "}
            <span className="text-xs text-muted">
              ({formatHitRate(hitRate.low)}-{formatHitRate(hitRate.high)}) · {hitRate.good.toLocaleString("en-US")} of {hitRate.founders.toLocaleString("en-US")} tracked founders had a good outcome
            </span>
          </p>
          {!hitRate.reliable && (
            <p className="mt-0.5 text-[11px] text-muted">
              {hitRate.founders < 8
                ? "Too few tracked founders to read much into this rate."
                : "The 95% interval is too wide to rank this campus."}
            </p>
          )}
        </section>
      )}
    </div>
  );
}
