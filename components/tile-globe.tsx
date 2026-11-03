"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useGlobeRotation } from "@/lib/client/use-globe-rotation";
import { loadMapLibre } from "@/lib/client/map-prefetch";
import { markerRadiusByFounders, markerSizeLegend } from "@/lib/domain/marker-radius";
import { absoluteDate } from "@/lib/domain/relative-time";
import { campusSlug, shortCampusLabel } from "@/lib/domain/campuses";
import { sampleSurfaceCounts, type FacetCompany } from "@/lib/domain/sample-facets";
import { MapCredit } from "./map-credit";
import { CompanyLocationLayer } from "./company-location-layer";
import mapStyles from "./company-location-map.module.css";
import type { Map as LibreMap } from "maplibre-gl";
import { campusFoundersTop, campusFoundersRanked, CAMPUS_FOUNDERS_VISIBLE } from "./sample-instrument";
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
}

export type TileCompany = FacetCompany;

const BRAND = "#2F4FD8";
const COUNT = "font-bold tabular-nums text-[color:var(--cobalt,#2F4FD8)]";

const COUNTRY_COLOR: Record<string, string> = {
  "United States": "#2F4FD8",
  Canada: "#5C6FA8",
  "United Kingdom": "#3F465C",
};

function markerColor(country: string): string {
  return COUNTRY_COLOR[country] ?? BRAND;
}

/**
 * Keep the globe disk inside the stage. MapLibre's equator is 512 * 2^zoom px,
 * so the sphere diameter is that divided by π. A higher zoom clips the horizon
 * at the panel edges and reads as a flat outline.
 */
function globeView(width: number, height: number): { center: [number, number]; zoom: number } {
  const minDim = Math.max(160, Math.min(width, height));
  const diameter = minDim * 0.96;
  const zoom = Math.log2((diameter * Math.PI) / 512);
  // Faces the US, with Canada and the UK still on the near side.
  return { center: [-72, 36], zoom: Math.min(3, Math.max(0.4, zoom)) };
}

