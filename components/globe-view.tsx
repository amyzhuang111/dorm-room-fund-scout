"use client";

import { memo, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { loadMapLibre } from "@/lib/client/map-prefetch";
import { buildHref } from "@/lib/domain/url";
import type { CampusArc, CandidateSummary, UniversitySummary } from "@/lib/domain/queries";
import { ResultTray } from "./result-tray";
import { PersonLinkButton } from "./person-link";
import { CompanyNameLink } from "./company-website";
import { CampusBenchmarks } from "./campus-benchmarks";
import { alphabeticalByLabel, shortCampusLabel } from "@/lib/domain/campuses";
import { SIGNALS_THIS_WEEK_LABEL } from "@/lib/domain/signal-copy";
import type { UserMapMarker } from "@/lib/domain/user-pipeline";
import "maplibre-gl/dist/maplibre-gl.css";

// Real MapLibre GL JS globe projection + the free OpenFreeMap "positron"
// vector style — the exact stack dashboard.vclense.ch/ycglobe uses (studied
// directly from its page source), recolored here to this app's palette
// instead of their orange/cream theme. No API key needed (OpenFreeMap is a
// free, no-auth tile service).
const STYLE_URL = "https://tiles.openfreemap.org/styles/positron";

// Home map style. OpenFreeMap vector tiles, our own muted layers, not the
// stock positron paint.
const HERO_STYLE = {
  version: 8,
  name: "Campus Scout muted",
  glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
  sources: {
    openmaptiles: { type: "vector", url: "https://tiles.openfreemap.org/planet" },
  },
  layers: [
    { id: "background", type: "background", paint: { "background-color": "#2a3548" } },
    { id: "water", type: "fill", source: "openmaptiles", "source-layer": "water", paint: { "fill-color": "#0c1320" } },
    { id: "terrain", type: "fill", source: "openmaptiles", "source-layer": "landcover", paint: { "fill-color": "#33445c", "fill-opacity": 0.35 } },
    {
      id: "boundary",
      type: "line",
      source: "openmaptiles",
      "source-layer": "boundary",
      filter: ["any", ["==", ["get", "admin_level"], 2], ["==", ["get", "admin_level"], "2"]],
      paint: { "line-color": "#8ea3c4", "line-width": 1.1 },
    },
  ],
};

const COOL_DOT = ["interpolate", ["linear"], ["coalesce", ["get", "founders"], 0], 1, "#7f9dcf", 80, "#a9c2ee", 250, "#d5e4ff", 700, "#f4f7ff"] as const;

// Positron's OWN default colors are near-white by design (land
// rgb(242,243,240), water rgb(194,200,202) — verified against the live
// style JSON) — a minimalist basemap meant to sit under data, not to be
// looked at on its own at world zoom. It needs real contrast injected, not
// another pale tint layered on top, or it reads as a blank white circle
// (exactly what happened here the first time).
const DAY_THEME = {
  land: "#e7ebfc",
  landAlt: "#d5dcf8",
  ocean: "#fbfbfc",
  boundary: "#d3d7e0",
  labelText: "#0e1220",
  labelHalo: "#fbfbfc",
  sky: "#fbfbfc",
  horizon: "#2b47c9",
  fog: "#fbfbfc",
  dot: "#5b6ee0",
  arc: "#7c8cf0",
};

const NIGHT_THEME = {
  land: "#3b4a8a",
  landAlt: "#3b4a8a",
  ocean: "#1a2748",
  boundary: "#6d7cb8",
  labelText: "#eceef4",
  labelHalo: "#0b0e17",
  sky: "#0b0e17",
  horizon: "#9eb4ff",
  fog: "#0b0e17",
  dot: "#7c8cf0",
  arc: "#7c8cf0",
};

interface MapEvent {
  error?: unknown;
  point?: { x: number; y: number };
  features?: { properties?: { id?: string; name?: string; cluster_id?: number }; geometry?: { coordinates?: [number, number] } }[];
}

interface CampusMap {
  resize: () => void;
  remove?: () => void;
  getCanvas: () => { style: { cursor: string } };
  getStyle: () => { layers: { id: string; type: string }[] };
  getCenter: () => { lng: number; lat: number };
  setCenter: (center: { lng: number; lat: number }) => void;
  getSource: (id: string) => { getClusterExpansionZoom?: (clusterId: number) => Promise<number>; setData?: (data: object) => void } | undefined;
  getLayer: (id: string) => unknown;
  setProjection: (projection: { type: string }) => void;
  setSky: (sky: object) => void;
  setPaintProperty: (layer: string, prop: string, value: unknown) => void;
  addSource: (id: string, source: object) => void;
  addLayer: (layer: object) => void;
  setFilter: (layer: string, filter: unknown) => void;
  setLayoutProperty: (layer: string, prop: string, value: unknown) => void;
  flyTo: (options: object) => void;
  fitBounds: (bounds: [[number, number], [number, number]], options?: object) => void;
  project: (lngLat: [number, number]) => { x: number; y: number };
  zoomIn: () => void;
  zoomOut: () => void;
  on: {
    (type: string, handler: (event: MapEvent) => void): void;
    (type: string, layer: string, handler: (event: MapEvent) => void): void;
  };
  hasImage?: (id: string) => boolean;
  addImage?: (id: string, image: ImageData, options?: object) => void;
  getContainer?: () => { setAttribute: (name: string, value: string) => void };
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

function campusFeatureCollection(
  universities: { id: string; name: string; lat: number | null; lon: number | null; companyCount: number; founderCount: number }[],
  recentIds: string[],
) {
  const placed = universities.filter((university): university is typeof university & { lat: number; lon: number } => university.lat != null && university.lon != null);
  const labeled = new Set([...placed].sort((a, b) => b.founderCount - a.founderCount).slice(0, 10).map((university) => university.id));
  return {
    type: "FeatureCollection" as const,
    features: placed.map((university) => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [university.lon, university.lat] as [number, number] },
      properties: {
        id: university.id,
        name: shortCampusLabel(university.id, university.name),
        count: university.companyCount,
        founders: university.founderCount,
        recent: recentIds.includes(university.id) ? 1 : 0,
        label: labeled.has(university.id) ? 1 : 0,
      },
    })),
  };
}

