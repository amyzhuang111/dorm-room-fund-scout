import { getProjectDetail, listCandidateProjects, listUniversities } from "@/lib/domain/queries";
import type { Queue } from "@/lib/domain/queue";
import { FilterSidebar } from "@/components/filter-sidebar";
import { CandidateTable } from "@/components/candidate-table";
import { CompanyDetail } from "@/components/company-detail";
import { UniversityDrawer } from "@/components/university-drawer";
import { GlobeView } from "@/components/globe-view";
import { ExploreToolbar } from "@/components/explore-toolbar";
import { ViewMemory } from "@/components/view-memory";

const VIEWS = ["globe", "table"] as const;

export default async function StartupDiscoverPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const basePath = "/startup/discover";
  const view = VIEWS.includes(sp.view as any) ? (sp.view as (typeof VIEWS)[number]) : "globe";

  const universities = listUniversities();
  const selectedUniversity = sp.university ? universities.find((u) => u.id === sp.university) : undefined;
  const selectedProject = sp.project ? getProjectDetail(sp.project) : null;

  const candidates = listCandidateProjects({ universityId: sp.university, queue: sp.queue as Queue | undefined, sector: sp.sector, search: sp.q });

  return (
    <div className="flex min-h-[calc(100vh-3.5rem-2.25rem)] flex-col sm:flex-row">
      <FilterSidebar universities={universities} basePath={basePath} current={sp} mode="startup" />

      <div className="flex-1 border-r border-border-c">
        <ViewMemory basePath={basePath} current={sp} storageKey="campus-universe:startup-discover-view" />
        <ExploreToolbar
          basePath={basePath}
          current={sp}
          resultCount={candidates.length}
          resultLabel={candidates.length === 1 ? "startup candidate" : "startup candidates"}
          searchPlaceholder="Search companies, founders…"
        />

        {view === "table" && <CandidateTable candidates={candidates} basePath={basePath} current={sp} />}
        {view === "globe" && (
          <GlobeView
            universities={universities}
            basePath={basePath}
            current={sp}
            previewCandidates={sp.university ? candidates : []}
            trayCandidates={candidates}
          />
        )}
      </div>

      <div className="w-full sm:w-96 sm:shrink-0">
        {selectedProject ? (
          <CompanyDetail project={selectedProject} />
        ) : selectedUniversity ? (
          <UniversityDrawer university={selectedUniversity} tab={(sp.tab as any) ?? "prospects"} basePath={basePath} current={sp} />
        ) : (
          <div className="p-4 text-sm text-muted">Select a university from the left, or a company from the table, to see details here.</div>
        )}
      </div>
    </div>
  );
}
