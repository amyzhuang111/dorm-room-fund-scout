"use client";

import dynamic from "next/dynamic";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import type { EnrollmentStatus } from "@/lib/domain/founder-status";
import { sectorsForUniversity } from "@/lib/domain/candidate-filter";
import { companiesInView } from "@/lib/domain/live-view";
import type { FeedbackRecord, FeedbackTarget } from "@/lib/domain/feedback";
import { likeTargetsFrom } from "@/lib/domain/review-view";
import type { CampusArc, CandidateSummary, ProjectDetail, SectorCount, UniversitySummary } from "@/lib/domain/queries";
import { FilterSidebar } from "./filter-sidebar";
import { CandidateTable } from "./candidate-table";
import { CompanyDetail } from "./company-detail";
import { ExploreToolbar } from "./explore-toolbar";
import { ScoutNav, useScoutNav } from "./scout-nav";
import { projectShell, useProjectDetail } from "./use-project-detail";
import { useFeedbackRecords } from "./feedback-provider";
import { useMergedCatalog, useUserPipeline } from "./user-pipeline-provider";
import { userCompanyMatches, userMapMarkers } from "@/lib/domain/user-pipeline";

const GlobeView = dynamic(() => import("./globe-view").then((mod) => mod.GlobeView), {
  ssr: false,
  loading: () => <div className="grid min-h-[70vh] place-items-center text-sm text-muted">Loading map…</div>,
});

const VIEWS = ["globe", "table"] as const;

export function StartupDiscoverApp({
  initial,
  universities,
  candidates,
  arcs,
  sectors,
  enrollment,
  records,
  likes,
  initialDetail,
}: {
  initial: Record<string, string | undefined>;
  universities: UniversitySummary[];
  candidates: CandidateSummary[];
  arcs: CampusArc[];
  sectors: SectorCount[];
  enrollment: { all: Record<EnrollmentStatus, number>; byUniversity: Record<string, Record<EnrollmentStatus, number>> };
  records: FeedbackRecord[];
  likes: FeedbackTarget[];
  initialDetail: ProjectDetail | null;
}) {
  return (
    <ScoutNav basePath="/startup/discover" initial={initial}>
      <DiscoverBody
        universities={universities}
        candidates={candidates}
        arcs={arcs}
        sectors={sectors}
        enrollment={enrollment}
        initialRecords={records}
        initialLikes={likes}
        initialDetail={initialDetail}
      />
    </ScoutNav>
  );
}

function DiscoverBody({
  universities,
  candidates,
  arcs,
  sectors,
  enrollment,
  initialRecords,
  initialLikes,
  initialDetail,
}: {
  universities: UniversitySummary[];
  candidates: CandidateSummary[];
  arcs: CampusArc[];
  sectors: SectorCount[];
  enrollment: { all: Record<EnrollmentStatus, number>; byUniversity: Record<string, Record<EnrollmentStatus, number>> };
  initialRecords: FeedbackRecord[];
  initialLikes: FeedbackTarget[];
  initialDetail: ProjectDetail | null;
}) {
  const nav = useScoutNav()!;
  const { current, navigate } = nav;
  const catalog = useMergedCatalog(universities, candidates, []);
  // The toggle itself reads `current` so it paints immediately. Filtering 569
  // companies (and repainting the tray) follows on the next frame.
  const query = useDeferredValue(current);
  const records = useFeedbackRecords(initialRecords);
  const likes = useMemo(() => likeTargetsFrom(records, catalog.candidates, [], initialLikes), [records, catalog.candidates, initialLikes]);
  const sorted = useMemo(() => {
    const viewed = companiesInView(catalog.candidates, records, likes, query);
    const seen = new Set(viewed.map((company) => company.id));
    const extras = catalog.candidates
      .filter((company) => !seen.has(company.id) && userCompanyMatches(company, query))
      .map((company) => ({ ...company, boostNote: null, boostScore: 0 }));
    return [...viewed, ...extras];
  }, [catalog.candidates, records, likes, query]);
  const visibleSectors = useMemo(() => sectorsForUniversity(sectors, current.university), [sectors, current.university]);
  const counts = (current.university && enrollment.byUniversity[current.university]) || enrollment.all;
  const view = VIEWS.find((item) => item === current.view) ?? "globe";
  const [seen, setSeen] = useState({ globe: view === "globe", table: view === "table" });
  if (!seen[view]) setSeen((prev) => ({ ...prev, [view]: true }));
  const detail = useProjectDetail(current.project, initialDetail);
  const { state: pipelineState } = useUserPipeline();
  const markers = useMemo(() => userMapMarkers(pipelineState, catalog.universities), [pipelineState, catalog.universities]);
  const selectedProject = current.project
    ? (sorted.find((company) => company.id === current.project) ?? candidates.find((company) => company.id === current.project))
    : undefined;

  useEffect(() => {
    try {
      if (current.view === "network") {
        localStorage.removeItem("campus-universe:startup-discover-view");
        navigate({ view: null });
        return;
      }
      if (current.view) {
        localStorage.setItem("campus-universe:startup-discover-view", current.view);
        return;
      }
      const remembered = localStorage.getItem("campus-universe:startup-discover-view");
      if (remembered === "network") {
        localStorage.removeItem("campus-universe:startup-discover-view");
        return;
      }
      if (remembered && remembered !== "globe") navigate({ view: remembered });
    } catch {
      // Private window — keep the default globe.
    }
    // Remembered view is applied once on entry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div data-scout-live="" className="flex min-h-[calc(100vh-3.5rem-2.25rem)] flex-col sm:flex-row">
      <FilterSidebar universities={catalog.universities} basePath="/startup/discover" current={current} mode="startup" sectors={visibleSectors} />
      <div className="min-w-0 flex-1">
        <ExploreToolbar
          basePath="/startup/discover"
          current={current}
          resultCount={sorted.length}
          resultLabel={sorted.length === 1 ? "startup candidate" : "startup candidates"}
          searchPlaceholder="Search founders, companies, projects…"
          counts={counts}
        />
        {seen.table && (
          <div className={view === "table" ? "" : "hidden"}>
            <CandidateTable candidates={sorted} basePath="/startup/discover" current={query} feedbackView={query.feedback} detail={detail && query.project === detail.id ? detail : null} />
          </div>
        )}
        {seen.globe && (
          <div className={view === "globe" ? "" : "hidden"}>
            <GlobeView
              universities={catalog.universities}
              basePath="/startup/discover"
              current={query}
              previewCandidates={query.university ? sorted : []}
              trayCandidates={sorted}
              campusArcs={arcs}
              onNavigate={navigate}
              active={view === "globe"}
              userMarkers={markers}
            />
          </div>
        )}
      </div>
      {view === "globe" && selectedProject && (
        <div className="w-full border-t border-border-c sm:w-96 sm:shrink-0 sm:border-l sm:border-t-0 xl:w-[420px]">
          <CompanyDetail project={projectShell(selectedProject, detail)} />
        </div>
      )}
    </div>
  );
}
