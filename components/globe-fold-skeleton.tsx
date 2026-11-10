import { absoluteDate } from "@/lib/domain/relative-time";
import { CorpusCountStrip } from "@/components/corpus-count-strip";

/** Painted stand-in for the globe. No loading sentence, same cream well the map uses. */
export function GlobeFoldSkeleton({
  companyCount = 0,
  foundersListed = 0,
  campusesOnMap = 0,
  campusesWithFounders = 0,
  dataThrough = null,
  variant = "page",
}: {
  companyCount?: number;
  foundersListed?: number;
  /** Campuses with coordinates, including public campus overrides. */
  campusesOnMap?: number;
  /** Affiliations of people stored with founder_status founder. */
  campusesWithFounders?: number;
  dataThrough?: string | null;
  topName?: string;
  topFounders?: number;
  topSignals?: number;
  /** `disc` sits inside the map well. `page` is the first paint before the fold arrives. */
  variant?: "page" | "disc";
}) {
  const disc = (
    <div className="home-globe-skeleton" data-dispatch-map-stage="" data-fold-bigmap-skeleton="" aria-hidden={variant === "page" ? true : undefined}>
      <span className="home-globe-skeleton-disc" />
    </div>
  );
  if (variant === "disc") {
    return (
      <div aria-busy="true" data-home-skeleton="disc">
        {disc}
      </div>
    );
  }
  return (
    <div data-home-fold="" data-fold-mobile-root="" data-home-skeleton="page" aria-busy="true">
      <div data-home-fold-screen="">
        <div data-home-counts="">
          <CorpusCountStrip
            companies={companyCount}
            foundersListed={foundersListed}
            campusesOnMap={campusesOnMap}
            campusesWithFounders={campusesWithFounders}
            updatedAt={dataThrough}
          />
          {dataThrough ? <p className="sr-only">Updated {absoluteDate(dataThrough)}</p> : null}
        </div>
        <div data-home-map-well="">{disc}</div>
      </div>
    </div>
  );
}
