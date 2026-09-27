import { permanentRedirect } from "next/navigation";
import { FounderShortlistApp } from "@/components/founder-shortlist-app";
import { requireMemberPage } from "@/lib/auth/guard";
import { mergedParamHref } from "@/lib/domain/entity-redirects";
import type { EnrollmentStatus } from "@/lib/domain/founder-status";
import { listFounderStatusCounts, listFoundersForPage, listUniversities } from "@/lib/domain/queries";
import { readReviewState } from "@/lib/domain/review-server";

export default async function FounderShortlistPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireMemberPage("/founder/shortlist");
  const sp = await searchParams;
  const mergedFounder = mergedParamHref("/founder/shortlist", sp, "founder", "person");
  if (mergedFounder) permanentRedirect(mergedFounder);
  const universities = listUniversities();
  const review = await readReviewState();
  const enrollment = {
    all: listFounderStatusCounts(),
    byUniversity: Object.fromEntries(universities.map((university) => [university.id, listFounderStatusCounts(university.id)])) as Record<
      string,
      Record<EnrollmentStatus, number>
    >,
  };
  return (
    <FounderShortlistApp
      initial={sp}
      universities={universities}
      founders={listFoundersForPage()}
      enrollment={enrollment}
      records={review.records}
      likes={review.likes}
    />
  );
}
