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
import type { UserMapMarker } from "@/lib/domain/user-pipeline";
import "maplibre-gl/dist/maplibre-gl.css";

// Real MapLibre GL JS globe projection + the free OpenFreeMap "positron"
// vector style — the exact stack dashboard.vclense.ch/ycglobe uses (studied
// directly from its page source), recolored here to this app's palette
// instead of their orange/cream theme. No API key needed (OpenFreeMap is a
// free, no-auth tile service).
const STYLE_URL = "https://tiles.openfreemap.org/styles/positron";

// Positron's OWN default colors are near-white by design (land
// rgb(242,243,240), water rgb(194,200,202) — verified against the live
// style JSON) — a minimalist basemap meant to sit under data, not to be
// looked at on its own at world zoom. It needs real contrast injected, not
// another pale tint layered on top, or it reads as a blank white circle
// (exactly what happened here the first time).
const MAP_THEME = {
  land: "#e6dcc8",
  landAlt: "#d9ceb6",
  ocean: "#c5cdc6",
  boundary: "#8a8478",
  labelText: "#1f1e1b",
  labelHalo: "#f7f6f1",
  sky: "#f7f6f1",
  horizon: "#d5d1c6",
  fog: "#f7f6f1",
  dot: "#a65d4e",
  arc: "#7a5c78",
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
}) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<CampusMap | null>(null);
  const [status, setStatus] = useState<"loading" | "ok" | "unsupported">("loading");
  const [geoMode, setGeoMode] = useState<"campus" | "hq">("campus");
  const [hoverTip, setHoverTip] = useState<{ id: string; x: number; y: number } | null>(null);
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
    spinPaused.current = Boolean(current.university) || geoMode === "hq";
  }, [basePath, current, geoMode, onNavigate]);

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
        map = new maplibregl.Map({
          container: containerRef.current,
          style: STYLE_URL,
          center: [-98, 39],
          zoom: 3.35,
          minZoom: 1.5,
          maxZoom: 8,
          attributionControl: { compact: true },
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
      resizeObserver = new ResizeObserver(() => map?.resize());
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

        trySet(() => map.setProjection({ type: "globe" }), "globe projection");
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

        for (const l of map.getStyle().layers) {
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
            trySet(() => map.setPaintProperty(l.id, "fill-opacity", 0.25), `landAlt-opacity:${l.id}`);
          }
          if (l.type === "line" && /boundary/.test(l.id)) {
            trySet(() => map.setPaintProperty(l.id, "line-color", MAP_THEME.boundary), `boundary:${l.id}`);
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
              cluster: true,
              clusterRadius: 48,
              clusterMaxZoom: 4,
              data: {
                type: "FeatureCollection",
                features: points.map((u) => ({
                  type: "Feature",
                  geometry: { type: "Point", coordinates: [u.lon, u.lat] },
                  properties: {
                    id: u.id,
                    name: shortCampusLabel(u.id, u.name),
                    count: u.companyCount,
                    founders: u.founderCount,
                  },
                })),
              },
            });
          }

          const unclustered = ["!", ["has", "point_count"]];
          if (!map.getLayer("campus-glow")) {
            map.addLayer({
              id: "campus-glow",
              type: "circle",
              source: "campuses",
              filter: unclustered,
              paint: {
                "circle-radius": ["interpolate", ["linear"], ["get", "count"], 0, 16, 20, 28, 200, 42],
                "circle-color": MAP_THEME.dot,
                "circle-opacity": 0.38,
                "circle-blur": 1,
              },
            });
          }

          if (!map.getLayer("campus-dots")) {
            map.addLayer({
              id: "campus-dots",
              type: "circle",
              source: "campuses",
              filter: unclustered,
              paint: {
                "circle-radius": ["interpolate", ["linear"], ["get", "count"], 0, 6, 20, 9, 200, 14],
                "circle-color": MAP_THEME.dot,
                "circle-stroke-width": 1.5,
                "circle-stroke-color": "#f7f6f1",
                "circle-opacity": 0.95,
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
                "circle-radius": ["interpolate", ["linear"], ["get", "point_count"], 2, 14, 6, 22],
                "circle-color": MAP_THEME.dot,
                "circle-opacity": 0.85,
                "circle-stroke-width": 1.5,
                "circle-stroke-color": "#f7f6f1",
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
                "text-size": 11,
              },
              paint: { "text-color": "#1f1e1b" },
            });
          }

          if (!map.getLayer("campus-selected")) {
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

          if (!map.getLayer("campus-labels")) {
            map.addLayer({
              id: "campus-labels",
              type: "symbol",
              source: "campuses",
              filter: unclustered,
              layout: {
                "text-field": ["concat", ["get", "name"], "  ", ["to-string", ["get", "count"]]],
                "text-size": 11,
                "text-offset": [0, 1.35],
                "text-anchor": "top",
              },
              paint: { "text-color": MAP_THEME.labelText, "text-halo-color": MAP_THEME.labelHalo, "text-halo-width": 1.2 },
            });
          }

          if (!map.getSource("campus-arcs") && campusArcs.length > 0) {
            const byId = new Map(points.map((u) => [u.id, u]));
            const features = campusArcs.flatMap((arc) => {
              const a = byId.get(arc.fromId);
              const b = byId.get(arc.toId);
              if (!a || a.lon == null || a.lat == null || !b || b.lon == null || b.lat == null) return [];
              return [{
                type: "Feature",
                geometry: { type: "LineString", coordinates: greatCircle([a.lon, a.lat], [b.lon, b.lat]) },
                properties: { count: arc.count },
              }];
            });
            map.addSource("campus-arcs", { type: "geojson", data: { type: "FeatureCollection", features } });
            map.addLayer({
              id: "campus-arcs",
              type: "line",
              source: "campus-arcs",
              paint: { "line-color": MAP_THEME.arc, "line-width": 1.4, "line-opacity": 0.55 },
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
          map.on("mouseenter", "campus-dots", () => (map.getCanvas().style.cursor = "pointer"));
          map.on("mousemove", "campus-dots", (e: MapEvent) => {
            const id = e.features?.[0]?.properties?.id;
            if (!id || !e.point) return;
            setHoverTip({ id, x: e.point.x, y: e.point.y });
          });
          map.on("mouseleave", "campus-dots", () => {
            map.getCanvas().style.cursor = "";
            setHoverTip(null);
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
          }, 1200);
        };
        map.on("dragstart", pauseSpin);
        map.on("wheel", pauseSpin);
        map.on("dragend", resumeSpin);
        let last = performance.now();
        let raf = 0;
        const tick = (now: number) => {
          if (cancelled) return;
          raf = requestAnimationFrame(tick);
          if (interacting || spinPaused.current || prefersReducedMotion()) {
            last = now;
            return;
          }
          const dt = Math.min(0.05, (now - last) / 1000);
          last = now;
          const center = map.getCenter();
          center.lng -= 2.4 * dt;
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
    map.getSource("campuses")?.setData?.({
      type: "FeatureCollection",
      features: placedPoints.map((u) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [u.lon, u.lat] },
        properties: {
          id: u.id,
          name: shortCampusLabel(u.id, u.name),
          count: u.companyCount,
          founders: u.founderCount,
        },
      })),
    });
    const arcFeatures = arcFeaturesFor(placedPoints, campusArcs);
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
          paint: { "line-color": MAP_THEME.arc, "line-width": 1.4, "line-opacity": 0.55 },
        });
      }
    }
    if (!current.university && !framedRef.current && placedPoints.length > 0) {
      framedRef.current = true;
      frameCampuses(map, placedPoints);
    }
  }, [universities, campusArcs, status, current.university]);

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
        map.flyTo({ center: [u.lon, u.lat], zoom: 4.4, duration: prefersReducedMotion() ? 0 : 1100, essential: true });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current.university, status]);

  const emphasizeKey = emphasizeIds.join(",");
  useEffect(() => {
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
  }, [emphasizeKey, status, universities]);

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
    for (const layer of ["campus-glow", "campus-dots", "campus-selected", "campus-labels", "campus-clusters", "campus-cluster-count", "campus-arcs", "user-added-icons"]) {
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
    <div className={flush ? "" : "p-2"}>
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
      <div className="relative h-[min(62dvh,680px)] min-h-[420px] w-full overflow-hidden rounded-2xl border border-border-c sm:min-h-[520px]" style={{ background: MAP_THEME.sky }}>
        <div ref={containerRef} className="h-full w-full" />
        {status === "ok" && (
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
        {geoMode === "hq" && status === "ok" && (
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

        {geoMode === "campus" && selectedUniversity && status === "ok" && (
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

        {status === "ok" && (
          <div className="absolute bottom-3 right-3 z-10 flex flex-col gap-1">
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
      {status === "ok" && (
        <p className="viz-legend">
          {geoMode === "campus"
            ? "Dot size follows candidate count. A ring marks the campus in view."
            : "A company is plotted only when a source gives coordinates."}
        </p>
      )}
      {status === "ok" && <ResultTray docked candidates={trayCandidates} basePath={basePath} current={current} />}
      <div className="mt-3 sm:hidden">
        <UniversityListFallback universities={universities} basePath={basePath} current={current} compact />
        {selectedUniversity && (
          <div className="mt-2">
            <CampusBenchmarks pitchbook={selectedUniversity.pitchbook} hitRate={selectedUniversity.hitRate} />
          </div>
        )}
      </div>
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

function arcFeaturesFor(points: UniversitySummary[], campusArcs: CampusArc[]) {
  const byId = new Map(points.map((u) => [u.id, u]));
  return campusArcs.flatMap((arc) => {
    const a = byId.get(arc.fromId);
    const b = byId.get(arc.toId);
    if (!a || a.lon == null || a.lat == null || !b || b.lon == null || b.lat == null) return [];
    return [{
      type: "Feature",
      geometry: { type: "LineString", coordinates: greatCircle([a.lon, a.lat], [b.lon, b.lat]) },
      properties: { count: arc.count },
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
  const u = universities.find((x) => x.id === tip.id);
  if (!u) return null;
  return (
    <div
      className="glass-panel pointer-events-none absolute z-10 px-2.5 py-1.5 text-xs"
      style={{ left: tip.x + 12, top: tip.y - 8 }}
    >
      <p className="font-medium text-foreground">{shortCampusLabel(u.id, u.name)}</p>
      <p className="text-muted" style={{ fontVariantNumeric: "tabular-nums" }}>
        {u.companyCount} companies · {u.founderCount} founders · {u.sourcesConfigured} sources
      </p>
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
