"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { loadMapLibre } from "@/lib/client/map-prefetch";
import { shortCampusLabel } from "@/lib/domain/campuses";
import { MapCredit } from "./map-credit";
import { markerRadius, markerSizeLegend } from "@/lib/domain/marker-radius";
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
  logoUrl?: string | null;
  founders?: string[];
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
  const [country, setCountry] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [stripMode, setStripMode] = useState<"startups" | "founders">("startups");
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
  const filteredCampuses = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = shown;
    if (!q) return base;
    return base.filter((campus) => campus.name.toLowerCase().includes(q) || shortCampusLabel(campus.id, campus.name).toLowerCase().includes(q));
  }, [shown, query]);
  const byFounders = useMemo(
    () => [...filteredCampuses].sort((a, b) => b.founders - a.founders || a.name.localeCompare(b.name)).slice(0, 8),
    [filteredCampuses],
  );
  const bySignals = useMemo(
    () => [...filteredCampuses].sort((a, b) => b.signals - a.signals || a.name.localeCompare(b.name)).slice(0, 6),
    [filteredCampuses],
  );
  const maxFounders = byFounders[0]?.founders || 1;
  const countryRows = useMemo(() => {
    return countries.slice(0, 5).map(([name, count], index) => ({
      id: `country-${name}`,
      name,
      lat: 0,
      lon: 0,
      founders: count,
      signals: count,
      country: name,
      _index: index,
    })) as TileCampus[];
  }, [countries]);
  const companiesInView = useMemo(() => {
    const ids = new Set(shown.map((campus) => campus.id));
    return companies
      .filter((company) => company.schoolId && ids.has(company.schoolId) && (!selectedId || company.schoolId === selectedId))
      .sort((a, b) => b.signals - a.signals || a.name.localeCompare(b.name));
  }, [companies, shown, selectedId]);
  const companyStrip = useMemo(() => companiesInView.slice(0, 72), [companiesInView]);
  const founderStrip = useMemo(() => {
    const rows: { key: string; name: string; companyId: string; companyName: string }[] = [];
    for (const company of companiesInView) {
      for (const person of company.founders ?? []) {
        const name = person.trim();
        if (!name) continue;
        rows.push({ key: `${company.id}:${name}`, name, companyId: company.id, companyName: company.name });
        if (rows.length >= 72) return rows;
      }
    }
    return rows;
  }, [companiesInView]);

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
  }

  const mobileChoices = (
    <div className="mt-2 space-y-2 lg:hidden">
      <ViewDrawer
        mode={stripMode}
        onMode={setStripMode}
        companies={companyStrip}
        founders={founderStrip}
        companyTotal={companiesInView.length}
        founderTotal={founderStrip.length}
      />
      <details className="rounded-xl border border-[#f0d9c6] bg-white/94 px-2.5 py-2 text-[#20140c]">
        <summary className="cursor-pointer text-[12px] font-semibold">Campuses · {shown.length}</summary>
        <div className="mt-2 space-y-2">
          <p className="text-[11px] leading-4 text-[#6b5443]">{markerSizeLegend()}</p>
          <div className="chip-scroll">
            <FilterChip active={!country} onClick={() => setCountry(null)} label={`All · ${campuses.length}`} />
            {countries.map(([name, count]) => (
              <FilterChip key={name} active={country === name} onClick={() => setCountry(country === name ? null : name)} label={`${name} · ${count}`} />
            ))}
          </div>
          <div className="chip-scroll">
            {byFounders.map((campus) => (
              <button key={campus.id} type="button" onClick={() => focus(campus)} className="shrink-0 whitespace-nowrap rounded-full border border-[#f0d9c6] bg-white px-2.5 py-1 text-[12px] text-[#20140c]">
                {shortCampusLabel(campus.id, campus.name)} <span className={COUNT}>{campus.founders.toLocaleString("en-US")}</span>
              </button>
            ))}
          </div>
        </div>
      </details>
    </div>
  );

  return (
    <div className={className}>
    <div className="relative overflow-hidden rounded-2xl bg-[#FFF7F0]" style={{ height: stageHeight }}>
      <div ref={mapNode} className="h-full w-full" />
      <aside className="absolute bottom-3 left-2 top-2 z-10 hidden w-[220px] flex-col overflow-hidden rounded-xl border border-[#f0d9c6] bg-white/94 text-[#20140c] shadow-[0_10px_30px_rgba(90,44,14,0.08)] lg:flex">
        <div className="border-b border-[#f0d9c6] px-2.5 py-2">
          <p className="text-[12px] font-semibold tracking-tight">Filters</p>
          <label className="sr-only" htmlFor="globe-campus-q">Filter campuses</label>
          <input
            id="globe-campus-q"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search campuses"
            className="mt-1.5 h-7 w-full rounded-md border border-[#f0d9c6] bg-[#FFF7F0] px-2 text-[12px] text-[#20140c] outline-none placeholder:text-[#8a7260]"
          />
        </div>
        <div className="border-b border-[#f0d9c6] px-2.5 py-2">
          <p className="mb-1 text-[10px] font-medium uppercase tracking-[0.06em] text-[#8a7260]">Country</p>
          <div className="flex flex-wrap gap-1">
            <FilterChip active={!country} onClick={() => setCountry(null)} label={`All · ${campuses.length}`} />
            {countries.map(([name, count]) => (
              <FilterChip key={name} active={country === name} onClick={() => setCountry(country === name ? null : name)} label={`${name} · ${count}`} />
            ))}
          </div>
          <p className="mb-1 mt-2 text-[10px] font-medium uppercase tracking-[0.06em] text-[#8a7260]">Signal weight</p>
          <p className="text-[11px] leading-4 text-[#6b5443]">Marker size follows stored campus signals (see legend).</p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-1.5 py-1.5">
          <p className="px-1 pb-1 text-[10px] font-medium uppercase tracking-[0.06em] text-[#8a7260]">Campuses</p>
          <ul className="space-y-0.5">
            {filteredCampuses
              .slice()
              .sort((a, b) => b.founders - a.founders || a.name.localeCompare(b.name))
              .slice(0, 40)
              .map((campus) => (
                <li key={campus.id}>
                  <button
                    type="button"
                    onClick={() => focus(campus)}
                    className={`flex w-full items-baseline gap-1.5 rounded-md px-1.5 py-1 text-left text-[12px] hover:bg-[#FFF1E6] ${selectedId === campus.id ? "bg-[#FFF1E6]" : ""}`}
                  >
                    <span className="min-w-0 flex-1 truncate text-[#20140c]">{shortCampusLabel(campus.id, campus.name)}</span>
                    <span className={`${COUNT} shrink-0 text-[11px]`}>{campus.founders.toLocaleString("en-US")}</span>
                  </button>
                </li>
              ))}
          </ul>
        </div>
        <p className="border-t border-[#f0d9c6] px-2.5 py-1.5 text-[10px] leading-[14px] text-[#6b5443]">{markerSizeLegend()}</p>
      </aside>
      <aside className="absolute bottom-[6.25rem] right-2 top-2 z-10 hidden w-[236px] space-y-2 overflow-y-auto lg:block">
        <RankCard title="Leading campuses" metric="founders" rows={byFounders} max={maxFounders} onPick={focus} />
        <RankCard title="Top by signals" metric="signals" rows={bySignals} max={bySignals[0]?.signals || 1} onPick={focus} />
        <RankCard
          title="Countries"
          metric="founders"
          rows={countryRows}
          max={countryRows[0]?.founders || 1}
          onPick={(row) => setCountry(row.country === country ? null : row.country)}
          valueLabel="campuses"
        />
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
      <div className="absolute bottom-2 left-[232px] right-2 z-10 hidden lg:block">
        <ViewDrawer
          mode={stripMode}
          onMode={setStripMode}
          companies={companyStrip}
          founders={founderStrip}
          companyTotal={companiesInView.length}
          founderTotal={founderStrip.length}
        />
      </div>
      <p className="pointer-events-auto absolute bottom-[6.5rem] right-2 z-10 hidden max-w-[220px] text-right text-[10px] leading-[14px] text-[#6b5443] lg:block">
        <MapCredit />
      </p>
    </div>
    {mobileChoices}
    </div>
  );
}

