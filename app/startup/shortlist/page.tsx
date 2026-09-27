import { permanentRedirect } from "next/navigation";
import { StartupShortlistApp } from "@/components/startup-lists-app";
import { requireMemberPage } from "@/lib/auth/guard";
import { mergedParamHref } from "@/lib/domain/entity-redirects";
import { getProjectDetail, listCandidateProjects, listSectorCounts, listUniversities } from "@/lib/domain/queries";
import { readReviewState } from "@/lib/domain/review-server";

export default async function StartupShortlistPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireMemberPage("/startup/shortlist");
  const sp = await searchParams;
  const mergedProject = mergedParamHref("/startup/shortlist", sp, "project", "project");
  if (mergedProject) permanentRedirect(mergedProject);
  const review = await readReviewState();
  return (
    <StartupShortlistApp
      initial={sp}
      universities={listUniversities()}
      candidates={listCandidateProjects()}
      sectors={listSectorCounts()}
      records={review.records}
      likes={review.likes}
      initialDetail={sp.project ? getProjectDetail(sp.project) : null}
    />
  );
}
