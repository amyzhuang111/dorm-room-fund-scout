"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { loadMapLibre } from "@/lib/client/map-prefetch";
import { markerRadiusByFounders, markerSizeLegend } from "@/lib/domain/marker-radius";
import { absoluteDate } from "@/lib/domain/relative-time";
import { shortCampusLabel } from "@/lib/domain/campuses";
import { sampleSurfaceCounts, type FacetCompany } from "@/lib/domain/sample-facets";
import { MapCredit } from "./map-credit";
import {
  applyFacets,
  emptyFacets,
  FacetRail,
  IntelligenceBoards,
  MobileFilterDock,
  MobileWireStrip,
  campusFoundersTop,
  PANEL,
  ScoutChronograph,
  signalChronographDetail,
  chronographCaption,
  topPrograms,
  sectorMix,
  contentsPageInsight,
  type FacetState,
} from "./sample-instrument";
import "maplibre-gl/dist/maplibre-gl.css";

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

const OCEAN = "#FFDBBB";
const LAND = "#DD8A4E";
const BOUNDARY = "#C4733E";
const BRAND = "#FB651E";
const COUNT = "font-bold tabular-nums text-[color:var(--ember,#D96B1C)]";

const COUNTRY_COLOR: Record<string, string> = {
  "United States": "#3b6fd8",
  Canada: "#e23b4a",
  "United Kingdom": "#2f9e6b",
};

function markerColor(country: string): string {
  return COUNTRY_COLOR[country] ?? BRAND;
}

/** Orange land and cream ocean are in the style, so the first painted frame is the globe, not stock positron. */
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
      paint: { "line-color": BOUNDARY, "line-width": 0.6, "line-opacity": 0.4 },
    },
    {
      id: "boundary",
      type: "line",
      source: "openmaptiles",
      "source-layer": "boundary",
      filter: ["any", ["==", ["get", "admin_level"], 2], ["==", ["get", "admin_level"], "2"]],
      paint: { "line-color": BOUNDARY, "line-width": 0.7, "line-opacity": 0.5 },
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
  const diameter = minDim * 0.92;
  const zoom = Math.log2((diameter * Math.PI) / 512);
  // Faces the US, with Canada and the UK still on the near side.
  return { center: [-72, 36], zoom: Math.min(3, Math.max(0.4, zoom)) };
}

