import { FounderDiscoverApp } from "@/components/founder-discover-app";
import type { EnrollmentStatus } from "@/lib/domain/founder-status";
import { listFounderStatusCounts, listFoundersForPage, listUniversities } from "@/lib/domain/queries";
import { readReviewState } from "@/lib/domain/review-server";

export default async function FounderDiscoverPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const universities = listUniversities();
  const review = await readReviewState();
  const founders = listFoundersForPage();
  const enrollment = {
    all: listFounderStatusCounts(),
    byUniversity: Object.fromEntries(universities.map((university) => [university.id, listFounderStatusCounts(university.id)])) as Record<
      string,
      Record<EnrollmentStatus, number>
    >,
  };
  const totalFounders = universities.reduce((sum, university) => sum + university.founderCount, 0);
  const totalResolved = universities.reduce((sum, university) => sum + university.resolvedPersonCount, 0);
  return (
    <FounderDiscoverApp
      initial={sp}
      universities={universities}
      founders={founders}
      enrollment={enrollment}
      records={review.records}
      likes={review.likes}
      totalFounders={totalFounders}
      totalResolved={totalResolved}
    />
  );
}
