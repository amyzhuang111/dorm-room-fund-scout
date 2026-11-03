import { plainTextDeep } from "@/lib/display/plain-text";
import { permanentRedirect } from "next/navigation";
import { FounderDiscoverApp } from "@/components/founder-discover-app";
import { mergedParamHref } from "@/lib/domain/entity-redirects";
import type { EnrollmentStatus } from "@/lib/domain/founder-status";
import { listFounderStatusCounts, listFoundersForPage, listPotentialFoundersForPage, listUniversities } from "@/lib/domain/queries";
import { readReviewState } from "@/lib/domain/review-server";

export default async function FounderDiscoverPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const mergedFounder = mergedParamHref("/founder/discover", sp, "founder", "person");
  if (mergedFounder) permanentRedirect(mergedFounder);
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
      founders={plainTextDeep(founders)}
      potentialFounders={plainTextDeep(listPotentialFoundersForPage())}
      enrollment={enrollment}
      records={review.records}
      likes={review.likes}
      totalFounders={totalFounders}
      totalResolved={totalResolved}
    />
  );
}
