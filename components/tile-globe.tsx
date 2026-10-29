"use client";

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

const OCEAN = "#FFDBBB";
const LAND = "#DD8A4E";
const LAND_ALT = "#D48148";
const BOUNDARY = "#C4733E";
const LABEL = "#5a2c0e";
const HALO = "#FFE9D6";
const BRAND = "#FB651E";
const COUNT = "font-bold tabular-nums text-[#E05612]";

const COUNTRY_COLOR: Record<string, string> = {
  "United States": "#3b6fd8",
  Canada: "#e23b4a",
  "United Kingdom": "#2f9e6b",
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
  const [hover, setHover] = useState<{ name: string; founders: number; signals: number; x: number; y: number } | null>(null);
  const [ready, setReady] = useState(false);

  const country = facets.country;
  const shown = useMemo(
    () => (country ? campuses.filter((campus) => campus.country === country) : campuses),
    [campuses, country],
  );
  const countryIds = useMemo(() => new Set(shown.map((campus) => campus.id)), [shown]);
  const filteredCompanies = useMemo(() => {
    const base = applyFacets(companies, facets, countryIds);
    if (selectedId) return base.filter((company) => company.schoolId === selectedId);
    return base;
  }, [companies, facets, countryIds, selectedId]);
  const companyStrip = useMemo(() => filteredCompanies.slice(0, 96), [filteredCompanies]);
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
          "sky-color": "#FFE8D6",
          "horizon-color": "#FFF8F2",
          "fog-color": "#FFF3E9",
          "sky-horizon-blend": 0.45,
          "horizon-fog-blend": 0.7,
          "fog-ground-blend": 0.55,
          "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 1, 2.2, 0.9, 4, 0.4],
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
            "circle-stroke-color": "#ffffff",
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
            "circle-stroke-color": "#20140c",
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

  const mobileChoices = (
    <div className="mt-2 space-y-2 lg:hidden">
      <ViewDrawer
        mode={stripMode}
        onMode={setStripMode}
        companies={companyStrip}
        founders={founderStrip}
        companyTotal={filteredCompanies.length}
        founderTotal={founderStrip.length}
      />
      <details className="rounded-xl border border-[#f0d9c6] bg-white/94 px-2.5 py-2 text-[#20140c]">
        <summary className="cursor-pointer text-[12px] font-semibold">Filters · {shown.length} campuses</summary>
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
            footer={markerSizeLegend()}
          />
        </div>
      </details>
    </div>
  );

  return (
    <div className={className}>
      <div className="relative overflow-hidden rounded-2xl bg-[#FFF7F0]" style={{ height: stageHeight }}>
        <div ref={mapNode} className="h-full w-full" />
        <aside className="absolute bottom-3 left-2 top-2 z-10 hidden w-[240px] lg:block">
          <FacetRail
            companies={companies}
            campuses={campuses}
            facets={facets}
            onChange={onFacetChange}
            onCampusFocus={(id) => {
              const campus = campuses.find((row) => row.id === id);
              if (campus) focus(campus);
            }}
            footer={
              <>
                <p>{markerSizeLegend()}</p>
                <p className="mt-1">
                  <MapCredit />
                </p>
              </>
            }
          />
        </aside>
        <aside className="absolute bottom-[4.75rem] right-2 top-1.5 z-10 hidden w-[236px] overflow-y-auto overscroll-contain lg:block">
          <IntelligenceBoards companies={filteredCompanies} />
        </aside>
        {hover ? (
          <div className="pointer-events-none absolute z-20 w-max max-w-[240px] -translate-x-1/2 -translate-y-full rounded-xl border border-[#f0d9c6] bg-white px-2.5 py-1.5 text-left text-[#20140c] shadow" style={{ left: hover.x, top: Math.max(12, hover.y - 12) }}>
            <p className="text-[13px] font-medium leading-4">{hover.name}</p>
            <p className="mt-0.5 text-[12px] leading-4 text-[#6b5443]">
              <span className={COUNT}>{hover.founders.toLocaleString("en-US")}</span> founders
              {" · "}
              <span className={COUNT}>{hover.signals.toLocaleString("en-US")}</span> signals
            </p>
          </div>
        ) : null}
        <div className="absolute bottom-2 left-[252px] right-[252px] z-10 hidden lg:block">
          <ViewDrawer
            mode={stripMode}
            onMode={setStripMode}
            companies={companyStrip}
            founders={founderStrip}
            companyTotal={filteredCompanies.length}
            founderTotal={founderStrip.length}
          />
        </div>
      </div>
      {mobileChoices}
    </div>
  );
}
