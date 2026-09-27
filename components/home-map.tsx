"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import type { CampusArc, CandidateSummary, UniversitySummary } from "@/lib/domain/queries";
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

  const university = nav.current.university;
  const preview = university ? candidates.filter((candidate) => candidate.universityIds.includes(university)) : [];

  return (
    <GlobeView
      universities={universities}
      campusArcs={arcs}
      trayCandidates={candidates}
      previewCandidates={preview}
      basePath="/"
      current={nav.current}
      onNavigate={nav.navigate}
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
