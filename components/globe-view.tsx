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
    { id: "background", type: "background", paint: { "background-color": "#3c3832" } },
    { id: "water", type: "fill", source: "openmaptiles", "source-layer": "water", paint: { "fill-color": "#12110f", "fill-outline-color": "#9a9184" } },
    { id: "terrain", type: "fill", source: "openmaptiles", "source-layer": "landcover", paint: { "fill-color": "#4a453c", "fill-opacity": 0.35 } },
    {
      id: "coast",
      type: "line",
      source: "openmaptiles",
      "source-layer": "water",
      paint: { "line-color": "#9a9184", "line-width": 1.15, "line-opacity": 0.8 },
    },
    {
      id: "boundary",
      type: "line",
      source: "openmaptiles",
      "source-layer": "boundary",
      filter: ["any", ["==", ["get", "admin_level"], 2], ["==", ["get", "admin_level"], "2"]],
      paint: { "line-color": "#7d756b", "line-width": 1.1 },
    },
    {
      id: "states",
      type: "line",
      source: "openmaptiles",
      "source-layer": "boundary",
      filter: ["any", ["==", ["get", "admin_level"], 4], ["==", ["get", "admin_level"], "4"]],
      paint: { "line-color": "#7d756b", "line-width": 0.7, "line-opacity": 0.5 },
    },
  ],
};

const COOL_DOT = ["interpolate", ["linear"], ["coalesce", ["get", "founders"], 0], 1, "#e6dfd4", 80, "#f3eee6", 250, "#faf6f0", 700, "#fffaf4"] as const;

// Positron's OWN default colors are near-white by design (land
// rgb(242,243,240), water rgb(194,200,202) — verified against the live
// style JSON) — a minimalist basemap meant to sit under data, not to be
// looked at on its own at world zoom. It needs real contrast injected, not
// another pale tint layered on top, or it reads as a blank white circle
// (exactly what happened here the first time).
const DAY_THEME = {
  land: "#e6e0d4",
  landAlt: "#d9d2c4",
  ocean: "#f4f1eb",
  boundary: "#c9c0b2",
  labelText: "#1c1915",
  labelHalo: "#f4f1eb",
  sky: "#f4f1eb",
  horizon: "#3c42d4",
  fog: "#f4f1eb",
  dot: "#3c42d4",
  arc: "#5a62e0",
};