function campusCollection(campuses: TileCampus[]) {
  /** Founders-weighted map: top desks + label priority match campus plates (Penn / Stanford / MIT). */
  const ranked = [...campuses].sort((a, b) => b.founders - a.founders || a.name.localeCompare(b.name));
  const topIds = new Set(ranked.slice(0, 3).map((c) => c.id));
  const labelRank = new Map(ranked.slice(0, 8).map((c, i) => [c.id, i + 1]));
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
  selectedId,
  onSelect,
  className = "",
  dataThrough = null,
}: {
  campuses: TileCampus[];
  companies?: TileCompany[];
  /** Full catalog size, used until /data/directory.json arrives. */
  companyCount?: number;
  foundersListed?: number;
  selectedId?: string | null;
  onSelect: (id: string) => void;
  className?: string;
  /** ISO from HeroStats.updatedAt / latestDataTimestamp — never invent. */
  dataThrough?: string | null;
}) {
  const mapNode = useRef<HTMLDivElement | null>(null);
  const [stageHeight, setStageHeight] = useState(780);
  const mapRef = useRef<{
    getSource: (id: string) => { setData: (data: unknown) => void } | undefined;
    setFilter: (layer: string, filter: unknown) => void;
    flyTo: (opts: object) => void;
      jumpTo: (opts: object) => void;
      resize: () => void;
    loaded: () => boolean;
  } | null>(null);
  const frameRef = useRef<(() => void) | null>(null);
  const [facets, setFacets] = useState<FacetState>(emptyFacets);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [hover, setHover] = useState<{ name: string; founders: number; signals: number; x: number; y: number } | null>(null);
  const [ready, setReady] = useState(false);
  const [painted, setPainted] = useState(false);
  const [failed, setFailed] = useState(false);

  const country = facets.country;
  const shown = useMemo(
    () => (country ? campuses.filter((campus) => campus.country === country) : campuses),
    [campuses, country],
  );
  const countryIds = useMemo(() => new Set(shown.map((campus) => campus.id)), [shown]);
  const filteredCompanies = useMemo(() => {
    const scope = country ? countryIds : undefined;
    const base = applyFacets(companies, facets, scope);
    if (selectedId) return base.filter((company) => company.schoolId === selectedId);
    return base;
  }, [companies, facets, country, countryIds, selectedId]);
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
      getCenter: () => { lng: number; lat: number };
      easeTo: (opts: object) => void;
      flyTo: (opts: object) => void;
      jumpTo: (opts: object) => void;
      resize: () => void;
      remove: () => void;
      loaded: () => boolean;
      getCanvas: () => HTMLCanvasElement;
      getCanvasContainer: () => HTMLElement;
    } | null = null;

    const fit = () => {
      const node = mapNode.current;
      const wide = window.innerWidth >= 1024;
      const docTop = node ? node.getBoundingClientRect().top + window.scrollY : wide ? 96 : 120;
      // Desktop strip is inside the stage. Mobile chips and the strip sit under it.
      const reserve = wide ? 8 : 320; // room for Live + Ledger strip under the stage
      const available = Math.round(window.innerHeight - docTop - reserve);
      const raw = Math.max(wide ? 520 : 220, available);
      setStageHeight(wide ? raw : Math.min(260, raw));
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
            "sky-color": "#FFE8D6",
            "horizon-color": "#FFF8F2",
            "fog-color": "#FFF3E9",
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
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 0.4, ["+", ["*", ["get", "radius"], 0.85], 3], 1.8, ["+", ["get", "radius"], 4], 3.2, ["+", ["*", ["get", "radius"], 1.4], 5]],
            "circle-color": "#D96B1C",
            "circle-opacity": 0.2,
            "circle-stroke-width": 0,
          },
        });
        map.addLayer({
          id: "campus-dots",
          type: "circle",
          source: "campuses",
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 0.4, ["*", ["get", "radius"], 0.85], 1.8, ["get", "radius"], 3.2, ["*", ["get", "radius"], 1.35]],
            "circle-color": ["get", "color"],
            "circle-stroke-color": "#FFFFFF",
            "circle-stroke-width": ["case", ["==", ["get", "top"], 1], 1.6, 1.05],
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
          if (!map.loaded()) return;
          revealed = true;
          frame();
          setPainted(true);
          spin();
        };
        if (map.loaded()) reveal();
        map.on("idle", reveal);
      });

      const read = (event: { features?: { properties?: Record<string, unknown> }[]; point?: { x: number; y: number } }) => {
        const props = event.features?.[0]?.properties;
        if (!props || !event.point) return null;
        return {
          id: String(props.id ?? ""),
          name: String(props.name ?? ""),
          founders: Number(props.founders ?? 0),
          signals: Number(props.signals ?? 0),
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
      map.on("click", "campus-dots", (event) => {
        const hit = read(event);
        if (hit?.id) onSelect(hit.id);
      });
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
    const countryFilter = country ? ["==", ["get", "country"], country] : null;
    mapRef.current.setFilter("campus-dots", countryFilter);
    mapRef.current.setFilter(
      "campus-halo",
      country
        ? ["all", ["==", ["get", "top"], 1], ["==", ["get", "country"], country]]
        : ["==", ["get", "top"], 1],
    );
    const selected = selectedId
      ? country
        ? ["all", ["==", ["get", "id"], selectedId], ["==", ["get", "country"], country]]
        : ["==", ["get", "id"], selectedId]
      : ["==", ["get", "id"], ""];
    mapRef.current.setFilter("campus-selected", selected);
  }, [country, ready, selectedId]);


  function focus(campus: TileCampus) {
    mapRef.current?.flyTo({ center: [campus.lon, campus.lat], zoom: 3.1, essential: true });
    onSelect(campus.id);
    setFacets((prev) => ({ ...prev, campus: campus.id }));
  }

  function onFacetChange(next: FacetState) {
    setFacets(next);
    if (next.campus && next.campus !== facets.campus) {
      const campus = campuses.find((row) => row.id === next.campus);
      if (campus) {
        mapRef.current?.flyTo({ center: [campus.lon, campus.lat], zoom: 3.1, essential: true });
        onSelect(campus.id);
      }
    }
  }

  const catalogReady = companies.length > 0;
  const liveCount = catalogReady ? filteredCompanies.length : companyCount;
  const signaledLive = useMemo(
    () => filteredCompanies.filter((c) => (c.signals ?? 0) > 0).length,
    [filteredCompanies],
  );
  const quietLive = liveCount - signaledLive;
  const facetsActive = useMemo(() => {
    const f = facets;
    return Boolean(
      f.query.trim() ||
        f.sector ||
        f.sectorMissing ||
        f.kind ||
        f.stage ||
        f.campus ||
        f.country ||
        f.recency ||
        f.foundedYear != null ||
        f.yearMissing ||
        f.status ||
        f.flag ||
        f.hqRegion,
    );
  }, [facets]);
  const filterSliceLabel = useMemo(() => {
    if (facets.flag === "new") return "Founded in 2026";
    if (facets.flag === "signaled") return "Active this month";
    if (facets.flag === "funded") return "Raised funding";
    if (facets.flag === "founders") return "Has named founders";
    if (facets.sector) return facets.sector;
    if (facets.status) return facets.status;
    if (facets.campus) {
      const campus = campuses.find((row) => row.id === facets.campus);
      return campus ? campus.name.replace(/^University of /, "").replace(/ University$/, "") : "Campus";
    }
    if (facets.foundedYear != null) return `Founded ${facets.foundedYear}`;
    if (facets.hqRegion) return facets.hqRegion;
    if (facets.query.trim()) return `Search “${facets.query.trim()}”`;
    return "Filtered slice";
  }, [facets, campuses]);

  const universeChrono = useMemo(() => signalChronographDetail(companies), [companies]);
  const peakBar = useMemo(() => universeChrono.bars.find((b) => b.peak) ?? null, [universeChrono]);
  // Third mast beat: leading program (not peak 369 — chronograph owns the peak).
  const leadProgram = useMemo(() => topPrograms(companies)[0] ?? null, [companies]);
  const leadSector = useMemo(() => sectorMix(companies)[0] ?? null, [companies]);
  const dispatchInsight = useMemo(() => contentsPageInsight(companies), [companies]);
  const signaledUniverse = useMemo(() => companies.filter((c) => c.signals > 0).length, [companies]);
  const quietUniverse = companies.length - signaledUniverse;
  const sliceLeadProgram = useMemo(() => topPrograms(filteredCompanies)[0] ?? null, [filteredCompanies]);
  const sliceLeadSector = useMemo(() => sectorMix(filteredCompanies)[0] ?? null, [filteredCompanies]);
  const sliceSignaled = useMemo(() => filteredCompanies.filter((c) => c.signals > 0).length, [filteredCompanies]);
  const sliceQuiet = filteredCompanies.length - sliceSignaled;

  // Masthead founders/campuses match the sample strip (universe totals via sampleSurfaceCounts),
  // not the filtered map/facet slice — so strip and fold data-count nodes never diverge.
  const universeCounts = catalogReady
    ? sampleSurfaceCounts(companies, campuses)
    : { companies: companyCount, foundersListed, campusesOnMap: campuses.length };

  /** Campus plates sitewide — ranked by founder names (Penn 757 / Stanford 300 / MIT 238). */
  const topDesksByFounders = useMemo(() => campusFoundersTop(campuses, 8), [campuses]);
  const topCampus = topDesksByFounders[0] ?? null;

  return (
    <div className={className} data-fold-mobile-root="">
      {/* Full-width dual-figure masthead — newspaper banner, not a left-column stamp */}
      <div className="mb-3 border-b border-[color:var(--line,#E1E5EF)] pb-3" data-fold-counts="">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[color:var(--ember,#D96B1C)]" aria-hidden />
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[color:var(--cobalt,#2F4FD8)]">Scout dispatch</p>
          <span
            className="inline-flex items-center rounded-sm border border-[color:var(--line-strong,#C5CAD8)] bg-[color:var(--bg,#FFFFFF)] px-1.5 py-0.5 font-mono text-[9px] tabular-nums tracking-[0.04em] text-[color:var(--fg-2,#3F465C)]"
            data-dispatch-snapshot=""
          >
            Snapshot · {absoluteDate(dataThrough)}
          </span>
        </div>
        <div className="mt-3 grid items-end gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6" data-dispatch-dual="">
          <div className="min-w-0" data-dispatch-figure="">
            <p className="mt-0 font-mono text-[64px] font-bold leading-[0.88] tracking-[-0.07em] text-[color:var(--ember,#D96B1C)] sm:text-[72px] lg:text-[80px]">
              {liveCount.toLocaleString("en-US")}
            </p>
            <div className="mt-2 flex items-end gap-2" aria-hidden>
              <span className="h-px w-8 bg-[color:var(--cobalt,#2F4FD8)]" />
              <span className="h-[3px] flex-1 max-w-[180px] bg-[color:var(--ember,#D96B1C)]" />
            </div>
            <p className="mt-2 text-[16px] font-semibold leading-tight tracking-tight text-[color:var(--fg,#0B0E17)] sm:text-[17px]">
              companies forming on campus
            </p>
          </div>
          {topCampus ? (
            <div className="min-w-0 border-t border-[color:var(--line,#E1E5EF)] pt-2.5 sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0" data-top-desk-figure="">
              {/* Mobile: one quiet line so 2,513 + chronograph own the fold. Desk: dual figure + peak beat. */}
              <div className="sm:hidden" data-top-desk-compact="">
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--ember,#D96B1C)]">01 · top desk</p>
                <p className="mt-1 text-[15px] font-semibold tracking-tight text-[color:var(--fg,#0B0E17)]">
                  {topCampus.name.replace(/^University of /, "").replace(/ University$/, "")}
                  <span className="ml-2 font-mono text-[12px] font-bold tabular-nums text-[color:var(--ember,#D96B1C)]">
                    {topCampus.founders.toLocaleString("en-US")}
                  </span>
                  <span className="font-mono text-[11px] text-[color:var(--fg-2,#3F465C)]"> founders · </span>
                  <span className="font-mono text-[12px] font-bold tabular-nums text-[color:var(--ember,#D96B1C)]">
                    {topCampus.signals.toLocaleString("en-US")}
                  </span>
                  <span className="font-mono text-[11px] text-[color:var(--fg-2,#3F465C)]"> signals</span>
                </p>
                {dispatchInsight ? (
                  <p className="mt-1 font-mono text-[11px] tabular-nums text-[color:var(--fg-2,#3F465C)]" data-mobile-dispatch-whisper="">
                    <span className="font-bold text-[color:var(--ember,#D96B1C)]">{dispatchInsight.detail}</span>
                    {" · "}
                    {dispatchInsight.label}
                  </p>
                ) : null}
              </div>
              <div className="hidden sm:block">
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--ember,#D96B1C)]">01 · top desk</p>
                <p className="mt-1 text-[28px] font-bold leading-[0.95] tracking-tight text-[color:var(--fg,#0B0E17)] sm:text-[32px] lg:text-[36px]">
                  {shortCampusLabel(topCampus.id, topCampus.name)}
                </p>
                <p className="mt-1.5 font-mono text-[11px] tabular-nums text-[color:var(--fg-2,#3F465C)]">
                  {"#1 by founder names · chronograph is the desk"}
                </p>
              </div>
            </div>
          ) : null}
          {/* Desk fifth beat: leading program (real density). Chronograph keeps peak 369 — no mast echo. Hidden on mobile so fold-375 holds. */}
          <div className="hidden min-w-0 border-l border-[color:var(--line,#E1E5EF)] pl-6 lg:block" data-program-desk-figure="">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--cobalt,#2F4FD8)]">01 · program desk</p>
            <p className="mt-1 font-mono text-[64px] font-bold leading-[0.9] tracking-[-0.06em] text-[color:var(--ember,#D96B1C)]">
              {(leadProgram?.count ?? 0).toLocaleString("en-US")}
            </p>
            <p className="mt-1 text-[16px] font-semibold tracking-tight text-[color:var(--fg,#0B0E17)]">
              {leadProgram?.label ?? "Program"}
            </p>
            <p className="mt-0.5 font-mono text-[11px] tabular-nums text-[color:var(--fg-2,#3F465C)]">
              <span className={COUNT}>{signaledUniverse.toLocaleString("en-US")}</span>
              {" with signal · "}
              <span className={COUNT}>{quietUniverse.toLocaleString("en-US")}</span>
              {" quiet"}
              {leadSector ? (
                <>
                  {" · "}
                  <span className={COUNT}>{leadSector.count.toLocaleString("en-US")}</span>
                  {" "}
                  {leadSector.label}
                </>
              ) : null}
            </p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-2">
          <p className="font-mono text-[11px] tabular-nums leading-relaxed text-[color:var(--fg-2,#3F465C)]">
            <span className={COUNT} data-count="founders-listed">{universeCounts.foundersListed.toLocaleString("en-US")}</span>
            {" founder names listed"}
            <span className="mx-1.5 text-[color:var(--line-strong,#C5CAD8)]">·</span>
            <span className={COUNT} data-count="campuses-on-map">{universeCounts.campusesOnMap.toLocaleString("en-US")}</span>
            {" campuses on map"}
          </p>
          <div className="flex shrink-0 flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setFiltersOpen((v) => !v)}
              className="hidden h-8 items-center rounded-sm border border-[color:var(--line-strong,#C5CAD8)] bg-[color:var(--bg,#FFFFFF)] px-3 font-mono text-[11px] font-medium text-[color:var(--fg,#0B0E17)] hover:border-[color:var(--cobalt,#2F4FD8)] lg:inline-flex"
            >
              {filtersOpen ? "Show desk roster" : "Filters"}
            </button>
            <a
              href="/ask"
              className="inline-flex h-8 items-center rounded-sm border border-[color:var(--ember,#D96B1C)] bg-[color:var(--ember,#D96B1C)] px-3 font-mono text-[11px] font-semibold text-white"
            >
              Scout ask
            </a>
          </div>
        </div>
      </div>

      {/* Scout Chronograph — full-width. Desk: global 369. Filters open + facet: filtered-slice hero. */}
      <div className="mb-3" data-fold-chronograph="" data-fold-filters-slice={filtersOpen && facetsActive ? "1" : undefined}>
        {filtersOpen && !facetsActive ? (
          <div
            className="relative overflow-hidden border border-[color:var(--ember,#D96B1C)]/40 bg-[color:var(--bg,#FFFFFF)] px-3 py-3 before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-[color:var(--ember,#D96B1C)] sm:px-4"
            data-fold-filter-invite=""
            data-fold-contents-lead=""
          >
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--ember,#D96B1C)]">Contents · dispatch index</p>
            <div className="mt-2 grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-6">
              <div>
                <p className="font-mono text-[48px] font-bold leading-[0.88] tracking-[-0.07em] text-[color:var(--ember,#D96B1C)] sm:text-[56px]">
                  {signaledUniverse.toLocaleString("en-US")}
                </p>
                <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.1em] text-[color:var(--fg-2,#3F465C)]">with signal</p>
              </div>
              <div>
                <p className="font-mono text-[48px] font-bold leading-[0.88] tracking-[-0.07em] text-[color:var(--fg,#0B0E17)] sm:text-[56px]">
                  {quietUniverse.toLocaleString("en-US")}
                </p>
                <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.1em] text-[color:var(--fg-2,#3F465C)]">quiet</p>
              </div>
              {dispatchInsight ? (
                <div className="col-span-2 sm:col-span-1">
                  <p className="font-mono text-[48px] font-bold leading-[0.88] tracking-[-0.07em] text-[color:var(--ember,#D96B1C)] sm:text-[56px]">
                    {dispatchInsight.signaled.toLocaleString("en-US")}
                  </p>
                  <p className="mt-1 text-[13px] font-semibold tracking-tight text-[color:var(--fg,#0B0E17)]">{dispatchInsight.label}</p>
                  <p className="mt-0.5 font-mono text-[10px] tabular-nums text-[color:var(--fg-2,#3F465C)]">{dispatchInsight.detail}</p>
                </div>
              ) : null}
            </div>
            <p className="mt-2 font-mono text-[11px] tabular-nums text-[color:var(--fg-2,#3F465C)]">
              {chronographCaption(universeChrono)}
              {leadSector ? (
                <>
                  {" · "}
                  <span className="font-bold text-[color:var(--ember,#D96B1C)]">{leadSector.count.toLocaleString("en-US")}</span>
                  {" "}
                  {leadSector.label}
                </>
              ) : null}
            </p>
            <p className="mt-1 font-mono text-[10px] text-[color:var(--fg-3,#5C647A)]">
              Open a flag or sector in Contents for a filtered-slice chronograph
            </p>
          </div>
        ) : filtersOpen && facetsActive ? (
          <div className="space-y-2" data-fold-filters-slice-lead="">
            <div
              className="relative overflow-hidden border border-[color:var(--ember,#D96B1C)]/40 bg-[color:var(--bg,#FFFFFF)] px-3 py-3 before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-[color:var(--ember,#D96B1C)] sm:px-4"
              data-fold-slice-contents=""
            >
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--ember,#D96B1C)]">
                Contents · {filterSliceLabel}
              </p>
              <div className="mt-2 grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-6">
                <div>
                  <p className="font-mono text-[48px] font-bold leading-[0.88] tracking-[-0.07em] text-[color:var(--ember,#D96B1C)] sm:text-[56px]">
                    {liveCount.toLocaleString("en-US")}
                  </p>
                  <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.1em] text-[color:var(--fg-2,#3F465C)]">matching</p>
                </div>
                <div>
                  <p className="font-mono text-[48px] font-bold leading-[0.88] tracking-[-0.07em] text-[color:var(--fg,#0B0E17)] sm:text-[56px]">
                    {sliceSignaled.toLocaleString("en-US")}
                  </p>
                  <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.1em] text-[color:var(--fg-2,#3F465C)]">with signal</p>
                </div>
                {sliceLeadProgram ? (
                  <div className="col-span-2 sm:col-span-1">
                    <p className="font-mono text-[48px] font-bold leading-[0.88] tracking-[-0.07em] text-[color:var(--ember,#D96B1C)] sm:text-[56px]">
                      {sliceLeadProgram.count.toLocaleString("en-US")}
                    </p>
                    <p className="mt-1 text-[13px] font-semibold tracking-tight text-[color:var(--fg,#0B0E17)]">{sliceLeadProgram.label}</p>
                    <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-[color:var(--fg-2,#3F465C)]">on this slice</p>
                  </div>
                ) : (
                  <div>
                    <p className="font-mono text-[48px] font-bold leading-[0.88] tracking-[-0.07em] text-[color:var(--fg,#0B0E17)] sm:text-[56px]">
                      {sliceQuiet.toLocaleString("en-US")}
                    </p>
                    <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.1em] text-[color:var(--fg-2,#3F465C)]">quiet</p>
                  </div>
                )}
              </div>
              <p className="mt-2 font-mono text-[11px] tabular-nums text-[color:var(--fg-2,#3F465C)]">
                <span className="font-bold text-[color:var(--ember,#D96B1C)]">{sliceQuiet.toLocaleString("en-US")}</span>
                {" quiet"}
                {sliceLeadSector ? (
                  <>
                    {" · "}
                    <span className="font-bold text-[color:var(--ember,#D96B1C)]">{sliceLeadSector.count.toLocaleString("en-US")}</span>
                    {" "}
                    {sliceLeadSector.label}
                  </>
                ) : null}
              </p>
            </div>
          </div>
        ) : null}
      </div>

      {/* Fold owns the chronograph dial exclusively — 8px rhythm, peak-share moment, one dial. */}
      <div className="mb-4 hidden space-y-4 lg:block" data-fold-chrono-identity="" data-fold-chrono-typographic="" data-fold-baseline="8">
        <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] items-end gap-4 border-b border-[color:var(--line,#E1E5EF)] pb-4" data-fold-peak-share="">
          <div className="min-w-0">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.28em] text-[color:var(--cobalt,#2F4FD8)]">Peak share</p>
            <p className="mt-2 font-mono text-[72px] font-bold leading-[0.82] tracking-[-0.08em] text-[color:var(--ember,#D96B1C)]">
              {(peakBar?.count ?? 0).toLocaleString("en-US")}
              <span className="mx-2 text-[28px] font-semibold tracking-[-0.04em] text-[color:var(--fg-3,#5C647A)]">/</span>
              <span className="text-[40px] font-bold tracking-[-0.06em] text-[color:var(--fg,#0B0E17)]">{universeChrono.dated.toLocaleString("en-US")}</span>
            </p>
            <p className="mt-3 max-w-[36rem] text-[18px] font-semibold leading-snug tracking-tight text-[color:var(--fg,#0B0E17)]">
              {peakBar?.label ?? "Peak month"} took{" "}
              <span className="text-[color:var(--ember,#D96B1C)]">
                {Math.round(((peakBar?.count ?? 0) / Math.max(1, universeChrono.dated)) * 100)}%
              </span>
              {" of every dated signal on record"}
            </p>
          </div>
          <div className="min-w-0 self-stretch border-l border-[color:var(--line,#E1E5EF)] pl-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--ember,#D96B1C)]">Scout edition</p>
            <p className="mt-3 font-mono text-[13px] leading-6 tabular-nums text-[color:var(--fg-2,#3F465C)]">
              <span className="font-bold text-[color:var(--ember,#D96B1C)]">{universeChrono.dated.toLocaleString("en-US")}</span>
              {" dated"}
              <br />
              <span className="font-bold text-[color:var(--fg,#0B0E17)]">{quietLive.toLocaleString("en-US")}</span>
              {" quiet"}
              <br />
              <span className="font-bold text-[color:var(--fg,#0B0E17)]">{universeCounts.foundersListed.toLocaleString("en-US")}</span>
              {" founder names"}
              <br />
              <span className="font-bold text-[color:var(--fg,#0B0E17)]">{universeCounts.campusesOnMap.toLocaleString("en-US")}</span>
              {" campuses on map"}
            </p>
          </div>
        </div>
        <ScoutChronograph
          companies={filteredCompanies}
          variant="hero"
          kicker="Chronograph · fold owns this dial"
          reading={`Baseline 8 · peak owns the fold · ${quietLive.toLocaleString("en-US")} quiet`}
        />
      </div>

      {/* Structural desk: roster | map | wire. Filters open: Contents | map | wire. Chronograph lives above. */}
      <div className="grid gap-4 lg:grid-cols-[minmax(200px,240px)_minmax(0,1.15fr)_minmax(200px,260px)]" data-fold-desk-spread="">
        <aside className="hidden min-w-0 lg:block" data-fold-desk-left="">
          <div className="sticky top-14 h-[min(78vh,780px)]">
            {filtersOpen ? (
              <div className="flex h-full min-h-0 flex-col gap-2" data-fold-filters-index="">
                {facetsActive ? (
                  <div
                    className="shrink-0 relative overflow-hidden border border-[color:var(--ember,#D96B1C)]/40 bg-[color:var(--bg,#FFFFFF)] px-2.5 py-2 before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-[color:var(--ember,#D96B1C)]"
                    data-fold-filter-slice-pin=""
                  >
                    <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-[color:var(--ember,#D96B1C)]">Slice on</p>
                    <p className="mt-1 truncate text-[13px] font-semibold tracking-tight text-[color:var(--fg,#0B0E17)]">{filterSliceLabel}</p>
                    <p className="mt-0.5 font-mono text-[20px] font-bold leading-none tracking-[-0.04em] text-[color:var(--ember,#D96B1C)]">
                      {liveCount.toLocaleString("en-US")}
                    </p>
                    <p className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.1em] text-[color:var(--fg-2,#3F465C)]">matching</p>
                  </div>
                ) : null}
                <div className="min-h-0 flex-1">
                  <FacetRail
                    companies={companies}
                    campuses={campuses}
                    facets={facets}
                    onChange={onFacetChange}
                    index
                    indexCount={liveCount}
                    caption="Dispatch index"
                    onCampusFocus={(id) => {
                      const campus = campuses.find((row) => row.id === id);
                      if (campus) focus(campus);
                    }}
                    footer={<p>{markerSizeLegend()}</p>}
                  />
                </div>
              </div>
            ) : (
              <div className="flex h-full min-h-0 flex-col gap-2" data-desk-chronograph-col="">
                <div
                  className="relative min-h-0 flex-1 overflow-hidden border border-[color:var(--cobalt,#2F4FD8)]/30 bg-[color:var(--bg,#FFFFFF)] before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-[color:var(--cobalt,#2F4FD8)]"
                  data-desk-roster=""
                  data-campus-metric="founders"
                >
                  <div className="border-b border-[color:var(--line,#E1E5EF)] px-2.5 py-1.5">
                    <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-[color:var(--cobalt,#2F4FD8)]">Top desks · founders</p>
                  </div>
                  <ol className="divide-y divide-[color:var(--line,#E1E5EF)]" data-campus-founders-top="">
                    {topDesksByFounders.slice(0, 3).map((campus, i) => {
                      const active = selectedId === campus.id;
                      const label = shortCampusLabel(campus.id, campus.name);
                      return (
                        <li key={campus.id}>
                          <button
                            type="button"
                            onClick={() => focus(campus)}
                            className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-[color:var(--cobalt-haze,#E8ECFA)]/50 ${active ? "bg-[color:var(--ember,#D96B1C)]/8" : ""}`}
                          >
                            <span className="w-5 shrink-0 text-right font-mono text-[12px] font-bold tabular-nums text-[color:var(--ember,#D96B1C)]">
                              {String(i + 1).padStart(2, "0")}
                            </span>
                            <span className="min-w-0 flex-1 truncate text-[12px] font-semibold tracking-tight text-[color:var(--fg,#0B0E17)]">{label}</span>
                            <span className={`shrink-0 font-mono text-[11px] ${COUNT}`}>{campus.founders.toLocaleString("en-US")}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              </div>
            )}
          </div>
        </aside>

        <div className="min-w-0" data-fold-desk-map="">
          <div
            className="relative overflow-hidden rounded-none border-2 border-[color:var(--cobalt,#2F4FD8)]/35 bg-[#FFDBBB] shadow-[inset_0_0_0_1px_rgba(47,79,216,0.06),0_1px_0_rgba(217,107,28,0.18)]"
            style={{ height: stageHeight }}
            data-dispatch-map-stage=""
            data-globe-state={painted ? "ready" : failed ? "error" : "loading"}
          >
            <div ref={mapNode} className={`h-full w-full ${painted && !failed ? "" : "invisible"}`} />
            {!painted ? (
              <div className="absolute inset-0 z-30 bg-[#FFF7F0]" aria-busy="true" aria-live="polite">
                <div className="grid h-full place-items-center">
                  <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#6b5443]">{failed ? "Globe unavailable" : "Loading globe"}</p>
                </div>
              </div>
            ) : null}
            <div className="pointer-events-auto absolute bottom-2 left-1/2 z-10 hidden -translate-x-1/2 lg:block" data-map-credit>
              <p className="rounded bg-[color:var(--bg,#FFFFFF)]/80 px-2 py-0.5 font-mono text-[9px] text-[color:var(--fg-3,#5C647A)]">
                <MapCredit />
              </p>
            </div>
            {hover ? (
              <div
                className="pointer-events-none absolute z-30 w-max max-w-[240px] -translate-x-1/2 -translate-y-full rounded-lg border border-[color:var(--line,#E1E5EF)] bg-[color:var(--bg-raised,#FFFFFF)] px-2.5 py-1.5 text-left text-[color:var(--fg,#0B0E17)]"
                style={{ left: hover.x, top: Math.max(12, hover.y - 12) }}
              >
                <p className="text-[13px] font-medium leading-4">{hover.name}</p>
                <p className="mt-0.5 text-[12px] leading-4 text-[color:var(--fg-2,#3F465C)]">
                  <span className={COUNT}>{hover.founders.toLocaleString("en-US")}</span> founders
                  {" · "}
                  <span className={COUNT}>{hover.signals.toLocaleString("en-US")}</span> signals
                </p>
              </div>
            ) : null}
          </div>
        </div>

        <aside className="hidden min-w-0 lg:block" data-fold-desk-wire="">
          <div className="sticky top-14">
            <div className={`${PANEL} relative overflow-hidden p-3 before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-[color:var(--cobalt,#2F4FD8)]`}>
              <div className="mb-2 flex items-baseline justify-between gap-2 border-b border-[color:var(--line,#E1E5EF)] pb-2">
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--cobalt,#2F4FD8)]">Dispatch wire</p>
                <p className="font-mono text-[10px] tabular-nums text-[color:var(--fg-3,#5C647A)]">{filteredCompanies.length.toLocaleString("en-US")}</p>
              </div>
              <IntelligenceBoards companies={filteredCompanies} compact surface="fold" />
            </div>
          </div>
        </aside>
      </div>

      <div
        className="mt-4 space-y-8 lg:hidden"
        data-fold-counts-mobile=""
        data-mobile-fold-compose=""
        style={{ paddingBottom: "calc(5.75rem + env(safe-area-inset-bottom, 0px))" }}
      >
        <div className="space-y-4" data-mobile-fold-spine="" data-mobile-chrono-identity="">
          <ScoutChronograph
            companies={filteredCompanies}
            variant="spine"
            kicker="Fold · chronograph spine"
            reading={`Typographic spine · ${quietLive.toLocaleString("en-US")} quiet · ${liveCount.toLocaleString("en-US")} matching`}
          />
        </div>
        <div data-mobile-desk-roster="" data-campus-metric="founders">
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--cobalt,#2F4FD8)]">Top desks · founders</p>
            <p className="font-mono text-[9px] text-[color:var(--fg-3,#5C647A)]">Penn · Stanford · MIT</p>
          </div>
          <ol className="divide-y divide-[color:var(--line,#E1E5EF)] border border-[color:var(--line,#E1E5EF)]" data-campus-founders-top="">
            {topDesksByFounders.slice(0, 3).map((campus, i) => {
              const label = shortCampusLabel(campus.id, campus.name);
              return (
                <li key={campus.id}>
                  <button
                    type="button"
                    onClick={() => focus(campus)}
                    className="flex w-full items-baseline gap-2 px-3 py-2.5 text-left hover:bg-[color:var(--ember,#D96B1C)]/5"
                  >
                    <span className="w-5 shrink-0 text-right font-mono text-[11px] font-bold tabular-nums text-[color:var(--ember,#D96B1C)]">{String(i + 1).padStart(2, "0")}</span>
                    <span className="min-w-0 flex-1 truncate text-[13px] font-semibold tracking-tight text-[color:var(--fg,#0B0E17)]">{label}</span>
                    <span className={`shrink-0 font-mono text-[13px] font-bold ${COUNT}`}>{campus.founders.toLocaleString("en-US")}</span>
                    <span className="shrink-0 font-mono text-[9px] text-[color:var(--fg-3,#5C647A)]">founders</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
        {/* Secondary insight below spine hero — fold-mobile owns spine only above the fold. */}
        {dispatchInsight ? (
          <div
            className="relative overflow-hidden border border-[color:var(--ember,#D96B1C)]/40 bg-[color:var(--bg,#FFFFFF)] px-3.5 py-4 before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-[color:var(--ember,#D96B1C)]"
            data-mobile-fold-insight=""
          >
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--ember,#D96B1C)]">
              {filtersOpen && facetsActive ? `Contents · ${filterSliceLabel}` : "Dispatch · newest sector"}
            </p>
            {filtersOpen && facetsActive ? (
              <>
                <p className="mt-3 font-mono text-[52px] font-bold leading-[0.88] tracking-[-0.07em] text-[color:var(--ember,#D96B1C)]">
                  {sliceQuiet.toLocaleString("en-US")}
                </p>
                <p className="mt-2 text-[16px] font-semibold tracking-tight text-[color:var(--fg,#0B0E17)]">quiet on this slice</p>
                <p className="mt-2 font-mono text-[13px] font-semibold tabular-nums text-[color:var(--fg,#0B0E17)]">
                  <span className="font-bold text-[color:var(--ember,#D96B1C)]">{liveCount.toLocaleString("en-US")}</span>
                  {" matching · "}
                  <span className="font-bold text-[color:var(--ember,#D96B1C)]">{sliceSignaled.toLocaleString("en-US")}</span>
                  {" with signal"}
                  {sliceLeadSector ? (
                    <>
                      {" · "}
                      <span className="font-bold text-[color:var(--ember,#D96B1C)]">{sliceLeadSector.count.toLocaleString("en-US")}</span>
                      {" "}
                      {sliceLeadSector.label}
                    </>
                  ) : null}
                </p>
              </>
            ) : (
              <>
                <p className="mt-3 font-mono text-[52px] font-bold leading-[0.88] tracking-[-0.07em] text-[color:var(--ember,#D96B1C)]">
                  {dispatchInsight.signaled.toLocaleString("en-US")}
                </p>
                <p className="mt-2 text-[16px] font-semibold tracking-tight text-[color:var(--fg,#0B0E17)]">{dispatchInsight.label}</p>
                <p className="mt-2 font-mono text-[13px] font-semibold tabular-nums text-[color:var(--fg,#0B0E17)]">{dispatchInsight.detail}</p>
                <p className="mt-1.5 font-mono text-[11px] tabular-nums text-[color:var(--fg-2,#3F465C)]">
                  <span className="font-bold text-[color:var(--ember,#D96B1C)]">{dispatchInsight.figure.toLocaleString("en-US")}</span>
                  {" newest in window · fold lead"}
                </p>
              </>
            )}
          </div>
        ) : null}
        <MobileWireStrip companies={filteredCompanies} label="Dispatch wire" surface="fold" />
      </div>

      <MobileFilterDock
        onOpen={() => setMobileFiltersOpen(true)}
        count={liveCount}
        caption="Narrow the dispatch"
        tone="ember"
        kicker="Map filters"
        observe="[data-fold-mobile-root]"
      />
      {mobileFiltersOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Scout filters">
          <button type="button" className="absolute inset-0 bg-slate-900/35" aria-label="Close filters" onClick={() => setMobileFiltersOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 flex max-h-[min(82dvh,620px)] flex-col overflow-hidden rounded-t-md border border-[color:var(--cobalt,#2F4FD8)]/25 border-b-0 bg-[color:var(--bg,#FFFFFF)] shadow-[0_-8px_28px_rgba(15,23,42,0.12)] before:absolute before:inset-x-0 before:top-0 before:h-0.5 before:bg-[color:var(--cobalt,#2F4FD8)]">
            <div className="relative flex items-end justify-between gap-3 border-b border-[color:var(--line,#E1E5EF)] px-3 py-3 before:absolute before:inset-x-0 before:top-0 before:h-0.5 before:bg-[color:var(--ember,#D96B1C)]">
              <div className="min-w-0">
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--cobalt,#2F4FD8)]">Scout filters · {shown.length} campuses</p>
                <p className="mt-1 font-mono text-[40px] font-bold leading-none tracking-[-0.05em] text-[color:var(--ember,#D96B1C)]">{liveCount.toLocaleString("en-US")}</p>
                <p className="mt-1.5 text-[15px] font-semibold tracking-tight text-[color:var(--fg,#0B0E17)]">Narrow the dispatch</p>
                <p className="mt-0.5 font-mono text-[9px] tabular-nums text-[color:var(--fg-3,#5C647A)]">
                  <span className="font-bold text-[color:var(--ember,#D96B1C)]">{signaledLive.toLocaleString("en-US")}</span>
                  {" with signal · "}
                  <span className="font-bold text-[color:var(--fg,#0B0E17)]">{quietLive.toLocaleString("en-US")}</span>
                  {" quiet"}
                </p>
              </div>
              <button type="button" onClick={() => setMobileFiltersOpen(false)} className="inline-flex h-9 shrink-0 items-center rounded-sm border border-[color:var(--ember,#D96B1C)] bg-[color:var(--ember,#D96B1C)] px-3.5 font-mono text-[11px] font-semibold text-white">Done</button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              <div className="h-[min(70dvh,540px)]">
                <FacetRail
                  companies={companies}
                  campuses={campuses}
                  facets={facets}
                  onChange={onFacetChange}
                  dense
                  onCampusFocus={(id) => {
                    const campus = campuses.find((row) => row.id === id);
                    if (campus) focus(campus);
                  }}
                  footer={<p>{markerSizeLegend()}</p>}
                />
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