function CompanyMark({ name, logoUrl }: { name: string; logoUrl: string | null }) {
  const [failed, setFailed] = useState(false);
  const letter = name.trim().charAt(0).toUpperCase() || "?";
  if (!logoUrl || failed) {
    return (
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-[#FFF1E6] text-[11px] font-semibold text-[#E05612]" aria-hidden>
        {letter}
      </span>
    );
  }
  return (
    <Image
      src={logoUrl}
      alt=""
      width={28}
      height={28}
      unoptimized
      className="h-7 w-7 shrink-0 rounded-md border border-[#f0d9c6] bg-white object-contain"
      onError={() => setFailed(true)}
    />
  );
}

function personInitials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  const first = (parts[0] ?? "").replace(/[^A-Za-z]/g, "");
  const last = parts.length > 1 ? parts[parts.length - 1].replace(/[^A-Za-z]/g, "") : "";
  return ((first[0] ?? "") + (last[0] ?? first[1] ?? "")).toUpperCase() || "?";
}

function ViewDrawer({
  mode,
  onMode,
  companies,
  founders,
  companyTotal,
  founderTotal,
}: {
  mode: "startups" | "founders";
  onMode: (mode: "startups" | "founders") => void;
  companies: TileCompany[];
  founders: { key: string; name: string; companyId: string; companyName: string }[];
  companyTotal: number;
  founderTotal: number;
}) {
  const total = mode === "startups" ? companyTotal : founderTotal;
  if (companyTotal === 0 && founderTotal === 0) return null;
  return (
    <div className="rounded-xl border border-[#f0d9c6] bg-white/94 px-2.5 py-2 text-[#20140c] shadow-[0_10px_30px_rgba(90,44,14,0.08)]">
      <div className="mb-1.5 flex flex-wrap items-center gap-2 px-0.5">
        <p className="text-[12px] font-semibold tracking-tight">Current view</p>
        <p className={`${COUNT} text-[12px]`}>{total.toLocaleString("en-US")}</p>
        <div className="ml-auto inline-flex overflow-hidden rounded-md border border-[#f0d9c6]">
          <button type="button" onClick={() => onMode("startups")} className={`h-6 px-2 text-[11px] font-medium ${mode === "startups" ? "bg-[#FB651E] text-white" : "bg-white text-[#6b5443]"}`}>
            Startups
          </button>
          <button type="button" onClick={() => onMode("founders")} className={`h-6 px-2 text-[11px] font-medium ${mode === "founders" ? "bg-[#FB651E] text-white" : "bg-white text-[#6b5443]"}`}>
            Founders
          </button>
        </div>
      </div>
      {mode === "startups" ? (
        <div className="grid max-h-[5.5rem] grid-cols-2 gap-1 overflow-y-auto sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
          {companies.map((company) => (
            <a key={company.id} href={`/startup/${company.id}`} className="flex min-w-0 items-center gap-1.5 rounded-lg border border-[#f0d9c6] bg-white px-1.5 py-1 text-[11px] text-[#20140c] hover:border-[#E05612]">
              <CompanyMark name={company.name} logoUrl={company.logoUrl ?? null} />
              <span className="min-w-0 truncate">{company.name}</span>
            </a>
          ))}
        </div>
      ) : (
        <div className="grid max-h-[5.5rem] grid-cols-2 gap-1 overflow-y-auto sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
          {founders.map((person) => (
            <a key={person.key} href={`/startup/${person.companyId}`} className="flex min-w-0 items-center gap-1.5 rounded-lg border border-[#f0d9c6] bg-white px-1.5 py-1 text-[11px] text-[#20140c] hover:border-[#E05612]" title={person.companyName}>
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-[#FFF1E6] text-[10px] font-semibold text-[#E05612]" aria-hidden>
                {personInitials(person.name)}
              </span>
              <span className="min-w-0 truncate">{person.name}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function FilterChip({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`shrink-0 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] ${active ? "border-[#FB651E] bg-[#FB651E] text-white" : "border-[#f0d9c6] bg-white text-[#20140c]"}`}>
      {label}
    </button>
  );
}

function RankCard({
  title,
  metric,
  rows,
  max,
  onPick,
  valueLabel,
}: {
  title: string;
  metric: "founders" | "signals";
  rows: TileCampus[];
  max: number;
  onPick: (campus: TileCampus) => void;
  valueLabel?: string;
}) {
  const unit = valueLabel ?? metric;
  return (
    <div className="rounded-xl border border-[#f0d9c6] bg-white/94 p-2.5 text-[#20140c] shadow-[0_10px_30px_rgba(90,44,14,0.08)]">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[12px] font-semibold">{title}</p>
        <p className="text-[10px] uppercase tracking-[0.04em] text-[#8a7260]">{unit}</p>
      </div>
      <ol className="mt-1.5 space-y-1.5">
        {rows.map((campus, index) => {
          const value = metric === "founders" ? campus.founders : campus.signals;
          const width = Math.max(8, Math.round((value / Math.max(1, max)) * 100));
          return (
            <li key={campus.id}>
              <button type="button" onClick={() => onPick(campus)} className="w-full text-left hover:text-[#FB651E]" title={`${value.toLocaleString("en-US")} ${unit}`}>
                <div className="flex items-baseline gap-1.5 text-[12px]">
                  <span className={`${COUNT} w-3.5 shrink-0 text-[11px]`}>{index + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-[#20140c]">{campus.id.startsWith("country-") ? campus.name : shortCampusLabel(campus.id, campus.name)}</span>
                  <span className={`${COUNT} shrink-0 text-[11px]`}>{value.toLocaleString("en-US")}</span>
                </div>
                <div className="ml-[18px] mt-0.5 h-1 overflow-hidden rounded-full bg-[#FFF1E6]">
                  <div className="h-full rounded-full bg-[#FB651E]" style={{ width: `${width}%` }} />
                </div>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