export const GlobeView = memo(function GlobeView({
  universities,
  basePath,
  current,
  previewCandidates = [],
  trayCandidates = [],
  campusArcs = [],
  onNavigate,
  active = true,
  emphasizeIds = [],
  userMarkers = [],
  resultsPending = false,
  knownResultCount = null,
  hideStats = false,
  flush = false,
  hero = false,
  locked = false,
  geoMode: geoModeProp,
  recentIds = [],
}: {
  universities: UniversitySummary[];
  basePath: string;
  current: Record<string, string | undefined>;
  previewCandidates?: CandidateSummary[];
  // Design MD §5's bottom result tray — the current filtered result set,
  // shown regardless of whether a campus is selected (unlike
  // previewCandidates, which is per-campus and only passed once one is).
  trayCandidates?: CandidateSummary[];
  campusArcs?: CampusArc[];
  onNavigate?: (overrides: Record<string, string | null>) => void;
  active?: boolean;
  /** Campus ids Ask AI matched. Others stay on the map, drawn lighter. */
  emphasizeIds?: string[];
  /** User-added startups plotted beside a campus that already has coordinates. */
  userMarkers?: UserMapMarker[];
  /** Company rows are still downloading. The map itself does not wait on them. */
  resultsPending?: boolean;
  /** Unfiltered company count, so the stat can paint before the row list arrives. */
  knownResultCount?: number | null;
  /** Page headers own the stat strip. The map then skips its own numbers. */
  hideStats?: boolean;
  /** Drop the outer padding when the page column already frames the map. */
  flush?: boolean;
  /** Full-bleed night globe: unlabeled land, founder-sized dots, capped arcs. */
  hero?: boolean;
  /** Mini-globe: no spin, no chrome. */
  locked?: boolean;
  geoMode?: "campus" | "hq";
  recentIds?: string[];
}) {
  const MAP_THEME = hero || locked ? NIGHT_THEME : DAY_THEME;
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<CampusMap | null>(null);
  const [status, setStatus] = useState<"loading" | "ok" | "unsupported">("loading");
  const [geoModeState, setGeoModeState] = useState<"campus" | "hq">("campus");
  const geoMode = geoModeProp ?? geoModeState;
  const setGeoMode = setGeoModeState;
  const [hoverTip, setHoverTip] = useState<{ id: string; x: number; y: number } | null>(null);
  const [heroPins, setHeroPins] = useState<{ id: string; name: string; x: number; y: number; labelX: number; labelY: number; lineX: number; lineY: number }[]>([]);
  const [userTip, setUserTip] = useState<{ id: string; name: string; x: number; y: number } | null>(null);
  const selectedUniversity = current.university ? universities.find((u) => u.id === current.university) : undefined;
  const placed = trayCandidates.filter((c) => c.recordedPlace);
  const unplaced = trayCandidates.filter((c) => !c.recordedPlace);

  // The map (and its "click campus-dots" handler) is constructed once, in a
  // mount-only effect below — without this ref, that handler's closure would
  // freeze basePath/current at their first-render values, silently dropping
  // any filter/search the user had applied by the time they click a marker.
  // Updated in an effect (not during render) per the rules-of-hooks: a ref
  // write during render can be dropped by React and isn't guaranteed to be
  // visible to effects/handlers that read it later.
  const liveRef = useRef({ basePath, current, onNavigate });
  const spinPaused = useRef(false);
  const framedRef = useRef(false);
  useEffect(() => {
    liveRef.current = { basePath, current, onNavigate };
    const narrow = typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches;
    spinPaused.current = locked || (hero && narrow) || (!hero && (Boolean(current.university) || geoMode === "hq"));
  }, [basePath, current, geoMode, hero, locked, onNavigate]);

  const points = universities.filter((u) => u.lat != null && u.lon != null);

  useEffect(() => {
    if (!containerRef.current) return;
    let map: CampusMap;
    let cancelled = false;
    let resizeObserver: ResizeObserver | undefined;

    (async () => {
      let maplibregl: { Map: new (options: object) => CampusMap };
      try {
        // Loaded from the CDN at runtime rather than through our own bundle on
        // purpose: MapLibre creates its own tile-parsing Web Worker internally via
        // a blob: URL, and Turbopack (verified directly — it extracts the worker
        // into its own chunk instead of leaving MapLibre's own blob-URL creation
        // alone) breaks that, producing a "worker" that never actually processes
        // tile requests — the map showed only its flat background layer with zero
        // .pbf tile requests ever issued, confirmed by inspecting network traffic
        // and comparing against an isolated non-bundled reproduction where it
        // worked correctly. This is also literally what dashboard.vclense.ch/
        // ycglobe itself does (a plain CDN <script> tag, not an NPM bundle) — not
        // a workaround invented here, the same integration choice as the model.
        // The homepage starts this import from the document, before hydration.
        maplibregl = (await loadMapLibre()) as { Map: new (options: object) => CampusMap };
      } catch {
        if (!cancelled) setStatus("unsupported");
        return;
      }
      if (cancelled || !containerRef.current) return;

      try {
        const lockedPoint = locked ? points.find((university) => university.lat != null && university.lon != null) : undefined;
        map = new maplibregl.Map({
          container: containerRef.current,
          style: hero ? HERO_STYLE : STYLE_URL,
          center: lockedPoint ? [lockedPoint.lon as number, lockedPoint.lat as number] : [-98, 39],
          zoom: locked ? 5.6 : hero ? (window.matchMedia("(max-width: 767px)").matches ? 2.4 : 3.1) : 3.35,
          minZoom: hero ? 0.4 : locked ? 2 : 1.5,
          maxZoom: 8,
          attributionControl: hero || locked ? false : { compact: true },
        });
      } catch {
        // Headless or blocked-GPU browsers throw before any canvas exists.
        // Leave the campus list in place instead of an endless loading state.
        if (!cancelled) setStatus("unsupported");
        return;
      }
      mapRef.current = map;
      let styleLoaded = false;

      // The container's real flex/grid-computed size isn't necessarily final at the
      // exact moment the effect runs and the Map constructs — if MapLibre measures a
      // wrong/zero size at construction, it computes "zero tiles needed for this
      // viewport" and, critically, never recomputes on its own afterward. That is the
      // actual root cause of a map that shows only the flat background layer (colors
      // applying fine, since those are pure paint-property calls) with literally zero
      // vector-tile requests ever issued — verified by inspecting network traffic:
      // the style/sprite loaded, but no .pbf tile request ever fired. A ResizeObserver
      // that calls resize() whenever the container's real size changes fixes it, for
      // this initial-layout race and for any later container resize (sidebar toggling,
      // window resize, drawer opening).
      let styleReady = false;
      const layoutHeroLabels = () => {
        const width = containerRef.current?.clientWidth ?? 0;
        const height = containerRef.current?.clientHeight ?? 0;
        if (width < 80 || height < 80) return;
        const ranked = [...points]
          .filter((university) => university.lat != null && university.lon != null)
          .sort((a, b) => b.founderCount - a.founderCount || a.name.localeCompare(b.name))
          .slice(0, 10);
        const anchors = ranked.map((university) => {
          const projected = map.project([university.lon as number, university.lat as number]);
          const name = shortCampusLabel(university.id, university.name);
          return { id: university.id, name, x: projected.x, y: projected.y, lon: university.lon as number, textW: Math.min(112, Math.max(36, name.length * 7.4)) };
        });
        const placeColumn = (group: typeof anchors, side: "west" | "east") => {
          if (group.length === 0) return [];
          const ordered = [...group].sort((a, b) => a.y - b.y);
          let nextY = 10;
          const placed = ordered.map((item) => {
            let labelY = Math.max(item.y - 8, nextY);
            labelY = Math.max(8, Math.min(height - 22, labelY));
            nextY = labelY + 26;
            return { ...item, labelY };
          });
          const overflow = (placed[placed.length - 1]?.labelY ?? 0) - (height - 22);
          if (overflow > 0) {
            for (const pin of placed) pin.labelY = Math.max(8, pin.labelY - overflow);
          }
          const edge = side === "west" ? Math.min(...group.map((item) => item.x)) : Math.max(...group.map((item) => item.x));
          return placed.map((item) => {
            const labelX = side === "west"
              ? Math.max(6, edge - item.textW - 28)
              : Math.min(width - item.textW - 6, edge + 28);
            const lineX = side === "west" ? labelX + item.textW + 4 : labelX - 4;
            return { id: item.id, name: item.name, x: item.x, y: item.y, labelX, labelY: item.labelY, lineX, lineY: item.labelY + 8 };
          });
        };
        const west = anchors.filter((item) => item.lon < -104);
        const east = anchors.filter((item) => item.lon >= -104);
        setHeroPins([...placeColumn(west, "west"), ...placeColumn(east, "east")]);
      };
      const frameHero = () => {
        if (!hero || !styleReady || framedRef.current) return;
        const width = containerRef.current?.clientWidth ?? 0;
        const height = containerRef.current?.clientHeight ?? 0;
        if (width < 80 || height < 80) return;
        framedRef.current = true;
        map.resize();
        map.fitBounds(
          [
            [-125, 24.2],
            [-66.8, 49.4],
          ],
          { padding: { top: 28, bottom: 20, left: 108, right: 124 }, duration: 0 },
        );
        layoutHeroLabels();
      };
      map.on("moveend", () => {
        if (!cancelled && hero && styleReady) layoutHeroLabels();
      });
      resizeObserver = new ResizeObserver(() => {
        map?.resize();
        frameHero();
      });
      resizeObserver.observe(containerRef.current);

      // MapLibre fires "error" for lots of non-fatal things too (a single tile 404,
      // a missing glyph) — only treat it as fatal (fall back to the list view) if the
      // style never loaded at all; otherwise just log it and keep going.
      map.on("error", (e: MapEvent) => {
        console.warn("[globe-view] map error:", e?.error ?? e);
        if (!cancelled && !styleLoaded) setStatus("unsupported");
      });

      map.on("style.load", () => {
        if (cancelled) return;
        styleLoaded = true;
        // Each recolor attempt is independently guarded — one bad layer id/type must
        // never silently take the rest of the theming down with it (that's exactly how
        // the map ended up looking like a blank white circle the first time around).
        const trySet = (fn: () => void, label: string) => {
          try {
            fn();
          } catch (e) {
            console.warn(`[globe-view] couldn't apply "${label}":`, e);
          }
        };

        trySet(() => map.setProjection({ type: hero || locked ? "mercator" : "globe" }), hero || locked ? "mercator projection" : "globe projection");
        if (locked) {
          for (const layer of map.getStyle?.()?.layers ?? []) {
            if (layer.type === "symbol") trySet(() => map.setLayoutProperty(layer.id, "visibility", "none"), `hide-label:${layer.id}`);
          }
        }
        if (!hero) {
        trySet(
          () =>
            map.setSky({
              "sky-color": MAP_THEME.sky,
              "horizon-color": MAP_THEME.horizon,
              "fog-color": MAP_THEME.fog,
              "sky-horizon-blend": 0.45,
              "horizon-fog-blend": 0.72,
              "fog-ground-blend": 0.35,
              "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 1, 4, 0.55, 8, 0],
            }),
          "sky/atmosphere"
        );
        }

        if (!hero) for (const l of map.getStyle().layers) {
          if (l.type === "background") trySet(() => map.setPaintProperty(l.id, "background-color", MAP_THEME.land), `background:${l.id}`);
          if (l.id === "water") trySet(() => map.setPaintProperty(l.id, "fill-color", MAP_THEME.ocean), `water:${l.id}`);
          if (l.type === "fill" && /landcover|landuse|park|wood|sand/.test(l.id)) {
            // These layers' own fill-opacity is a zoom-interpolated expression whose domain
            // starts around zoom 8 — MapLibre clamps to the first stop's value *below* that
            // domain, so at our low zoom (~2.6) several of them render at ~0.7–1.0 opacity,
            // not the near-zero you'd expect from a "detail that fades in" layer. Recoloring
            // them without also capping opacity paints a solid wall over the whole map — that
            // was the actual cause of "the globe is just a white/purple circle," not the base
            // color choice. Verified in an isolated MapLibre harness before landing this.
            trySet(() => map.setPaintProperty(l.id, "fill-color", MAP_THEME.landAlt), `landAlt:${l.id}`);
            trySet(() => map.setPaintProperty(l.id, "fill-opacity", hero || locked ? 0 : 0.25), `landAlt-opacity:${l.id}`);
          }
          if (l.type === "line") {
            const night = hero || locked;
            trySet(() => map.setPaintProperty(l.id, "line-color", night ? "#243056" : MAP_THEME.boundary), `line:${l.id}`);
            if (night && !/boundary|admin/i.test(l.id)) {
              trySet(() => map.setPaintProperty(l.id, "line-opacity", 0), `line-hide:${l.id}`);
            }
          }
          if (l.type === "symbol") {
            trySet(() => map.setPaintProperty(l.id, "text-color", MAP_THEME.labelText), `labelText:${l.id}`);
            trySet(() => map.setPaintProperty(l.id, "text-halo-color", MAP_THEME.labelHalo), `labelHalo:${l.id}`);
          }
        }


        try {
          if (!map.getSource("campuses")) {
            map.addSource("campuses", {
              type: "geojson",
              cluster: !hero && !locked,
              clusterRadius: 48,
              clusterMaxZoom: 4,
                data: campusFeatureCollection(points, recentIds),
            });
          }

          const unclustered = ["!", ["has", "point_count"]];
          if (!locked && !map.getLayer("campus-glow")) {
            map.addLayer({
              id: "campus-glow",
              type: "circle",
              source: "campuses",
              filter: unclustered,
              paint: {
                "circle-radius": hero
                  ? ["interpolate", ["linear"], ["sqrt", ["max", ["coalesce", ["get", "founders"], 0], 0]], 0, 6, 10, 10, 28, 16]
                  : ["interpolate", ["linear"], ["get", "count"], 0, 16, 20, 28, 200, 42],
                "circle-color": hero ? COOL_DOT : MAP_THEME.dot,
                "circle-opacity": hero ? 0.45 : 0.38,
                "circle-blur": hero ? 0.55 : 1,
              },
            });
          }

          if (!locked && !map.getLayer("campus-dots")) {
            map.addLayer({
              id: "campus-dots",
              type: "circle",
              source: "campuses",
              filter: unclustered,
              paint: {
                "circle-radius": locked
                  ? 7
                  : hero
                    ? ["interpolate", ["linear"], ["sqrt", ["max", ["coalesce", ["get", "founders"], 0], 0]], 0, 3.5, 10, 6, 28, 10]
                    : ["interpolate", ["linear"], ["get", "count"], 0, 6, 20, 9, 200, 14],
                "circle-color": hero ? COOL_DOT : locked ? "#E8823A" : MAP_THEME.dot,
                "circle-stroke-width": locked ? 0 : 1,
                "circle-stroke-color": hero ? "#0B0E17" : "#fbfbfc",
                "circle-opacity": locked ? 1 : hero ? 0.85 : 0.95,
              },
            });
          }
          if (hero && !map.getLayer("campus-pulse")) {
            map.addLayer({
              id: "campus-pulse",
              type: "circle",
              source: "campuses",
              filter: ["==", ["get", "recent"], 1],
              paint: {
                "circle-radius": ["interpolate", ["linear"], ["sqrt", ["coalesce", ["get", "founders"], 0]], 0, 16, 10, 22, 28, 30],
                "circle-color": "#E8823A",
                "circle-opacity": 0.45,
                "circle-stroke-width": 3,
                "circle-stroke-color": "#E8823A",
                "circle-stroke-opacity": 1,
              },
            });
          }

          if (!map.getLayer("campus-clusters")) {
            map.addLayer({
              id: "campus-clusters",
              type: "circle",
              source: "campuses",
              filter: ["has", "point_count"],
              paint: {
                "circle-radius": ["interpolate", ["linear"], ["get", "point_count"], 2, 18, 8, 28, 24, 40],
                "circle-color": hero ? "#6d93d4" : MAP_THEME.dot,
                "circle-opacity": 0.92,
                "circle-stroke-width": 1.5,
                "circle-stroke-color": hero ? "#0B0E17" : "#f7f6f1",
              },
            });
          }

          if (!map.getLayer("campus-cluster-count")) {
            map.addLayer({
              id: "campus-cluster-count",
              type: "symbol",
              source: "campuses",
              filter: ["has", "point_count"],
              layout: {
                "text-field": ["get", "point_count_abbreviated"],
                "text-size": hero ? 13 : 11,
                "text-allow-overlap": true,
              },
              paint: {
                "text-color": hero ? "#0B0E17" : "#1f1e1b",
                "text-halo-color": hero ? "#6d93d4" : "#f7f6f1",
                "text-halo-width": hero ? 1.5 : 0,
              },
            });
          }

          if (!locked && !map.getLayer("campus-selected")) {
            map.addLayer({
              id: "campus-selected",
              type: "circle",
              source: "campuses",
              filter: ["all", unclustered, ["==", ["get", "id"], current.university ?? "__none__"]],
              paint: {
                "circle-radius": ["interpolate", ["linear"], ["get", "count"], 0, 10, 20, 14, 200, 18],
                "circle-color": "#f7f6f1",
                "circle-stroke-width": 2,
                "circle-stroke-color": MAP_THEME.dot,
              },
            });
          }

          if (!locked && !hero && !map.getLayer("campus-labels")) {
            map.addLayer({
              id: "campus-labels",
              type: "symbol",
              source: "campuses",
              filter: hero ? ["==", ["get", "label"], 1] : unclustered,
              layout: {
                "text-field": hero ? ["get", "name"] : ["concat", ["get", "name"], " ", ["to-string", ["get", "count"]]],
                "text-font": ["Noto Sans Regular"],
                "text-size": locked ? 14 : hero ? 13 : 11,
                "text-offset": locked ? [1.15, 0] : [0, 1.15],
                "text-anchor": locked ? "left" : "top",
                "text-allow-overlap": locked || hero,
              },
              paint: { "text-color": MAP_THEME.labelText, "text-halo-color": MAP_THEME.labelHalo, "text-halo-width": hero ? 2 : 1.2 },
            });
          }

          if (!map.getSource("campus-arcs") && campusArcs.length > 0) {
            const byId = new Map(points.map((u) => [u.id, u]));
            const features = arcFeaturesFor(points, campusArcs, hero ? 60 : Infinity, current.university);
            map.addSource("campus-arcs", { type: "geojson", data: { type: "FeatureCollection", features } });
            map.addLayer({
              id: "campus-arcs",
              type: "line",
              source: "campus-arcs",
              paint: hero
                ? {
                    "line-color": ["case", ["==", ["get", "focus"], 1], "#F2B35B", "#7C8CF0"],
                    "line-width": ["case", ["==", ["get", "focus"], 1], 1.5, 1],
                    "line-opacity": ["case", ["==", ["get", "focus"], 1], 0.9, 0.22],
                  }
                : { "line-color": MAP_THEME.arc, "line-width": 1.4, "line-opacity": 0.55 },
            });
          }

          map.on("click", "campus-dots", (e: MapEvent) => {
            const id = e.features?.[0]?.properties?.id;
            if (!id) return;
            const { basePath: livePath, current: liveCurrent, onNavigate: go } = liveRef.current;
            const switchingCampus = liveCurrent.university !== id;
            const overrides: Record<string, string | null> = switchingCampus
              ? { university: id, project: null }
              : { university: id };
            if (go) go(overrides);
            else router.push(buildHref(livePath, liveCurrent, overrides));
          });
          map.on("mouseenter", "campus-dots", () => {
            map.getCanvas().style.cursor = "pointer";
            pauseSpin();
          });
          map.on("mousemove", "campus-dots", (e: MapEvent) => {
            const id = e.features?.[0]?.properties?.id;
            if (!id || !e.point) return;
            setHoverTip({ id, x: e.point.x, y: e.point.y });
          });
          map.on("mouseleave", "campus-dots", () => {
            map.getCanvas().style.cursor = "";
            setHoverTip(null);
            resumeSpin();
          });
          map.on("click", "campus-clusters", (e: MapEvent) => {
            const feature = e.features?.[0];
            const clusterId = feature?.properties?.cluster_id;
            const coords = feature?.geometry?.coordinates;
            const source = map.getSource("campuses");
            if (clusterId == null || !coords || !source?.getClusterExpansionZoom) return;
            source.getClusterExpansionZoom(clusterId).then((zoom) => {
              map.flyTo({ center: coords, zoom, duration: prefersReducedMotion() ? 0 : 700 });
            });
          });
          map.on("mouseenter", "campus-clusters", () => (map.getCanvas().style.cursor = "pointer"));
          map.on("mouseleave", "campus-clusters", () => (map.getCanvas().style.cursor = ""));
        } catch (e) {
          console.error("[globe-view] FAILED adding campus source/layers:", e);
        }
        styleReady = true;
        if (hero) requestAnimationFrame(frameHero);
        setStatus("ok");

        let interacting = false;
        let resumeTimer = 0;
        const pauseSpin = () => {
          interacting = true;
          window.clearTimeout(resumeTimer);
        };
        const resumeSpin = () => {
          window.clearTimeout(resumeTimer);
          resumeTimer = window.setTimeout(() => {
            interacting = false;
          }, hero ? 4000 : 1200);
        };
        map.on("dragstart", pauseSpin);
        map.on("wheel", pauseSpin);
        map.on("dragend", resumeSpin);
        let last = performance.now();
        let raf = 0;
        const tick = (now: number) => {
          if (cancelled) return;
          raf = requestAnimationFrame(tick);
          if (hero && map.getLayer("campus-pulse") && !prefersReducedMotion() && !navigator.webdriver) {
            const phase = (now % 2400) / 2400;
            const scale = 1 + 0.45 * phase;
            try {
              map.setPaintProperty("campus-pulse", "circle-radius", ["*", scale, ["interpolate", ["linear"], ["sqrt", ["coalesce", ["get", "founders"], 0]], 0, 16, 10, 22, 28, 30]]);
              map.setPaintProperty("campus-pulse", "circle-opacity", 0.35 + 0.4 * (1 - phase));
            } catch {
              // The pulse layer can still be attaching on the first frames.
            }
          }
          if (hero || locked || interacting || spinPaused.current || prefersReducedMotion() || navigator.webdriver) {
            last = now;
            return;
          }
          const dt = Math.min(0.05, (now - last) / 1000);
          last = now;
          const center = map.getCenter();
          center.lng += -2.4 * dt;
          map.setCenter(center);
        };
        raf = requestAnimationFrame(tick);
        const stopSpin = () => {
          cancelled = true;
          cancelAnimationFrame(raf);
          window.clearTimeout(resumeTimer);
        };
        mapRef.current = Object.assign(map, { __stopSpin: stopSpin });
      });
    })();

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      const extra = mapRef.current as (CampusMap & { __stopSpin?: () => void }) | null;
      extra?.__stopSpin?.();
      map?.remove?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Campus dots are captured when the map is created. The homepage fetches them
  // after the shell paints, so replace the GeoJSON once they arrive.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || status !== "ok" || !map.getSource("campuses")) return;
    const placedPoints = universities.filter((u) => u.lat != null && u.lon != null);
    map.getSource("campuses")?.setData?.(campusFeatureCollection(placedPoints, recentIds));
    const arcFeatures = arcFeaturesFor(placedPoints, campusArcs, hero ? 60 : Infinity, current.university);
    const arcSource = map.getSource("campus-arcs");
    if (arcSource?.setData) {
      arcSource.setData({ type: "FeatureCollection", features: arcFeatures });
    } else if (arcFeatures.length > 0) {
      map.addSource("campus-arcs", { type: "geojson", data: { type: "FeatureCollection", features: arcFeatures } });
      if (!map.getLayer("campus-arcs")) {
        map.addLayer({
          id: "campus-arcs",
          type: "line",
          source: "campus-arcs",
          paint: hero
            ? {
                "line-color": ["case", ["==", ["get", "focus"], 1], "#F2B35B", "#7C8CF0"],
                "line-width": ["case", ["==", ["get", "focus"], 1], 1.5, 1],
                "line-opacity": ["case", ["==", ["get", "focus"], 1], 0.9, 0.22],
              }
            : { "line-color": MAP_THEME.arc, "line-width": 1.4, "line-opacity": 0.55 },
        });
      }
    }
    if (!hero && !current.university && !framedRef.current && placedPoints.length > 0) {
      framedRef.current = true;
      frameCampuses(map, placedPoints);
    }
  }, [universities, campusArcs, status, current.university, recentIds, hero]);

  const userLayerBound = useRef(false);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || status !== "ok") return;
    try {
      if (map.hasImage && map.addImage && !map.hasImage("user-added-square")) {
        const size = 18;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.fillStyle = "#111111";
          ctx.fillRect(1, 1, size - 2, size - 2);
          ctx.strokeStyle = "#f7f6f1";
          ctx.lineWidth = 2;
          ctx.strokeRect(2.5, 2.5, size - 5, size - 5);
          map.addImage("user-added-square", ctx.getImageData(0, 0, size, size), { pixelRatio: 2 });
        }
      }
      if (!map.getSource("user-added")) {
        map.addSource("user-added", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      }
      if (!map.getLayer("user-added-icons")) {
        map.addLayer({
          id: "user-added-icons",
          type: "symbol",
          source: "user-added",
          layout: {
            "icon-image": "user-added-square",
            "icon-size": 0.9,
            "icon-allow-overlap": true,
            "text-field": "User-added",
            "text-size": 11,
            "text-offset": [0, 1.35],
            "text-anchor": "top",
            "text-allow-overlap": true,
          },
          paint: { "text-color": "#1f1e1b", "text-halo-color": "#f7f6f1", "text-halo-width": 1.2 },
        });
      }
      if (!userLayerBound.current) {
        userLayerBound.current = true;
        map.on("click", "user-added-icons", (event) => {
          const id = event.features?.[0]?.properties?.id;
          if (!id) return;
          router.push(`/startup/${id}`);
        });
        map.on("mouseenter", "user-added-icons", () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mousemove", "user-added-icons", (event) => {
          const id = event.features?.[0]?.properties?.id;
          const name = event.features?.[0]?.properties?.name;
          if (!id || !event.point) return;
          setUserTip({ id, name: name || "User-added", x: event.point.x, y: event.point.y });
        });
        map.on("mouseleave", "user-added-icons", () => {
          map.getCanvas().style.cursor = "";
          setUserTip(null);
        });
      }
      map.getSource("user-added")?.setData?.({
        type: "FeatureCollection",
        features: userMarkers.map((marker) => ({
          type: "Feature",
          geometry: { type: "Point", coordinates: [marker.lon, marker.lat] },
          properties: { id: marker.id, name: marker.name },
        })),
      });
      if (map.getLayer("user-added-icons")) {
        map.setLayoutProperty("user-added-icons", "visibility", geoMode === "campus" ? "visible" : "none");
      }
      map.getContainer?.().setAttribute(
        "aria-label",
        userMarkers.length ? `User-added: ${userMarkers.map((marker) => marker.name).join(", ")}` : "Campus map"
      );
    } catch {
      // The style can still be settling on the first frame after load.
    }
  }, [userMarkers, status, geoMode, router]);

  // Fly to / re-filter the selected campus without re-creating the map.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || status !== "ok") return;
    if (map.getLayer("campus-selected")) {
      map.setFilter("campus-selected", ["all", ["!", ["has", "point_count"]], ["==", ["get", "id"], current.university ?? "__none__"]]);
    }
    if (current.university) {
      const u = universities.find((x) => x.id === current.university);
      if (u?.lat != null && u?.lon != null) {
        map.flyTo({
          center: [u.lon, u.lat],
          zoom: locked ? 5.6 : hero ? 4 : 4.4,
          duration: prefersReducedMotion() || locked ? 0 : hero ? 320 : 1100,
          essential: true,
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current.university, status]);

  const emphasizeKey = emphasizeIds.join(",");
  useEffect(() => {
    if (hero || locked) return;
    const map = mapRef.current;
    if (!map || status !== "ok" || !map.getLayer("campus-dots")) return;
    const ids = emphasizeKey ? emphasizeKey.split(",") : [];
    const marked = ids.length > 0;
    const inSet: unknown[] = ["in", ["get", "id"], ["literal", ids]];
    map.setPaintProperty("campus-dots", "circle-opacity", marked ? ["case", inSet, 1, 0.18] : 0.95);
    map.setPaintProperty("campus-dots", "circle-stroke-color", marked ? ["case", inSet, "#1f1e1b", "#f7f6f1"] : "#f7f6f1");
    map.setPaintProperty("campus-dots", "circle-stroke-width", marked ? ["case", inSet, 3, 1.5] : 1.5);
    map.setPaintProperty("campus-glow", "circle-opacity", marked ? ["case", inSet, 0.55, 0.08] : 0.38);
    if (marked) {
      frameCampuses(
        map,
        universities.filter((university) => ids.includes(university.id))
      );
    }
  }, [emphasizeKey, status, universities, hero]);

  useEffect(() => {
    if (!active || status !== "ok") return;
    mapRef.current?.resize();
  }, [active, status]);

  // Headquarters mode must not keep campus markers on the map. Those dots are
  // affiliation counts, and leaving them up reads as if the campus were an HQ.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || status !== "ok") return;
    const visibility = geoMode === "campus" ? "visible" : "none";
    for (const layer of ["campus-glow", "campus-dots", "campus-pulse", "campus-counts", "campus-selected", "campus-labels", "campus-clusters", "campus-cluster-count", "campus-arcs", "user-added-icons"]) {
      if (!map.getLayer(layer)) continue;
      map.setLayoutProperty(layer, "visibility", visibility);
    }
  }, [geoMode, status]);

  const monitored = universities.filter((u) => u.sourcesConfigured > 0).length;
  const statItems = selectedUniversity
    ? [
        { n: selectedUniversity.companyCount, label: "companies" },
        { n: selectedUniversity.founderCount, label: "founders" },
        { n: selectedUniversity.sourcesConfigured, label: "sources" },
      ]
    : [
        { n: resultsPending ? (knownResultCount ?? trayCandidates.length) : trayCandidates.length, label: "in view" },
        { n: points.length, label: "campuses" },
        { n: monitored, label: "monitored" },
      ];

  return (
    <div className={hero || locked ? "h-full" : flush ? "" : "p-2"}>
      {!hideStats && status === "ok" && (
        <div className="stat-strip mb-6">
          {statItems.map((s) => (
            <p key={s.label}>
              <span className="stat-num">{s.n.toLocaleString("en-US")}</span>
              <span className="stat-kicker">{s.label}</span>
            </p>
          ))}
        </div>
      )}
      <div className={hero || locked ? "hero-map relative h-full w-full overflow-hidden" : "relative h-[min(62dvh,680px)] min-h-[420px] w-full overflow-hidden rounded-xl border border-line sm:min-h-[520px]"} style={{ background: hero ? "#2a3548" : MAP_THEME.sky }}>
        <div ref={containerRef} className="h-full w-full" />
        {hero && status === "ok" && heroPins.length > 0 && (
          <svg className="pointer-events-none absolute inset-0 z-10 h-full w-full" aria-hidden>
            {heroPins.map((pin) => (
              <line key={pin.id} x1={pin.x} y1={pin.y} x2={pin.lineX} y2={pin.lineY} stroke="#d5dbe8" strokeWidth="1.25" />
            ))}
          </svg>
        )}
        {hero && status === "ok" && heroPins.map((pin) => (
          <span
            key={pin.id}
            className="pointer-events-none absolute z-10 whitespace-nowrap text-[14px] font-medium text-[#f7f8fc]"
            style={{ left: pin.labelX, top: pin.labelY, textShadow: "0 1px 2px #0c1320, 0 0 8px #0c1320" }}
          >
            {pin.name}
          </span>
        ))}
        {locked && selectedUniversity && status === "ok" && (
          <div className="pointer-events-none absolute inset-0 z-10">
            <div className="absolute left-1/2 top-1/2 flex -translate-y-1/2 items-center">
              <span className="h-3 w-3 shrink-0 -translate-x-1/2 rounded-full bg-[#E8823A]" />
              <span className="ml-1.5 whitespace-nowrap text-[14px] font-medium text-[#eceef4]" style={{ textShadow: "0 1px 2px #0b0e17" }}>
                {shortCampusLabel(selectedUniversity.id, selectedUniversity.name)} {selectedUniversity.companyCount.toLocaleString("en-US")}
              </span>
            </div>
          </div>
        )}
        {status === "ok" && !hero && !locked && (
          <div className="segmented absolute right-3 top-3 z-10" role="group" aria-label="Map geography">
            <button type="button" onClick={() => setGeoMode("campus")} className={geoMode === "campus" ? "is-active" : ""}>
              Campuses
            </button>
            <button type="button" onClick={() => setGeoMode("hq")} className={geoMode === "hq" ? "is-active" : ""}>
              Headquarters
            </button>
          </div>
        )}
        {status === "ok" && hoverTip && geoMode === "campus" && (
          <CampusHover universities={universities} tip={hoverTip} />
        )}
        {status === "ok" && userTip && geoMode === "campus" && (
          <div className="pointer-events-none absolute z-10 rounded-xl border border-border-c bg-surface px-2.5 py-1.5 text-xs text-foreground" style={{ left: userTip.x + 12, top: userTip.y - 8 }}>
            <p className="font-medium">{userTip.name}</p>
            <p>User-added</p>
          </div>
        )}
        {status === "loading" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
            <div className="globe-skeleton" />
            <p className="ui-label">Loading globe</p>
          </div>
        )}
        {status === "unsupported" && (
          <div className="absolute inset-0 flex flex-col items-start justify-start gap-2 overflow-y-auto p-4">
            <p className="text-sm text-muted">
              The map couldn&apos;t load (likely no WebGL) — here&apos;s the same campus list it would show.
            </p>
            <UniversityListFallback universities={universities} basePath={basePath} current={current} />
          </div>
        )}

        {/* Floating campus-summary panel — pattern studied from dashboard.vclense.ch/ycglobe's
            frosted floating panels. */}
        {!hero && !locked && geoMode === "hq" && status === "ok" && (
          <div className="glass-panel absolute left-3 top-16 w-72 max-h-[420px] overflow-y-auto">
            <div className="glass-panel-head">
              <span className="font-serif text-base text-foreground">Headquarters</span>
            </div>
            <p className="px-3 pt-2 text-[11px] leading-snug text-muted">
              A company is plotted only when a source gives coordinates. A place name is not geocoded, and a campus is never used as a headquarters.
            </p>
            <div className="px-3 py-2">
              <span className="ui-label">Place name on record · not plotted ({placed.length})</span>
              <ul className="mt-1.5 space-y-1">
                {placed.slice(0, 8).map((c) => (
                  <li key={c.id}>
                    <span className="block rounded-md px-1.5 py-1 text-xs hover:bg-surface-2">
                      <CompanyNameLink id={c.id} name={c.name} websiteUrl={c.websiteUrl} className="font-medium text-foreground hover:text-link" />
                      <span className="block truncate text-muted">{c.recordedPlace}</span>
                    </span>
                  </li>
                ))}
                {placed.length === 0 && <li className="text-xs text-muted">No sourced place names in this result set.</li>}
              </ul>
            </div>
            <div className="px-3 pb-3">
              <span className="ui-label">Location unknown ({unplaced.length})</span>
              <ul className="mt-1.5 space-y-1">
                {unplaced.slice(0, 6).map((c) => (
                  <li key={c.id}>
                    <span className="block truncate rounded-md px-1.5 py-1 text-xs">
                      <CompanyNameLink id={c.id} name={c.name} websiteUrl={c.websiteUrl} className="text-foreground hover:text-link" />
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {!hero && !locked && geoMode === "campus" && selectedUniversity && status === "ok" && (
          <div className="glass-panel absolute left-3 top-16 hidden w-64 max-h-[420px] overflow-y-auto sm:block">
            <div className="glass-panel-head">
              <span className="font-serif text-base text-foreground">{selectedUniversity.name}</span>
              <a
                href={buildHref(basePath, current, { university: null })}
                className="ml-auto text-[11px] text-muted hover:text-foreground"
                aria-label="Close campus panel"
              >
                ✕
              </a>
            </div>
            <div className="flex items-center gap-3 px-3 py-2 text-[11px] text-muted">
              <span>
                <span className="font-medium text-foreground">{selectedUniversity.companyCount}</span> companies
              </span>
              <span>
                <span className="font-medium text-foreground">{selectedUniversity.founderCount}</span> founders
              </span>
              <span>
                <span className="font-medium text-foreground">{selectedUniversity.sourcesConfigured}</span> sources
              </span>
            </div>
            <div className="px-3">
              <CampusBenchmarks pitchbook={selectedUniversity.pitchbook} hitRate={selectedUniversity.hitRate} />
            </div>
            <div className="px-3 pb-3">
              <span className="ui-label">Preview results</span>
              <ul className="mt-1.5 space-y-1">
                {previewCandidates.slice(0, 5).map((c) => (
                  <li key={c.id}>
                    <span className="block truncate rounded-md px-1.5 py-1 text-xs">
                      <CompanyNameLink id={c.id} name={c.name} websiteUrl={c.websiteUrl} className="text-foreground hover:text-link" />
                    </span>
                    {c.founderLinks[0]?.link && (
                      <span className="mt-0.5 flex items-center gap-1 px-1.5">
                        <PersonLinkButton link={c.founderLinks[0].link} name={c.founderLinks[0].name} />
                      </span>
                    )}
                  </li>
                ))}
                {previewCandidates.length === 0 && (
                  <li className="text-xs text-muted">{resultsPending ? "Loading candidates…" : "No candidates found here yet."}</li>
                )}
              </ul>
              {previewCandidates.length > 5 && (
                <a href={buildHref(basePath, current, { view: "table" })} className="mt-1.5 block text-[11px] text-link underline">
                  See all {previewCandidates.length} in Table
                </a>
              )}
            </div>
          </div>
        )}

        {status === "ok" && !locked && (
          <div className={`absolute z-10 flex flex-col gap-1 ${hero ? "bottom-3 right-3" : "bottom-3 right-3"}`}>
            <button
              type="button"
              onClick={() => mapRef.current?.zoomIn()}
              aria-label="Zoom in"
              className="flex h-7 w-7 items-center justify-center rounded-md border border-border-c bg-surface text-sm text-foreground"
            >
              +
            </button>
            <button
              type="button"
              onClick={() => mapRef.current?.zoomOut()}
              aria-label="Zoom out"
              className="flex h-7 w-7 items-center justify-center rounded-md border border-border-c bg-surface text-sm text-foreground"
            >
              −
            </button>
            <button
              type="button"
              onClick={() => {
                const map = mapRef.current;
                if (!map) return;
                frameCampuses(map, points);
              }}
              aria-label="Reset view"
              className="flex h-7 w-7 items-center justify-center rounded-md border border-border-c bg-surface text-[10px] text-foreground"
              title="Fit campuses"
            >
              ⤢
            </button>
          </div>
        )}
      </div>
      {status === "ok" && !hero && !locked && (
        <p className="viz-legend">
          {geoMode === "campus"
            ? "Dot size follows candidate count. A ring marks the campus in view."
            : "A company is plotted only when a source gives coordinates."}
        </p>
      )}
      {status === "ok" && !hero && <ResultTray docked candidates={trayCandidates} basePath={basePath} current={current} />}
      {!hero && (
        <div className="mt-3 sm:hidden">
          <UniversityListFallback universities={universities} basePath={basePath} current={current} compact />
          {selectedUniversity && (
            <div className="mt-2">
              <CampusBenchmarks pitchbook={selectedUniversity.pitchbook} hitRate={selectedUniversity.hitRate} />
            </div>
          )}
        </div>
      )}
    </div>
  );
});

function frameCampuses(map: CampusMap, points: UniversitySummary[]) {
  const placed = points.filter((u) => u.lon != null && u.lat != null);
  if (!placed.length) return;
  const west = Math.min(...placed.map((u) => u.lon as number));
  const east = Math.max(...placed.map((u) => u.lon as number));
  const south = Math.min(...placed.map((u) => u.lat as number));
  const north = Math.max(...placed.map((u) => u.lat as number));
  map.fitBounds(
    [
      [west - 2, south - 1.5],
      [east + 2, north + 1.5],
    ],
    { padding: { top: 36, bottom: 28, left: 48, right: 56 }, maxZoom: 4.2, duration: 0 },
  );
}

function arcFeaturesFor(points: UniversitySummary[], campusArcs: CampusArc[], cap = Infinity, focusId?: string) {
  const byId = new Map(points.map((u) => [u.id, u]));
  const ranked = [...campusArcs].sort((a, b) => b.count - a.count);
  const chosen = focusId
    ? ranked.filter((arc) => arc.fromId === focusId || arc.toId === focusId)
    : ranked.slice(0, cap);
  return chosen.flatMap((arc) => {
    const a = byId.get(arc.fromId);
    const b = byId.get(arc.toId);
    if (!a || a.lon == null || a.lat == null || !b || b.lon == null || b.lat == null) return [];
    return [{
      type: "Feature",
      geometry: { type: "LineString", coordinates: greatCircle([a.lon, a.lat], [b.lon, b.lat]) },
      properties: { count: arc.count, focus: focusId ? 1 : 0 },
    }];
  });
}

function greatCircle(a: [number, number], b: [number, number], steps = 48): [number, number][] {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const [lon1, lat1] = [toRad(a[0]), toRad(a[1])];
  const [lon2, lat2] = [toRad(b[0]), toRad(b[1])];
  const d = 2 * Math.asin(Math.sqrt(Math.sin((lat2 - lat1) / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon2 - lon1) / 2) ** 2));
  if (d === 0) return [a, b];
  const coords: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const A = Math.sin((1 - t) * d) / Math.sin(d);
    const B = Math.sin(t * d) / Math.sin(d);
    const x = A * Math.cos(lat1) * Math.cos(lon1) + B * Math.cos(lat2) * Math.cos(lon2);
    const y = A * Math.cos(lat1) * Math.sin(lon1) + B * Math.cos(lat2) * Math.sin(lon2);
    const z = A * Math.sin(lat1) + B * Math.sin(lat2);
    coords.push([toDeg(Math.atan2(y, x)), toDeg(Math.atan2(z, Math.sqrt(x * x + y * y)))]);
  }
  return coords;
}

