"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { loadMapLibre } from "@/lib/client/map-prefetch";
import { markerRadiusByFounders, markerSizeLegend } from "@/lib/domain/marker-radius";
import { absoluteDate } from "@/lib/domain/relative-time";
import { campusSlug, shortCampusLabel } from "@/lib/domain/campuses";
import { sampleSurfaceCounts, type FacetCompany } from "@/lib/domain/sample-facets";
import { MapCredit } from "./map-credit";
import { campusFoundersTop, campusFoundersRanked, CAMPUS_FOUNDERS_VISIBLE } from "./sample-instrument";
import "maplibre-gl/dist/maplibre-gl.css";
import { clientPointFromEvent, mapPointFromPointer } from "@/lib/domain/map-pointer";

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

const OCEAN = "#EEF1F8";
const LAND = "#6F7C96";
const BOUNDARY = "#1E3A9A";
const BRAND = "#2F4FD8";
const COUNT = "font-bold tabular-nums text-[color:var(--ember,#D96B1C)]";

const COUNTRY_COLOR: Record<string, string> = {
  "United States": "#2F4FD8",
  Canada: "#5C6FA8",
  "United Kingdom": "#3F465C",
};

function markerColor(country: string): string {
  return COUNTRY_COLOR[country] ?? BRAND;
}

