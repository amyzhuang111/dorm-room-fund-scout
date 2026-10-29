"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { loadMapLibre } from "@/lib/client/map-prefetch";
import { markerRadius, markerSizeLegend } from "@/lib/domain/marker-radius";
import { sampleSurfaceCounts, type FacetCompany } from "@/lib/domain/sample-facets";
import { MapCredit } from "./map-credit";
import {
  applyFacets,
  emptyFacets,
  FacetRail,
  IntelligenceBoards,
  PANEL,
  DispatchWire,
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
        color: markerColor(campus.country),
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
}: {
  campuses: TileCampus[];
  companies?: TileCompany[];
  selectedId?: string | null;
  onSelect: (id: string) => void;
  className?: string;
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
      setStageHeight(wide ? raw : Math.min(360, raw));
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
              try { map.setPaintProperty(layer.id, "line-width", 1.05); } catch {}
              try { map.setPaintProperty(layer.id, "line-opacity", 0.9); } catch {}
              try { map.setPaintProperty(layer.id, "line-dasharray", [1.2, 1.6]); } catch {}
            }
            if (layer.type === "line" && /coast|waterway/.test(layer.id)) {
              try { map.setPaintProperty(layer.id, "line-color", "#2F4FD8"); } catch {}
              try { map.setPaintProperty(layer.id, "line-opacity", 0.45); } catch {}
              try { map.setPaintProperty(layer.id, "line-dasharray", [0.8, 1.4]); } catch {}
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
          id: "campus-dots",
          type: "circle",
          source: "campuses",
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 1.2, ["get", "radius"], 3, ["*", ["get", "radius"], 1.55], 5, ["*", ["get", "radius"], 2.1]],
            "circle-color": ["get", "color"],
            "circle-stroke-color": "#FFFFFF",
            "circle-stroke-width": 1.15,
            "circle-opacity": 0.95,
          },
        });
        map.addLayer({
          id: "campus-selected",
          type: "circle",
          source: "campuses",
          filter: ["==", ["get", "id"], ""],
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 1.2, ["+", ["get", "radius"], 3.2], 3, ["+", ["*", ["get", "radius"], 1.55], 4], 5, ["+", ["*", ["get", "radius"], 2.1], 5]],
            "circle-color": ["get", "color"],
            "circle-stroke-color": "#D96B1C",
            "circle-stroke-width": 2.6,
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

  return (
    <div className={className}>
      {/* Scout Dispatch masthead: editorial mono band, not a three-pane YC skeleton */}
      <div className="mb-2 border-b border-[color:var(--line,#E1E5EF)] pb-2">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0" data-fold-counts>
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--cobalt,#2F4FD8)]">Scout dispatch</p>
            <p className="mt-1 font-mono text-[40px] font-bold leading-none tracking-[-0.04em] text-[color:var(--fg,#0B0E17)] sm:text-[48px]">
              <span className="text-[color:var(--ember,#D96B1C)]">{liveCount.toLocaleString("en-US")}</span>
            </p>
            <p className="mt-1 text-[15px] font-semibold tracking-tight text-[color:var(--fg,#0B0E17)]">companies forming on campus</p>
            <p className="sr-only mt-0.5 font-mono text-[11px] text-[color:var(--fg-2,#3F465C)]">
              <span className={COUNT} data-count="campuses-on-map">{universeCounts.campusesOnMap.toLocaleString("en-US")}</span> campuses on map
              {" · "}
              <span className={COUNT} data-count="founders-listed">{universeCounts.foundersListed.toLocaleString("en-US")}</span> founder names listed
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => {
                if (typeof window !== "undefined" && window.innerWidth < 1024) setMobileFiltersOpen(true);
                else setFiltersOpen((v) => !v);
              }}
              className="inline-flex h-8 items-center rounded-sm border border-[color:var(--line-strong,#C5CAD8)] bg-[color:var(--bg,#FFFFFF)] px-3 font-mono text-[11px] font-medium text-[color:var(--fg,#0B0E17)] hover:border-[color:var(--cobalt,#2F4FD8)]"
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
      <div className="grid gap-3 lg:grid-cols-[minmax(280px,340px)_minmax(0,1fr)]">
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
                <IntelligenceBoards companies={filteredCompanies} compact />
              </div>
            )}
          </div>
        </aside>
        <div className="min-w-0">
      <div className="relative overflow-hidden rounded-none border border-[color:var(--cobalt,#2F4FD8)]/25 bg-[color:var(--bg,#FFFFFF)]" style={{ height: stageHeight }}>
        <div ref={mapNode} className="h-full w-full" />
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
      {/* Mobile: Dispatch wire (named tiles with counts) + boards */}
      <div className="mt-2 space-y-2 lg:hidden" data-fold-counts-mobile>
        <DispatchWire companies={filteredCompanies} limit={8} />
        <IntelligenceBoards companies={filteredCompanies} compact />
      </div>
      {mobileFiltersOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Scout filters">
          <button type="button" className="absolute inset-0 bg-slate-900/35" aria-label="Close filters" onClick={() => setMobileFiltersOpen(false)} />
          <div className={`${PANEL} absolute inset-x-0 bottom-0 flex max-h-[min(78dvh,560px)] flex-col overflow-hidden rounded-t-lg border-t border-[color:var(--cobalt,#2F4FD8)]/25 bg-[color:var(--bg-raised,#FFFFFF)] shadow-[0_-6px_20px_rgba(15,23,42,0.10)]`}>
            <div className="flex items-center justify-between gap-2 border-b border-[color:var(--line,#E1E5EF)] px-2.5 py-1.5">
              <div className="min-w-0">
                <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-[color:var(--fg,#0B0E17)]">Scout filters · {shown.length} campuses</p>
                <p className="font-mono text-[9px] tabular-nums text-[color:var(--fg-3,#5C647A)]">Status · Year · Sector · Campus</p>
              </div>
              <button type="button" onClick={() => setMobileFiltersOpen(false)} className="inline-flex h-7 items-center rounded-sm border border-[color:var(--ember,#D96B1C)] bg-[color:var(--ember,#D96B1C)] px-2.5 font-mono text-[11px] font-semibold text-white">Done</button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1">
              <div className="h-[min(68dvh,500px)]">
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
