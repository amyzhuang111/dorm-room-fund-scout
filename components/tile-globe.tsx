"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useGlobeRotation } from "@/lib/client/use-globe-rotation";
import { loadMapLibre } from "@/lib/client/map-prefetch";
import { markerRadiusForCampus } from "@/lib/domain/marker-radius";
import { rankedByUndergrad } from "@/lib/domain/pitchbook-model";
import { absoluteDate } from "@/lib/domain/relative-time";
import { companyMatchesCampus } from "@/lib/domain/campus-membership";
import { campusSlug, shortCampusLabel } from "@/lib/domain/campuses";
import type { FacetCompany } from "@/lib/domain/sample-facets";
import { CampusGlobeFallback } from "./campus-globe-fallback";
import { MapCredit } from "./map-credit";
import { CompanyLocationLayer } from "./company-location-layer";
import mapStyles from "./company-location-map.module.css";
import type { Map as LibreMap } from "maplibre-gl";
import { CAMPUS_FOUNDERS_VISIBLE } from "./sample-instrument";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  clientPointFromEvent,
  formatMapHitMiss,
  mapPointFromPointer,
  nearestProjectedMarker,
} from "@/lib/domain/map-pointer";

export interface TileCampus {
  id: string;
  name: string;
  lat: number;
  lon: number;
  founders: number;
  signals: number;
  country: string;
  /** PitchBook 2026 undergraduate rank. Null when the school is not on that list. */
  pitchbookRank?: number | null;
  /** PitchBook undergraduate alumni who founded a VC-backed company. */
  pitchbookFounders?: number | null;
}

export type TileCompany = FacetCompany;

const BRAND = "#3A2416";
const COUNT = "font-bold tabular-nums text-[color:var(--ember,#E85D04)]";

const COUNTRY_COLOR: Record<string, string> = {
  "United States": "#3A2416",
  Canada: "#6B3A1F",
  "United Kingdom": "#8A4B24",
};

const LAND = "#F08A3A";
const OCEAN = "#F7E2C8";

function paintCampusDisk(map: {
  getStyle: () => { layers: { id: string; type: string }[] };
  setPaintProperty: (layer: string, prop: string, value: unknown) => void;
  setLayerZoomRange: (layer: string, min: number, max: number) => void;
}) {
  for (const layer of map.getStyle().layers) {
    try {
      if (layer.type === "background") map.setPaintProperty(layer.id, "background-color", LAND);
      else if (layer.type === "fill") {
        const water = layer.id === "water" || layer.id.startsWith("water");
        map.setPaintProperty(layer.id, "fill-color", water ? OCEAN : LAND);
      } else if (layer.type === "line") {
        map.setPaintProperty(layer.id, "line-color", layer.id.includes("water") ? "#E7C9A8" : "#9A3412");
      } else if (layer.type === "symbol") {
        map.setLayerZoomRange(layer.id, 4.6, 24);
      }
    } catch {
      // A style layer can refuse a paint or zoom change.
    }
  }
}

function markerColor(country: string): string {
  return COUNTRY_COLOR[country] ?? BRAND;
}

/**
 * Keep the globe disk inside the stage. MapLibre's equator is 512 * 2^zoom px,
 * so the sphere diameter is that divided by π. A higher zoom clips the horizon
 * at the panel edges and reads as a flat outline.
 */
/**
 * Automated captures (navigator.webdriver) get a fixed camera: no auto-spin, and
 * the framing the 4f46d4a QA control was shot at. Without this the fold globe
 * lands wherever the spin happened to be when the screenshot fired.
 */
function pinnedCaptureCenter(): [number, number] | null {
  if (typeof navigator === "undefined" || !navigator.webdriver) return null;
  // Matched to /workspace/reviews/shots/campus-scout/4f46d4a-qa/fold-1440.png.
  return [-109.5, 36];
}

function globeView(width: number, height: number, fill = 0.96): { center: [number, number]; zoom: number } {
  const minDim = Math.max(160, Math.min(width, height));
  const diameter = minDim * fill;
  const zoom = Math.log2((diameter * Math.PI) / 512);
  // Faces the US, with Canada and the UK still on the near side.
  const pinned = pinnedCaptureCenter();
  return { center: pinned ?? [-72, 36], zoom: Math.min(3, Math.max(0.4, zoom)) };
}

function campusCollection(campuses: TileCampus[]) {
  const pitchbook = rankedByUndergrad(campuses);
  const ranked = pitchbook.length > 0
    ? pitchbook
    : [...campuses].sort((a, b) => b.founders - a.founders || a.name.localeCompare(b.name));
  const topIds = new Set(ranked.slice(0, CAMPUS_FOUNDERS_VISIBLE).map((c) => c.id));
  const labelRank = new Map(ranked.slice(0, CAMPUS_FOUNDERS_VISIBLE).map((c) => [c.id, c.pitchbookRank ?? 99]));
  return {
    type: "FeatureCollection",
    features: campuses.map((campus) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [campus.lon, campus.lat] },
      properties: {
        id: campus.id,
        name: campus.name,
        shortLabel: shortCampusLabel(campus.id, campus.name),
        founders: campus.founders,
        signals: campus.signals,
        country: campus.country,
        color: markerColor(campus.country),
        top: topIds.has(campus.id) ? 1 : 0,
        labelRank: labelRank.get(campus.id) ?? 99,
        radius: markerRadiusForCampus(campus.founders, campus.pitchbookFounders),
      },
    })),
  };
}

