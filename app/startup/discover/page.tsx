import { getProjectDetail, listCampusArcs, listCandidateProjects, listUniversities } from "@/lib/domain/queries";
import { readReviewState } from "@/lib/domain/review-server";
import { reviewCompanies, reviewMode } from "@/lib/domain/review-view";
import type { Queue } from "@/lib/domain/queue";
import { FilterSidebar } from "@/components/filter-sidebar";
import { CandidateTable } from "@/components/candidate-table";
import { CompanyDetail } from "@/components/company-detail";
import { UniversityDrawer } from "@/components/university-drawer";
import { GlobeView } from "@/components/globe-view";
import { NetworkView } from "@/components/network-view";
import { ExploreToolbar } from "@/components/explore-toolbar";
import { ViewMemory } from "@/components/view-memory";
import { companyMatchesEnrollment, selectedEnrollment } from "@/lib/domain/founder-status";

const VIEWS = ["globe", "network", "table"] as const;

export default async function StartupDiscoverPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const basePath = "/startup/discover";
  const view = VIEWS.find((v) => v === sp.view) ?? "globe";

  const universities = listUniversities();
  const selectedUniversity = sp.university ? universities.find((u) => u.id === sp.university) : undefined;
  const selectedProject = sp.project ? getProjectDetail(sp.project) : null;

  const candidates = listCandidateProjects({ universityId: sp.university, queue: sp.queue as Queue | undefined, sector: sp.sector, search: sp.q });
  const review = await readReviewState();
  const mode = reviewMode(sp.feedback);
  const focus = selectedEnrollment(sp.enroll);
  const reviewed = reviewCompanies(candidates, review.records, review.likes, mode).filter((company) =>
    companyMatchesEnrollment(company.founderLinks, focus)
  );
  const sorted =
    sp.sort === "priority"
      ? [...reviewed].sort((a, b) => {
          if (b.enrollmentBoost !== a.enrollmentBoost) return b.enrollmentBoost - a.enrollmentBoost;
          if (b.boostScore !== a.boostScore) return b.boostScore - a.boostScore;
          if (a.qualityScore == null && b.qualityScore == null) return a.name.localeCompare(b.name);
          if (a.qualityScore == null) return 1;
          if (b.qualityScore == null) return -1;
          return b.qualityScore - a.qualityScore || a.name.localeCompare(b.name);
        })
      : reviewed;

  const showUniversityDrawer = !selectedProject && selectedUniversity && view !== "globe";

  return (
    <div className="flex min-h-[calc(100vh-3.5rem-2.25rem)] flex-col sm:flex-row">
      <FilterSidebar universities={universities} basePath={basePath} current={sp} mode="startup" />

      <div className="min-w-0 flex-1">
        <ViewMemory basePath={basePath} current={sp} storageKey="campus-universe:startup-discover-view" />
        <ExploreToolbar
          basePath={basePath}
          current={sp}
          resultCount={sorted.length}
          resultLabel={sorted.length === 1 ? "startup candidate" : "startup candidates"}
          searchPlaceholder="Search founders, companies, projects…"
        />

        {view === "table" && <CandidateTable candidates={sorted} basePath={basePath} current={sp} feedbackView={sp.feedback} detail={selectedProject} />}
        {view === "network" && (
          <NetworkView universityId={sp.university} basePath={basePath} current={sp} universities={universities} feedback={review.records} />
        )}
        {view === "globe" && (
          <GlobeView
            universities={universities}
            basePath={basePath}
            current={sp}
            previewCandidates={sp.university ? sorted : []}
            trayCandidates={sorted}
            campusArcs={listCampusArcs()}
          />
        )}
      </div>

      {view !== "table" && (selectedProject || showUniversityDrawer) && (
        <div className="w-full border-t border-border-c sm:w-96 sm:shrink-0 sm:border-l sm:border-t-0 xl:w-[420px]">
          {selectedProject ? (
            <CompanyDetail project={selectedProject} />
          ) : selectedUniversity ? (
            <UniversityDrawer university={selectedUniversity} tab={(sp.tab as "prospects") ?? "prospects"} basePath={basePath} current={sp} />
          ) : null}
        </div>
      )}
    </div>
  );
}
