"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { loadCandidates, loadGlobeMap } from "@/lib/client/map-prefetch";
import type { CampusArc, CandidateSummary, UniversitySummary } from "@/lib/domain/queries";
import { useAskHighlight } from "./ask-highlight";
import { PageHeader } from "./page-header";
import { ScoutNav, useScoutNav } from "./scout-nav";
import { useUserPipeline } from "./user-pipeline-provider";
import { mergeCatalog, userMapMarkers } from "@/lib/domain/user-pipeline";

const globeChunk = () => import("./globe-view");
const networkChunk = () => import("./network-map-app");
if (typeof window !== "undefined") {
  const network = new URLSearchParams(window.location.search).get("view") === "network";
  void (network ? networkChunk() : globeChunk());
}

const GlobeView = dynamic(() => globeChunk().then((mod) => mod.GlobeView), {
  ssr: false,
  loading: () => <GlobeShell />,
});

const NetworkMapApp = dynamic(() => networkChunk().then((mod) => mod.NetworkMapApp), {
  ssr: false,
  loading: () => (
    <div className="grid min-h-[70vh] w-full place-items-center bg-surface text-sm text-muted">
      Loading network…
    </div>
  ),
});

export function HomeMap({ initial, network }: { initial: Record<string, string | undefined>; network: boolean }) {
  return (
    <ScoutNav basePath="/" initial={initial}>
      <div className="mx-auto max-w-[1100px] px-6 pb-16 pt-10">
        <HomeChrome network={network} />
        {network ? (
          <div className="mt-8">
            <div className="overflow-hidden rounded-2xl border border-border-c">
              <NetworkMapApp />
            </div>
            <p className="viz-legend">Color marks university, community, person, and company. A square outline is user-added.</p>
          </div>
        ) : (
          <div className="mt-8">
            <HomeMapBody />
          </div>
        )}
      </div>
    </ScoutNav>
  );
}

function HomeViewToggle({ network }: { network: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function setHomeView(view: "globe" | "network") {
    const params = new URLSearchParams(searchParams.toString());
    if (view === "network") params.set("view", "network");
    else params.delete("view");
    const qs = params.toString();
    router.replace(qs ? `/?${qs}` : "/", { scroll: false });
  }

  return (
    <div className="segmented" role="group" aria-label="Homepage view">
      <button type="button" className={network ? "" : "is-active"} aria-pressed={!network} onClick={() => setHomeView("globe")}>
        Map
      </button>
      <button type="button" className={network ? "is-active" : ""} aria-pressed={network} onClick={() => setHomeView("network")}>
        Network
      </button>
    </div>
  );
}

function HomeChrome({ network }: { network: boolean }) {
  const nav = useScoutNav()!;
  const [universities, setUniversities] = useState<UniversitySummary[]>([]);
  const [knownResultCount, setKnownResultCount] = useState<number | null>(null);

  useEffect(() => {
    let cancel = false;
    loadGlobeMap()
      .then((data) => {
        if (cancel) return;
        setUniversities(data.universities ?? []);
        setKnownResultCount(data.candidateCount ?? 0);
      })
      .catch(() => {});
    return () => {
      cancel = true;
    };
  }, []);

  const selected = universities.find((university) => university.id === nav.current.university);
  const monitored = universities.filter((university) => university.sourcesConfigured > 0).length;
  const stats = selected
    ? [
        { n: selected.companyCount, label: "companies" },
        { n: selected.founderCount, label: "founders" },
        { n: selected.sourcesConfigured, label: "sources" },
      ]
    : [
        { n: knownResultCount, label: "in view" },
        { n: universities.length || null, label: "campuses" },
        { n: universities.length ? monitored : null, label: "monitored" },
      ];

  return (
    <PageHeader
      eyebrow={selected ? `Campus map · ${selected.name}` : "Campus map"}
      title="Find pre-seed student prospects, by university."
      subtitle="A Founder Scout and Startup Scout workspace for pre-seed student prospects."
      stats={stats}
      aside={<HomeViewToggle network={network} />}
    />
  );
}

function HomeMapBody() {
  const nav = useScoutNav()!;
  const [universities, setUniversities] = useState<UniversitySummary[]>([]);
  const [arcs, setArcs] = useState<CampusArc[]>([]);
  const [candidates, setCandidates] = useState<CandidateSummary[]>([]);
  const [candidatesReady, setCandidatesReady] = useState(false);
  const [knownResultCount, setKnownResultCount] = useState<number | null>(null);

  useEffect(() => {
    let cancel = false;
    // Campus dots do not wait on the company list. That list is several
    // megabytes and only fills the tray and the campus preview.
    loadGlobeMap()
      .then((data) => {
        if (cancel) return;
        setUniversities(data.universities ?? []);
        setArcs(data.arcs ?? []);
        setKnownResultCount(data.candidateCount ?? 0);
      })
      .catch(() => {});
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

  const { state } = useUserPipeline();
  const catalog = useMemo(() => mergeCatalog({ universities, candidates, founders: [] }, state), [universities, candidates, state]);
  const markers = useMemo(() => userMapMarkers(state, catalog.universities), [state, catalog.universities]);
  const ask = useAskHighlight();
  const university = ask?.focusCampus ?? nav.current.university;
  const preview = university ? catalog.candidates.filter((candidate) => candidate.universityIds.includes(university)) : [];
  const tray = useMemo(() => {
    if (!ask) return catalog.candidates;
    if (ask.startupIds.length === 0 && ask.personIds.length === 0) return catalog.candidates;
    return catalog.candidates.filter((candidate) => ask.startupIds.includes(candidate.id) || candidate.founderIds.some((id) => ask.personIds.includes(id)));
  }, [ask, catalog.candidates]);

  useEffect(() => {
    if (!ask?.focusCampus || nav.current.university === ask.focusCampus) return;
    nav.navigate({ university: ask.focusCampus });
  }, [ask?.token, ask?.focusCampus, nav]);

  return (
    <GlobeView
      universities={catalog.universities}
      campusArcs={arcs}
      trayCandidates={tray}
      previewCandidates={preview}
      basePath="/"
      current={nav.current}
      onNavigate={nav.navigate}
      emphasizeIds={ask?.campuses ?? []}
      userMarkers={markers}
      active
      resultsPending={!candidatesReady}
      knownResultCount={knownResultCount}
      hideStats
      flush
    />
  );
}

function GlobeShell() {
  return (
    <div
      className="relative grid h-[min(62dvh,680px)] min-h-[420px] w-full place-items-center overflow-hidden rounded-2xl border border-border-c bg-surface sm:min-h-[520px]"
    >
      <p className="ui-label">Loading globe</p>
    </div>
  );
}
