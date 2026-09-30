"use client";

import dynamic from "next/dynamic";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { loadCandidates } from "@/lib/client/map-prefetch";
import type { EnrollmentStatus } from "@/lib/domain/founder-status";
import { sectorsForUniversity } from "@/lib/domain/candidate-filter";
import { companiesInView } from "@/lib/domain/live-view";
import { domainKey, isHidden, type FeedbackRecord, type FeedbackTarget } from "@/lib/domain/feedback";
import { likeTargetsFrom } from "@/lib/domain/review-view";
import type { NetworkGraph } from "@/lib/domain/network";
import type { CampusArc, CandidateSummary, ProjectDetail, SectorCount, UniversitySummary } from "@/lib/domain/queries";
import { FilterSidebar } from "./filter-sidebar";
import { CandidateTable } from "./candidate-table";
import { CompanyDetail } from "./company-detail";
import { ExploreToolbar } from "./explore-toolbar";
import { ScoutNav, useScoutNav } from "./scout-nav";
import { CampusBenchmarks } from "./campus-benchmarks";
import { projectShell, useProjectDetail } from "./use-project-detail";
import { useFeedbackRecords } from "./feedback-provider";
import { useMergedCatalog, useUserPipeline } from "./user-pipeline-provider";
import { attachUserScoutNetwork, userCompanyMatches, userMapMarkers } from "@/lib/domain/user-pipeline";

const globeChunk = () => import("./globe-view");
const networkChunk = () => import("./network-canvas");
if (typeof window !== "undefined") {
  const view = new URLSearchParams(window.location.search).get("view");
  void (view === "network" ? networkChunk() : globeChunk());
}

const GlobeView = dynamic(() => globeChunk().then((mod) => mod.GlobeView), {
  ssr: false,
  loading: () => <div className="grid min-h-[70vh] place-items-center text-sm text-muted">Loading map…</div>,
});

const NetworkCanvas = dynamic(() => networkChunk().then((mod) => mod.NetworkCanvas), {
  ssr: false,
  loading: () => <div className="grid min-h-[70vh] place-items-center text-sm text-muted">Loading network…</div>,
});

const VIEWS = ["globe", "network", "table"] as const;

export function StartupDiscoverApp({
  initial,
  universities,
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
  arcs,
  sectors,
  enrollment,
  initialRecords,
  initialLikes,
  initialDetail,
  initialGraph,
}: {
  universities: UniversitySummary[];
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
  const [candidates, setCandidates] = useState<CandidateSummary[]>([]);
  const [candidatesReady, setCandidatesReady] = useState(false);
  useEffect(() => {
    let cancel = false;
    loadCandidates()
      .then((rows) => {
        if (cancel) return;
        setCandidates(rows);
        setCandidatesReady(true);
      })
      .catch(() => {
        if (!cancel) setCandidatesReady(true);
      });
    return () => {
      cancel = true;
    };
  }, []);
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
      .filter((company) => !seen.has(company.id) && userCompanyMatches(company, query) && (query.confirmed !== "1" || company.verificationStatus === "confirmed"))
      .map((company) => ({ ...company, boostNote: null, boostScore: 0 }));
    return [...viewed, ...extras];
  }, [catalog.candidates, records, likes, query]);
  const visibleSectors = useMemo(() => sectorsForUniversity(sectors, current.university), [sectors, current.university]);
  const counts = (current.university && enrollment.byUniversity[current.university]) || enrollment.all;
  const requested = VIEWS.find((item) => item === current.view) ?? "globe";
  const view = requested === "network" && !current.university ? "globe" : requested;
  const [seen, setSeen] = useState({ globe: view === "globe", network: view === "network", table: view === "table" });
  if (!seen[view]) setSeen((prev) => ({ ...prev, [view]: true }));
  const detail = useProjectDetail(current.project, initialDetail);
  const { state: pipelineState } = useUserPipeline();
  const markers = useMemo(() => userMapMarkers(pipelineState, catalog.universities), [pipelineState, catalog.universities]);
  const selectedProject = current.project
    ? (sorted.find((company) => company.id === current.project) ?? candidates.find((company) => company.id === current.project))
    : undefined;
  const selectedUniversity = current.university ? catalog.universities.find((university) => university.id === current.university) : undefined;

  useEffect(() => {
    if (!current.university && current.view === "network") navigate({ view: null });
  }, [current.university, current.view, navigate]);

  useEffect(() => {
    try {
      if (current.view === "network" && !current.university) return;
      if (current.view) {
        localStorage.setItem("campus-universe:startup-discover-view", current.view);
        return;
      }
      const remembered = localStorage.getItem("campus-universe:startup-discover-view");
      if (!remembered || remembered === "globe") return;
      if (remembered === "network" && !current.university) return;
      navigate({ view: remembered });
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
        {selectedUniversity && (
          <div className={view === "globe" ? "border-b border-border-c px-3 sm:hidden" : "border-b border-border-c px-3"}>
            <CampusBenchmarks pitchbook={selectedUniversity.pitchbook} hitRate={selectedUniversity.hitRate} />
          </div>
        )}
        {seen.table && (
          <div className={view === "table" ? "" : "hidden"}>
            <CandidateTable candidates={sorted} basePath="/startup/discover" current={query} feedbackView={query.feedback} detail={detail && query.project === detail.id ? detail : null} />
          </div>
        )}
        {seen.network && current.university && (
          <div className={view === "network" ? "" : "hidden"}>
            <NetworkSlot universities={catalog.universities} current={query} records={records} initialGraph={initialGraph} />
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
              resultsPending={!candidatesReady}
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

  const { state } = useUserPipeline();
  const visible = useMemo(() => {
    if (!graph) return null;
    const withUsers = attachUserScoutNetwork(graph, state, current.university);
    const hiddenMode = current.feedback === "hidden";
    const nodes = withUsers.nodes.filter((node) => {
      if (node.type === "university") return true;
      if (current.confirmed === "1" && node.confirmed !== true) return false;
      const entityType = node.type === "person" ? "person" : "project";
      const hidden = isHidden(records, { entityType, entityId: node.id, name: node.label, domain: domainKey(node.linkUrl) });
      return hiddenMode ? hidden : !hidden;
    });
    const keep = new Set(nodes.map((node) => node.id));
    return { ...withUsers, nodes, edges: withUsers.edges.filter((edge) => keep.has(edge.source) && keep.has(edge.target)) };
  }, [graph, records, current.feedback, current.confirmed, state, current.university]);

  if (!current.university) return null;
  if (!visible || visible.nodes.length === 0) {
    return <p className="p-6 text-sm text-muted">{graph ? "No evidence-backed connections on record for this campus yet." : "Loading network…"}</p>;
  }
  const campusName = universities.find((university) => university.id === current.university)?.name ?? "campus";
  return <NetworkCanvas graph={visible} basePath="/startup/discover" current={current} campusName={campusName} presentation="campus" />;
}