function CampusHover({
  universities,
  tip,
}: {
  universities: UniversitySummary[];
  tip: { id: string; x: number; y: number };
}) {
  const u = universities.find((x) => x.id === tip.id) as (UniversitySummary & { signalWeek?: number; latestSignal?: string | null }) | undefined;
  if (!u) return null;
  const brief = u;
  return (
    <div
      className="glass-panel pointer-events-none absolute z-10 max-w-[240px] px-2.5 py-1.5 text-[13px]"
      style={{ left: tip.x + 12, top: tip.y - 8 }}
    >
      <p className="font-medium text-foreground">{shortCampusLabel(u.id, u.name)}</p>
      <p className="text-[14px] text-muted">
        <span className="num">{u.founderCount.toLocaleString("en-US")}</span> founders
      </p>
      {brief.signalWeek != null && (
        <p className="text-[14px] text-muted">
          <span className="num">{brief.signalWeek.toLocaleString("en-US")}</span> {SIGNALS_THIS_WEEK_LABEL}
        </p>
      )}
      {brief.latestSignal ? <p className="truncate text-[14px] text-fg-2" title={brief.latestSignal}>{brief.latestSignal}</p> : null}
    </div>
  );
}

function UniversityListFallback({
  universities,
  basePath,
  current,
  compact,
}: {
  universities: UniversitySummary[];
  basePath: string;
  current: Record<string, string | undefined>;
  compact?: boolean;
}) {
  const listed = alphabeticalByLabel(universities, (u) => u.name);
  return (
    <ul className={compact ? "flex flex-wrap gap-2" : "space-y-1.5"}>
      {listed.map((u) => (
        <li key={u.id}>
          <a
            href={buildHref(basePath, current, current.university !== u.id ? { university: u.id, project: null } : { university: u.id })}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${current.university === u.id ? "border-accent bg-accent text-accent-foreground" : "border-border-c hover:bg-surface-2"}`}
          >
            {u.name}
            <span className="text-muted">({u.candidateProjectCount})</span>
          </a>
        </li>
      ))}
    </ul>
  );
}
