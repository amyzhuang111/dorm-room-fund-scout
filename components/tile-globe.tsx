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
  campusFoundersTop,
  ScoutChronograph,
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
      const wide = window.innerWidth >= 1024;
      const target = Math.round(window.innerHeight * (wide ? 0.58 : 0.48));
      setStageHeight(wide ? Math.max(480, Math.min(640, target)) : Math.max(320, Math.min(420, target)));
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

  const signaledUniverse = useMemo(() => companies.filter((c) => c.signals > 0).length, [companies]);
  const quietUniverse = companies.length - signaledUniverse;

  // One campus count: the campuses actually drawn on the globe.
  const universeCounts = catalogReady
    ? sampleSurfaceCounts(companies, campuses)
    : { companies: companyCount, foundersListed, campusesOnMap: campuses.length };
  const campusesOnMap = universeCounts.campusesOnMap;

  const topCampuses = useMemo(() => campusFoundersTop(campuses, 3), [campuses]);

  return (
    <div className={className} data-fold-mobile-root="">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-2" data-fold-counts="">
        <p className="flex min-w-0 flex-wrap items-baseline gap-x-4 gap-y-1 text-[14px] leading-6 text-[color:var(--fg-2,#3F465C)]">
          <span>
            <span className={COUNT}>{(catalogReady ? companies.length : companyCount).toLocaleString("en-US")}</span>
            {" companies"}
          </span>
          {catalogReady ? (
            <>
              <span>
                <span className={COUNT}>{signaledUniverse.toLocaleString("en-US")}</span>
                {" with a signal"}
              </span>
              <span>
                <span className={COUNT}>{quietUniverse.toLocaleString("en-US")}</span>
                {" with no signal"}
              </span>
            </>
          ) : null}
          <span>
            <span className={COUNT} data-count="founders-listed">{universeCounts.foundersListed.toLocaleString("en-US")}</span>
            {" founder names"}
          </span>
          <span>
            <span className={COUNT} data-count="campuses-on-map">{campusesOnMap.toLocaleString("en-US")}</span>
            {" campuses on the map"}
          </span>
          {facetsActive ? <span>Showing {liveCount.toLocaleString("en-US")}</span> : null}
          {dataThrough ? <span>Updated {absoluteDate(dataThrough)}</span> : null}
        </p>
        <div className="flex shrink-0 flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setFiltersOpen((v) => !v)}
            className="hidden h-8 items-center rounded-sm border border-[color:var(--line-strong,#C5CAD8)] bg-[color:var(--bg,#FFFFFF)] px-3 font-mono text-[11px] font-medium text-[color:var(--fg,#0B0E17)] hover:border-[color:var(--cobalt,#2F4FD8)] lg:inline-flex"
          >
            {filtersOpen ? "Hide filters" : "Filters"}
          </button>
          <a
            href="/ask"
            className="inline-flex h-8 items-center rounded-sm border border-[color:var(--ember,#D96B1C)] bg-[color:var(--ember,#D96B1C)] px-3 font-mono text-[11px] font-semibold text-white"
          >
            Scout ask
          </a>
        </div>
      </div>

      {filtersOpen ? (
        <div className="mb-4" data-fold-filters-index="">
          {facetsActive ? (
            <p className="mb-2 text-[14px] text-[color:var(--fg,#0B0E17)]">
              Showing {liveCount.toLocaleString("en-US")} companies
              {filterSliceLabel ? ` · ${filterSliceLabel}` : ""}
            </p>
          ) : (
            <p className="mb-2 text-[14px] text-[color:var(--fg-2,#3F465C)]">Filter the companies on the map.</p>
          )}
          <FacetRail
            companies={companies}
            campuses={campuses}
            facets={facets}
            onChange={onFacetChange}
            indexCount={liveCount}
            caption="Filters"
            onCampusFocus={(id) => {
              const campus = campuses.find((row) => row.id === id);
              if (campus) focus(campus);
            }}
            footer={<p>{markerSizeLegend()}</p>}
          />
        </div>
      ) : null}

      <div className="mb-4" data-fold-chronograph="">
        <ScoutChronograph
          companies={filteredCompanies}
          variant="hero"
          kicker="Signals by month"
          reading="Each bar is companies whose latest signal falls in that month. The number above is that tallest bar."
        />
      </div>

      <section className="mb-4" data-fold-desk-map="" aria-label="Map">
        <h2 className="mb-2 font-mono text-[12px] font-medium uppercase tracking-[0.14em] text-[color:var(--cobalt,#2F4FD8)]">Map</h2>
        <div
          className="relative overflow-hidden rounded-none border-2 border-[color:var(--cobalt,#2F4FD8)]/35 bg-[#FFDBBB]"
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
          <div className="pointer-events-none absolute left-3 top-3 z-10 flex flex-wrap gap-x-3 gap-y-1 rounded-sm bg-[color:var(--bg,#FFFFFF)]/90 px-2.5 py-1.5 font-mono text-[11px] text-[color:var(--fg-2,#3F465C)]">
            <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-[#3b6fd8]" aria-hidden />United States</span>
            <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-[#e23b4a]" aria-hidden />Canada</span>
            <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-[#2f9e6b]" aria-hidden />United Kingdom</span>
          </div>
          <div className="pointer-events-auto absolute bottom-2 left-1/2 z-10 -translate-x-1/2" data-map-credit>
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
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(220px,280px)_minmax(0,1fr)]">
        <section data-campus-metric="founders">
          <h2 className="mb-2 font-mono text-[12px] font-medium uppercase tracking-[0.14em] text-[color:var(--cobalt,#2F4FD8)]">Top campuses</h2>
          <ol className="divide-y divide-[color:var(--line,#E1E5EF)] border border-[color:var(--line,#E1E5EF)]" data-campus-founders-top="">
            {topCampuses.map((campus, i) => {
              const active = selectedId === campus.id;
              const label = shortCampusLabel(campus.id, campus.name);
              return (
                <li key={campus.id}>
                  <button
                    type="button"
                    onClick={() => focus(campus)}
                    className={`flex w-full items-baseline gap-2 px-3 py-2.5 text-left hover:bg-[color:var(--cobalt-haze,#E8ECFA)]/50 ${active ? "bg-[color:var(--ember,#D96B1C)]/8" : ""}`}
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
          <p className="mt-2 text-[12px] leading-5 text-[color:var(--fg-3,#5C647A)]">{markerSizeLegend()}</p>
        </section>
        <IntelligenceBoards companies={filteredCompanies} surface="fold" hideLatest />
      </div>

      <MobileFilterDock
        onOpen={() => setMobileFiltersOpen(true)}
        count={liveCount}
        caption="Filter companies"
        tone="ember"
        kicker="Filters"
        observe="[data-fold-mobile-root]"
      />
      {mobileFiltersOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Filters">
          <button type="button" className="absolute inset-0 bg-slate-900/35" aria-label="Close filters" onClick={() => setMobileFiltersOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 flex max-h-[min(82dvh,620px)] flex-col rounded-t-md border border-[color:var(--cobalt,#2F4FD8)]/25 border-b-0 bg-[color:var(--bg,#FFFFFF)] shadow-[0_-8px_28px_rgba(15,23,42,0.12)]">
            <div className="flex items-end justify-between gap-3 border-b border-[color:var(--line,#E1E5EF)] px-3 py-3">
              <div className="min-w-0">
                <p className="text-[15px] font-semibold tracking-tight text-[color:var(--fg,#0B0E17)]">Filters</p>
                <p className="mt-1 text-[13px] text-[color:var(--fg-2,#3F465C)]">
                  {liveCount.toLocaleString("en-US")} companies
                  {" · "}
                  {signaledLive.toLocaleString("en-US")} with a signal
                  {" · "}
                  {quietLive.toLocaleString("en-US")} with no signal
                </p>
              </div>
              <button type="button" onClick={() => setMobileFiltersOpen(false)} className="inline-flex h-9 shrink-0 items-center rounded-sm border border-[color:var(--ember,#D96B1C)] bg-[color:var(--ember,#D96B1C)] px-3.5 font-mono text-[11px] font-semibold text-white">Done</button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
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
      ) : null}
    </div>
  );
}
