import { matchCandidate } from "./candidate-filter";
import { companyMatchesEnrollment, selectedEnrollment } from "./founder-status";
import type { FeedbackRecord, FeedbackTarget } from "./feedback";
import type { Queue } from "./queue";
import type { CandidateSummary } from "./queries";
import { reviewCompanies, reviewMode } from "./review-view";

type ReviewedCompany = ReturnType<typeof reviewCompanies>[number];

export function companiesInView(
  candidates: CandidateSummary[],
  records: FeedbackRecord[],
  likes: FeedbackTarget[],
  current: Record<string, string | undefined>
): ReviewedCompany[] {
  const matched = candidates.filter((candidate) =>
    matchCandidate(candidate, {
      universityId: current.university,
      queue: current.queue as Queue | undefined,
      sector: current.sector,
      search: current.q,
    })
  );
  const reviewed = reviewCompanies(matched, records, likes, reviewMode(current.feedback)).filter((company) =>
    companyMatchesEnrollment(company.founderLinks, selectedEnrollment(current.enroll))
  );
  if (current.sort !== "priority") return reviewed;
  return [...reviewed].sort((a, b) => {
    if (b.enrollmentBoost !== a.enrollmentBoost) return b.enrollmentBoost - a.enrollmentBoost;
    if (b.boostScore !== a.boostScore) return b.boostScore - a.boostScore;
    if (a.qualityScore == null && b.qualityScore == null) return a.name.localeCompare(b.name);
    if (a.qualityScore == null) return 1;
    if (b.qualityScore == null) return -1;
    return b.qualityScore - a.qualityScore || a.name.localeCompare(b.name);
  });
}
