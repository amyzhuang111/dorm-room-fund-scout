"use client";

import dynamic from "next/dynamic";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import type { EnrollmentStatus } from "@/lib/domain/founder-status";
import { sectorsForUniversity } from "@/lib/domain/candidate-filter";
import { companiesInView } from "@/lib/domain/live-view";
import { domainKey, isHidden, type FeedbackRecord, type FeedbackTarget } from "@/lib/domain/feedback";
import { likeTargetsFrom } from "@/lib/domain/review-view";
import type { CampusArc, CandidateSummary, ProjectDetail, SectorCount, UniversitySummary } from "@/lib/domain/queries";
import type { NetworkGraph } from "@/lib/domain/network";
import { FilterSidebar } from "./filter-sidebar";
import { CandidateTable } from "./candidate-table";
import { CompanyDetail } from "./company-detail";
import { ExploreToolbar } from "./explore-toolbar";
import { ScoutNav, useScoutNav } from "./scout-nav";
import { UniversityPanel } from "./university-panel";
import { projectShell, useProjectDetail } from "./use-project-detail";
import { useFeedbackRecords } from "./feedback-provider";

const GlobeView = dynamic(() => import("./globe-view").then((mod) => mod.GlobeView), {
  ssr: false,
  loading: () => <div className="grid min-h-[70vh] place-items-center text-sm text-muted">Loading map…</div>,
});

const NetworkCanvas = dynamic(() => import("./network-canvas").then((mod) => mod.NetworkCanvas), {
  ssr: false,
  loading: () => <div className="grid min-h-[70vh] place-items-center text-sm text-muted">Loading network…</div>,
});

