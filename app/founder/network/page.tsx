import { FounderNetworkApp } from "@/components/founder-network-app";
import { selectedEnrollment, type EnrollmentStatus } from "@/lib/domain/founder-status";
import { buildScoutNetwork } from "@/lib/domain/network";
import { getNetworkNodeDetail, getProjectDetail, listFounderStatusCounts, listUniversities } from "@/lib/domain/queries";
import { readReviewState } from "@/lib/domain/review-server";

export default async function FounderNetworkPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const universities = listUniversities();
  const review = await readReviewState();
  const company = sp.project ? getProjectDetail(sp.project) : null;
  const node = sp.project && !company ? getNetworkNodeDetail(sp.project) : null;
  const enrollment = {
    all: listFounderStatusCounts(),
    byUniversity: Object.fromEntries(universities.map((university) => [university.id, listFounderStatusCounts(university.id)])) as Record<
      string,
      Record<EnrollmentStatus, number>
    >,
  };
  return (
    <FounderNetworkApp
      initial={sp}
      universities={universities}
      enrollment={enrollment}
      records={review.records}
      initialGraph={buildScoutNetwork(sp.university, { enrollment: selectedEnrollment(sp.enroll) })}
      initialCompany={company}
      initialNode={node}
    />
  );
}
