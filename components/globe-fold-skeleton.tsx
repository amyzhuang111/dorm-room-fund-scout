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
      <div className="mb-4" data-fold-counts="">
        <p className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[14px] leading-6 text-[color:var(--fg-2,#3F465C)]">
          <span>
            <span className="font-bold tabular-nums text-[color:var(--ember,#D96B1C)]">{companyCount.toLocaleString("en-US")}</span>
            {" vetted companies"}
          </span>
          <span>
            <span className="font-bold tabular-nums text-[color:var(--ember,#D96B1C)]" data-count="founders-listed">{foundersListed.toLocaleString("en-US")}</span>
            {" founders on those companies"}
          </span>
          <span>
            <span className="font-bold tabular-nums text-[color:var(--ember,#D96B1C)]" data-count="campuses-on-map">{campusesOnMap.toLocaleString("en-US")}</span>
            {" schools with a pin"}
          </span>
          {campusesWithFounders > 0 ? (
            <span>
              <span className="font-bold tabular-nums text-[color:var(--ember,#D96B1C)]" data-count="campuses-with-founders">{campusesWithFounders.toLocaleString("en-US")}</span>
              {" campuses with promoted founders"}
            </span>
          ) : null}
          {dataThrough ? <span>Updated {absoluteDate(dataThrough)}</span> : null}
        </p>
        <p className="mt-1 text-[13px] text-[color:var(--fg,#0B0E17)]">Schools with a pin include campuses with no promoted founder. The Campuses page lists only the schools that have one.</p>
      </div>
      <div
        className="relative overflow-hidden border-2 border-[color:var(--cobalt,#2F4FD8)]/35 bg-[#FFFFFF]"
        style={{ height: "clamp(420px, 74vh, 780px)" }}
        data-dispatch-map-stage=""
        data-fold-bigmap-skeleton=""
      >
        <div className="grid h-full place-items-center">
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[color:var(--ink-muted,#5a6577)]">Loading globe</p>
        </div>
      </div>
    </div>
  );
}
