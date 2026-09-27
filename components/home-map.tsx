"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import type { CampusArc, CandidateSummary, UniversitySummary } from "@/lib/domain/queries";
import { useAskHighlight } from "./ask-highlight";
import { ScoutNav, useScoutNav } from "./scout-nav";

const GlobeView = dynamic(() => import("./globe-view").then((mod) => mod.GlobeView), {
  ssr: false,
  loading: () => <GlobeShell />,
});

const NetworkMapApp = dynamic(() => import("./network-map-app").then((mod) => mod.NetworkMapApp), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-x-0 top-14 bottom-0 z-20 grid place-items-center bg-white text-sm text-black">Loading network…</div>
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

  useEffect(() => {
    let cancel = false;
    fetch("/api/globe")
      .then((res) => {
        if (!res.ok) throw new Error("globe failed");
        return res.json() as Promise<{ universities: UniversitySummary[]; arcs: CampusArc[]; candidates: CandidateSummary[] }>;
      })
      .then((data) => {
        if (cancel) return;
        setUniversities(data.universities ?? []);
        setArcs(data.arcs ?? []);
        setCandidates(data.candidates ?? []);
      })
      .catch(() => {});
    return () => {
      cancel = true;
    };
  }, []);

  const ask = useAskHighlight();
  const university = ask?.focusCampus ?? nav.current.university;
  const preview = university ? candidates.filter((candidate) => candidate.universityIds.includes(university)) : [];
  const tray = useMemo(() => {
    if (!ask) return candidates;
    if (ask.startupIds.length === 0 && ask.personIds.length === 0) return candidates;
    return candidates.filter((candidate) => ask.startupIds.includes(candidate.id) || candidate.founderIds.some((id) => ask.personIds.includes(id)));
  }, [ask, candidates]);

  useEffect(() => {
    if (!ask?.focusCampus || nav.current.university === ask.focusCampus) return;
    nav.navigate({ university: ask.focusCampus });
  }, [ask?.token, ask?.focusCampus, nav]);

  return (
    <GlobeView
      universities={universities}
      campusArcs={arcs}
      trayCandidates={tray}
      previewCandidates={preview}
      basePath="/"
      current={nav.current}
      onNavigate={nav.navigate}
      emphasizeIds={ask?.campuses ?? []}
      active
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
