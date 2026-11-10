import Link from "next/link";
import { absoluteDate } from "@/lib/domain/relative-time";

/** Same labels and numbers on the map, Companies, and Data. */
export function CorpusCountStrip({
  companies,
  foundersListed,
  foundersIndexed = 0,
  campusesOnMap,
  campusesWithFounders = 0,
  updatedAt = null,
  className = "",
}: {
  companies: number;
  foundersListed: number;
  foundersIndexed?: number;
  campusesOnMap: number;
  campusesWithFounders?: number;
  updatedAt?: string | null;
  className?: string;
}) {
  const num = "font-bold tabular-nums text-[color:var(--ember,#C45C12)]";
  return (
    <p
      className={`flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-[12px] leading-5 text-[color:var(--fg-2,#6b5443)] sm:text-[13px] ${className}`}
      data-fold-counts=""
      data-corpus-count-strip=""
    >
      <Link href="/companies" className="hover:underline">
        <span className={num}>{companies.toLocaleString("en-US")}</span>
        {" vetted companies"}
      </Link>
      <Link href="/founders" className="hover:underline" data-founder-count-note="">
        <span className={num} data-count="founders-listed">
          {foundersListed.toLocaleString("en-US")}
        </span>
        {" founders on those companies"}
        {foundersIndexed > 0 ? (
          <>
            {" · "}
            <span className={num} data-count="founders-indexed">
              {foundersIndexed.toLocaleString("en-US")}
            </span>
            {" in the full index"}
          </>
        ) : null}
      </Link>
      <span>
        <span className={num} data-count="campuses-on-map">
          {campusesOnMap.toLocaleString("en-US")}
        </span>
        {" schools with a pin"}
      </span>
      {campusesWithFounders > 0 ? (
        <Link href="/campuses" className="hover:underline">
          <span className={num} data-count="campuses-with-founders">
            {campusesWithFounders.toLocaleString("en-US")}
          </span>
          {" campuses with promoted founders"}
        </Link>
      ) : null}
      {updatedAt ? <span>Updated {absoluteDate(updatedAt)}</span> : null}
    </p>
  );
}