const NIGHT_THEME = {
  land: "#3c3832",
  landAlt: "#4a453c",
  ocean: "#12110f",
  boundary: "#7d756b",
  labelText: "#f4f0e8",
  labelHalo: "#12110f",
  sky: "#12110f",
  horizon: "#c5c9ff",
  fog: "#12110f",
  dot: "#e6dfd4",
  arc: "#c5c9ff",
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

function weekOf(university: UniversitySummary): number {
  const value = (university as UniversitySummary & { signalWeek?: number }).signalWeek;
  return typeof value === "number" ? value : 0;
}

type HeroPin = { id: string; name: string; x: number; y: number; labelX: number; labelY: number; badge: boolean; lineX: number; lineY: number };
type HeroMark = { id: string; x: number; y: number; hot: boolean };

const INSET_IDS = new Set(["univ_penn", "univ_mit", "univ_harvard", "univ_yale"]);
const US_BOUNDS: [[number, number], [number, number]] = [
  [-125, 24.2],
  [-66.8, 49.4],
];
const WORLD_BOUNDS: [[number, number], [number, number]] = [
  [-168, -55],
  [178, 74],
];

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
  world = false,
  locked = false,
  geoMode: geoModeProp,
  recentIds = [],
  highlightId = null,
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
  /** Hero camera framed to the world. The US hero stays on the continental bounds. */
  world?: boolean;
  /** Mini-globe: no spin, no chrome. */
  locked?: boolean;
  geoMode?: "campus" | "hq";
  recentIds?: string[];
  /** Leaderboard row under the pointer. Draws a ring on that campus bubble. */
  highlightId?: string | null;
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
  const [heroPins, setHeroPins] = useState<HeroPin[]>([]);
  const [heroMarks, setHeroMarks] = useState<HeroMark[]>([]);
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
  const points = universities.filter((u) => u.lat != null && u.lon != null);
  const liveRef = useRef({ basePath, current, onNavigate });
  const spinPaused = useRef(false);
  const framedRef = useRef(false);
  const heroSizeRef = useRef("");
  const pointsRef = useRef(points);
  const relayoutRef = useRef<(() => void) | null>(null);
  const plotKey = universities.map((university) => `${university.id}:${university.founderCount}:${weekOf(university)}`).join("|");
  const recentKey = recentIds.join("|");
  useEffect(() => {
    pointsRef.current = universities.filter((university) => university.lat != null && university.lon != null);
    relayoutRef.current?.();
  }, [plotKey, recentKey, universities]);
  useEffect(() => {
    liveRef.current = { basePath, current, onNavigate };
    const narrow = typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches;
    spinPaused.current = locked || (hero && narrow) || (!hero && (Boolean(current.university) || geoMode === "hq"));
  }, [basePath, current, geoMode, hero, locked, onNavigate]);

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
          center: lockedPoint ? [lockedPoint.lon as number, lockedPoint.lat as number] : hero && world ? [10, 12] : [-98, 39],
          zoom: locked ? 5.6 : hero ? (world ? 1 : window.matchMedia("(max-width: 767px)").matches ? 2.4 : 3.1) : 3.35,
          minZoom: hero ? (world ? -1 : 0.4) : locked ? 2 : 1.5,
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
        const plotted = pointsRef.current.filter((university) => university.lat != null && university.lon != null);
        const hotIds = new Set(
          [...plotted]
            .filter((university) => weekOf(university) > 0)
            .sort((a, b) => weekOf(b) - weekOf(a) || b.founderCount - a.founderCount || a.name.localeCompare(b.name))
            .slice(0, 3)
            .map((university) => university.id),
        );
        const textWidth = (text: string) => Math.min(120, Math.max(36, Math.ceil(text.length * 7.2)));
        const pins: HeroPin[] = [];
        const marks: HeroMark[] = [];
        const abroadIds = new Set<string>();
        if (world) {
          const anchors: { x: number; y: number }[] = [];
          const abroad = [...plotted]
            .filter((university) => (university.country ?? "").trim().toLowerCase() !== "united states")
            .sort((a, b) => b.founderCount - a.founderCount || a.name.localeCompare(b.name));
          for (const university of abroad) {
            const projected = map.project([university.lon as number, university.lat as number]);
            if (projected.x < 8 || projected.y < 8 || projected.x > width - 8 || projected.y > height - 8) continue;
            const crowded = anchors.some((anchor) => Math.hypot(anchor.x - projected.x, anchor.y - projected.y) < 64);
            if (crowded) continue;
            abroadIds.add(university.id);
            anchors.push({ x: projected.x, y: projected.y });
          }
        }
        for (const university of plotted) {
          const projected = map.project([university.lon as number, university.lat as number]);
          const inInset = INSET_IDS.has(university.id);
          const hot = hotIds.has(university.id) && !inInset;
          marks.push({ id: university.id, x: projected.x, y: projected.y, hot });
          const named = world ? abroadIds.has(university.id) : university.id === "univ_berkeley" || university.id === "univ_stanford";
          if (!named) continue;
          const name = shortCampusLabel(university.id, university.name);
          const tw = textWidth(name);
          const blockH = hot ? 34 : 16;
          let labelX: number;
          let labelY: number;
          let lineX: number;
          let lineY: number;
          if (world) {
            labelX = projected.x - tw / 2;
            labelY = projected.y - blockH - 22;
            labelX = Math.max(8, Math.min(width - tw - 8, labelX));
            labelY = Math.max(8, Math.min(height - blockH - 8, labelY));
            lineX = Math.max(labelX, Math.min(labelX + tw, projected.x));
            lineY = labelY + blockH;
          } else {
            const berkeley = university.id === "univ_berkeley";
            // East of the dot stays over land. Berkeley sits above its dot, Stanford below, so the two labels cannot stack.
            labelX = projected.x + (berkeley ? 14 : 16);
            labelY = berkeley ? projected.y - blockH - 16 : projected.y + 16;
            labelX = Math.max(projected.x + 8, Math.min(width - tw - 8, labelX));
            labelY = Math.max(8, Math.min(height - blockH - 8, labelY));
            lineX = labelX;
            lineY = berkeley ? labelY + blockH : labelY;
          }
          pins.push({ id: university.id, name, x: projected.x, y: projected.y, labelX, labelY, badge: hot, lineX, lineY });
        }
        setHeroPins(pins);
        setHeroMarks(marks);
      };
      relayoutRef.current = layoutHeroLabels;
      const frameHero = () => {
        if (!hero || !styleReady) return;
        const width = containerRef.current?.clientWidth ?? 0;
        const height = containerRef.current?.clientHeight ?? 0;
        if (width < 80 || height < 80) return;
        const sizeKey = `${Math.round(width)}x${Math.round(height)}`;
        if (heroSizeRef.current === sizeKey) return;
        heroSizeRef.current = sizeKey;
        map.resize();
        map.fitBounds(
          world ? WORLD_BOUNDS : US_BOUNDS,
          {
            padding: world
              ? width < 700
                ? { top: 44, bottom: 36, left: 12, right: 12 }
                : { top: 44, bottom: 48, left: 20, right: 20 }
              : width < 700
                ? { top: 28, bottom: 48, left: 16, right: 16 }
                : { top: 28, bottom: 64, left: 36, right: 36 },
            duration: 0,
          },
        );
        // fitBounds commits the camera after this turn. project() is stale until then,
        // and a layout here would pin the labels away from the bubbles.
        const paintLabels = () => {
          if (!cancelled) layoutHeroLabels();
        };
        requestAnimationFrame(() => requestAnimationFrame(paintLabels));
        window.setTimeout(paintLabels, 60);
        window.setTimeout(paintLabels, 240);
        window.setTimeout(paintLabels, 700);
      };
      map.on("moveend", () => {
        if (!cancelled && hero && styleReady) layoutHeroLabels();
      });
      map.on("idle", () => {
        if (!cancelled && hero && styleReady) layoutHeroLabels();
      });
      if (hero) {
        let ticks = 0;
        const timer = window.setInterval(() => {
          ticks += 1;
          if (!cancelled && styleReady) layoutHeroLabels();
          if (ticks >= 24 || cancelled) window.clearInterval(timer);
        }, 400);
      }
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
            trySet(() => map.setPaintProperty(l.id, "line-color", night ? NIGHT_THEME.boundary : MAP_THEME.boundary), `line:${l.id}`);
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
                "circle-color": hero ? COOL_DOT : locked ? "#c5c9ff" : MAP_THEME.dot,
                "circle-stroke-width": locked ? 0 : 1,
                "circle-stroke-color": hero ? "#12110f" : "#f4f1eb",
                "circle-opacity": locked ? 1 : hero ? 0.85 : 0.95,
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
                "circle-color": hero ? "#cfc6b8" : MAP_THEME.dot,
                "circle-opacity": 0.92,
                "circle-stroke-width": 1.5,
                "circle-stroke-color": hero ? "#12110f" : "#f4f1eb",
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
                "text-color": hero ? "#16151c" : "#1c1915",
                "text-halo-color": hero ? "#cfc6b8" : "#f4f1eb",
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
                "circle-color": "#fffaf4",
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
            const features = arcFeaturesFor(points, campusArcs, hero ? 60 : Infinity, current.university);
            map.addSource("campus-arcs", { type: "geojson", data: { type: "FeatureCollection", features } });
            map.addLayer({
              id: "campus-arcs",
              type: "line",
              source: "campus-arcs",
              paint: hero
                ? {
                    "line-color": ["case", ["==", ["get", "focus"], 1], "#c5c9ff", "#8a8176"],
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
                "line-color": ["case", ["==", ["get", "focus"], 1], "#c5c9ff", "#8a8176"],
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
  }, [universities, campusArcs, status, current.university, recentIds, hero, MAP_THEME.arc]);

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
          ctx.fillStyle = "#16151c";
          ctx.fillRect(1, 1, size - 2, size - 2);
          ctx.strokeStyle = "#f4f0e8";
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
          paint: { "text-color": "#1c1915", "text-halo-color": "#f4f1eb", "text-halo-width": 1.2 },
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
    map.setPaintProperty("campus-dots", "circle-stroke-color", marked ? ["case", inSet, "#1c1915", "#f4f1eb"] : "#f4f1eb");
    map.setPaintProperty("campus-dots", "circle-stroke-width", marked ? ["case", inSet, 3, 1.5] : 1.5);
    map.setPaintProperty("campus-glow", "circle-opacity", marked ? ["case", inSet, 0.55, 0.08] : 0.38);
    if (marked) {
      frameCampuses(
        map,
        universities.filter((university) => ids.includes(university.id))
      );
    }
  }, [emphasizeKey, status, universities, hero, locked]);

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
    <div className={hero ? "h-[420px] w-full lg:h-full" : locked ? "h-full" : flush ? "" : "p-2"}>
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
      <div className={hero ? "hero-map relative h-[420px] w-full overflow-hidden lg:h-full" : locked ? "hero-map relative h-full w-full overflow-hidden" : "relative h-[min(62dvh,680px)] min-h-[420px] w-full overflow-hidden rounded-xl border border-line sm:min-h-[520px]"} style={{ background: hero ? "#3c3832" : MAP_THEME.sky }}>
        <div ref={containerRef} className="h-full w-full" />
        {hero && status === "ok" && heroMarks.map((mark) => {
          const hovered = highlightId === mark.id;
          if (!mark.hot && !hovered) return null;
          const color = mark.hot ? "#c5c9ff" : "#a8afff";
          const glow = mark.hot ? "rgba(197,201,255,0.85)" : "rgba(168,175,255,0.75)";
          const size = hovered && !mark.hot ? 34 : 26;
          return (
            <span
              key={`ring-${mark.id}`}
              className="pointer-events-none absolute z-10 rounded-full"
              style={{
                left: mark.x,
                top: mark.y,
                width: size,
                height: size,
                transform: "translate(-50%, -50%)",
                boxShadow: mark.hot
                  ? `0 0 0 2px ${color}, 0 0 0 5px rgba(197,201,255,0.35), 0 0 12px 3px ${glow}`
                  : `0 0 0 2px ${color}, 0 0 10px 3px ${glow}`,
              }}
            />
          );
        })}
        {hero && status === "ok" && heroPins.length > 0 && (
          <svg className="pointer-events-none absolute inset-0 z-20 h-full w-full" aria-hidden>
            {heroPins.map((pin) => {
              const dx = pin.lineX - pin.x;
              const dy = pin.lineY - pin.y;
              const len = Math.hypot(dx, dy) || 1;
              const start = Math.min(9, len * 0.3);
              return (
                <line
                  key={`leader-${pin.id}`}
                  x1={pin.x + (dx / len) * start}
                  y1={pin.y + (dy / len) * start}
                  x2={pin.lineX}
                  y2={pin.lineY}
                  stroke="#e6dfd4"
                  strokeWidth="1.25"
                />
              );
            })}
          </svg>
        )}
        {hero && status === "ok" && heroPins.map((pin) => (
          <span
            key={pin.id}
            className="pointer-events-none absolute z-20 whitespace-nowrap text-[14px] font-medium leading-4 text-fg"
            style={{ left: pin.labelX, top: pin.labelY, textShadow: "0 1px 2px #12110f, 0 0 8px #12110f" }}
          >
            <span className="block">{pin.name}</span>
            {pin.badge ? <span className="block text-[13px] text-link">new this week</span> : null}
          </span>
        ))}
        {locked && selectedUniversity && status === "ok" && (
          <div className="pointer-events-none absolute inset-0 z-10">
            <div className="absolute left-1/2 top-1/2 flex -translate-y-1/2 items-center">
              <span className="h-3 w-3 shrink-0 -translate-x-1/2 rounded-full bg-[#c5c9ff]" />
              <span className="ml-1.5 whitespace-nowrap text-[14px] font-medium text-fg" style={{ textShadow: "0 1px 2px #12110f" }}>
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
                if (hero && world) {
                  heroSizeRef.current = "";
                  const width = containerRef.current?.clientWidth ?? 0;
                  map.fitBounds(WORLD_BOUNDS, {
                    padding: width < 700 ? { top: 44, bottom: 36, left: 12, right: 12 } : { top: 44, bottom: 48, left: 20, right: 20 },
                    duration: 0,
                  });
                  return;
                }
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
