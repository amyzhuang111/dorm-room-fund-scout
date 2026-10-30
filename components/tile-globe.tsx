"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { loadMapLibre } from "@/lib/client/map-prefetch";
import { markerRadius, markerSizeLegend } from "@/lib/domain/marker-radius";
import { absoluteDate } from "@/lib/domain/relative-time";
import { sampleSurfaceCounts, type FacetCompany } from "@/lib/domain/sample-facets";
import { MapCredit } from "./map-credit";
import {
  applyFacets,
  emptyFacets,
  FacetRail,
  IntelligenceBoards,
  MobileFilterDock,
  MobileWireStrip,
  PANEL,
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

const OCEAN = "#FFFFFF";
const LAND = "#FFFFFF";
const LAND_ALT = "#FFFFFF";
const LABEL = "#2F4FD8";
const HALO = "#FFFFFF";
const BRAND = "#2F4FD8";
const COUNT = "font-bold tabular-nums text-[color:var(--ember,#D96B1C)]";

const COUNTRY_COLOR: Record<string, string> = {
  "United States": "#2F4FD8",
  Canada: "#2F4FD8",
  "United Kingdom": "#2F4FD8",
};

function markerColor(country: string): string {
  return COUNTRY_COLOR[country] ?? BRAND;
}

function campusCollection(campuses: TileCampus[]) {
  const ranked = [...campuses].sort((a, b) => b.signals - a.signals || b.founders - a.founders || a.name.localeCompare(b.name));
  const topIds = new Set(ranked.slice(0, 3).map((c) => c.id));
  return {
    type: "FeatureCollection",
    features: campuses.map((campus) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [campus.lon, campus.lat] },
      properties: {
        id: campus.id,
        name: campus.name,
        founders: campus.founders,
        signals: campus.signals,
        country: campus.country,
        // Cobalt field; ember marks the top-3 desk campuses (memorable dispatch signature).
        color: topIds.has(campus.id) ? "#D96B1C" : markerColor(campus.country),
        top: topIds.has(campus.id) ? 1 : 0,
        radius: markerRadius(campus.signals),
      },
    })),
  };
}

