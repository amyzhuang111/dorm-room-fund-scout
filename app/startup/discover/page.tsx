import { StartupDiscoverApp } from "@/components/startup-discover-app";
import { selectedEnrollment, type EnrollmentStatus } from "@/lib/domain/founder-status";
import { buildScoutNetwork } from "@/lib/domain/network";
import {
  getProjectDetail,
  listCampusArcs,
  listCandidateProjects,
  listFounderStatusCounts,
  listSectorCounts,
  listUniversities,
} from "@/lib/domain/queries";
import { readReviewState } from "@/lib/domain/review-server";

export default async function StartupDiscoverPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const universities = listUniversities();
  const review = await readReviewState();
  const view = sp.view ?? "globe";
  const enrollment = {
    all: listFounderStatusCounts(),
    byUniversity: Object.fromEntries(universities.map((university) => [university.id, listFounderStatusCounts(university.id)])) as Record<
      string,
      Record<EnrollmentStatus, number>
    >,
  };
  return (
    <StartupDiscoverApp
      initial={sp}
      universities={universities}
      candidates={listCandidateProjects()}
      arcs={listCampusArcs()}
      sectors={listSectorCounts()}
      enrollment={enrollment}
      records={review.records}
      likes={review.likes}
      initialDetail={sp.project ? getProjectDetail(sp.project) : null}
      initialGraph={
        view === "network"
          ? buildScoutNetwork(sp.university, { sector: sp.sector, enrollment: selectedEnrollment(sp.enroll) })
          : null
      }
    />
  );
}