/** White ocean + cool slate land (own atlas, not YCGlobe cream). First painted frame is the globe. */
const GLOBE_STYLE = {
  version: 8,
  name: "Campus Scout globe",
  glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
  sources: {
    openmaptiles: { type: "vector", url: "https://tiles.openfreemap.org/planet" },
  },
  layers: [
    { id: "background", type: "background", paint: { "background-color": LAND } },
    {
      id: "water",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "water",
      paint: { "fill-color": OCEAN, "fill-opacity": 1 },
    },
    {
      id: "coast",
      type: "line",
      source: "openmaptiles",
      "source-layer": "water",
      paint: { "line-color": BOUNDARY, "line-width": 1.45, "line-opacity": 0.72 },
    },
    {
      id: "boundary",
      type: "line",
      source: "openmaptiles",
      "source-layer": "boundary",
      filter: ["any", ["==", ["get", "admin_level"], 2], ["==", ["get", "admin_level"], "2"]],
      paint: { "line-color": BOUNDARY, "line-width": 1.15, "line-opacity": 0.55 },
    },
  ],
};

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
  const [stageHeight, setStageHeight] = useState(860);
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
  const [pinned, setPinned] = useState<{ id: string; name: string; founders: number; signals: number; country: string } | null>(null);
  const [ready, setReady] = useState(false);
  const [painted, setPainted] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const node = mapNode.current;
    if (!node) return;
    let dead = false;
    let interacting = false;
    let hovering = false;
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
    } | null = null;

    const fit = () => {
      const wide = window.innerWidth >= 1024;
      // Desk: taller stage like 8b fold wow (map fills the column). Mobile: compact under founders.
      const target = Math.round(window.innerHeight * (wide ? 0.58 : 0.42));
      setStageHeight(wide ? Math.max(420, Math.min(540, target)) : Math.max(220, Math.min(260, target)));
    };
    fit();
    window.addEventListener("resize", fit);
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reduce = motion.matches;
    const onMotion = () => {
      reduce = motion.matches;
    };
    motion.addEventListener("change", onMotion);

    const collection = () => campusCollection(campuses);

    const spin = () => {
      if (dead || !map || reduce || interacting || hovering) return;
      const center = map.getCenter();
      center.lng -= 8;
      map.easeTo({ center, duration: 1400, easing: (t: number) => t, essential: true });
    };

    const styleTimer = window.setTimeout(() => {
      if (!dead) setFailed(true);
    }, 15000);

    const startMap = () => {
      void loadMapLibre().then((mod) => {
      if (dead || !mapNode.current) return;
      const created = new mod.Map({
        container: mapNode.current,
        style: JSON.parse(JSON.stringify(GLOBE_STYLE)) as object,
        center: [-72, 36],
        zoom: 1.4,
        minZoom: 0.35,
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
            "circle-stroke-color": "#D96B1C",
            "circle-stroke-width": 1.35,
            "circle-stroke-opacity": 0.62,
          },
        });
        map.addLayer({
          id: "campus-dots",
          type: "circle",
          source: "campuses",
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 0.4, ["*", ["get", "radius"], 0.95], 1.8, ["*", ["get", "radius"], 1.12], 3.2, ["*", ["get", "radius"], 1.5]],
            "circle-color": ["case", ["==", ["get", "top"], 1], "#2F4FD8", ["get", "color"]],
            "circle-stroke-color": ["case", ["==", ["get", "top"], 1], "#D96B1C", "#FFFFFF"],
            "circle-stroke-width": ["case", ["==", ["get", "top"], 1], 2.2, 1.25],
            "circle-opacity": 0.96,
          },
        });
        map.addLayer({
          id: "campus-selected",
          type: "circle",
          source: "campuses",
          filter: ["==", ["get", "id"], ""],
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 0.4, ["+", ["*", ["get", "radius"], 0.85], 3], 1.8, ["+", ["get", "radius"], 3.2], 3.2, ["+", ["*", ["get", "radius"], 1.35], 4]],
            "circle-color": ["get", "color"],
            "circle-stroke-color": "#D96B1C",
            "circle-stroke-width": 2.8,
            "circle-opacity": 1,
          },
        });
        window.clearTimeout(styleTimer);
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
          map.jumpTo(globeView(width, height));
        };
        frameRef.current = frame;
        frame();
        setReady(true);
        let revealed = false;
        const reveal = () => {
          if (dead || revealed || !map) return;
          // The style is already the orange/cream globe. Waiting on map.loaded()
          // leaves the skeleton up when a tile request never settles.
          revealed = true;
          frame();
          setPainted(true);
          spin();
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
        hovering = true;
        map!.getCanvas().style.cursor = "pointer";
        setHover(hit);
      });
      map.on("mouseleave", "campus-dots", () => {
        hovering = false;
        if (map) map.getCanvas().style.cursor = "";
        setHover(null);
      });
      // Hit-test in layout CSS pixels. Touch + CSS transform break MapLibre's
      // event.point; rebuild from clientX/Y with DPR-safe scale correction.
      const pickCampus = (point: { x: number; y: number }) => {
        if (!map) return null;
        // Generous hit slop for finger + DPR; coords are layout CSS px (not device px).
        const pad = 36;
        const box: [[number, number], [number, number]] = [
          [point.x - pad, point.y - pad],
          [point.x + pad, point.y + pad],
        ];
        const features = map.queryRenderedFeatures(box, { layers: ["campus-dots"] });
        const props = features[0]?.properties;
        if (!props) return null;
        return {
          id: String(props.id ?? ""),
          name: String(props.name ?? ""),
          founders: Number(props.founders ?? 0),
          signals: Number(props.signals ?? 0),
          country: String(props.country ?? ""),
          x: point.x,
          y: point.y,
        };
      };
      const pointFromMapEvent = (event: { point?: { x: number; y: number }; originalEvent?: Event }) => {
        if (!map) return event.point ?? null;
        const client = clientPointFromEvent(event.originalEvent ?? null);
        if (client) {
          return mapPointFromPointer(map.getCanvasContainer(), client.clientX, client.clientY);
        }
        return event.point ?? null;
      };
      const selectAt = (event: { point?: { x: number; y: number }; originalEvent?: Event }) => {
        const point = pointFromMapEvent(event);
        if (!point) return;
        const hit = pickCampus(point);
        if (!hit?.id) return;
        setPinned({ id: hit.id, name: hit.name, founders: hit.founders, signals: hit.signals, country: hit.country });
        onSelect(hit.id);
      };
      map.on("click", (event) => selectAt(event));
      // touchend: some mobile WebViews drop click after Clear; same hit path.
      const selectFromClient = (clientX: number, clientY: number, ev?: Event) => {
        const point = mapPointFromPointer(map!.getCanvasContainer(), clientX, clientY);
        const hit = pickCampus(point);
        if (!hit?.id) return false;
        ev?.preventDefault?.();
        setPinned({ id: hit.id, name: hit.name, founders: hit.founders, signals: hit.signals, country: hit.country });
        onSelect(hit.id);
        return true;
      };
      map.getCanvas().addEventListener(
        "touchend",
        (ev) => {
          if (!ev.changedTouches?.length) return;
          if (ev.changedTouches.length !== 1) return;
          const t = ev.changedTouches[0]!;
          selectFromClient(t.clientX, t.clientY, ev);
        },
        { passive: false },
      );
      map.getCanvas().addEventListener(
        "pointerup",
        (ev) => {
          if (ev.pointerType === "mouse") return; // map click handler covers mouse
          if (ev.button != null && ev.button !== 0) return;
          selectFromClient(ev.clientX, ev.clientY, ev);
        },
        { passive: false },
      );
      const hold = () => {
        interacting = true;
      };
      const release = () => {
        interacting = false;
      };
      map.on("dragstart", hold);
      map.on("dragend", release);
      map.on("zoomstart", (event) => {
        if (event.originalEvent) interacting = true;
      });
      map.on("zoomend", release);
      map.on("moveend", () => {
        if (!interacting) spin();
      });
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
      motion.removeEventListener("change", onMotion);
      map?.remove();
      mapRef.current = null;
    };
    // The map is created once. Campus data is pushed in the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    frameRef.current?.();
  }, [stageHeight]);

  useEffect(() => {
    const source = mapRef.current?.getSource("campuses");
    if (!source) return;
    source.setData(campusCollection(campuses));
  }, [campuses, ready]);

  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const selected = selectedId ? ["==", ["get", "id"], selectedId] : ["==", ["get", "id"], ""];
    mapRef.current.setFilter("campus-selected", selected);
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

  useEffect(() => {
    if (!selectedId) {
      setPinned(null);
      return;
    }
    const campus = campuses.find((c) => c.id === selectedId);
    if (campus) {
      setPinned({ id: campus.id, name: campus.name, founders: campus.founders, signals: campus.signals, country: campus.country });
    }
  }, [selectedId, campuses]);


  function focus(campus: TileCampus) {
    mapRef.current?.flyTo({ center: [campus.lon, campus.lat], zoom: 3.1, essential: true });
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
  const quietUniverse = companies.length - signaledUniverse;

  // One campus count: the campuses actually drawn on the globe.
  const universeCounts = catalogReady
    ? sampleSurfaceCounts(companies, campuses)
    : { companies: companyCount, foundersListed, campusesOnMap: campuses.length };
  const campusesOnMap = universeCounts.campusesOnMap;

  const rankedCampuses = useMemo(() => campusFoundersRanked(campuses), [campuses]);
  const topCampuses = useMemo(() => campusFoundersTop(campuses, CAMPUS_FOUNDERS_VISIBLE), [campuses]);
  const [showAllCampuses, setShowAllCampuses] = useState(false);
  const plateCampuses = showAllCampuses ? rankedCampuses : topCampuses;

  return (
    <div className={className} data-fold-mobile-root="">
      <div className="mb-2 flex flex-wrap items-end justify-between gap-x-4 gap-y-1" data-fold-counts="">
        <p className="flex min-w-0 flex-wrap items-baseline gap-x-2.5 gap-y-1 text-[12px] tabular-nums leading-5 text-[color:var(--fg-2,#3F465C)]">
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
        <p className="mt-1 hidden text-[12px] text-[color:var(--fg,#0B0E17)] lg:block">Click a campus to see its founders.</p>
      </div>

      <section className="mb-4" data-fold-desk-map="" aria-label="Map">
        <h2 className="mb-2 text-[12px] font-semibold tracking-tight text-[color:var(--cobalt,#2F4FD8)]">Map</h2>
        <div
          className="relative overflow-hidden rounded-none border border-[color:var(--cobalt,#2F4FD8)]/45 bg-[linear-gradient(165deg,#FBFCFE_0%,#F0F3FA_48%,#E6EBF6_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.85),inset_0_-18px_40px_rgba(47,79,216,0.07),0_1px_2px_rgba(15,23,42,0.04)] before:pointer-events-none before:absolute before:inset-2 before:z-[1] before:border before:border-[color:var(--cobalt,#2F4FD8)]/15 before:content-[''] after:pointer-events-none after:absolute after:inset-0 after:z-[1] after:bg-[radial-gradient(ellipse_at_30%_20%,rgba(255,255,255,0.55),transparent_55%),radial-gradient(ellipse_at_70%_85%,rgba(47,79,216,0.08),transparent_50%)] after:content-['']"
          style={{ height: stageHeight }}
          data-dispatch-map-stage=""
          data-globe-state={painted ? "ready" : failed ? "error" : "loading"}
        >
          <div ref={mapNode} className={`relative z-[2] h-full w-full ${painted && !failed ? "" : "invisible"}`} />
          {!painted ? (
            <div className="absolute inset-0 z-30 bg-[#FFFFFF]" aria-busy="true" aria-live="polite">
              <div className="grid h-full place-items-center">
                <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[color:var(--cobalt,#2F4FD8)]">{failed ? "Globe unavailable" : "Loading globe"}</p>
              </div>
            </div>
          ) : null}
          <div className="pointer-events-auto absolute bottom-2 left-1/2 z-10 -translate-x-1/2" data-map-credit>
            <p className="rounded bg-[color:var(--bg,#FFFFFF)]/80 px-2 py-0.5 font-mono text-[9px] text-[color:var(--fg-3,#5C647A)]">
              <MapCredit />
            </p>
          </div>
          {hover && (!pinned || pinned.id !== hover.id) ? (
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
          {pinned ? (
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
                  onClick={() => onSelect(pinned.id)}
                  className="shrink-0 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[color:var(--ember,#D96B1C)] hover:underline"
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
          <div className="pointer-events-none absolute right-2 top-2 z-20 max-w-[160px] rounded-sm border border-[color:var(--line,#E1E5EF)] bg-[color:var(--bg,#FFFFFF)]/92 px-2 py-1.5" data-fold-map-legend="">
            <p className="font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-[color:var(--fg-3,#5C647A)]">Markers</p>
            <p className="mt-0.5 text-[10px] leading-3.5 text-[color:var(--fg-2,#3F465C)]">Size = founders · cobalt top desks · ember ring = selected</p>
          </div>
        </div>
      </section>

      <section className="mt-3 max-w-sm" data-campus-metric="founders" data-mobile-campus-picker="">
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
                    className={`flex w-full items-baseline gap-2 px-1 py-2 text-left hover:bg-[color:var(--cobalt-haze,#E8ECFA)]/50 ${active ? "bg-[color:var(--ember,#D96B1C)]/8" : ""}`}
                  >
                    <span className="w-5 shrink-0 text-right font-mono text-[12px] font-bold tabular-nums text-[color:var(--ember,#D96B1C)]">
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
            <a href="/campuses" className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--fg-3,#5C647A)] underline-offset-2 hover:underline">
              Campus index
            </a>
          </div>
          <p className="mt-2 text-[12px] leading-5 text-[color:var(--fg-3,#5C647A)]">{markerSizeLegend()}</p>
        </section>
    </div>
  );
}