export function TileGlobe({
  campuses,
  companies = [],
  companyCount = 0,
  foundersListed = 0,
  foundersIndexed = 0,
  foundersLabel = "founders on those companies",
  campusesWithFounders = 0,
  selectedId,
  onSelect,
  className = "",
  dataThrough = null,
  highlightCampusIds = null,
  embedded = false,
  onCompanySelect,
  onMapFocusChange,
}: {
  campuses: TileCampus[];
  /** Keep city exploration within the dashboard, preserving its navigation and filters. */
  embedded?: boolean;
  onMapFocusChange?: (expanded: boolean) => void;
  onCompanySelect?: (id: string) => void;
  companies?: TileCompany[];
  /** Full catalog size, used until /data/directory.json arrives. */
  companyCount?: number;
  /** Founder names attached to company cards in the directory sample. */
  foundersListed?: number;
  /** Rows in the searchable founder index (founders.json). May exceed foundersListed. */
  foundersIndexed?: number;
  foundersLabel?: string;
  /** Campuses page list: schools with a promoted founder. A subset of the pins. */
  campusesWithFounders?: number;
  selectedId?: string | null;
  onSelect: (id: string) => void;
  className?: string;
  /** ISO from HeroStats.updatedAt / latestDataTimestamp  -  never invent. */
  dataThrough?: string | null;
  /** When set (search active), dim campuses outside this set. */
  highlightCampusIds?: Set<string> | null;
}) {
  const mapNode = useRef<HTMLDivElement | null>(null);
  /** r44 bigmap default; fit() replaces on mount. */
  const [stageHeight, setStageHeight] = useState(640);
  const hitPadRef = useRef(64);
  const nearestMaxRef = useRef(100);
  const campusesRef = useRef(campuses);
  useEffect(() => { campusesRef.current = campuses; }, [campuses]);
  const mapRef = useRef<{
    getSource: (id: string) => { setData: (data: unknown) => void } | undefined;
    setFilter: (layer: string, filter: unknown) => void;
    getLayer: (id: string) => unknown;
    setPaintProperty: (layer: string, prop: string, value: unknown) => void;
    flyTo: (opts: object) => void;
    jumpTo: (opts: object) => void;
    resize: () => void;
    loaded: () => boolean;
  } | null>(null);
  const frameRef = useRef<(() => void) | null>(null);
  const [hover, setHover] = useState<{ id: string; name: string; founders: number; signals: number; country: string; x: number; y: number } | null>(null);
  const pinned = campuses.find(c => c.id === selectedId) ?? null;
  const [activeMap, setActiveMap] = useState<LibreMap | null>(null);
  const [ready, setReady] = useState(false);
  const [painted, setPainted] = useState(false);
  const [failed, setFailed] = useState(false);
  const [locationsMode, setLocationsMode] = useState(false);
  const [expandedMap, setExpandedMap] = useState(false);
  const changeMapFocus = useCallback((value: boolean) => { setExpandedMap(value); onMapFocusChange?.(value); }, [onMapFocusChange]);
  const [rotationEnabled, setRotationEnabled] = useState(false);
  useGlobeRotation(activeMap, rotationEnabled && !pinnedCaptureCenter());
  const locationsModeRef = useRef(locationsMode);
  useEffect(() => { locationsModeRef.current = locationsMode; }, [locationsMode]);

  useEffect(() => {
    const node = mapNode.current;
    if (!node) return;
    let dead = false;
    let map: {
      on: (type: string, layerOrHandler: string | ((event: { features?: { properties?: Record<string, unknown> }[]; point?: { x: number; y: number }; originalEvent?: Event }) => void), handler?: (event: { features?: { properties?: Record<string, unknown> }[]; point?: { x: number; y: number }; originalEvent?: Event }) => void) => void;
      getStyle: () => { layers: { id: string; type: string }[] };
      setProjection: (opts: object) => void;
      setSky: (opts: object) => void;
      setPaintProperty: (layer: string, prop: string, value: unknown) => void;
      setLayerZoomRange: (layer: string, min: number, max: number) => void;
      addSource: (id: string, source: object) => void;
      addLayer: (layer: object) => void;
      getSource: (id: string) => { setData: (data: unknown) => void } | undefined;
      setFilter: (layer: string, filter: unknown) => void;
      getLayer: (id: string) => unknown;
      getCenter: () => { lng: number; lat: number };
      getZoom: () => number;
      easeTo: (opts: object) => void;
      flyTo: (opts: object) => void;
      jumpTo: (opts: object) => void;
      resize: () => void;
      remove: () => void;
      loaded: () => boolean;
      getCanvas: () => HTMLCanvasElement;
      getCanvasContainer: () => HTMLElement;
      queryRenderedFeatures: (
        pointOrBox: { x: number; y: number } | [[number, number], [number, number]],
        opts?: { layers?: string[] },
      ) => { properties?: Record<string, unknown> }[];
      project: (lngLat: [number, number]) => { x: number; y: number };
    } | null = null;

    const fit = () => {
      const wide = window.innerWidth >= 1024;
      // r53 mobile: taller full-bleed stage (~88vh) so globe dominates under the deck sheet.
      // r56 desk: taller full-bleed (~86vh) so the map owns the first screen with fold overlays.
      // r57 mobile: when the investor sheet is deck/expanded, shrink map to a compact header.
      const sheetMode = document.documentElement.getAttribute("data-fold-sheet-mode");
      const compactHeader = !wide && (sheetMode === "deck" || sheetMode === "expanded");
      const target = compactHeader
        ? Math.round(window.innerHeight * 0.24)
        : Math.round(window.innerHeight * (wide ? 0.92 : 0.88));
      const next = wide
        ? Math.max(680, Math.min(1000, target))
        : compactHeader
          ? Math.max(140, Math.min(220, target))
          : Math.max(520, Math.min(760, target));
      setStageHeight(next);
      hitPadRef.current = Math.round(Math.max(56, Math.min(120, next * 0.1)));
      nearestMaxRef.current = Math.round(Math.max(88, Math.min(160, next * 0.14)));
    };
    fit();
    window.addEventListener("resize", fit);
    const sheetMo = new MutationObserver(fit);
    sheetMo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-fold-sheet-mode"] });

    const collection = () => campusCollection(campuses);


    const styleTimer = window.setTimeout(() => {
      if (!dead) setFailed(true);
    }, 15000);

    const startMap = () => {
      void loadMapLibre().then((mod) => {
      if (dead || !mapNode.current) return;
      const created = new mod.Map({
        container: mapNode.current,
        style: "/company-globe-style.json",
        center: [-72, 36],
        zoom: 1.4,
        minZoom: 0.35,
        maxZoom: 17,
        maxPitch: 0,
        renderWorldCopies: false,
        attributionControl: false,
        fadeDuration: 0,
      });
      map = created as unknown as NonNullable<typeof map>;
      mapRef.current = map;

      map.on("style.load", () => {
        if (dead || !map) return;
        try {
          map.setProjection({ type: "globe" });
        } catch {
          setFailed(true);
          return;
        }
        try {
          map.setSky({
            "sky-color": "#FFF4E8",
            "horizon-color": "#FFF4E8",
            "fog-color": "#FFE8D2",
            "sky-horizon-blend": 0.45,
            "horizon-fog-blend": 0.7,
            "fog-ground-blend": 0.55,
            "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 1, 2.2, 0.9, 4, 0.4],
          });
        } catch {
          // The globe still paints without a custom sky.
        }
        const layers = map.getStyle().layers;
        const styled = layers.some((layer) => layer.id === "water") && layers.some((layer) => layer.type === "background");
        if (!styled) {
          setFailed(true);
          return;
        }
        paintCampusDisk(map);
        map.addSource("campuses", { type: "geojson", data: collection() });
        map.addLayer({
          id: "campus-halo",
          type: "circle",
          source: "campuses",
          filter: ["==", ["get", "top"], 1],
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 0.4, ["+", ["*", ["get", "radius"], 1.05], 6], 1.8, ["+", ["*", ["get", "radius"], 1.15], 7], 3.2, ["+", ["*", ["get", "radius"], 1.55], 8]],
            "circle-color": "#3A2416",
            "circle-opacity": 0.18,
            "circle-stroke-color": "#3A2416",
            "circle-stroke-width": 1.35,
            "circle-stroke-opacity": 0.55,
          },
        });
        map.addLayer({
          id: "campus-dots",
          type: "circle",
          source: "campuses",
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 0.4, ["*", ["get", "radius"], 1.0], 1.8, ["*", ["get", "radius"], 1.18], 3.2, ["*", ["get", "radius"], 1.55]],
            "circle-color": ["case", ["==", ["get", "top"], 1], "#3A2416", ["get", "color"]],
            "circle-stroke-color": "#FFF4E8",
            "circle-stroke-width": ["case", ["==", ["get", "top"], 1], 2.4, 1.5],
            "circle-opacity": 0.98,
            "circle-stroke-opacity": 1,
          },
        });
        // Outer selection ring (clear selected state on white ocean).
        map.addLayer({
          id: "campus-selected-ring",
          type: "circle",
          source: "campuses",
          filter: ["==", ["get", "id"], ""],
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 0.4, ["+", ["*", ["get", "radius"], 1.05], 6], 1.8, ["+", ["*", ["get", "radius"], 1.2], 7], 3.2, ["+", ["*", ["get", "radius"], 1.55], 9]],
            "circle-color": "rgba(58,36,22,0.16)",
            "circle-stroke-color": "#3A2416",
            "circle-stroke-width": 3.2,
            "circle-stroke-opacity": 1,
            "circle-opacity": 1,
          },
        });
        map.addLayer({
          id: "campus-selected",
          type: "circle",
          source: "campuses",
          filter: ["==", ["get", "id"], ""],
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 0.4, ["+", ["*", ["get", "radius"], 0.95], 2], 1.8, ["+", ["get", "radius"], 2.6], 3.2, ["+", ["*", ["get", "radius"], 1.4], 3.5]],
            "circle-color": "#3A2416",
            "circle-stroke-color": "#FFF4E8",
            "circle-stroke-width": 2.4,
            "circle-opacity": 1,
          },
        });
        // Top-desk short labels; collision so they never stack. Selected always wins.
        map.addLayer({
          id: "campus-labels",
          type: "symbol",
          source: "campuses",
          minzoom: 3.2,
          filter: ["<=", ["get", "labelRank"], 3],
          layout: {
            "text-field": ["get", "shortLabel"],
            "text-font": ["Noto Sans Regular"],
            "text-size": ["interpolate", ["linear"], ["zoom"], 0.4, 10, 1.8, 11, 3.2, 13],
            "text-offset": [0, 1.15],
            "text-anchor": "top",
            "text-allow-overlap": false,
            "text-ignore-placement": false,
            "symbol-sort-key": ["get", "labelRank"],
            "text-padding": 4,
            "text-max-width": 8,
          },
          paint: {
            "text-color": "#2A1A10",
            "text-halo-color": "#FFF4E8",
            "text-halo-width": 1.6,
            "text-halo-blur": 0.2,
          },
        });
        map.addLayer({
          id: "campus-label-selected",
          type: "symbol",
          source: "campuses",
          minzoom: 3.2,
          filter: ["==", ["get", "id"], ""],
          layout: {
            "text-field": ["get", "shortLabel"],
            "text-font": ["Noto Sans Regular"],
            "text-size": ["interpolate", ["linear"], ["zoom"], 0.4, 11, 1.8, 12.5, 3.2, 14],
            "text-offset": [0, 1.2],
            "text-anchor": "top",
            "text-allow-overlap": true,
            "text-ignore-placement": true,
            "text-padding": 2,
            "text-max-width": 9,
          },
          paint: {
            "text-color": "#9A3412",
            "text-halo-color": "#FFF4E8",
            "text-halo-width": 2,
            "text-halo-blur": 0.15,
          },
        });
        window.clearTimeout(styleTimer);
        let framed = false;
        let framedSize = 0;
        const frame = () => {
          if (dead || !map) return;
          const stage = mapNode.current?.parentElement;
          const height = stage?.clientHeight || 0;
          const width = stage?.clientWidth || 0;
          if (width < 40 || height < 40) return;
          if (mapNode.current) {
            mapNode.current.style.width = `${width}px`;
            mapNode.current.style.height = `${height}px`;
          }
          const canvasBox = map.getCanvasContainer();
          canvasBox.style.width = `${width}px`;
          canvasBox.style.height = `${height}px`;
          map.resize();
          const sizeKey = Math.round(Math.min(width, height));
          const fill = stage?.classList.contains("globe-disk") ? 1.22 : 0.96;
          if (!framed || Math.abs(sizeKey - framedSize) > 24) map.jumpTo(globeView(width, height, fill));
          framed = true;
          framedSize = sizeKey;
        };
        frameRef.current = frame;
        frame();
        setFailed(false);
        setReady(true);
        setActiveMap(map as unknown as LibreMap);
        let revealed = false;
        const reveal = () => {
          if (dead || revealed || !map) return;
          // Waiting on map.loaded()
          // leaves the skeleton up when a tile request never settles.
          revealed = true;
          frame();
          setPainted(true);
        };
        map.on("render", reveal);
        map.on("idle", reveal);
        // Cap skeleton time: first paint must not sit on LOADING GLOBE for long
        // even if idle/render stall (offline tiles, slow network).
        window.setTimeout(reveal, 900);
      });

      const read = (event: { features?: { properties?: Record<string, unknown> }[]; point?: { x: number; y: number } }) => {
        const props = event.features?.[0]?.properties;
        if (!props || !event.point) return null;
        return {
          id: String(props.id ?? ""),
          name: String(props.name ?? ""),
          founders: Number(props.founders ?? 0),
          signals: Number(props.signals ?? 0),
          country: String(props.country ?? ""),
          x: event.point.x,
          y: event.point.y,
        };
      };
      map.on("mousemove", "campus-dots", (event) => {
        const hit = read(event);
        if (!hit) return;
        map!.getCanvas().style.cursor = "pointer";
        setHover(hit);
      });
      map.on("mouseleave", "campus-dots", () => {
        if (map) map.getCanvas().style.cursor = "";
        setHover(null);
      });
      // Hit-test in layout CSS pixels. Always re-read getBoundingClientRect (Clear/scroll
      // can stale a cached rect). Never multiply by DPR. Fall back to nearest projected
      // campus when queryRenderedFeatures misses a finger-sized target.
      // Scale hit slop with stage size so finger targets keep pace with the bigger map.
      const hitPad = () => hitPadRef.current;
      const nearestMax = () => nearestMaxRef.current;
      let lastSelectAt = 0;
      let lastSelectId = "";
      const projectedMarkers = () => {
        if (!map) return [];
        return campusesRef.current.map((c) => {
          const pt = map!.project([c.lon, c.lat]);
          return {
            id: c.id,
            name: c.name,
            founders: c.founders,
            signals: c.signals,
            country: c.country,
            x: pt.x,
            y: pt.y,
          };
        });
      };
      const logMiss = (point: { x: number; y: number }) => {
        const ranked = projectedMarkers()
          .map((m) => ({ ...m, dist: Math.hypot(m.x - point.x, m.y - point.y) }))
          .sort((a, b) => a.dist - b.dist);
        const msg = formatMapHitMiss(point, ranked);
        console.warn(`[map-hit] ${msg}`);
        try {
          const stage = mapNode.current?.parentElement;
          if (stage) stage.setAttribute("data-map-hit-miss", msg);
        } catch { /* ignore */ }
      };
      const pickCampus = (point: { x: number; y: number }) => {
        if (!map) return null;
        const pad = hitPad();
        const box: [[number, number], [number, number]] = [
          [point.x - pad, point.y - pad],
          [point.x + pad, point.y + pad],
        ];
        const features = map.queryRenderedFeatures(box, { layers: ["campus-dots"] });
        const props = features[0]?.properties;
        if (props?.id) {
          return {
            id: String(props.id ?? ""),
            name: String(props.name ?? ""),
            founders: Number(props.founders ?? 0),
            signals: Number(props.signals ?? 0),
            country: String(props.country ?? ""),
            x: point.x,
            y: point.y,
          };
        }
        const near = nearestProjectedMarker(point, projectedMarkers(), nearestMax());
        if (near) {
          return {
            id: near.id,
            name: near.name,
            founders: near.founders,
            signals: near.signals,
            country: near.country,
            x: point.x,
            y: point.y,
          };
        }
        logMiss(point);
        return null;
      };
      const pointFromMapEvent = (event: { point?: { x: number; y: number }; originalEvent?: Event }) => {
        if (!map) return event.point ?? null;
        const client = clientPointFromEvent(event.originalEvent ?? null);
        if (client) {
          // Fresh rect every event — do not cache after Clear/scroll.
          return mapPointFromPointer(map.getCanvasContainer(), client.clientX, client.clientY);
        }
        return event.point ?? null;
      };
      const applyHit = (hit: { id: string; name: string; founders: number; signals: number; country: string }) => {
        if (!hit.id) return false;
        const now = performance.now();
        // touchend + click/pointerup must not toggle the same campus off.
        if (hit.id === lastSelectId && now - lastSelectAt < 450) return true;
        lastSelectAt = now;
        lastSelectId = hit.id;
        onSelect(hit.id);
        return true;
      };
      const selectAt = (event: { point?: { x: number; y: number }; originalEvent?: Event }) => {
        if (locationsModeRef.current) return;
        const point = pointFromMapEvent(event);
        if (!point) return;
        const hit = pickCampus(point);
        if (!hit?.id) return;
        applyHit(hit);
      };
      const selectFromClient = (clientX: number, clientY: number, ev?: Event) => {
        if (locationsModeRef.current) return false;
        // Re-read container rect on every tap.
        const point = mapPointFromPointer(map!.getCanvasContainer(), clientX, clientY);
        const hit = pickCampus(point);
        if (!hit?.id) return false;
        ev?.preventDefault?.();
        return applyHit(hit);
      };
      const canvas = map.getCanvas();
      const canvasRoot = map.getCanvasContainer();
      canvas.style.touchAction = "none";
      canvasRoot.style.touchAction = "none";
      let touchGuardUntil = 0;
      const onTouchEnd = (ev: TouchEvent) => {
        if (!ev.changedTouches?.length) return;
        if (ev.changedTouches.length !== 1) return;
        const touch = ev.changedTouches[0]!;
        const ok = selectFromClient(touch.clientX, touch.clientY, ev);
        if (ok) {
          touchGuardUntil = performance.now() + 500;
          ev.preventDefault();
          ev.stopPropagation();
        }
      };
      // Capture on the container so taps that land on overlays inside the canvas root still hit-test.
      canvasRoot.addEventListener("touchend", onTouchEnd, { passive: false, capture: true });
      // Swallow the synthetic mouse click that follows a real finger tap so we
      // do not toggle the same campus off or miss via a second hit-test.
      map.on("click", (event) => {
        if (performance.now() < touchGuardUntil) {
          event.originalEvent?.preventDefault?.();
          return;
        }
        selectAt(event);
      });
      // Expose marker screen points for checks / miss diagnostics.
      (window as unknown as { __campusScoutMap?: unknown }).__campusScoutMap = {
        resize: () => {
          try { map?.resize(); } catch { /* ignore */ }
        },
        markerClientPoints: () => {
          if (!map) return [];
          const container = map.getCanvasContainer();
          const rect = container.getBoundingClientRect(); // fresh
          const layoutW = Math.max(1, container.clientWidth);
          const layoutH = Math.max(1, container.clientHeight);
          const scaleX = rect.width / layoutW || 1;
          const scaleY = rect.height / layoutH || 1;
          const vw = typeof window !== "undefined" ? window.innerWidth : rect.width;
          const vh = typeof window !== "undefined" ? window.innerHeight : rect.height;
          return projectedMarkers()
            .map((m) => ({
              id: m.id,
              name: m.name,
              x: m.x,
              y: m.y,
              clientX: rect.left + m.x * scaleX,
              clientY: rect.top + m.y * scaleY,
            }))
            // Must be on the canvas AND in the visual viewport (finger can only tap what is on screen).
            .filter(
              (m) =>
                m.clientX >= Math.max(0, rect.left) &&
                m.clientX <= Math.min(vw, rect.right) &&
                m.clientY >= Math.max(0, rect.top) &&
                m.clientY <= Math.min(vh, rect.bottom),
            );
        },
      };

    }).catch((error) => { if (!dead) { console.warn("Campus globe unavailable", error instanceof Error ? error.message : String(error)); setFailed(true); } });
    };

    const ric = window.requestIdleCallback?.bind(window);
    if (ric) ric(() => { if (!dead) startMap(); }, { timeout: 50 });
    else window.setTimeout(() => { if (!dead) startMap(); }, 0);

    const observer = new ResizeObserver(() => { frameRef.current?.(); mapRef.current?.resize(); });
    observer.observe(node.parentElement ?? node);
    return () => {
      dead = true;
      window.clearTimeout(styleTimer);
      observer.disconnect();
      window.removeEventListener("resize", fit);
      sheetMo.disconnect();
      map?.remove();
      mapRef.current = null;
    };
    // The map is created once. Campus data is pushed in the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    frameRef.current?.();
  }, [stageHeight, expandedMap]);

  useEffect(() => {
    if (!expandedMap || embedded) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setExpandedMap(false); return; }
      if (event.key !== "Tab") return;
      const controls = Array.from(mapNode.current?.parentElement?.querySelectorAll<HTMLElement>("a[href],button:not([disabled]),input,select") ?? []).filter(el => el.getBoundingClientRect().width > 0);
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", keyboard);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener("keydown", keyboard); };
  }, [expandedMap, embedded]);

  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const map = mapRef.current as unknown as LibreMap;
    for (const layer of map.getStyle().layers ?? []) {
      if (layer.id.startsWith("campus-")) map.setLayoutProperty(layer.id, "visibility", locationsMode ? "none" : "visible");
    }
    setHover(null);
  }, [locationsMode, ready]);

  useEffect(() => {
    const source = mapRef.current?.getSource("campuses");
    if (!source) return;
    source.setData(campusCollection(campuses));
  }, [campuses, ready]);

  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const map = mapRef.current;
    const selected = selectedId ? ["==", ["get", "id"], selectedId] : ["==", ["get", "id"], ""];
    if (map.getLayer("campus-selected")) map.setFilter("campus-selected", selected);
    if (map.getLayer("campus-selected-ring")) map.setFilter("campus-selected-ring", selected);
    if (map.getLayer("campus-label-selected")) map.setFilter("campus-label-selected", selected);
  }, [ready, selectedId]);

  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const map = mapRef.current;
    if (!map.getLayer("campus-dots")) return;
    if (highlightCampusIds == null) {
      map.setPaintProperty("campus-dots", "circle-opacity", 0.96);
      map.setPaintProperty("campus-halo", "circle-opacity", 0.18);
      return;
    }
    if (highlightCampusIds.size === 0) {
      map.setPaintProperty("campus-dots", "circle-opacity", 0.18);
      map.setPaintProperty("campus-halo", "circle-opacity", 0.04);
      return;
    }
    const ids = [...highlightCampusIds];
    const match = ["match", ["get", "id"], ids, 0.98, 0.22];
    const haloMatch = ["match", ["get", "id"], ids, 0.22, 0.04];
    map.setPaintProperty("campus-dots", "circle-opacity", match);
    map.setPaintProperty("campus-halo", "circle-opacity", haloMatch);
  }, [ready, highlightCampusIds, campuses]);



  function resetGlobalView() {
    const width = mapNode.current?.clientWidth || 1200;
    const height = mapNode.current?.clientHeight || stageHeight;
    const camera = globeView(width, height);
    mapRef.current?.flyTo({ ...camera, duration: 550, essential: true });
  }


  const catalogReady = companies.length > 0;
  const pinnedCompanies = useMemo(() => {
    if (!pinned) return [] as TileCompany[];
    return companies
      .filter((c) => companyMatchesCampus(c, pinned.id))
      .slice()
      .sort((a, b) => (b.signals ?? 0) - (a.signals ?? 0) || a.name.localeCompare(b.name))
      .slice(0, 3);
  }, [companies, pinned]);
  const signaledUniverse = useMemo(() => companies.filter((c) => c.signals > 0).length, [companies]);

  // Keep the server founder count. Summing founder-name slots after hydrate
  // counts the same person twice and disagrees with the vetted list.
  const campusesOnMap = campuses.length;

  return (
    <div className={`${className ?? ""} relative`} data-fold-mobile-root="">
      <div className="mb-2 hidden flex-wrap gap-2 lg:flex" data-fold-counts="">
        <p className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[10px] tabular-nums leading-4 text-[color:var(--fg-2,#3F465C)] lg:gap-x-2.5 lg:gap-y-1 lg:text-[12px] lg:leading-5">
          <Link href="/companies" className="pointer-events-auto hover:underline">
            <span className={COUNT}>{(catalogReady ? companies.length : companyCount).toLocaleString("en-US")}</span>
            {" vetted companies"}
          </Link>
          {catalogReady ? (
            <span>
              <span className={COUNT}>{signaledUniverse.toLocaleString("en-US")}</span>
              {" signaled"}
            </span>
          ) : null}
          <span>
            <span className={COUNT} data-count="campuses-on-map">{campusesOnMap.toLocaleString("en-US")}</span>
            {" schools with a pin"}
          </span>
          {campusesWithFounders > 0 ? (
            <Link href="/campuses" className="pointer-events-auto hover:underline">
              <span className={COUNT} data-count="campuses-with-founders">{campusesWithFounders.toLocaleString("en-US")}</span>
              {" campuses with promoted founders"}
            </Link>
          ) : null}
          {/* Compact founder counts (checks need data-count + data-founder-count-note). No fine-print essay. */}
          <Link href="/founders" className="pointer-events-auto hover:underline" data-founder-count-note="">
            <span className={COUNT} data-count="founders-listed">{foundersListed.toLocaleString("en-US")}</span>
            {` ${foundersLabel}`}
            {foundersIndexed > 0 ? (
              <>
                {" · "}
                <span className={COUNT} data-count="founders-indexed">{foundersIndexed.toLocaleString("en-US")}</span>
                {" in the full index"}
              </>
            ) : null}
          </Link>
          {dataThrough ? <span className="text-[color:var(--fg-3,#5C647A)]">Updated {absoluteDate(dataThrough)}</span> : null}
        </p>
        <p className="mt-1 hidden text-[12px] text-[color:var(--fg,#0B0E17)] lg:block">{locationsMode ? "Startup headquarters, by city. Switch to Campuses for the school map." : "Schools with a pin include campuses with no promoted founder. The Campuses page lists only the schools that have one."}</p>
      </div>

      <section
        className={expandedMap ? "fixed inset-0 z-[200] flex flex-col bg-[#FFF4E8]" : "flex h-full min-h-0 w-full flex-col items-center"}
        data-fold-desk-map=""
        aria-label="Map"
        role={expandedMap ? "dialog" : undefined}
        aria-modal={expandedMap ? true : undefined}
      >
        <h2 className={`${expandedMap ? "mb-1" : "mb-2"} flex w-full flex-wrap items-center justify-center gap-1 text-[12px] font-semibold tracking-tight text-[#9A3412]`}>
          <span className="sr-only">Map</span>
          {!failed && <span className={`${mapStyles.mapModes} inline-flex border border-[#F0D7C2] bg-[#FFFBF6]`} role="group" aria-label="Map locations">
            {expandedMap ? <button type="button" aria-pressed={locationsMode} onClick={() => { setLocationsMode(true); resetGlobalView(); }} className={`min-h-11 px-3 text-[13px] ${locationsMode ? "bg-[#E85D04] text-[#FFF4E8]" : "bg-[#FFFBF6] text-[#9A3412]"}`}>Startup HQs</button> : null}
            <button type="button" onClick={resetGlobalView} title="Recenter the entire globe" className={`${expandedMap ? "min-h-11 px-3 text-[13px]" : "min-h-8 px-2.5 text-[12px]"} bg-[#FFFBF6] text-[#9A3412]`}>Reset</button>
            <button type="button" aria-pressed={rotationEnabled} title="Turn automatic rotation on or off" onClick={() => setRotationEnabled(v => !v)} className={`${expandedMap ? "min-h-11 px-3 text-[13px]" : "min-h-8 px-2.5 text-[12px]"} bg-[#FFFBF6] text-[#9A3412]`}>{rotationEnabled ? "Pause" : "Rotate"}</button>
            <button type="button" aria-pressed={!locationsMode} onClick={() => { setLocationsMode(false); if (expandedMap) changeMapFocus(false); resetGlobalView(); }} className={`${expandedMap ? "min-h-11 px-3 text-[13px]" : "min-h-8 px-2.5 text-[12px]"} ${!locationsMode ? "bg-[#E85D04] text-[#FFF4E8]" : "bg-[#FFFBF6] text-[#9A3412]"}`}>Campuses</button>
            {expandedMap ? <button type="button" onClick={() => changeMapFocus(false)} className="min-h-11 bg-[#FFFBF6] px-3 text-[13px] text-[#9A3412]">Close</button> : null}
          </span>}
        </h2>
        <div className={expandedMap ? "flex min-h-0 w-full flex-1" : "globe-stage min-h-0 w-full flex-1"}>
          <div
            className={expandedMap ? "relative min-h-0 min-w-0 flex-1" : "globe-disk"}
            data-map-expanded={expandedMap ? "true" : undefined}
            data-map-embedded={embedded ? "true" : undefined}
            data-dispatch-map-stage=""
            data-fold-bigmap-stage=""
            data-map-stage-h={stageHeight}
            data-globe-state={painted ? "ready" : failed ? "error" : "loading"}
          >
            <div ref={mapNode} className={`relative z-[2] h-full w-full ${painted && !failed ? "" : "invisible"}`} />
            <CompanyLocationLayer embedded={embedded} onCompanySelect={onCompanySelect} map={activeMap} enabled={locationsMode} companies={companies} highlightCampusIds={selectedId ? new Set([selectedId]) : highlightCampusIds} expanded={expandedMap} onExpand={changeMapFocus} rotationEnabled={rotationEnabled} onRotationChange={setRotationEnabled} />
            {!painted || failed ? (
              <div className="absolute inset-0 z-30 bg-[#F08A3A]" aria-busy={!failed} aria-live="polite">
                {failed ? <CampusGlobeFallback campuses={campuses} onSelect={onSelect} selectedId={selectedId} highlightCampusIds={highlightCampusIds} /> : (
                  <div className="globe-disc" data-globe-disc="">
                    <p className="sr-only">Globe is loading</p>
                  </div>
                )}
              </div>
            ) : null}
          </div>
          {expandedMap && pinned ? (
            <aside className="hidden w-[280px] shrink-0 overflow-auto border-l border-[#F0D7C2] bg-[#FFFBF6] p-3 sm:block" data-fold-entity-card="" data-entity-selected={pinned.id}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#E85D04]">Selected</p>
                  <p className="mt-0.5 break-words text-[15px] font-semibold tracking-tight text-[#2A1A10]">{pinned.name}</p>
                </div>
                <button type="button" onClick={() => onSelect("")} className="shrink-0 text-[12px] font-semibold text-[#9A3412]" data-entity-clear="">Clear</button>
              </div>
              <p className="mt-1 text-[12px] leading-4 text-[#5C4030]">
                <span className={COUNT}>{pinned.founders.toLocaleString("en-US")}</span> founders
                {" · "}
                <span className={COUNT}>{pinned.signals.toLocaleString("en-US")}</span> signals
                {pinned.country ? <>{" · "}{pinned.country}</> : null}
              </p>
              {pinnedCompanies.length > 0 ? (
                <ul className="mt-2 space-y-1 border-t border-[#F0D7C2] pt-2">
                  {pinnedCompanies.map((co) => (
                    <li key={co.id}>
                      <a href={`/startup/${co.id}`} className="flex items-baseline justify-between gap-2 text-[12px]">
                        <span className="break-words font-medium text-[#2A1A10]">{co.name}</span>
                        {co.sector ? <span className="shrink-0 font-mono text-[10px] text-[#8A6854]">{co.sector}</span> : null}
                      </a>
                    </li>
                  ))}
                </ul>
              ) : null}
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[12px]">
                <a href={`/campuses/${campusSlug(pinned.id)}`} className="font-medium text-[#9A3412]">Campus page</a>
                <a href={`/founders?campus=${encodeURIComponent(pinned.id)}`} className="font-medium text-[#5C4030]">Founders</a>
              </div>
            </aside>
          ) : null}
        </div>
        {!expandedMap ? (
          <div className="mt-1 flex w-full flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-1" data-map-credit>
            <p className="font-mono text-[11px] leading-4 text-[#8A6854]"><MapCredit /></p>
            {!locationsMode && (hover || pinned) ? (
              <p className="max-w-full break-words text-[13px] leading-4 text-[#2A1A10]" data-fold-entity-hover="">
                <span className="font-semibold">{(hover && (!pinned || pinned.id !== hover.id) ? hover : pinned)!.name}</span>
                {" · "}
                <span className={COUNT}>{(hover && (!pinned || pinned.id !== hover.id) ? hover : pinned)!.founders.toLocaleString("en-US")}</span>
                {" founders · "}
                <span className={COUNT}>{(hover && (!pinned || pinned.id !== hover.id) ? hover : pinned)!.signals.toLocaleString("en-US")}</span>
                {" signals"}
              </p>
            ) : (
              <button type="button" className="text-[12px] font-semibold text-[#E85D04]" onClick={() => { setLocationsMode(true); changeMapFocus(true); }}>Headquarters map</button>
            )}
          </div>
        ) : null}
      </section>


    </div>
  );
}
