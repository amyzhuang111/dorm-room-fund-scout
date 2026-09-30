import type { CampusArc, CandidateSummary, UniversitySummary } from "@/lib/domain/queries";
import type { MapGraph } from "@/lib/domain/network-map";
import { MAPLIBRE_URL } from "./map-boot-script";

export interface GlobeMapPayload {
  universities: UniversitySummary[];
  arcs: CampusArc[];
  candidateCount: number;
}

type MapLibreModule = { Map: new (options: object) => unknown };

type BootWindow = Window & {
  __maplibrePromise?: Promise<MapLibreModule>;
  __globeMapPromise?: Promise<GlobeMapPayload>;
  __networkMapPromise?: Promise<MapGraph>;
  __candidatesPromise?: Promise<CandidateSummary[]>;
};

function boot(): BootWindow {
  return window as BootWindow;
}

export function loadMapLibre(): Promise<MapLibreModule> {
  const w = boot();
  if (!w.__maplibrePromise) {
    // MapLibre's tile worker is created from a blob URL. Bundling it (Turbopack
    // in particular) replaces that worker with a chunk that never parses tiles.
    w.__maplibrePromise = import(/* webpackIgnore: true */ MAPLIBRE_URL);
  }
  return w.__maplibrePromise;
}

export function loadGlobeMap(): Promise<GlobeMapPayload> {
  const w = boot();
  if (!w.__globeMapPromise) {
    w.__globeMapPromise = fetch("/data/globe-map.json").then(async (res) => {
      if (res.ok) return res.json() as Promise<GlobeMapPayload>;
      const fallback = await fetch("/api/globe?part=map");
      if (!fallback.ok) throw new Error("globe map failed");
      return fallback.json() as Promise<GlobeMapPayload>;
    });
  }
  return w.__globeMapPromise;
}

export function loadNetworkMap(): Promise<MapGraph> {
  const w = boot();
  if (!w.__networkMapPromise) {
    w.__networkMapPromise = fetch("/data/network-map.json").then(async (res) => {
      if (res.ok) return res.json() as Promise<MapGraph>;
      const fallback = await fetch("/api/network/map");
      if (!fallback.ok) throw new Error("network map failed");
      return fallback.json() as Promise<MapGraph>;
    });
  }
  return w.__networkMapPromise;
}

export function loadCandidates(): Promise<CandidateSummary[]> {
  const w = boot();
  if (!w.__candidatesPromise) {
    w.__candidatesPromise = fetch("/data/candidates.json").then(async (res) => {
      if (res.ok) return res.json() as Promise<CandidateSummary[]>;
      const fallback = await fetch("/api/candidates");
      if (!fallback.ok) throw new Error("candidates failed");
      return fallback.json() as Promise<CandidateSummary[]>;
    });
  }
  return w.__candidatesPromise;
}
