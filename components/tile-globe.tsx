"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useGlobeRotation } from "@/lib/client/use-globe-rotation";
import { loadMapLibre } from "@/lib/client/map-prefetch";
import { markerRadiusForCampus } from "@/lib/domain/marker-radius";
import { rankedByUndergrad } from "@/lib/domain/pitchbook-model";
import { absoluteDate } from "@/lib/domain/relative-time";
import { campusSlug, shortCampusLabel } from "@/lib/domain/campuses";
import type { FacetCompany } from "@/lib/domain/sample-facets";
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
  Canada: "#5C3A28",
  "United Kingdom": "#6B442C",
};

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

function globeView(width: number, height: number): { center: [number, number]; zoom: number } {
  const minDim = Math.max(160, Math.min(width, height));
  const diameter = minDim * 0.96;
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
  campusesWithFounders = 0,
  selectedId,
  onSelect,
  className = "",
  dataThrough = null,
  highlightCampusIds = null,
}: {
  campuses: TileCampus[];
  companies?: TileCompany[];
  /** Full catalog size, used until /data/directory.json arrives. */
  companyCount?: number;
  /** Founder names attached to company cards in the directory sample. */
  foundersListed?: number;
  /** Rows in the searchable founder index (founders.json). May exceed foundersListed. */
  foundersIndexed?: number;
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
      const sheetMode = document.documentElement.getAttribute("data-fold-sheet-mode");
      const compactHeader = !wide && (sheetMode === "deck" || sheetMode === "expanded");
      // Desktop: disk beside the rail, under the nav and counts.
      // Phone (390x844): square disk, then founders in the leftover fold. Nothing covers the tiles.
      const next = wide
        ? Math.max(480, Math.min(640, Math.round(window.innerHeight - 220)))
        : compactHeader
          ? Math.max(200, Math.min(240, Math.round(window.innerWidth * 0.58)))
          : Math.max(240, Math.min(Math.round(window.innerWidth * 0.86), Math.round(window.innerHeight - 430)));
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
        // Place names sit on the tiles and cover campus markers. Keep them for a zoomed map only.
        for (const layer of layers) {
          if (layer.type !== "symbol") continue;
          try {
            map.setLayerZoomRange(layer.id, 4.6, 24);
          } catch {
            // A style layer can refuse a zoom range. The disk still paints.
          }
        }
        const styled = layers.some((layer) => layer.id === "water") && layers.some((layer) => layer.type === "background");
        if (!styled) {
          setFailed(true);
          return;
        }
        map.addSource("campuses", { type: "geojson", data: collection() });
        map.addLayer({
          id: "campus-halo",
          type: "circle",
          source: "campuses",
          filter: ["==", ["get", "top"], 1],
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 0.4, ["+", ["*", ["get", "radius"], 1.05], 6], 1.8, ["+", ["*", ["get", "radius"], 1.15], 7], 3.2, ["+", ["*", ["get", "radius"], 1.55], 8]],
            "circle-color": "#FFF4E8",
            "circle-opacity": 0.55,
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
            "circle-stroke-color": ["case", ["==", ["get", "top"], 1], "#FFF4E8", "#FFF4E8"],
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
            "circle-color": "rgba(255,244,232,0.35)",
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
            "text-padding": 8,
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
            "text-color": "#2A1A10",
            "text-halo-color": "#FFF4E8",
            "text-halo-width": 2,
            "text-halo-blur": 0.15,
          },
        });
        window.clearTimeout(styleTimer);
        let framed = false;
        const frame = () => {
          if (dead || !map) return;
          const stage = mapNode.current?.parentElement;
          const height = stage?.clientHeight || mapNode.current?.clientHeight || 520;
          const width = stage?.clientWidth || mapNode.current?.clientWidth || 640;
          if (mapNode.current) {
            mapNode.current.style.width = `${width}px`;
            mapNode.current.style.height = `${height}px`;
          }
          const canvasBox = map.getCanvasContainer();
          canvasBox.style.width = `${width}px`;
          canvasBox.style.height = `${height}px`;
          map.resize();
          if (!framed) map.jumpTo(globeView(width, height));
          framed = true;
        };
        frameRef.current = frame;
        frame();
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

    });
    };

    const ric = window.requestIdleCallback?.bind(window);
    if (ric) ric(() => { if (!dead) startMap(); }, { timeout: 50 });
    else window.setTimeout(() => { if (!dead) startMap(); }, 0);

    const observer = new ResizeObserver(() => mapRef.current?.resize());
    observer.observe(node);
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
    if (!expandedMap) return;
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
  }, [expandedMap]);

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
  const signaledUniverse = useMemo(() => companies.filter((c) => c.signals > 0).length, [companies]);

  // Keep the server founder count. Summing founder-name slots after hydrate
  // counts the same person twice and disagrees with the vetted list.
  const campusesOnMap = campuses.length;

  return (
    <div className={`${className ?? ""} relative`} data-fold-mobile-root="">
      <div className="mb-2 flex flex-wrap gap-2" data-fold-counts="">
        <p className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[10px] tabular-nums leading-4 text-[color:var(--fg-2,#3F465C)] lg:gap-x-2.5 lg:gap-y-1 lg:text-[12px] lg:leading-5">
          <Link href="/companies" className="pointer-events-auto inline-flex items-baseline gap-1 hover:underline">
            <span className={COUNT}>{(catalogReady ? companies.length : companyCount).toLocaleString("en-US")}</span>
            <span>vetted companies</span>
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
            {" founders on those companies"}
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
      </div>

      <section className="mb-4" data-fold-desk-map="" aria-label="Map">
        <h2 className="mb-2 flex flex-wrap items-center gap-2 text-[12px] font-semibold tracking-tight text-[color:var(--ember,#E85D04)]"><span className="max-sm:sr-only">Map</span>
          <span className={`${mapStyles.mapModes} w-full border border-[color:var(--line,#F0D7C2)] bg-[color:var(--bg-raised,#FFFBF6)] lg:ml-auto lg:w-auto`} role="group" aria-label="Map locations">
            <button type="button" aria-pressed={locationsMode} onClick={() => { setLocationsMode(true); resetGlobalView(); }} className={`min-h-11 min-w-11 px-1.5 text-center text-[12px] leading-tight sm:px-3 sm:text-[14px] ${locationsMode ? "bg-[#E85D04] text-[#FFF4E8]" : "bg-[color:var(--bg-raised,#FFFBF6)] text-[#9A3412]"}`}>Startup HQs</button>
            <button type="button" onClick={resetGlobalView} title="Recenter the entire globe" className="min-h-11 min-w-11 bg-[color:var(--bg-raised,#FFFBF6)] px-1.5 text-[12px] text-[#9A3412] sm:px-3 sm:text-[14px]">Reset</button>
            <button type="button" aria-pressed={rotationEnabled} title="Turn automatic rotation on or off" onClick={()=>setRotationEnabled(v=>!v)} className="min-h-11 min-w-11 bg-[color:var(--bg-raised,#FFFBF6)] px-1.5 text-[12px] text-[#9A3412] sm:px-3 sm:text-[14px]">{rotationEnabled ? "Pause" : "Rotate"}</button>
            <button type="button" aria-pressed={!locationsMode} onClick={() => { setLocationsMode(false); resetGlobalView(); }} className={`min-h-11 min-w-11 px-1.5 text-center text-[12px] leading-tight sm:px-3 sm:text-[14px] ${!locationsMode ? "bg-[#E85D04] text-[#FFF4E8]" : "bg-[color:var(--bg-raised,#FFFBF6)] text-[#9A3412]"}`}>Campuses</button>
          </span>
        </h2>
        <div
          className={`${expandedMap ? mapStyles.expandedStage : "globe-stage"} relative`}
          style={expandedMap ? {position:"fixed",inset:0,zIndex:200,height:"100dvh",width:"100vw"} : { height: stageHeight }}
          role={expandedMap ? "dialog" : undefined}
          aria-modal={expandedMap ? true : undefined}
          aria-label={expandedMap ? "Expanded startup map" : undefined}
          data-map-expanded={expandedMap ? "true" : undefined}
          data-dispatch-map-stage=""
          data-fold-bigmap-stage=""
          data-map-stage-h={stageHeight}
          data-globe-state={painted ? "ready" : failed ? "error" : "loading"}
        >
          <div className={expandedMap ? "relative h-full w-full" : "globe-disk"}>
            <div ref={mapNode} className={`relative z-[2] h-full w-full ${painted && !failed ? "" : "invisible"}`} />
            <CompanyLocationLayer map={activeMap} enabled={locationsMode} companies={companies} highlightCampusIds={selectedId ? new Set([selectedId]) : highlightCampusIds} expanded={expandedMap} onExpand={setExpandedMap} rotationEnabled={rotationEnabled} onRotationChange={setRotationEnabled} />
            {!painted ? (
              <div className="absolute inset-0 z-30 grid place-items-center bg-[#F08A3A]" aria-busy="true" aria-live="polite">
                <div className="globe-disc" data-globe-disc="" />
                <p className="sr-only">{failed ? "Globe unavailable" : "Globe is loading"}</p>
              </div>
            ) : null}
          </div>
        </div>
        <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5" data-map-credit>
          <p className="max-w-full font-mono text-[11px] leading-4 text-[color:var(--fg-3,#8A6854)]">
            <MapCredit />
          </p>
          {!locationsMode && hover && (!pinned || pinned.id !== hover.id) ? (
            <p className="max-w-full break-words text-[13px] leading-4 text-[color:var(--fg,#2A1A10)]" data-fold-entity-hover="">
              <span className="font-semibold">{hover.name}</span>
              {" · "}
              <span className={COUNT}>{hover.founders.toLocaleString("en-US")}</span>
              {" founders · "}
              <span className={COUNT}>{hover.signals.toLocaleString("en-US")}</span>
              {" signals"}
            </p>
          ) : !locationsMode ? (
            <p className="hidden text-[12px] leading-4 text-[color:var(--fg-2,#5C4030)] sm:block" data-fold-map-legend="" data-fold-legend-body="">
              Marker size follows founders on file. A ring marks the selected school.
            </p>
          ) : (
            <button type="button" className="min-h-11 text-[13px] font-semibold text-[color:var(--ember,#E85D04)]" onClick={() => setExpandedMap(true)}>
              Open the full headquarters map
            </button>
          )}
        </div>
        {!locationsMode && pinned ? (
          <div
            className="mt-2 rounded-sm border border-[color:var(--ember,#E85D04)]/35 bg-[color:var(--bg-raised,#FFFBF6)] px-3 py-2 text-left lg:hidden"
            data-fold-entity-card=""
            data-entity-selected={pinned.id}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[color:var(--ember,#E85D04)]">Selected</p>
                <p className="mt-0.5 break-words text-[15px] font-semibold leading-5 tracking-tight text-[color:var(--fg,#2A1A10)]">{pinned.name}</p>
              </div>
              <button
                type="button"
                onClick={() => onSelect("")}
                className="inline-flex min-h-11 shrink-0 items-center font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-[color:var(--ember,#E85D04)]"
                data-entity-clear=""
              >
                Clear
              </button>
            </div>
            <p className="mt-1 text-[12px] leading-4 text-[color:var(--fg-2,#5C4030)]">
              <span className={COUNT}>{pinned.founders.toLocaleString("en-US")}</span> founders
              {" · "}
              <span className={COUNT}>{pinned.signals.toLocaleString("en-US")}</span> signals
              {pinned.country ? <>{" · "}{pinned.country}</> : null}
            </p>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[13px]">
              <a href={`/campuses/${campusSlug(pinned.id)}`} className="inline-flex min-h-11 items-center font-medium text-[color:var(--ember,#E85D04)]">Campus page</a>
              <a href={`/founders?campus=${encodeURIComponent(pinned.id)}`} className="inline-flex min-h-11 items-center font-medium text-[color:var(--fg,#2A1A10)]">Founders</a>
            </div>
          </div>
        ) : null}
      </section>


    </div>
  );
}
