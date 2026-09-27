import { permanentRedirect } from "next/navigation";
import { StartupDiscoverApp } from "@/components/startup-discover-app";
import { mergedParamHref } from "@/lib/domain/entity-redirects";
import type { EnrollmentStatus } from "@/lib/domain/founder-status";
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
  const mergedProject = mergedParamHref("/startup/discover", sp, "project", "project");
  if (mergedProject) permanentRedirect(mergedProject);
  // Network view was removed. Globe is the default when `view` is absent.
  if (sp.view === "network") {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(sp)) {
      if (key !== "view" && value) params.set(key, value);
    }
    const qs = params.toString();
    permanentRedirect(qs ? `/startup/discover?${qs}` : "/startup/discover");
  }
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
    />
  );
}