export function TileGlobe({
  campuses,
  companies = [],
  selectedId,
  onSelect,
  className = "",
  dataThrough = null,
}: {
  campuses: TileCampus[];
  companies?: TileCompany[];
  selectedId?: string | null;
  onSelect: (id: string) => void;
  className?: string;
  /** ISO from HeroStats.updatedAt / latestDataTimestamp — never invent. */
  dataThrough?: string | null;
}) {
  const mapNode = useRef<HTMLDivElement | null>(null);
  const [stageHeight, setStageHeight] = useState(720);
  const mapRef = useRef<{
    getSource: (id: string) => { setData: (data: unknown) => void } | undefined;
    setFilter: (layer: string, filter: unknown) => void;
    flyTo: (opts: object) => void;
    resize: () => void;
  } | null>(null);
  const [facets, setFacets] = useState<FacetState>(emptyFacets);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [hover, setHover] = useState<{ name: string; founders: number; signals: number; x: number; y: number } | null>(null);
  const [ready, setReady] = useState(false);

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
      setLayoutProperty: (layer: string, prop: string, value: unknown) => void;
      addSource: (id: string, source: object) => void;
      addLayer: (layer: object) => void;
      getSource: (id: string) => { setData: (data: unknown) => void } | undefined;
      setFilter: (layer: string, filter: unknown) => void;
      getCenter: () => { lng: number; lat: number };
      easeTo: (opts: object) => void;
      flyTo: (opts: object) => void;
      resize: () => void;
      remove: () => void;
      getCanvas: () => HTMLCanvasElement;
    } | null = null;

    const fit = () => {
      const node = mapNode.current;
      const wide = window.innerWidth >= 1024;
      const docTop = node ? node.getBoundingClientRect().top + window.scrollY : wide ? 96 : 120;
      // Desktop strip is inside the stage. Mobile chips and the strip sit under it.
      const reserve = wide ? 8 : 320; // room for Live + Ledger strip under the stage
      const available = Math.round(window.innerHeight - docTop - reserve);
      const raw = Math.max(wide ? 560 : 220, available);
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

    void loadMapLibre().then((mod) => {
      if (dead || !mapNode.current) return;
      const created = new mod.Map({
        container: mapNode.current,
        style: "https://tiles.openfreemap.org/styles/positron",
        center: [-28, 16],
        zoom: window.innerWidth >= 1024 ? 2.5 : 1.2,
        minZoom: 1.15,
        maxPitch: 0,
        attributionControl: false,
      });
      map = created as unknown as NonNullable<typeof map>;
      mapRef.current = map;

      map.on("style.load", () => {
        if (dead || !map) return;
        map.setProjection({ type: "globe" });
        map.setSky({
          "sky-color": "#FFFFFF",
          "horizon-color": "#FFFFFF",
          "fog-color": "#EEF1FB",
          "sky-horizon-blend": 0.7,
          "horizon-fog-blend": 0.2,
          "fog-ground-blend": 0.15,
          "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 0.35, 2.2, 0.12, 4, 0.04],
        });
        for (const layer of map.getStyle().layers) {
          try {
            if (layer.type === "background") map.setPaintProperty(layer.id, "background-color", LAND);
            if (layer.id === "water") map.setPaintProperty(layer.id, "fill-color", OCEAN);
            // Line-art globe: no filled land masses (escape YC filled-land skeleton)
            if (layer.type === "fill" && /landcover|landuse|park|wood|sand|land|earth|building/.test(layer.id)) {
              try { map.setPaintProperty(layer.id, "fill-opacity", 0); } catch {}
              try { map.setPaintProperty(layer.id, "fill-color", LAND_ALT); } catch {}
            }
            if (layer.type === "fill" && /land|earth|continent/.test(layer.id) && layer.id !== "water") {
              try { map.setLayoutProperty(layer.id, "visibility", "none"); } catch {}
            }
            if (layer.type === "line" && /boundary/.test(layer.id)) {
              map.setPaintProperty(layer.id, "line-color", "#2F4FD8");
              try { map.setPaintProperty(layer.id, "line-width", 0.7); } catch {}
              try { map.setPaintProperty(layer.id, "line-opacity", 0.55); } catch {}
              try { map.setPaintProperty(layer.id, "line-dasharray", [0.6, 1.8]); } catch {}
            }
            if (layer.type === "line" && /coast|waterway/.test(layer.id)) {
              try { map.setPaintProperty(layer.id, "line-color", "#2F4FD8"); } catch {}
              try { map.setPaintProperty(layer.id, "line-width", 0.95); } catch {}
              try { map.setPaintProperty(layer.id, "line-opacity", 0.85); } catch {}
              // Solid coast — precise line-art, not dashed noise
              try { map.setPaintProperty(layer.id, "line-dasharray", [1, 0]); } catch {}
            }
            if (layer.type === "symbol" && /country|water_name|marine|sea|ocean/.test(layer.id)) {
              map.setLayoutProperty(layer.id, "text-font", ["Noto Sans Italic"]);
              map.setPaintProperty(layer.id, "text-color", LABEL);
              map.setPaintProperty(layer.id, "text-halo-color", HALO);
              map.setPaintProperty(layer.id, "text-halo-width", 1.4);
            }
          } catch {
            // Icon-only symbol layers have no text paint.
          }
        }
        map.addSource("campuses", { type: "geojson", data: collection() });
        map.addLayer({
          id: "campus-halo",
          type: "circle",
          source: "campuses",
          filter: ["==", ["get", "top"], 1],
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 1.2, ["+", ["get", "radius"], 4.5], 3, ["+", ["*", ["get", "radius"], 1.55], 5.5], 5, ["+", ["*", ["get", "radius"], 2.1], 6.5]],
            "circle-color": "#D96B1C",
            "circle-opacity": 0.18,
            "circle-stroke-width": 0,
          },
        });
        map.addLayer({
          id: "campus-dots",
          type: "circle",
          source: "campuses",
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 1.2, ["get", "radius"], 3, ["*", ["get", "radius"], 1.55], 5, ["*", ["get", "radius"], 2.15]],
            "circle-color": ["get", "color"],
            "circle-stroke-color": ["case", ["==", ["get", "top"], 1], "#FFFFFF", "#FFFFFF"],
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
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 1.2, ["+", ["get", "radius"], 3.2], 3, ["+", ["*", ["get", "radius"], 1.55], 4], 5, ["+", ["*", ["get", "radius"], 2.15], 5]],
            "circle-color": ["get", "color"],
            "circle-stroke-color": "#D96B1C",
            "circle-stroke-width": 2.8,
            "circle-opacity": 1,
          },
        });
        setReady(true);
        map.resize();
        spin();
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

    const observer = new ResizeObserver(() => mapRef.current?.resize());
    observer.observe(node);
    return () => {
      dead = true;
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
    const source = mapRef.current?.getSource("campuses");
    if (!source) return;
    source.setData(campusCollection(campuses));
  }, [campuses, ready]);

  useEffect(() => {
    if (!ready || !mapRef.current) return;
    mapRef.current.setFilter("campus-dots", country ? ["==", ["get", "country"], country] : null);
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

  const liveCount = filteredCompanies.length;
  // Masthead founders/campuses match the sample strip (universe totals via sampleSurfaceCounts),
  // not the filtered map/facet slice — so strip and fold data-count nodes never diverge.
  const universeCounts = sampleSurfaceCounts(companies, campuses);

  const topCampus = useMemo(() => {
    return [...campuses].sort((a, b) => b.signals - a.signals || b.founders - a.founders || a.name.localeCompare(b.name))[0] ?? null;
  }, [campuses]);

  return (
    <div className={className} data-fold-mobile-root="">
      {/* Shared column grid: masthead + wire + stage share one vertical rhythm */}
      <div className="grid gap-x-3 gap-y-0 lg:grid-cols-[minmax(280px,340px)_minmax(0,1fr)]">
        <div className="col-span-full mb-3 border-b border-[color:var(--line,#E1E5EF)] pb-3" data-fold-counts>
          <div className="grid items-end gap-3 lg:grid-cols-[minmax(280px,340px)_minmax(0,1fr)]">
            <div className="min-w-0" data-dispatch-figure="">
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
              <p className="mt-2 font-mono text-[56px] font-bold leading-[0.88] tracking-[-0.07em] text-[color:var(--ember,#D96B1C)] sm:text-[72px]">
                {liveCount.toLocaleString("en-US")}
              </p>
              {/* Signature underline: cobalt hairline + ember weight — magazine figure rule */}
              <div className="mt-2 flex items-end gap-2" aria-hidden>
                <span className="h-px w-8 bg-[color:var(--cobalt,#2F4FD8)]" />
                <span className="h-[3px] flex-1 max-w-[180px] bg-[color:var(--ember,#D96B1C)]" />
              </div>
              <p className="mt-2 text-[16px] font-semibold leading-tight tracking-tight text-[color:var(--fg,#0B0E17)] sm:text-[17px]">
                companies forming on campus
              </p>
            </div>
            <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <p className="font-mono text-[11px] tabular-nums leading-relaxed text-[color:var(--fg-2,#3F465C)]">
                <span className={COUNT} data-count="founders-listed">{universeCounts.foundersListed.toLocaleString("en-US")}</span>
                {" founder names listed"}
                <span className="mx-1.5 text-[color:var(--line-strong,#C5CAD8)]">·</span>
                <span className={COUNT} data-count="campuses-on-map">{universeCounts.campusesOnMap.toLocaleString("en-US")}</span>
                {" campuses on map"}
                {topCampus ? (
                  <>
                    <span className="mx-1.5 text-[color:var(--line-strong,#C5CAD8)]">·</span>
                    <span className="font-semibold text-[color:var(--ember,#D96B1C)]">01</span>
                    {" desk · "}
                    <span className="text-[color:var(--fg,#0B0E17)]">{topCampus.name.replace(/^University of /, "").replace(/ University$/, "")}</span>
                  </>
                ) : null}
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
          </div>
        </div>
        {/* One strong editorial column */}
        <aside className="hidden min-w-0 lg:block">
          <div className="sticky top-14 space-y-2">
            {filtersOpen ? (
              <div className="h-[min(70vh,640px)]">
                <FacetRail
                  companies={companies}
                  campuses={campuses}
                  facets={facets}
                  onChange={onFacetChange}
                  sheet
                  caption="Narrow the dispatch"
                  onCampusFocus={(id) => {
                    const campus = campuses.find((row) => row.id === id);
                    if (campus) focus(campus);
                  }}
                  footer={<p>{markerSizeLegend()}</p>}
                />
              </div>
            ) : (
              <div className={`${PANEL} relative overflow-hidden p-3 before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-[color:var(--cobalt,#2F4FD8)]`}>
                <div className="mb-2 flex items-baseline justify-between gap-2 border-b border-[color:var(--line,#E1E5EF)] pb-2">
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--cobalt,#2F4FD8)]">Wire</p>
                  <p className="font-mono text-[10px] tabular-nums text-[color:var(--fg-3,#5C647A)]">{filteredCompanies.length.toLocaleString("en-US")}</p>
                </div>
                <IntelligenceBoards companies={filteredCompanies} compact surface="fold" />
              </div>
            )}
          </div>
        </aside>
        <div className="min-w-0">
      <div className="relative overflow-hidden rounded-none border border-[color:var(--cobalt,#2F4FD8)]/30 bg-[color:var(--bg,#FFFFFF)] shadow-[inset_0_0_0_1px_rgba(47,79,216,0.04)]" style={{ height: stageHeight }}>
        <div ref={mapNode} className="h-full w-full" />
        {/* Signature: dispatch scale card — cobalt pins / ember top desk */}
        <div className="pointer-events-none absolute left-2.5 top-2.5 z-10 hidden rounded-sm border border-[color:var(--cobalt,#2F4FD8)]/25 bg-[color:var(--bg,#FFFFFF)]/92 px-2 py-1.5 backdrop-blur-[2px] lg:block" data-dispatch-scale="">
          <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-[color:var(--cobalt,#2F4FD8)]">Dispatch scale</p>
          <div className="mt-1 flex items-center gap-3 font-mono text-[10px] tabular-nums text-[color:var(--fg-2,#3F465C)]">
            <span className="inline-flex items-center gap-1"><span className="inline-block h-1.5 w-1.5 rounded-full bg-[color:var(--cobalt,#2F4FD8)]" aria-hidden />field</span>
            <span className="inline-flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full bg-[color:var(--ember,#D96B1C)]" aria-hidden />top desk</span>
          </div>
        </div>
        {/* Static mid-animation feel: orbit rings + top-desk callout (fold signature). */}
        <div className="pointer-events-none absolute right-[18%] top-[28%] z-10 hidden lg:block" data-dispatch-orbit="" aria-hidden>
          <div className="relative h-16 w-16">
            <span className="absolute inset-0 rounded-full border border-dashed border-[color:var(--ember,#D96B1C)]/55" />
            <span className="absolute inset-2 rounded-full border border-[color:var(--ember,#D96B1C)]/35" />
            <span className="absolute inset-4 rounded-full border border-[color:var(--ember,#D96B1C)]/70" />
            <span className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[color:var(--ember,#D96B1C)]" />
            <span className="absolute -right-1 top-2 h-1.5 w-1.5 rounded-full bg-[color:var(--ember,#D96B1C)]/80" />
          </div>
        </div>
        {topCampus ? (
          <div className="pointer-events-none absolute bottom-3 right-3 z-10 hidden max-w-[200px] rounded-sm border border-[color:var(--ember,#D96B1C)]/40 bg-[color:var(--bg,#FFFFFF)]/95 px-2.5 py-1.5 shadow-[0_1px_0_rgba(217,107,28,0.15)] backdrop-blur-[2px] lg:block" data-top-desk-callout="">
            <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-[color:var(--ember,#D96B1C)]">01 · top desk</p>
            <p className="mt-0.5 text-[12px] font-semibold tracking-tight text-[color:var(--fg,#0B0E17)]">
              {topCampus.name.replace(/^University of /, "").replace(/ University$/, "")}
            </p>
            <p className="mt-0.5 font-mono text-[10px] tabular-nums text-[color:var(--fg-2,#3F465C)]">
              <span className={COUNT}>{topCampus.founders.toLocaleString("en-US")}</span>
              {" founder names"}
            </p>
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
      </div>
      {/* Mobile-native: figure above, map band, swipe WIRE digest, bottom filter dock */}
      <div
        className="mt-3 space-y-3 lg:hidden"
        data-fold-counts-mobile
        data-mobile-fold-compose=""
        style={{ paddingBottom: "calc(5.75rem + env(safe-area-inset-bottom, 0px))" }}
      >
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
            <div className="relative flex items-end justify-between gap-3 border-b border-[color:var(--line,#E1E5EF)] px-3 py-2.5">
              <div className="min-w-0">
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--cobalt,#2F4FD8)]">Scout filters · {shown.length} campuses</p>
                <p className="mt-0.5 text-[13px] font-semibold tracking-tight text-[color:var(--fg,#0B0E17)]">Narrow the dispatch</p>
                <p className="mt-0.5 font-mono text-[9px] tabular-nums text-[color:var(--fg-3,#5C647A)]">Status · Year · Sector · Campus</p>
              </div>
              <button type="button" onClick={() => setMobileFiltersOpen(false)} className="inline-flex h-8 shrink-0 items-center rounded-sm border border-[color:var(--ember,#D96B1C)] bg-[color:var(--ember,#D96B1C)] px-3 font-mono text-[11px] font-semibold text-white">Done</button>
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
