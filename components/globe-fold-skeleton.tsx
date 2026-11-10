import { absoluteDate } from "@/lib/domain/relative-time";

/** Same status row and map stage the globe paints, so the page does not jump when the map arrives. */
export function GlobeFoldSkeleton({
  companyCount = 0,
  foundersListed = 0,
  campusesOnMap = 0,
  campusesWithFounders = 0,
  dataThrough = null,
}: {
  companyCount?: number;
  foundersListed?: number;
  /** Schools that have coordinates, including schools with no promoted founder. */
  campusesOnMap?: number;
  /** Same list as the Campuses page: a promoted founder is on record. */
  campusesWithFounders?: number;
  dataThrough?: string | null;
  topName?: string;
  topFounders?: number;
  topSignals?: number;
}) {
  return (
    <div data-fold-mobile-root="" aria-busy="true">
      <div className="mb-2" data-fold-counts="">
        <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[13px] leading-5 text-[color:var(--fg-2,#5C4030)]">
          <span>
            <span className="font-bold tabular-nums text-[color:var(--ember,#E85D04)]">{companyCount.toLocaleString("en-US")}</span>
            {" vetted companies"}
          </span>
          <span>
            <span className="font-bold tabular-nums text-[color:var(--ember,#E85D04)]" data-count="founders-listed">{foundersListed.toLocaleString("en-US")}</span>
            {" founders on those companies"}
          </span>
          <span>
            <span className="font-bold tabular-nums text-[color:var(--ember,#E85D04)]" data-count="campuses-on-map">{campusesOnMap.toLocaleString("en-US")}</span>
            {" schools with a pin"}
          </span>
          {campusesWithFounders > 0 ? (
            <span>
              <span className="font-bold tabular-nums text-[color:var(--ember,#E85D04)]" data-count="campuses-with-founders">{campusesWithFounders.toLocaleString("en-US")}</span>
              {" campuses with promoted founders"}
            </span>
          ) : null}
          {dataThrough ? <span>Updated {absoluteDate(dataThrough)}</span> : null}
        </p>
      </div>
      <div
        className="globe-stage relative grid place-items-center overflow-hidden border border-[color:var(--ember,#E85D04)]/40"
        style={{ height: "min(92vw, calc(100dvh - 340px))", minHeight: 280 }}
        data-dispatch-map-stage=""
        data-fold-bigmap-skeleton=""
      >
        <div className="globe-disc" data-globe-disc="" />
        <p className="sr-only">Globe is loading</p>
      </div>
    </div>
  );
}
