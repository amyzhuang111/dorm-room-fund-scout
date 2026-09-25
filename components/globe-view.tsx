"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { buildHref } from "@/lib/domain/url";
import type { CandidateSummary, UniversitySummary } from "@/lib/domain/queries";
import { ResultTray } from "./result-tray";
import { shortCampusLabel } from "@/lib/domain/campuses";
import "maplibre-gl/dist/maplibre-gl.css";

// Real MapLibre GL JS globe projection + the free OpenFreeMap "positron"
// vector style — the exact stack dashboard.vclense.ch/ycglobe uses (studied
// directly from its page source), recolored here to the DRF-sampled palette
// instead of their orange/cream theme. No API key needed (OpenFreeMap is a
// free, no-auth tile service).
const STYLE_URL = "https://tiles.openfreemap.org/styles/positron";

// Positron's OWN default colors are near-white by design (land
// rgb(242,243,240), water rgb(194,200,202) — verified against the live
// style JSON) — a minimalist basemap meant to sit under data, not to be
// looked at on its own at world zoom. It needs real contrast injected, not
// another pale tint layered on top, or it reads as a blank white circle
// (exactly what happened here the first time).
const MAP_THEME = {
  land: "#efe6d6",
  landAlt: "#e2d3bc",
  ocean: "#d5e2ea",
  boundary: "#c4b8a8",
  labelText: "#1c1917",
  labelHalo: "#f7f4ee",
  sky: "#e7eef3",
  horizon: "#f3efe6",
  fog: "#e7eef3",
};

interface MapEvent {
  error?: unknown;
  point?: { x: number; y: number };
  features?: { properties?: { id?: string } }[];
}

interface CampusMap {
  resize: () => void;
  remove?: () => void;
  getCanvas: () => { style: { cursor: string } };
  getStyle: () => { layers: { id: string; type: string }[] };
  getSource: (id: string) => unknown;
  getLayer: (id: string) => unknown;
  setProjection: (projection: { type: string }) => void;
  setSky: (sky: object) => void;
  setPaintProperty: (layer: string, prop: string, value: unknown) => void;
  addSource: (id: string, source: object) => void;
  addLayer: (layer: object) => void;
  setFilter: (layer: string, filter: unknown) => void;
  flyTo: (options: object) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  on: {
    (type: string, handler: (event: MapEvent) => void): void;
    (type: string, layer: string, handler: (event: MapEvent) => void): void;
  };
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

export function GlobeView({
  universities,
  basePath,
  current,
  previewCandidates = [],
  trayCandidates = [],
}: {
  universities: UniversitySummary[];
  basePath: string;
  current: Record<string, string | undefined>;
  previewCandidates?: CandidateSummary[];
  // Design MD §5's bottom result tray — the current filtered result set,
  // shown regardless of whether a campus is selected (unlike
  // previewCandidates, which is per-campus and only passed once one is).
  trayCandidates?: CandidateSummary[];
}) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<CampusMap | null>(null);
  const [status, setStatus] = useState<"loading" | "ok" | "unsupported">("loading");
  const [geoMode, setGeoMode] = useState<"campus" | "hq">("campus");
  const [hoverTip, setHoverTip] = useState<{ id: string; x: number; y: number } | null>(null);
  const selectedUniversity = current.university ? universities.find((u) => u.id === current.university) : undefined;
  const placed = trayCandidates.filter((c) => c.recordedPlace);
  const unplaced = trayCandidates.filter((c) => !c.recordedPlace);

  // The map (and its "click campus-dots" handler) is constructed once, in a
  // mount-only effect below — without this ref, that handler's closure would
  // freeze basePath/current at their first-render values, silently dropping
  // any filter/search the user had applied by the time they click a marker.
  // Updated in an effect (not during render) per the rules-of-hooks: a ref
  // write during render can be dropped by React and isn't guaranteed to be
  // visible to effects/handlers that read it later.
  const liveRef = useRef({ basePath, current });
  useEffect(() => {
    liveRef.current = { basePath, current };
  }, [basePath, current]);

  const points = universities.filter((u) => u.lat != null && u.lon != null);

