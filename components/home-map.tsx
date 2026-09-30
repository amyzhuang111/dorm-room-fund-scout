"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { loadCandidates, loadGlobeMap } from "@/lib/client/map-prefetch";
import type { CampusArc, CandidateSummary, UniversitySummary } from "@/lib/domain/queries";
import { useAskHighlight } from "./ask-highlight";
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
    <div className="grid min-h-[80vh] w-full place-items-center bg-white text-sm text-black" style={{ height: "max(80vh, calc(100dvh - 3.5rem))" }}>
      Loading network…
    </div>
  ),
});

export function HomeMap({ initial, network }: { initial: Record<string, string | undefined>; network: boolean }) {
  return (
    <ScoutNav basePath="/" initial={initial}>
      {network ? <NetworkMapApp /> : <HomeMapBody />}
    </ScoutNav>
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
    />
  );
}

function GlobeShell() {
  return (
    <div className="p-2">
      <div
        className="relative grid h-[min(68dvh,820px)] min-h-[420px] w-full place-items-center overflow-hidden rounded-xl border border-border-c sm:min-h-[520px]"
        style={{ background: "#f7f6f8" }}
      >
        <p className="ui-label">Loading globe</p>
      </div>
    </div>
  );
}