function campusCollection(campuses: TileCampus[]) {
  /** Founders-weighted map: top desks + label priority match campus plates (Penn / Stanford / MIT). */
  const ranked = [...campuses].sort((a, b) => b.founders - a.founders || a.name.localeCompare(b.name));
  const topIds = new Set(ranked.slice(0, CAMPUS_FOUNDERS_VISIBLE).map((c) => c.id));
  const labelRank = new Map(ranked.slice(0, CAMPUS_FOUNDERS_VISIBLE).map((c, i) => [c.id, i + 1]));
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
        radius: markerRadiusByFounders(campus.founders),
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
  const [locationsMode, setLocationsMode] = useState(true);
  const [expandedMap, setExpandedMap] = useState(false);
  const [rotationEnabled, setRotationEnabled] = useState(true);
  useGlobeRotation(activeMap, rotationEnabled);
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
        : Math.round(window.innerHeight * (wide ? 0.86 : 0.88));
      const next = wide
        ? Math.max(640, Math.min(900, target))
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
            "sky-color": "#F4F6FB",
            "horizon-color": "#FFFFFF",
            "fog-color": "#EEF1F8",
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
        map.addSource("campuses", { type: "geojson", data: collection() });
        map.addLayer({
          id: "campus-halo",
          type: "circle",
          source: "campuses",
          filter: ["==", ["get", "top"], 1],
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 0.4, ["+", ["*", ["get", "radius"], 1.05], 6], 1.8, ["+", ["*", ["get", "radius"], 1.15], 7], 3.2, ["+", ["*", ["get", "radius"], 1.55], 8]],
            "circle-color": "#2F4FD8",
            "circle-opacity": 0.18,
            "circle-stroke-color": "#2F4FD8",
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
            "circle-color": ["case", ["==", ["get", "top"], 1], "#2F4FD8", ["get", "color"]],
            "circle-stroke-color": ["case", ["==", ["get", "top"], 1], "#FFFFFF", "#FFFFFF"],
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
            "circle-color": "rgba(47,79,216,0.12)",
            "circle-stroke-color": "#2F4FD8",
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
            "circle-color": "#2F4FD8",
            "circle-stroke-color": "#FFFFFF",
            "circle-stroke-width": 2.4,
            "circle-opacity": 1,
          },
        });
        // Top-desk short labels; collision so they never stack. Selected always wins.
        map.addLayer({
          id: "campus-labels",
          type: "symbol",
          source: "campuses",
          filter: ["<=", ["get", "labelRank"], 12],
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
            "text-color": "#0B0E17",
            "text-halo-color": "#FFFFFF",
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
            "text-color": "#2F4FD8",
            "text-halo-color": "#FFFFFF",
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
    if (ric) ric(() => { if (!dead) startMap(); }, { timeout: 500 });
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



  function focus(campus: TileCampus) {
    setLocationsMode(false);
    mapRef.current?.flyTo({ center: [campus.lon, campus.lat], zoom: 11, essential: true });
    onSelect(campus.id);
  }

  const catalogReady = companies.length > 0;
  const pinnedCompanies = useMemo(() => {
    if (!pinned) return [] as TileCompany[];
    return companies
      .filter((c) => c.schoolId === pinned.id)
      .slice()
      .sort((a, b) => (b.signals ?? 0) - (a.signals ?? 0) || a.name.localeCompare(b.name))
      .slice(0, 3);
  }, [companies, pinned]);
  const signaledUniverse = useMemo(() => companies.filter((c) => c.signals > 0).length, [companies]);

  // One campus count: the campuses actually drawn on the globe.
  const universeCounts = catalogReady
    ? sampleSurfaceCounts(companies, campuses)
    : { companies: companyCount, foundersListed, campusesOnMap: campuses.length };
  const campusesOnMap = universeCounts.campusesOnMap;

  const rankedCampuses = useMemo(() => campusFoundersRanked(campuses), [campuses]);
  const topCampuses = useMemo(() => campusFoundersTop(campuses, CAMPUS_FOUNDERS_VISIBLE), [campuses]);
  const [showAllCampuses, setShowAllCampuses] = useState(false);
  const [legendOpen, setLegendOpen] = useState(false);
  const plateCampuses = showAllCampuses ? rankedCampuses : topCampuses;

  return (
    <div className={`${className ?? ""} relative`} data-fold-mobile-root="">
      <div className={`${locationsMode ? mapStyles.hqCounts : ""} pointer-events-none absolute right-2 top-2 z-20 mb-0 ml-auto flex max-w-[70%] flex-wrap items-end justify-end gap-x-2 gap-y-0.5 rounded-sm bg-[color:var(--bg,#FFFFFF)]/92 px-2 py-1 shadow-sm backdrop-blur-[2px] lg:pointer-events-auto lg:static lg:mb-2 lg:ml-0 lg:max-w-none lg:justify-between lg:gap-x-4 lg:gap-y-1 lg:bg-transparent lg:px-0 lg:py-0 lg:shadow-none lg:backdrop-blur-none`} data-fold-counts="" style={locationsMode ? {position:"relative",maxWidth:"none",top:"auto",right:"auto",margin:0} : undefined}>
        <p className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[10px] tabular-nums leading-4 text-[color:var(--fg-2,#3F465C)] lg:gap-x-2.5 lg:gap-y-1 lg:text-[12px] lg:leading-5">
          <span>
            <span className={COUNT}>{(catalogReady ? companies.length : companyCount).toLocaleString("en-US")}</span>
            {" companies"}
          </span>
          {catalogReady ? (
            <span>
              <span className={COUNT}>{signaledUniverse.toLocaleString("en-US")}</span>
              {" signaled"}
            </span>
          ) : null}
          <span>
            <span className={COUNT} data-count="campuses-on-map">{campusesOnMap.toLocaleString("en-US")}</span>
            {" campuses on map"}
          </span>
          {/* Compact founder counts (checks need data-count + data-founder-count-note). No fine-print essay. */}
          <span data-founder-count-note="">
            <span className={COUNT} data-count="founders-listed">{universeCounts.foundersListed.toLocaleString("en-US")}</span>
            {" founders"}
            {foundersIndexed > 0 ? (
              <>
                {" · "}
                <span className={COUNT} data-count="founders-indexed">{foundersIndexed.toLocaleString("en-US")}</span>
                {" indexed"}
              </>
            ) : null}
          </span>
          {dataThrough ? <span className="text-[color:var(--fg-3,#5C647A)]">Updated {absoluteDate(dataThrough)}</span> : null}
        </p>
        <p className="mt-1 hidden text-[12px] text-[color:var(--fg,#0B0E17)] lg:block">{locationsMode ? "Choose a city to explore recorded startup HQs." : "Click a campus to see its founders."}</p>
      </div>

      <section className="mb-4" data-fold-desk-map="" aria-label="Map">
        <h2 className="mb-2 flex flex-wrap items-center gap-2 text-[12px] font-semibold tracking-tight text-[color:var(--cobalt,#2F4FD8)]">Map
          <span className="ml-auto inline-flex border border-[#c3cdee] bg-white" role="group" aria-label="Map locations">
            <button type="button" aria-pressed={locationsMode} onClick={()=>setLocationsMode(true)} className={`min-h-9 px-3 ${locationsMode ? "bg-[#2f4fd8] text-white" : "bg-white text-[#2f4fd8]"}`}>Startup HQs</button>
            <button type="button" aria-pressed={rotationEnabled} title="Rotation pauses while using the map, at city zoom, and for reduced motion" onClick={()=>setRotationEnabled(v=>!v)} className="min-h-9 px-3 bg-white text-[#2f4fd8]">{rotationEnabled ? "Pause rotation" : "Rotate globe"}</button>
            <button type="button" aria-pressed={!locationsMode} onClick={()=>setLocationsMode(false)} className={`min-h-9 px-3 ${!locationsMode ? "bg-[#2f4fd8] text-white" : "bg-white text-[#2f4fd8]"}`}>Campuses</button>
          </span>
        </h2>
        <div
          className={`${expandedMap ? mapStyles.expandedStage : ""} relative overflow-hidden rounded-none border border-[color:var(--cobalt,#2F4FD8)]/45 bg-white`}
          style={expandedMap ? {position:"fixed",inset:0,zIndex:200,height:"100dvh",width:"100vw",border:0} : { height: stageHeight }}
          role={expandedMap ? "dialog" : undefined}
          aria-modal={expandedMap ? true : undefined}
          aria-label={expandedMap ? "Expanded startup map" : undefined}
          data-map-expanded={expandedMap ? "true" : undefined}
          data-dispatch-map-stage=""
          data-fold-bigmap-stage=""
          data-map-stage-h={stageHeight}
          data-globe-state={painted ? "ready" : failed ? "error" : "loading"}
        >
          <div ref={mapNode} className={`relative z-[2] h-full w-full ${painted && !failed ? "" : "invisible"}`} />
          <CompanyLocationLayer map={activeMap} enabled={locationsMode} companies={companies} highlightCampusIds={selectedId ? new Set([selectedId]) : highlightCampusIds} expanded={expandedMap} onExpand={setExpandedMap} rotationEnabled={rotationEnabled} onRotationChange={setRotationEnabled} />
          {!painted ? (
            <div className="absolute inset-0 z-30 bg-[#FFFFFF]" aria-busy="true" aria-live="polite">
              <div className="grid h-full place-items-center">
                <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[color:var(--cobalt,#2F4FD8)]">{failed ? "Globe unavailable" : "Loading globe"}</p>
              </div>
            </div>
          ) : null}
          <div className="pointer-events-none absolute bottom-2 left-1/2 z-10 -translate-x-1/2 [&_a]:pointer-events-auto" data-map-credit>
            <p className="rounded bg-[color:var(--bg,#FFFFFF)]/80 px-2 py-0.5 font-mono text-[9px] text-[color:var(--fg-3,#5C647A)]">
              <MapCredit />
            </p>
          </div>
          {!locationsMode && hover && (!pinned || pinned.id !== hover.id) ? (
            <div
              className="pointer-events-none absolute z-30 w-max max-w-[260px] -translate-x-1/2 -translate-y-full rounded-sm border border-[color:var(--line,#E1E5EF)] bg-[color:var(--bg-raised,#FFFFFF)] px-2.5 py-1.5 text-left text-[color:var(--fg,#0B0E17)] shadow-sm"
              style={{ left: hover.x, top: Math.max(12, hover.y - 12) }}
              data-fold-entity-hover=""
            >
              <p className="text-[13px] font-semibold leading-4">{hover.name}</p>
              <p className="mt-0.5 text-[12px] leading-4 text-[color:var(--fg-2,#3F465C)]">
                <span className={COUNT}>{hover.founders.toLocaleString("en-US")}</span> founders
                {" · "}
                <span className={COUNT}>{hover.signals.toLocaleString("en-US")}</span> signals
                {hover.country ? <>{" · "}{hover.country}</> : null}
              </p>
            </div>
          ) : null}
          {!locationsMode && pinned ? (
            <div
              className="absolute bottom-8 left-3 z-30 w-[min(300px,calc(100%-1.5rem))] rounded-sm border border-[color:var(--cobalt,#2F4FD8)]/40 bg-[color:var(--bg,#FFFFFF)] px-3 py-2.5 text-left shadow-sm"
              data-fold-entity-card=""
              data-entity-selected={pinned.id}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[color:var(--cobalt,#2F4FD8)]">Selected</p>
                  <p className="mt-0.5 text-[15px] font-semibold tracking-tight text-[color:var(--fg,#0B0E17)]">{pinned.name}</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onSelect("");
                    try {
                      (window as unknown as { __campusScoutMap?: { resize?: () => void } }).__campusScoutMap?.resize?.();
                    } catch { /* ignore */ }
                  }}
                  className="shrink-0 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[color:var(--cobalt,#2F4FD8)] hover:underline"
                  data-entity-clear=""
                >
                  Clear
                </button>
              </div>
              <p className="mt-1 text-[12px] leading-4 text-[color:var(--fg-2,#3F465C)]">
                <span className={COUNT}>{pinned.founders.toLocaleString("en-US")}</span> founders
                {" · "}
                <span className={COUNT}>{pinned.signals.toLocaleString("en-US")}</span> signals
                {pinned.country ? <>{" · "}{pinned.country}</> : null}
              </p>
              {pinnedCompanies.length > 0 ? (
                <ul className="mt-2 space-y-1 border-t border-[color:var(--line,#E1E5EF)] pt-2" data-entity-companies="">
                  {pinnedCompanies.map((co) => (
                    <li key={co.id}>
                      <a
                        href={`/startup/${co.id}`}
                        className="flex items-baseline justify-between gap-2 text-[12px] hover:text-[color:var(--cobalt,#2F4FD8)]"
                      >
                        <span className="truncate font-medium text-[color:var(--fg,#0B0E17)]">{co.name}</span>
                        {co.sector ? (
                          <span className="shrink-0 font-mono text-[10px] text-[color:var(--fg-3,#5C647A)]">{co.sector}</span>
                        ) : null}
                      </a>
                    </li>
                  ))}
                </ul>
              ) : null}
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[12px]">
                <a href={`/campuses/${campusSlug(pinned.id)}`} className="font-medium text-[color:var(--cobalt,#2F4FD8)] hover:underline">
                  Campus page
                </a>
                <a href={`/companies?campus=${encodeURIComponent(pinned.id)}&from=map`} className="font-medium text-[color:var(--cobalt,#2F4FD8)] hover:underline">
                  Open companies
                </a>
                <a href={`/founders?campus=${encodeURIComponent(pinned.id)}`} className="font-medium text-[color:var(--fg-2,#3F465C)] hover:underline">
                  Founders
                </a>
              </div>
            </div>
          ) : null}
          {/* r49: collapsible legend tucked bottom-left — never over Program/filters or stats. */}
          <div className={`pointer-events-auto absolute left-2 top-2 z-20 max-w-[168px] lg:top-auto lg:bottom-2 ${locationsMode ? "hidden" : ""}`} data-fold-map-legend="">
            <button
              type="button"
              className="inline-flex h-7 items-center gap-1.5 rounded-sm border border-[color:var(--line,#E1E5EF)] bg-[color:var(--bg,#FFFFFF)]/95 px-2 font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-[color:var(--fg-3,#5C647A)] shadow-sm"
              aria-expanded={legendOpen}
              aria-controls="fold-map-legend-body"
              data-fold-legend-toggle=""
              onClick={() => setLegendOpen((v) => !v)}
            >
              Markers
              <span aria-hidden className="text-[color:var(--cobalt,#2F4FD8)]">{legendOpen ? "-" : "+"}</span>
            </button>
            {legendOpen ? (
              <div
                id="fold-map-legend-body"
                className="mt-1 rounded-sm border border-[color:var(--line,#E1E5EF)] bg-[color:var(--bg,#FFFFFF)]/95 px-2 py-1.5 shadow-sm"
                data-fold-legend-body=""
              >
                <p className="text-[10px] leading-3.5 text-[color:var(--fg-2,#3F465C)]">Size = founders · cobalt top desks · cobalt ring = selected</p>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <section className="mt-3 max-w-sm max-lg:hidden" data-campus-metric="founders" data-mobile-campus-picker="">
          <h2 className="mb-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[color:var(--cobalt,#2F4FD8)]">Filter campus</h2>
          <ol className="divide-y divide-[color:var(--line,#E1E5EF)] border-y border-[color:var(--line,#E1E5EF)]" data-campus-founders-top="">
            {plateCampuses.map((campus, i) => {
              const active = selectedId === campus.id;
              const label = shortCampusLabel(campus.id, campus.name);
              return (
                <li key={campus.id}>
                  <button
                    type="button"
                    onClick={() => focus(campus)}
                    className={`flex w-full items-baseline gap-2 px-1 py-2 text-left hover:bg-[color:var(--cobalt-haze,#E8ECFA)]/50 ${active ? "bg-[color:var(--cobalt-haze,#E8ECFA)]" : ""}`}
                  >
                    <span className="w-5 shrink-0 text-right font-mono text-[12px] font-bold tabular-nums text-[color:var(--cobalt,#2F4FD8)]">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="min-w-0 flex-1 text-[14px] font-semibold tracking-tight text-[color:var(--fg,#0B0E17)]">{label}</span>
                    <span className={`shrink-0 font-mono text-[13px] font-bold ${COUNT}`}>{campus.founders.toLocaleString("en-US")}</span>
                    <span className="shrink-0 text-[12px] text-[color:var(--fg-3,#5C647A)]">founders</span>
                  </button>
                </li>
              );
            })}
          </ol>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1" data-campus-founders-all="">
            {rankedCampuses.length > topCampuses.length ? (
              <button
                type="button"
                onClick={() => setShowAllCampuses((v) => !v)}
                className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--cobalt,#2F4FD8)] underline-offset-2 hover:underline"
              >
                {showAllCampuses ? "Show top 10" : `All campuses · ${(rankedCampuses.length - topCampuses.length).toLocaleString("en-US")} more`}
              </button>
            ) : null}
            <Link href="/campuses" className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--fg-3,#5C647A)] underline-offset-2 hover:underline">
              Campus index
            </Link>
          </div>
          <p className="mt-2 text-[12px] leading-5 text-[color:var(--fg-3,#5C647A)]">{markerSizeLegend()}</p>
        </section>
    </div>
  );
}