  useEffect(() => {
    if (!containerRef.current) return;
    let map: CampusMap;
    let cancelled = false;
    let resizeObserver: ResizeObserver | undefined;

    (async () => {
      let maplibregl: { Map: new (options: object) => CampusMap };
      try {
        // Loaded from the CDN at runtime rather than through our own bundle on
        // purpose: MapLibre creates its own tile-parsing Web Worker internally via
        // a blob: URL, and Turbopack (verified directly — it extracts the worker
        // into its own chunk instead of leaving MapLibre's own blob-URL creation
        // alone) breaks that, producing a "worker" that never actually processes
        // tile requests — the map showed only its flat background layer with zero
        // .pbf tile requests ever issued, confirmed by inspecting network traffic
        // and comparing against an isolated non-bundled reproduction where it
        // worked correctly. This is also literally what dashboard.vclense.ch/
        // ycglobe itself does (a plain CDN <script> tag, not an NPM bundle) — not
        // a workaround invented here, the same integration choice as the model.
        // @ts-expect-error — remote URL import, no local type declarations to resolve
        maplibregl = await import(/* webpackIgnore: true */ "https://unpkg.com/maplibre-gl@6.10.0/dist/maplibre-gl.mjs");
      } catch {
        if (!cancelled) setStatus("unsupported");
        return;
      }
      if (cancelled || !containerRef.current) return;

      map = new maplibregl.Map({
        container: containerRef.current,
        style: STYLE_URL,
        center: [-95, 40], // North America — where all 5 current campuses are
        zoom: 2.6,
        minZoom: 1.5,
        maxZoom: 8,
        attributionControl: { compact: true },
      });
      mapRef.current = map;
      let styleLoaded = false;

      // The container's real flex/grid-computed size isn't necessarily final at the
      // exact moment the effect runs and the Map constructs — if MapLibre measures a
      // wrong/zero size at construction, it computes "zero tiles needed for this
      // viewport" and, critically, never recomputes on its own afterward. That is the
      // actual root cause of a map that shows only the flat background layer (colors
      // applying fine, since those are pure paint-property calls) with literally zero
      // vector-tile requests ever issued — verified by inspecting network traffic:
      // the style/sprite loaded, but no .pbf tile request ever fired. A ResizeObserver
      // that calls resize() whenever the container's real size changes fixes it, for
      // this initial-layout race and for any later container resize (sidebar toggling,
      // window resize, drawer opening).
      resizeObserver = new ResizeObserver(() => map?.resize());
      resizeObserver.observe(containerRef.current);

      // MapLibre fires "error" for lots of non-fatal things too (a single tile 404,
      // a missing glyph) — only treat it as fatal (fall back to the list view) if the
      // style never loaded at all; otherwise just log it and keep going.
      map.on("error", (e: MapEvent) => {
        console.warn("[globe-view] map error:", e?.error ?? e);
        if (!cancelled && !styleLoaded) setStatus("unsupported");
      });

      map.on("style.load", () => {
        styleLoaded = true;
        // Each recolor attempt is independently guarded — one bad layer id/type must
        // never silently take the rest of the theming down with it (that's exactly how
        // the map ended up looking like a blank white circle the first time around).
        const trySet = (fn: () => void, label: string) => {
          try {
            fn();
          } catch (e) {
            console.warn(`[globe-view] couldn't apply "${label}":`, e);
          }
        };

        trySet(() => map.setProjection({ type: "globe" }), "globe projection");
        trySet(
          () =>
            map.setSky({
              "sky-color": MAP_THEME.sky,
              "horizon-color": MAP_THEME.horizon,
              "fog-color": MAP_THEME.fog,
              "sky-horizon-blend": 0.6,
              "horizon-fog-blend": 0.5,
              "fog-ground-blend": 0.5,
              "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 0.7, 6, 0],
            }),
          "sky/atmosphere"
        );

        for (const l of map.getStyle().layers) {
          if (l.type === "background") trySet(() => map.setPaintProperty(l.id, "background-color", MAP_THEME.land), `background:${l.id}`);
          if (l.id === "water") trySet(() => map.setPaintProperty(l.id, "fill-color", MAP_THEME.ocean), `water:${l.id}`);
          if (l.type === "fill" && /landcover|landuse|park|wood|sand/.test(l.id)) {
            // These layers' own fill-opacity is a zoom-interpolated expression whose domain
            // starts around zoom 8 — MapLibre clamps to the first stop's value *below* that
            // domain, so at our low zoom (~2.6) several of them render at ~0.7–1.0 opacity,
            // not the near-zero you'd expect from a "detail that fades in" layer. Recoloring
            // them without also capping opacity paints a solid wall over the whole map — that
            // was the actual cause of "the globe is just a white/purple circle," not the base
            // color choice. Verified in an isolated MapLibre harness before landing this.
            trySet(() => map.setPaintProperty(l.id, "fill-color", MAP_THEME.landAlt), `landAlt:${l.id}`);
            trySet(() => map.setPaintProperty(l.id, "fill-opacity", 0.25), `landAlt-opacity:${l.id}`);
          }
          if (l.type === "line" && /boundary/.test(l.id)) {
            trySet(() => map.setPaintProperty(l.id, "line-color", MAP_THEME.boundary), `boundary:${l.id}`);
          }
          if (l.type === "symbol") {
            trySet(() => map.setPaintProperty(l.id, "text-color", MAP_THEME.labelText), `labelText:${l.id}`);
            trySet(() => map.setPaintProperty(l.id, "text-halo-color", MAP_THEME.labelHalo), `labelHalo:${l.id}`);
          }
        }


        try {
          if (!map.getSource("campuses")) {
            map.addSource("campuses", {
              type: "geojson",
              data: {
                type: "FeatureCollection",
                features: points.map((u) => ({
                  type: "Feature",
                  geometry: { type: "Point", coordinates: [u.lon, u.lat] },
                  properties: {
                    id: u.id,
                    name: shortCampusLabel(u.id, u.name),
                    count: u.companyCount,
                    founders: u.founderCount,
                  },
                })),
              },
            });
          }

          if (!map.getLayer("campus-dots")) {
            map.addLayer({
              id: "campus-dots",
              type: "circle",
              source: "campuses",
              paint: {
                "circle-radius": ["interpolate", ["linear"], ["get", "count"], 0, 9, 8, 16, 40, 26],
                "circle-color": "#5b4bdb",
                "circle-stroke-width": 2,
                "circle-stroke-color": "#ffffff",
                "circle-opacity": 0.9,
              },
            });
          }

          if (!map.getLayer("campus-selected")) {
            map.addLayer({
              id: "campus-selected",
              type: "circle",
              source: "campuses",
              filter: ["==", ["get", "id"], current.university ?? "__none__"],
              paint: {
                "circle-radius": ["interpolate", ["linear"], ["get", "count"], 0, 14, 8, 22, 40, 32],
                "circle-color": "#ff6a33",
                "circle-stroke-width": 2,
                "circle-stroke-color": "#ffffff",
              },
            });
          }

          if (!map.getLayer("campus-labels")) {
            map.addLayer({
              id: "campus-labels",
              type: "symbol",
              source: "campuses",
              layout: {
                "text-field": ["concat", ["get", "name"], "  ", ["to-string", ["get", "count"]]],
                "text-size": 11,
                "text-offset": [0, 1.4],
                "text-anchor": "top",
              },
              paint: { "text-color": MAP_THEME.labelText, "text-halo-color": "#ffffff", "text-halo-width": 1.2 },
            });
          }

          map.on("click", "campus-dots", (e: MapEvent) => {
            const id = e.features?.[0]?.properties?.id;
            if (!id) return;
            const { basePath: livePath, current: liveCurrent } = liveRef.current;
            const switchingCampus = liveCurrent.university !== id;
            router.push(buildHref(livePath, liveCurrent, switchingCampus ? { university: id, project: null } : { university: id }));
          });
          map.on("mouseenter", "campus-dots", () => (map.getCanvas().style.cursor = "pointer"));
          map.on("mousemove", "campus-dots", (e: MapEvent) => {
            const id = e.features?.[0]?.properties?.id;
            if (!id || !e.point) return;
            setHoverTip({ id, x: e.point.x, y: e.point.y });
          });
          map.on("mouseleave", "campus-dots", () => {
            map.getCanvas().style.cursor = "";
            setHoverTip(null);
          });
        } catch (e) {
          console.error("[globe-view] FAILED adding campus source/layers:", e);
        }
        setStatus("ok");
      });
    })();

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      map?.remove?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fly to / re-filter the selected campus without re-creating the map.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || status !== "ok") return;
    if (map.getLayer("campus-selected")) {
      map.setFilter("campus-selected", ["==", ["get", "id"], current.university ?? "__none__"]);
    }
    if (current.university) {
      const u = universities.find((x) => x.id === current.university);
      if (u?.lat != null && u?.lon != null) {
        map.flyTo({ center: [u.lon, u.lat], zoom: 4, duration: prefersReducedMotion() ? 0 : 900 });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current.university, status]);

  return (
    <div className="p-2">
      <div className="relative h-[min(72vh,760px)] min-h-[480px] w-full overflow-hidden rounded-xl border border-border-c" style={{ background: MAP_THEME.ocean }}>
        <div ref={containerRef} className="h-full w-full" />
        {status === "ok" && (
          <div className="glass-panel absolute right-3 top-3 flex p-0.5">
            <button
              type="button"
              onClick={() => setGeoMode("campus")}
              className={`rounded-md px-2.5 py-1 text-[11px] font-medium ${geoMode === "campus" ? "bg-accent/10 text-accent" : "text-muted"}`}
            >
              Campuses
            </button>
            <button
              type="button"
              onClick={() => setGeoMode("hq")}
              className={`rounded-md px-2.5 py-1 text-[11px] font-medium ${geoMode === "hq" ? "bg-accent/10 text-accent" : "text-muted"}`}
            >
              Headquarters
            </button>
          </div>
        )}
        {status === "ok" && hoverTip && geoMode === "campus" && (
          <CampusHover universities={universities} tip={hoverTip} />
        )}
        {status === "loading" && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-muted">Loading globe…</div>
        )}
        {status === "unsupported" && (
          <div className="absolute inset-0 flex flex-col items-start justify-start gap-2 overflow-y-auto p-4">
            <p className="text-sm text-muted">
              The map couldn&apos;t load (likely no WebGL) — here&apos;s the same campus list it would show.
            </p>
            <UniversityListFallback universities={universities} basePath={basePath} current={current} />
          </div>
        )}

        {/* Floating campus-summary panel — pattern studied from dashboard.vclense.ch/ycglobe's
            frosted floating panels; colors/type still from the DRF-sampled tokens. */}
        {geoMode === "hq" && status === "ok" && (
          <div className="glass-panel absolute left-3 top-3 w-72 max-h-[520px] overflow-y-auto">
            <div className="glass-panel-head">
              <span className="text-sm font-medium text-foreground">Headquarters</span>
            </div>
            <p className="px-3 pt-2 text-[11px] leading-snug text-muted">
              A company is plotted only when a source gives coordinates. A place name is not geocoded, and a campus is never used as a headquarters.
            </p>
            <div className="px-3 py-2">
              <span className="ui-label">Place name on record · not plotted ({placed.length})</span>
              <ul className="mt-1.5 space-y-1">
                {placed.slice(0, 8).map((c) => (
                  <li key={c.id}>
                    <a href={buildHref(basePath, current, { project: c.id })} className="block rounded-md px-1.5 py-1 text-xs hover:bg-surface-2">
                      <span className="font-medium text-foreground">{c.name}</span>
                      <span className="block truncate text-muted">{c.recordedPlace}</span>
                    </a>
                  </li>
                ))}
                {placed.length === 0 && <li className="text-xs text-muted">No sourced place names in this result set.</li>}
              </ul>
            </div>
            <div className="px-3 pb-3">
              <span className="ui-label">Location unknown ({unplaced.length})</span>
              <ul className="mt-1.5 space-y-1">
                {unplaced.slice(0, 6).map((c) => (
                  <li key={c.id}>
                    <a href={buildHref(basePath, current, { project: c.id })} className="block truncate rounded-md px-1.5 py-1 text-xs text-foreground hover:bg-surface-2">
                      {c.name}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {geoMode === "campus" && selectedUniversity && status === "ok" && (
          <div className="glass-panel absolute left-3 top-3 w-64 max-h-[520px] overflow-y-auto">
            <div className="glass-panel-head">
              <span className="text-sm font-medium text-foreground">{selectedUniversity.name}</span>
              <a
                href={buildHref(basePath, current, { university: null })}
                className="ml-auto text-[11px] text-muted hover:text-foreground"
                aria-label="Close campus panel"
              >
                ✕
              </a>
            </div>
            <div className="flex items-center gap-3 px-3 py-2 text-[11px] text-muted">
              <span>
                <span className="font-medium text-foreground">{selectedUniversity.companyCount}</span> companies
              </span>
              <span>
                <span className="font-medium text-foreground">{selectedUniversity.founderCount}</span> founders
              </span>
              <span>
                <span className="font-medium text-foreground">{selectedUniversity.sourcesConfigured}</span> sources
              </span>
            </div>
            <div className="px-3 pb-3">
              <span className="ui-label">Preview results</span>
              <ul className="mt-1.5 space-y-1">
                {previewCandidates.slice(0, 5).map((c) => (
                  <li key={c.id}>
                    <a
                      href={buildHref(basePath, current, { project: c.id })}
                      className="block truncate rounded-md px-1.5 py-1 text-xs text-foreground hover:bg-surface-2"
                    >
                      {c.name}
                    </a>
                  </li>
                ))}
                {previewCandidates.length === 0 && <li className="text-xs text-muted">No candidates found here yet.</li>}
              </ul>
              {previewCandidates.length > 5 && (
                <a href={buildHref(basePath, current, { view: "table" })} className="mt-1.5 block text-[11px] text-accent underline">
                  See all {previewCandidates.length} in Table
                </a>
              )}
            </div>
          </div>
        )}

        {status === "ok" && <ResultTray candidates={trayCandidates} basePath={basePath} current={current} />}

        {status === "ok" && (
          <div className="absolute bottom-3 right-3 flex flex-col gap-1">
            <button
              type="button"
              onClick={() => mapRef.current?.zoomIn()}
              aria-label="Zoom in"
              className="glass-panel flex h-7 w-7 items-center justify-center text-sm text-foreground"
            >
              +
            </button>
            <button
              type="button"
              onClick={() => mapRef.current?.zoomOut()}
              aria-label="Zoom out"
              className="glass-panel flex h-7 w-7 items-center justify-center text-sm text-foreground"
            >
              −
            </button>
            <button
              type="button"
              onClick={() => mapRef.current?.flyTo({ center: [-95, 40], zoom: 2.6, duration: prefersReducedMotion() ? 0 : 900 })}
              aria-label="Reset view"
              className="glass-panel flex h-7 w-7 items-center justify-center text-[10px] text-foreground"
              title="Fit results"
            >
              ⤢
            </button>
          </div>
        )}
      </div>
      <p className="mt-2 text-[11px] text-muted">
        Marker size is the number of companies tied to that campus by sourced affiliation. It is not an estimate of every startup at the school.
        Drag to look around. Click a campus to open it. Headquarters mode lists recorded place names and leaves unknown locations unplotted.
      </p>
      <div className="mt-3">
        <UniversityListFallback universities={universities} basePath={basePath} current={current} compact />
      </div>
    </div>
  );
}

function CampusHover({
  universities,
  tip,
}: {
  universities: UniversitySummary[];
  tip: { id: string; x: number; y: number };
}) {
  const u = universities.find((x) => x.id === tip.id);
  if (!u) return null;
  return (
    <div
      className="glass-panel pointer-events-none absolute z-10 px-2.5 py-1.5 text-xs"
      style={{ left: tip.x + 12, top: tip.y - 8 }}
    >
      <p className="font-medium text-foreground">{shortCampusLabel(u.id, u.name)}</p>
      <p className="text-muted" style={{ fontVariantNumeric: "tabular-nums" }}>
        {u.companyCount} companies · {u.founderCount} founders
      </p>
    </div>
  );
}

function UniversityListFallback({
  universities,
  basePath,
  current,
  compact,
}: {
  universities: UniversitySummary[];
  basePath: string;
  current: Record<string, string | undefined>;
  compact?: boolean;
}) {
  return (
    <ul className={compact ? "flex flex-wrap gap-2" : "space-y-1.5"}>
      {universities.map((u) => (
        <li key={u.id}>
          <a
            href={buildHref(basePath, current, current.university !== u.id ? { university: u.id, project: null } : { university: u.id })}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${current.university === u.id ? "border-accent bg-accent/10 text-accent" : "border-border-c hover:bg-surface-2"}`}
          >
            {u.name}
            <span className="text-muted">({u.candidateProjectCount})</span>
          </a>
        </li>
      ))}
    </ul>
  );
}
