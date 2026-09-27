import { permanentRedirect, redirect } from "next/navigation";
import { StartupDiscoverApp } from "@/components/startup-discover-app";
import { resolveCampusSlug } from "@/lib/domain/campuses";
import { mergedParamHref } from "@/lib/domain/entity-redirects";
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
  const mergedProject = mergedParamHref("/startup/discover", sp, "project", "project");
  if (mergedProject) permanentRedirect(mergedProject);
  const campusId = resolveCampusSlug(sp.university) ?? resolveCampusSlug(sp.campus);
  const campusParamDirty = Boolean(sp.campus) || (Boolean(sp.university) && sp.university !== campusId);
  if (campusParamDirty || (sp.view === "network" && !campusId)) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(sp)) {
      if (!value || key === "campus" || key === "view" || key === "university") continue;
      params.set(key, value);
    }
    if (campusId) params.set("university", campusId);
    if (sp.view && sp.view !== "network") params.set("view", sp.view);
    if (sp.view === "network" && campusId) params.set("view", "network");
    const qs = params.toString();
    redirect(qs ? `/startup/discover?${qs}` : "/startup/discover");
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
      initialGraph={
        sp.view === "network" && campusId
          ? buildScoutNetwork(campusId, { sector: sp.sector, enrollment: selectedEnrollment(sp.enroll) })
          : null
      }
    />
  );
}
