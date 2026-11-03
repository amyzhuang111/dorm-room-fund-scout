"use client";

import dynamic from "next/dynamic";
import type { UniversitySummary } from "@/lib/domain/queries";
import { MapCredit } from "./map-credit";

const GlobeView = dynamic(() => import("./globe-view").then((mod) => mod.GlobeView), { ssr: false });

export function CampusMiniGlobe({ university }: { university: UniversitySummary }) {
  return (
    <div>
      <div className="h-[220px] w-full overflow-hidden rounded-lg border border-line">
        <GlobeView
          universities={[university]}
          basePath="/campuses"
          current={{ university: university.id }}
          locked
          hideStats
          flush
        />
      </div>
      <p className="mt-2 text-[14px] text-fg-2">
        <MapCredit />
      </p>
    </div>
  );
}
