"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { loadMapLibre } from "@/lib/client/map-prefetch";
import { markerRadius, markerSizeLegend } from "@/lib/domain/marker-radius";
import type { FacetCompany } from "@/lib/domain/sample-facets";
import { MapCredit } from "./map-credit";
import {
  applyFacets,
  emptyFacets,
  FacetRail,
  IntelligenceBoards,
  PANEL,
  preferLogoCompanies,
  ViewDrawer,
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

const OCEAN = "#0B0E17";
const LAND = "#1A2556";
const LAND_ALT = "#16204A";
const BOUNDARY = "#1F2536";
const LABEL = "#A3AAC0";
const HALO = "#0B0E17";
const BRAND = "#7C8CF0";
const COUNT = "font-bold tabular-nums text-[color:var(--ember,#E8823A)]";

const COUNTRY_COLOR: Record<string, string> = {
  "United States": "#7C8CF0",
  Canada: "#E8823A",
  "United Kingdom": "#3FB68B",
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
  const [stripMode, setStripMode] = useState<"startups" | "founders">("startups");
  const [filtersOpen, setFiltersOpen] = useState(false);
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
  const companyStrip = useMemo(() => preferLogoCompanies(filteredCompanies).slice(0, 96), [filteredCompanies]);
  const founderTotalListed = useMemo(() => {
    let n = 0;
    for (const company of filteredCompanies) n += (company.founders?.length ?? 0);
    return n;
  }, [filteredCompanies]);
  const founderStrip = useMemo(() => {
    const rows: { key: string; name: string; companyId: string; companyName: string }[] = [];
    for (const company of filteredCompanies) {
      for (const person of company.founders ?? []) {
        const name = person.trim();
        if (!name) continue;
        rows.push({ key: `${company.id}:${name}`, name, companyId: company.id, companyName: company.name });
        if (rows.length >= 96) return rows;
      }
    }
    return rows;
  }, [filteredCompanies]);

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
      const reserve = wide ? 8 : 150;
      const available = Math.round(window.innerHeight - docTop - reserve);
      setStageHeight(Math.max(wide ? 560 : 280, available));
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
          "sky-color": "#0B0E17",
          "horizon-color": "#121726",
          "fog-color": "#0B0E17",
          "sky-horizon-blend": 0.35,
          "horizon-fog-blend": 0.55,
          "fog-ground-blend": 0.4,
          "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 0.85, 2.2, 0.55, 4, 0.2],
        });
        for (const layer of map.getStyle().layers) {
          try {
            if (layer.type === "background") map.setPaintProperty(layer.id, "background-color", LAND);
            if (layer.id === "water") map.setPaintProperty(layer.id, "fill-color", OCEAN);
            if (layer.type === "fill" && /landcover|landuse|park|wood|sand/.test(layer.id)) map.setPaintProperty(layer.id, "fill-color", LAND_ALT);
            if (layer.type === "line" && /boundary/.test(layer.id)) map.setPaintProperty(layer.id, "line-color", BOUNDARY);
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
            "circle-stroke-color": "#0B0E17",
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
            "circle-stroke-color": "#E8823A",
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
  const founderCount = founderTotalListed;

  return (
    <div className={className}>
      <div className="relative overflow-hidden rounded-xl border border-[color:var(--line,#1F2536)] bg-[#0B0E17]" style={{ height: stageHeight }}>
        <div ref={mapNode} className="h-full w-full" />
        {/* Halflight left overlay: scout brief, not a YC-style filter rail */}
        <aside className="pointer-events-none absolute bottom-3 left-3 top-3 z-10 hidden w-[min(340px,34%)] flex-col gap-2 lg:flex">
          <div className="pointer-events-auto rounded-lg border border-[color:var(--line,#1F2536)] bg-[color:var(--bg-raised,#121726)]/96 p-3">
            <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-[color:var(--fg-3,#6B7390)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--ember,#E8823A)]" aria-hidden />
              Live · campus scout
            </p>
            <p className="mt-2 text-[22px] font-semibold leading-7 tracking-[-0.03em] text-[color:var(--fg,#ECEEF4)]">
              <span className={`${COUNT} font-mono text-[24px]`}>{liveCount.toLocaleString("en-US")}</span>
              {" companies forming"}
            </p>
            <p className="mt-1 font-mono text-[12px] text-[color:var(--fg-2,#A3AAC0)]" data-fold-counts>
              <span className={COUNT} data-count="campuses-on-map">{shown.length.toLocaleString("en-US")}</span> campuses on map
              {" · "}
              <span className={COUNT} data-count="founders-listed">{founderCount.toLocaleString("en-US")}</span> founders listed
            </p>
            <div className="mt-3 flex flex-wrap gap-1">
              <button
                type="button"
                onClick={() => setFiltersOpen((v) => !v)}
                className="inline-flex h-7 items-center rounded border border-[color:var(--line-strong,#2C3449)] bg-[color:var(--bg-sunken,#080A11)] px-2.5 text-[11px] font-medium text-[color:var(--fg,#ECEEF4)] hover:border-[color:var(--ember,#E8823A)]"
              >
                {filtersOpen ? "Hide filters" : "Filters"}
              </button>
              <a
                href="/ask"
                className="inline-flex h-7 items-center rounded-sm border border-[color:var(--ember,#E8823A)] bg-[color:var(--bg-sunken,#080A11)] px-2.5 font-mono text-[11px] font-semibold text-[color:var(--ember,#E8823A)]"
              >
                Scout ask
              </a>
            </div>
          </div>
          <div className="pointer-events-auto min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <IntelligenceBoards companies={filteredCompanies} compact />
          </div>
        </aside>
        {/* Right edge: logo stack (not a bottom YC drawer) */}
        <aside className="absolute bottom-3 right-3 top-3 z-10 hidden w-[168px] lg:block">
          <ViewDrawer
            mode={stripMode}
            onMode={setStripMode}
            companies={companyStrip}
            founders={founderStrip}
            companyTotal={filteredCompanies.length}
            founderTotal={founderTotalListed}
          />
        </aside>
        {/* Filter sheet overlays when opened — not a permanent left clone */}
        {filtersOpen ? (
          <div className="absolute bottom-3 left-[min(352px,36%)] top-3 z-20 hidden w-[260px] lg:block">
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
        ) : null}
        <div className="pointer-events-auto absolute bottom-2 left-1/2 z-10 hidden -translate-x-1/2 lg:block" data-map-credit>
          <p className="rounded bg-[#0B0E17]/80 px-2 py-0.5 font-mono text-[9px] text-[color:var(--fg-3,#6B7390)]">
            <MapCredit />
          </p>
        </div>
        {hover ? (
          <div
            className="pointer-events-none absolute z-30 w-max max-w-[240px] -translate-x-1/2 -translate-y-full rounded-lg border border-[color:var(--line,#1F2536)] bg-[color:var(--bg-raised,#121726)] px-2.5 py-1.5 text-left text-[color:var(--fg,#ECEEF4)]"
            style={{ left: hover.x, top: Math.max(12, hover.y - 12) }}
          >
            <p className="text-[13px] font-medium leading-4">{hover.name}</p>
            <p className="mt-0.5 text-[12px] leading-4 text-[color:var(--fg-2,#A3AAC0)]">
              <span className={COUNT}>{hover.founders.toLocaleString("en-US")}</span> founders
              {" · "}
              <span className={COUNT}>{hover.signals.toLocaleString("en-US")}</span> signals
            </p>
          </div>
        ) : null}
      </div>
      {/* Mobile: brief + filters sheet, no YC three-pane clone */}
      <div className="mt-2 space-y-2 lg:hidden">
        <div className={`${PANEL} relative overflow-hidden p-2.5 before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-[color:var(--ember,#E8823A)]`}>
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--cobalt,#2F4FD8)]">Live · campus scout</p>
          <p className="mt-1 text-[17px] font-semibold tracking-tight" data-fold-counts-mobile>
            <span className={COUNT}>{liveCount.toLocaleString("en-US")}</span>{" "}
            <span className="text-[color:var(--fg,#ECEEF4)]">companies</span>
          </p>
          <p className="mt-0.5 font-mono text-[11px] text-[color:var(--fg-2,#A3AAC0)]">
            <span className={COUNT} data-count="campuses-on-map">{shown.length.toLocaleString("en-US")}</span> campuses on map
            {" · "}
            <span className={COUNT} data-count="founders-listed">{founderCount.toLocaleString("en-US")}</span> founders listed
          </p>
          <Link
            href="/ask"
            className="mt-2 inline-flex h-7 items-center gap-1.5 rounded-sm border border-[color:var(--ember,#E8823A)]/50 bg-[color:var(--ember,#E8823A)]/10 px-2 font-mono text-[11px] text-[color:var(--ember,#E8823A)]"
          >
            <span aria-hidden>{">"}</span> Scout ask
          </Link>
        </div>
        <ViewDrawer
          mode={stripMode}
          onMode={setStripMode}
          companies={companyStrip}
          founders={founderStrip}
          companyTotal={filteredCompanies.length}
          founderTotal={founderTotalListed}
        />
        <IntelligenceBoards companies={filteredCompanies} compact />
        <details className={`${PANEL} px-2.5 py-2`}>
          <summary className="cursor-pointer font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-[color:var(--fg,#ECEEF4)]">Scout filters · {shown.length} campuses</summary>
          <div className="mt-2 h-[320px]">
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
        </details>
      </div>
    </div>
  );
}
