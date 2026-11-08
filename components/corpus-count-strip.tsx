import Link from "next/link";
import { COUNTED_HREFS, eligibilitySentences, type EligibilityExamples } from "@/lib/domain/counted-hrefs";
import { absoluteDate } from "@/lib/domain/relative-time";

/** One chip per population. The gap is between the number and its label. */
export function CorpusCountStrip({
  companies,
  foundersListed,
  foundersIndexed = 0,
  campusesOnMap,
  campusesWithFounders = 0,
  updatedAt = null,
  examples = null,
  className = "",
}: {
  companies: number;
  foundersListed: number;
  foundersIndexed?: number;
  campusesOnMap: number;
  campusesWithFounders?: number;
  updatedAt?: string | null;
  examples?: EligibilityExamples | null;
  className?: string;
}) {
  const sentences = examples ? eligibilitySentences(examples) : [];
  return (
    <div className={className} data-fold-counts="" data-corpus-count-strip="">
      <p className="corpus-count-line">
        <Link href={COUNTED_HREFS.eligibleCompanies} className="corpus-count-chip" data-count-chip="eligible-companies">
          <span className="corpus-count-num" data-count="eligible-companies">{companies.toLocaleString("en-US")}</span>
          <span className="corpus-count-label">eligible companies</span>
        </Link>
        <Link href={COUNTED_HREFS.eligibleCompanyPeople} className="corpus-count-chip" data-count-chip="founders-listed" data-founder-count-note="">
          <span className="corpus-count-num" data-count="founders-listed">{foundersListed.toLocaleString("en-US")}</span>
          <span className="corpus-count-label">people on those companies</span>
        </Link>
        <Link href={COUNTED_HREFS.fullIndex} className="corpus-count-chip" data-count-chip="founders-indexed">
          <span className="corpus-count-num" data-count="founders-indexed">{foundersIndexed.toLocaleString("en-US")}</span>
          <span className="corpus-count-label">full index</span>
        </Link>
        <Link href={COUNTED_HREFS.pins} className="corpus-count-chip" data-count-chip="campuses-on-map">
          <span className="corpus-count-num" data-count="campuses-on-map">{campusesOnMap.toLocaleString("en-US")}</span>
          <span className="corpus-count-label">schools with a pin</span>
        </Link>
        <Link href={COUNTED_HREFS.storedFounderCampuses} className="corpus-count-chip" data-count-chip="campuses-with-founders">
          <span className="corpus-count-num" data-count="campuses-with-founders">{campusesWithFounders.toLocaleString("en-US")}</span>
          <span className="corpus-count-label">stored-founder campuses</span>
        </Link>
        {updatedAt ? <span className="corpus-count-chip">Updated {absoluteDate(updatedAt)}</span> : null}
      </p>
      <details className="corpus-count-note">
        <summary>What these counts include</summary>
        <p>
          Eligible companies are rows stored with is_investable_candidate set. That flag is the scouting list. It is not a check that founders are enrolled now, and a source link does not confirm every field.
        </p>
        <p>
          People on those companies are distinct person ids with any role on an eligible company. The full index is a separate list. Schools with a pin are campuses with coordinates. Stored-founder campuses are affiliations of people whose founder_status is founder. Promoted founders are counted separately.
        </p>
        {sentences.map((sentence) => (
          <p key={sentence}>{sentence}</p>
        ))}
      </details>
    </div>
  );
}