const VIEWS = ["globe", "network", "table"] as const;

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
  initialGraph,
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
  initialGraph: NetworkGraph | null;
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
        initialGraph={initialGraph}
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
  initialGraph,
}: {
  universities: UniversitySummary[];
  candidates: CandidateSummary[];
  arcs: CampusArc[];
  sectors: SectorCount[];
  enrollment: { all: Record<EnrollmentStatus, number>; byUniversity: Record<string, Record<EnrollmentStatus, number>> };
  initialRecords: FeedbackRecord[];
  initialLikes: FeedbackTarget[];
  initialDetail: ProjectDetail | null;
  initialGraph: NetworkGraph | null;
}) {
  const nav = useScoutNav()!;
  const { current, navigate } = nav;
  // The toggle itself reads `current` so it paints immediately. Filtering 569
  // companies (and repainting the tray) follows on the next frame.
  const query = useDeferredValue(current);
  const records = useFeedbackRecords(initialRecords);
  const likes = useMemo(() => likeTargetsFrom(records, candidates, [], initialLikes), [records, candidates, initialLikes]);
  const sorted = useMemo(() => companiesInView(candidates, records, likes, query), [candidates, records, likes, query]);
  const visibleSectors = useMemo(() => sectorsForUniversity(sectors, current.university), [sectors, current.university]);
  const counts = (current.university && enrollment.byUniversity[current.university]) || enrollment.all;
  const view = VIEWS.find((item) => item === current.view) ?? "globe";
  const [seen, setSeen] = useState({ globe: view === "globe", network: view === "network", table: view === "table" });
  if (!seen[view]) setSeen((prev) => ({ ...prev, [view]: true }));
  const detail = useProjectDetail(current.project, initialDetail);
  const selectedUniversity = current.university ? universities.find((u) => u.id === current.university) : undefined;
  const showUniversityDrawer = !current.project && selectedUniversity && view !== "globe";

  useEffect(() => {
    try {
      if (current.view) {
        localStorage.setItem("campus-universe:startup-discover-view", current.view);
        return;
      }
      const remembered = localStorage.getItem("campus-universe:startup-discover-view");
      if (remembered && remembered !== "globe") navigate({ view: remembered });
    } catch {
      // Private window — keep the default globe.
    }
    // Remembered view is applied once on entry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div data-scout-live="" className="flex min-h-[calc(100vh-3.5rem-2.25rem)] flex-col sm:flex-row">
      <FilterSidebar universities={universities} basePath="/startup/discover" current={current} mode="startup" sectors={visibleSectors} />
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
        {seen.network && (
          <div className={view === "network" ? "" : "hidden"}>
            <NetworkSlot universities={universities} current={query} records={records} initialGraph={initialGraph} />
          </div>
        )}
        {seen.globe && (
          <div className={view === "globe" ? "" : "hidden"}>
            <GlobeView
              universities={universities}
              basePath="/startup/discover"
              current={query}
              previewCandidates={query.university ? sorted : []}
              trayCandidates={sorted}
              campusArcs={arcs}
              onNavigate={navigate}
              active={view === "globe"}
            />
          </div>
        )}
      </div>
      {view !== "table" && (current.project || showUniversityDrawer) && (
        <div className="w-full border-t border-border-c sm:w-96 sm:shrink-0 sm:border-l sm:border-t-0 xl:w-[420px]">
          {current.project && (sorted.find((c) => c.id === current.project) ?? candidates.find((c) => c.id === current.project)) ? (
            <CompanyDetail project={projectShell((sorted.find((c) => c.id === current.project) ?? candidates.find((c) => c.id === current.project))!, detail)} />
          ) : selectedUniversity ? (
            <UniversityPanel university={selectedUniversity} candidates={sorted} basePath="/startup/discover" current={current} />
          ) : null}
        </div>
      )}
    </div>
  );
}

function NetworkSlot({
  universities,
  current,
  records,
  initialGraph,
}: {
  universities: UniversitySummary[];
  current: Record<string, string | undefined>;
  records: FeedbackRecord[];
  initialGraph: NetworkGraph | null;
}) {
  const key = `${current.university ?? ""}|${current.sector ?? ""}|${current.enroll ?? ""}`;
  const [graph, setGraph] = useState<NetworkGraph | null>(initialGraph);
  const [loadedKey, setLoadedKey] = useState(initialGraph ? key : "");

  useEffect(() => {
    if (loadedKey === key && graph) return;
    const params = new URLSearchParams();
    if (current.university) params.set("university", current.university);
    if (current.sector) params.set("sector", current.sector);
    if (current.enroll) params.set("enroll", current.enroll);
    let cancel = false;
    fetch(`/api/network?${params.toString()}`)
      .then((res) => res.json())
      .then((data: NetworkGraph) => {
        if (cancel) return;
        setGraph(data);
        setLoadedKey(key);
      })
      .catch(() => {});
    return () => {
      cancel = true;
    };
  }, [key, loadedKey, graph, current.university, current.sector, current.enroll]);

  const visible = useMemo(() => {
    if (!graph) return null;
    const hiddenMode = current.feedback === "hidden";
    const nodes = graph.nodes.filter((node) => {
      if (node.type === "university") return true;
      const entityType = node.type === "person" ? "person" : "project";
      const hidden = isHidden(records, { entityType, entityId: node.id, name: node.label, domain: domainKey(node.linkUrl) });
      return hiddenMode ? hidden : !hidden;
    });
    const keep = new Set(nodes.map((node) => node.id));
    return { ...graph, nodes, edges: graph.edges.filter((edge) => keep.has(edge.source) && keep.has(edge.target)) };
  }, [graph, records, current.feedback]);

  if (!visible || visible.nodes.length === 0) {
    return <p className="p-6 text-sm text-muted">{graph ? "No evidence-backed connections on record for this campus yet." : "Loading network…"}</p>;
  }
  const campusName = current.university ? (universities.find((u) => u.id === current.university)?.name ?? "campus") : "Penn and Berkeley";
  return <NetworkCanvas graph={visible} basePath="/startup/discover" current={current} campusName={campusName} />;
}
