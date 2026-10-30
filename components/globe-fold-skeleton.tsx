import { absoluteDate } from "@/lib/domain/relative-time";

/** Same masthead and map stage the desk paints, so the fold does not jump when the globe chunk arrives. */
export function GlobeFoldSkeleton({
  companyCount = 0,
  foundersListed = 0,
  campusesOnMap = 0,
  dataThrough = null,
  topName = "",
  topFounders = 0,
  topSignals = 0,
}: {
  companyCount?: number;
  foundersListed?: number;
  campusesOnMap?: number;
  dataThrough?: string | null;
  topName?: string;
  topFounders?: number;
  topSignals?: number;
}) {
  const desk = topName.replace(/^University of /, "").replace(/ University$/, "");
  return (
    <div data-fold-mobile-root="" aria-busy="true">
      <div className="mb-3 border-b border-[color:var(--line,#E1E5EF)] pb-3" data-fold-counts="">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[color:var(--ember,#D96B1C)]" aria-hidden />
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[color:var(--cobalt,#2F4FD8)]">Scout dispatch</p>
          <span className="inline-flex items-center rounded-sm border border-[color:var(--line-strong,#C5CAD8)] bg-[color:var(--bg,#FFFFFF)] px-1.5 py-0.5 font-mono text-[9px] tabular-nums tracking-[0.04em] text-[color:var(--fg-2,#3F465C)]">
            Snapshot · {absoluteDate(dataThrough)}
          </span>
        </div>
        <div className="mt-3 grid items-end gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6">
          <div className="min-w-0">
            <p className="mt-0 font-mono text-[64px] font-bold leading-[0.88] tracking-[-0.07em] text-[color:var(--ember,#D96B1C)] sm:text-[72px] lg:text-[80px]">
              {companyCount.toLocaleString("en-US")}
            </p>
            <div className="mt-2 flex items-end gap-2" aria-hidden>
              <span className="h-px w-8 bg-[color:var(--cobalt,#2F4FD8)]" />
              <span className="h-[3px] max-w-[180px] flex-1 bg-[color:var(--ember,#D96B1C)]" />
            </div>
            <p className="mt-2 text-[16px] font-semibold leading-tight tracking-tight text-[color:var(--fg,#0B0E17)] sm:text-[17px]">
              companies forming on campus
            </p>
          </div>
          {desk ? (
            <div className="min-w-0 border-t border-[color:var(--line,#E1E5EF)] pt-2.5 sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0">
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--ember,#D96B1C)]">01 · top desk</p>
              <p className="mt-1 text-[15px] font-semibold tracking-tight text-[color:var(--fg,#0B0E17)]">
                {desk}
                <span className="ml-2 font-mono text-[12px] font-bold tabular-nums text-[color:var(--ember,#D96B1C)]">
                  {topFounders.toLocaleString("en-US")}
                </span>
                <span className="font-mono text-[11px] text-[color:var(--fg-2,#3F465C)]"> founders · </span>
                <span className="font-mono text-[12px] font-bold tabular-nums text-[color:var(--ember,#D96B1C)]">
                  {topSignals.toLocaleString("en-US")}
                </span>
              </p>
            </div>
          ) : null}
          <div className="hidden min-w-0 lg:block">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--cobalt,#2F4FD8)]">On the map</p>
            <p className="mt-1 font-mono text-[28px] font-bold tabular-nums leading-none text-[color:var(--ember,#D96B1C)]">
              {foundersListed.toLocaleString("en-US")}
            </p>
            <p className="mt-1 font-mono text-[11px] text-[color:var(--fg-2,#3F465C)]">
              founder names listed · {campusesOnMap.toLocaleString("en-US")} campuses on map
            </p>
          </div>
        </div>
      </div>
      <div
        className="relative overflow-hidden border-2 border-[color:var(--cobalt,#2F4FD8)]/35 bg-[color:var(--bg,#FFFFFF)]"
        style={{ height: 780 }}
        data-dispatch-map-stage=""
      />
    </div>
  );
}
