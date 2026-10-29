"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { loadMapLibre } from "@/lib/client/map-prefetch";
import { shortCampusLabel } from "@/lib/domain/campuses";
import { MapCredit } from "./map-credit";
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

export interface TileCompany {
  id: string;
  name: string;
  schoolId: string | null;
  signals: number;
}

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
  const [country, setCountry] = useState<string | null>(null);
  const [hover, setHover] = useState<{ name: string; founders: number; signals: number; x: number; y: number } | null>(null);
  const [ready, setReady] = useState(false);

  const countries = useMemo(() => {
    const counts = new Map<string, number>();
    for (const campus of campuses) {
      const name = campus.country.trim();
      if (!name) continue;
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [campuses]);

  const shown = useMemo(
    () => (country ? campuses.filter((campus) => campus.country === country) : campuses),
    [campuses, country],
  );
  const byFounders = useMemo(
    () => [...shown].sort((a, b) => b.founders - a.founders || a.name.localeCompare(b.name)).slice(0, 5),
    [shown],
  );
  const companyStrip = useMemo(() => {
    const ids = new Set(shown.map((campus) => campus.id));
    return companies
      .filter((company) => company.schoolId && ids.has(company.schoolId) && (!selectedId || company.schoolId === selectedId))
      .sort((a, b) => b.signals - a.signals || a.name.localeCompare(b.name))
      .slice(0, 12);
  }, [companies, shown, selectedId]);

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
      const docTop = node ? node.getBoundingClientRect().top + window.scrollY : wide ? 248 : 300;
      // Desktop strip is inside the stage. Mobile chips and the strip sit under it.
      const reserve = wide ? 8 : 136;
      const available = Math.round(window.innerHeight - docTop - reserve);
      setStageHeight(Math.max(wide ? 520 : 280, available));
    };
    fit();
    window.addEventListener("resize", fit);
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reduce = motion.matches;
    const onMotion = () => {
      reduce = motion.matches;
    };
    motion.addEventListener("change", onMotion);

    const collection = () => ({
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
        },
      })),
    });

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
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 1.2, 3.2, 3, 5.5, 5, 8],
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
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 1.2, 7, 3, 12, 5, 16],
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
    source.setData({
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
        },
      })),
    });
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
  }

  const mobileChoices = (
    <div className="mt-3 space-y-2 lg:hidden">
      <div className="flex gap-1.5 overflow-x-auto">
        <FilterChip active={!country} onClick={() => setCountry(null)} label={`All ${campuses.length}`} />
        {countries.map(([name, count]) => (
          <FilterChip key={name} active={country === name} onClick={() => setCountry(country === name ? null : name)} label={`${name} ${count}`} />
        ))}
      </div>
      <div className="flex gap-1.5 overflow-x-auto">
        {byFounders.map((campus) => (
          <button key={campus.id} type="button" onClick={() => focus(campus)} className="shrink-0 whitespace-nowrap rounded-full border border-[#f0d9c6] bg-white px-2.5 py-1 text-[12px] text-[#20140c]">
            {shortCampusLabel(campus.id, campus.name)} <span className={COUNT}>{campus.founders.toLocaleString("en-US")}</span>
          </button>
        ))}
      </div>
      <CompanyStrip companies={companyStrip} />
    </div>
  );

  return (
    <div className={className}>
    <div className="relative overflow-hidden rounded-3xl bg-[#FFF7F0]" style={{ height: stageHeight }}>
      <div ref={mapNode} className="h-full w-full" />
      <aside className="absolute left-3 top-3 z-10 hidden w-[228px] rounded-2xl border border-[#f0d9c6] bg-white/92 p-3 text-[#20140c] shadow-[0_10px_30px_rgba(90,44,14,0.08)] lg:block">
        <p className="text-[13px] font-semibold">Campuses</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <FilterChip active={!country} onClick={() => setCountry(null)} label={`All ${campuses.length}`} />
          {countries.map(([name, count]) => (
            <FilterChip key={name} active={country === name} onClick={() => setCountry(country === name ? null : name)} label={`${name} ${count}`} />
          ))}
        </div>
      </aside>
      <aside className="absolute right-3 top-3 z-10 hidden w-[250px] lg:block">
        <RankCard title="Leading campuses" rows={byFounders} onPick={focus} />
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
      <div className="absolute bottom-3 left-3 right-3 z-10 hidden lg:block">
        <CompanyStrip companies={companyStrip} />
      </div>
      <p className="pointer-events-auto absolute bottom-14 right-3 z-10 hidden max-w-[220px] text-right text-[11px] leading-4 text-[#6b5443] lg:block">
        <MapCredit />
      </p>
    </div>
    {mobileChoices}
    </div>
  );
}

function CompanyStrip({ companies }: { companies: TileCompany[] }) {
  if (companies.length === 0) return null;
  return (
    <div className="flex items-center gap-1.5 overflow-x-auto rounded-2xl border border-[#f0d9c6] bg-white/92 px-3 py-2 text-[#20140c] shadow-[0_10px_30px_rgba(90,44,14,0.08)]">
      {companies.map((company) => (
        <a key={company.id} href={`/startup/${company.id}`} className="shrink-0 rounded-full border border-[#f0d9c6] bg-white px-2.5 py-1 text-[12px] text-[#20140c] hover:border-[#E05612]">
          {company.name}
        </a>
      ))}
    </div>
  );
}

function FilterChip({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`shrink-0 whitespace-nowrap rounded-full border px-2.5 py-1 text-[12px] ${active ? "border-[#FB651E] bg-[#FB651E] text-white" : "border-[#f0d9c6] bg-white text-[#20140c]"}`}>
      {label}
    </button>
  );
}

function RankCard({ title, rows, onPick }: { title: string; rows: TileCampus[]; onPick: (campus: TileCampus) => void }) {
  return (
    <div className="rounded-2xl border border-[#f0d9c6] bg-white/92 p-3 text-[#20140c] shadow-[0_10px_30px_rgba(90,44,14,0.08)]">
      <p className="text-[13px] font-semibold">{title}</p>
      <ol className="mt-2 space-y-1.5">
        {rows.map((campus, index) => (
          <li key={campus.id}>
            <button type="button" onClick={() => onPick(campus)} className="flex w-full items-baseline gap-2 text-left text-[13px] hover:text-[#FB651E]">
              <span className={`${COUNT} w-4 shrink-0`}>{index + 1}</span>
              <span className="min-w-0 flex-1 truncate text-[#20140c]">{shortCampusLabel(campus.id, campus.name)}</span>
              <span className={`${COUNT} shrink-0`}>{campus.founders.toLocaleString("en-US")}</span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
