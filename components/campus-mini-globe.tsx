"use client";

import dynamic from "next/dynamic";
import type { UniversitySummary } from "@/lib/domain/queries";

const GlobeView = dynamic(() => import("./globe-view").then((mod) => mod.GlobeView), { ssr: false });

export function CampusMiniGlobe({ university }: { university: UniversitySummary }) {
  return (
    <div className="h-[280px] w-[280px] overflow-hidden rounded-xl border border-line">
      <GlobeView
        universities={[university]}
        basePath="/campuses"
        current={{ university: university.id }}
        locked
        hideStats
        flush
      />
    </div>
  );
}
