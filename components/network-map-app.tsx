"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { SECTION_SHORT, tierBandLabel, type HotspotSectionId } from "@/lib/domain/hotspot-model";
import type { MapEdgeType, MapGraph, MapNode, MapNodeType } from "@/lib/domain/network-map";
import { REGIONS, regionSwatch } from "@/lib/domain/network-regions";
import { signalTooltip } from "@/lib/domain/network-signal-size";
import { attachUserMapNodes, isUserAddedId } from "@/lib/domain/user-pipeline";
import { useUserPipeline } from "./user-pipeline-provider";
import type { NetworkFocus } from "@/lib/domain/network-focus";
import { buildPersonLinkedInLookup } from "@/lib/domain/map-linkedin";
import type { NetworkSigmaHandle } from "./network-sigma";
import { NODE_FILL, campusSwatches, groupCampusSwatches } from "./network-style";
import { useAskHighlight } from "./ask-highlight";
import { NETWORK_FILTER_EVENT, type NetworkMapFilter } from "@/lib/domain/network-filter";
import { LinkedInIconButton, LinkedInOpenButton, PersonLinkButton, ProfileIconLinks } from "./person-link";
import { DrfHopFilter } from "./drf-hop-filter";
import { WarmIntroPaths } from "./warm-intro-paths";

const NetworkSigma = dynamic(() => import("./network-sigma").then((mod) => mod.NetworkSigma), {
  ssr: false,
  loading: () => <p className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-sm text-black">Drawing the network…</p>,
});

const NODE_TYPES: { id: MapNodeType; label: string }[] = [
  { id: "person", label: "People" },
  { id: "startup", label: "Startups" },
  { id: "investor", label: "Investors" },
  { id: "campus", label: "Campuses" },
  { id: "program", label: "Clubs and labs" },
  { id: "organization", label: "Organizations" },
];

const ORG_SECTIONS: HotspotSectionId[] = ["existing_founders", "startups", "potential_founders"];
type OrgTierMode = "all" | "1" | "12";

const EDGE_TYPES: { id: MapEdgeType; label: string }[] = [
  { id: "founded", label: "Founded" },
  { id: "co_founder", label: "Co-founder" },
  { id: "studied_at", label: "Studied at" },
  { id: "invested_in", label: "Invested in" },
  { id: "member_of", label: "Member of" },
  { id: "at_campus", label: "At campus" },
  { id: "works_at", label: "Works at" },
];

const ENROLL: { id: string; label: string }[] = [
  { id: "current_student", label: "Current student" },
  { id: "recent_grad", label: "Recent grad" },
  { id: "older_alumni", label: "Alumni" },
];

type PeopleMode = "all" | "founder" | "potential";

interface Filters {
  campuses: string[];
  sectors: string[];
  tiers: string[];
  stages: string[];
  enroll: string[];
  nodeTypes: MapNodeType[];
  edgeTypes: MapEdgeType[];
  peopleMode: PeopleMode;
  yearFrom: number | null;
  yearTo: number | null;
  orgTier: OrgTierMode;
  orgSections: HotspotSectionId[];
  drfHops: boolean;
}

function enrollCaption(status: string | null, basis: MapNode["enrollBasis"]): string | null {
  const label = status === "current_student" ? "Current student" : status === "recent_grad" ? "Recent grad" : status === "older_alumni" ? "Alumni" : null;
  if (!label) return null;
  return basis === "inferred" ? `${label} est.` : label;
}

function campusesOf(node: MapNode): string[] {
  if (node.campuses && node.campuses.length) return node.campuses;
  return node.campus ? [node.campus] : [];
}

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

export function NetworkMapApp() {
  const [graph, setGraph] = useState<MapGraph | null>(null);
  const pipeline = useUserPipeline();
  const shown = useMemo(() => (graph ? attachUserMapNodes(graph, pipeline.state) : null), [graph, pipeline.state]);
  const seededCampuses = useRef(new Set<string>());
  const [error, setError] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [legendOpen, setLegendOpen] = useState(true);
  const [filters, setFilters] = useState<Filters | null>(null);
  const [showIsolates, setShowIsolates] = useState(false);
  const defaultsRef = useRef<Filters | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [fly, setFly] = useState<{ id: string; token: number }>({ id: "", token: 0 });
  const [focus, setFocus] = useState<NetworkFocus | null>(null);
  const graphApi = useRef<NetworkSigmaHandle | null>(null);

  const [pinned, setPinned] = useState<{ label: string; ids: Set<string> } | null>(null);
  const [drfNear, setDrfNear] = useState<Set<string> | null>(null);

  useEffect(() => {
    const onFilter = (event: Event) => {
      const detail = (event as CustomEvent<NetworkMapFilter | null>).detail;
      if (!detail || detail.ids.length === 0) {
        setPinned(null);
        return;
      }
      setPinned({ label: detail.label, ids: new Set(detail.ids) });
    };
    window.addEventListener(NETWORK_FILTER_EVENT, onFilter);
    return () => window.removeEventListener(NETWORK_FILTER_EVENT, onFilter);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelected(null);
        setPinned(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    let cancel = false;
    fetch("/api/network/map")
      .then((res) => {
        if (!res.ok) throw new Error("map failed");
        return res.json() as Promise<MapGraph>;
      })
      .then((data) => {
        if (cancel) return;
        setGraph(data);
        const campuses = data.nodes.filter((node) => node.type === "campus").map((node) => node.campus).filter((id): id is string => !!id);
        const sectors = [...new Set(data.nodes.map((node) => node.sector).filter((item): item is string => !!item))].sort();
        const tiers = [...new Set(data.nodes.map((node) => node.tier ?? "Untiered"))].sort();
        const stages = [...new Set(data.nodes.map((node) => node.stage ?? "Unknown"))].sort();
        const initial: Filters = {
          campuses,
          sectors,
          tiers,
          stages,
          enroll: ENROLL.map((item) => item.id),
          nodeTypes: NODE_TYPES.map((item) => item.id),
          edgeTypes: EDGE_TYPES.map((item) => item.id),
          peopleMode: "all",
          yearFrom: null,
          yearTo: null,
          orgTier: "all",
          orgSections: [...ORG_SECTIONS],
          drfHops: false,
        };
        defaultsRef.current = initial;
        setFilters(initial);
      })
      .catch(() => {
        if (!cancel) setError("The map could not be loaded.");
      });
    return () => {
      cancel = true;
    };
  }, []);

  useEffect(() => {
    if (!selected || isUserAddedId(selected)) return;
    let cancel = false;
    fetch(`/api/network/focus?id=${encodeURIComponent(selected)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { focus: NetworkFocus | null } | null) => {
        if (!cancel) setFocus(data?.focus ?? null);
      })
      .catch(() => {});
    return () => {
      cancel = true;
    };
  }, [selected]);

  useEffect(() => {
    if (!shown || !filters) return;
    const ids = shown.nodes.filter((node) => node.type === "campus" && node.campus).map((node) => node.campus as string);
    const fresh = ids.filter((id) => !seededCampuses.current.has(id) && !filters.campuses.includes(id));
    for (const id of ids) seededCampuses.current.add(id);
    if (fresh.length === 0) return;
    setFilters({ ...filters, campuses: [...filters.campuses, ...fresh] });
  }, [shown, filters]);

  useEffect(() => {
    if (!filters?.drfHops || drfNear) return;
    let cancel = false;
    fetch("/api/drf/neighborhood")
      .then((res) => (res.ok ? (res.json() as Promise<{ ids?: string[] }>) : { ids: [] }))
      .then((data) => {
        if (!cancel) setDrfNear(new Set(data.ids ?? []));
      })
      .catch(() => {
        if (!cancel) setDrfNear(new Set());
      });
    return () => {
      cancel = true;
    };
  }, [filters?.drfHops, drfNear]);

  const ask = useAskHighlight();
  const hidden = useMemo(() => {
    const base = hiddenIds(shown, filters, showIsolates, filters?.drfHops ? drfNear : null);
    let next = base;
    if (ask && shown && ask.ids.length > 0) {
      const keep = new Set(ask.ids);
      if (shown.nodes.some((node) => keep.has(node.id))) {
        next = new Set<string>();
        for (const node of shown.nodes) {
          if (!keep.has(node.id)) next.add(node.id);
        }
      }
    }
    if (pinned && shown) {
      const narrowed = new Set(next);
      for (const node of shown.nodes) {
        if (!pinned.ids.has(node.id)) narrowed.add(node.id);
      }
      return narrowed;
    }
    return next;
  }, [shown, filters, showIsolates, ask, pinned, drfNear]);
  const edgeTypes = useMemo(() => new Set(filters?.edgeTypes ?? []), [filters]);
  const activeId = selected && !hidden.has(selected) ? selected : null;

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!shown || q.length < 2) return [];
    return shown.nodes.filter((node) => !hidden.has(node.id) && node.label.toLowerCase().includes(q)).slice(0, 8);
  }, [shown, query, hidden]);

  const visibleCounts = useMemo(() => {
    const counts = { person: 0, startup: 0, campus: 0, investor: 0, program: 0, organization: 0 };
    if (!shown) return counts;
    for (const node of shown.nodes) {
      if (!hidden.has(node.id)) counts[node.type] += 1;
    }
    return counts;
  }, [shown, hidden]);

  const yearChoices = useMemo(() => {
    const counts = new Map<number, number>();
    if (!shown) return [];
    for (const node of shown.nodes) {
      if (node.type !== "person" || node.year == null) continue;
      counts.set(node.year, (counts.get(node.year) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[0] - a[0]).slice(0, 8);
  }, [shown]);

  function choose(id: string) {
    setSelected(id);
    setFly((prev) => ({ id, token: prev.token + 1 }));
    setQuery("");
  }

  const askToken = ask?.token ?? 0;
  const [seenAsk, setSeenAsk] = useState(0);
  if (askToken !== seenAsk) {
    setSeenAsk(askToken);
    if (ask?.focusId && shown?.nodes.some((node) => node.id === ask.focusId)) {
      setSelected(ask.focusId);
      setFly((prev) => ({ id: ask.focusId ?? "", token: prev.token + 1 }));
    }
  }

  const linkedinFor = useMemo(() => (shown ? buildPersonLinkedInLookup(shown) : null), [shown]);
  const selectedNode = shown?.nodes.find((node) => node.id === activeId) ?? null;
  const personLinkedIn =
    selectedNode?.type === "person"
      ? focus?.id === selected && focus.linkedin
        ? focus.linkedin
        : linkedinFor?.(selectedNode) ?? null
      : null;
  const detailOpen = activeId != null && selectedNode != null;

  const swatchGroups = useMemo(() => (graph ? groupCampusSwatches(campusSwatches(graph.nodes)) : []), [graph]);

  return (
    <div className="relative h-[calc(100dvh-3.5rem)] min-h-[520px] overflow-hidden bg-white text-black">
      {shown && filters ? (
        <NetworkSigma
          graph={shown}
          hidden={hidden}
          edgeTypes={edgeTypes}
          selected={activeId}
          flyToken={fly.token}
          flyId={fly.id || null}
          onSelect={(id) => setSelected(id)}
          onReady={(api) => {
            graphApi.current = api;
          }}
        />
      ) : (
        <p className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-sm text-black">{error ?? "Laying out the map…"}</p>
      )}

      <div className="absolute left-4 top-4 z-30 flex max-w-[22rem] flex-col items-start gap-1.5">
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="h-7 rounded border border-neutral-200 bg-white/80 px-2 text-[11px] font-medium text-neutral-700"
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen((open) => !open)}
          >
            {filtersOpen ? "Hide filters" : "Filters"}
          </button>
          <label className="inline-flex h-7 items-center gap-1.5 rounded border border-neutral-200 bg-white/80 px-2 text-[11px] text-neutral-700">
            <input type="checkbox" className="accent-black" checked={showIsolates} onChange={(event) => setShowIsolates(event.target.checked)} />
            Unlinked
          </label>
        </div>
        <p className="pl-0.5 text-[11px] leading-none text-neutral-400 tabular-nums">
          {visibleCounts.person.toLocaleString()} people · {visibleCounts.startup.toLocaleString()} startups · {visibleCounts.investor} investors · {visibleCounts.organization} organizations
        </p>
      </div>

      {filtersOpen && filters && graph && (
        <aside className="absolute bottom-14 left-4 top-16 z-30 flex w-[16.5rem] flex-col overflow-hidden rounded-md border border-neutral-200 bg-white text-black shadow-sm">
          <div className="flex items-center justify-between border-b border-black/10 px-3 py-2">
            <p className="text-sm font-semibold">Filters</p>
            <button
              type="button"
              className="text-xs font-medium underline"
              onClick={() => {
                if (defaultsRef.current) setFilters(defaultsRef.current);
              }}
            >
              Reset
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-3 pb-3">
            <FilterGroup title="People">
              <div className="grid grid-cols-3 gap-1">
                {(
                  [
                    ["all", "All"],
                    ["founder", "Founders"],
                    ["potential", "Potential"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    className={`rounded border px-1 py-1 text-[11px] font-medium ${filters.peopleMode === id ? "border-black bg-black text-white" : "border-black/20 bg-white text-black"}`}
                    onClick={() => setFilters({ ...filters, peopleMode: id })}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </FilterGroup>
            <FilterGroup title="Class year">
              <div className="flex gap-2">
                <YearField
                  label="From"
                  value={filters.yearFrom}
                  onChange={(yearFrom) => setFilters({ ...filters, yearFrom })}
                />
                <YearField label="To" value={filters.yearTo} onChange={(yearTo) => setFilters({ ...filters, yearTo })} />
              </div>
              {yearChoices.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  <button
                    type="button"
                    className={`rounded border px-1.5 py-0.5 text-[11px] ${filters.yearFrom == null && filters.yearTo == null ? "border-black bg-black text-white" : "border-black/20"}`}
                    onClick={() => setFilters({ ...filters, yearFrom: null, yearTo: null })}
                  >
                    Any
                  </button>
                  {yearChoices.map(([year, count]) => {
                    const on = filters.yearFrom === year && filters.yearTo === year;
                    return (
                      <button
                        key={year}
                        type="button"
                        className={`rounded border px-1.5 py-0.5 text-[11px] ${on ? "border-black bg-black text-white" : "border-black/20"}`}
                        onClick={() => setFilters({ ...filters, yearFrom: on ? null : year, yearTo: on ? null : year })}
                      >
                        {year}
                        <span className="ml-1 opacity-70">{count}</span>
                      </button>
                    );
                  })}
                </div>
              )}
              <p className="mt-1 text-[10px] leading-snug text-neutral-600">Sourced graduation years only. A range hides people with no class year.</p>
            </FilterGroup>
            <FilterGroup title="Node type">
              {NODE_TYPES.map((item) => (
                <Check
                  key={item.id}
                  label={item.label}
                  color={NODE_FILL[item.id]}
                  shape={item.id === "startup" ? "square" : item.id === "investor" ? "diamond" : item.id === "program" ? "hex" : item.id === "organization" ? "triangle" : "circle"}
                  mark={item.id === "campus" ? "campus" : item.id === "person" ? "person" : "node"}
                  checked={filters.nodeTypes.includes(item.id)}
                  onChange={() => setFilters({ ...filters, nodeTypes: toggle(filters.nodeTypes, item.id) })}
                />
              ))}
            </FilterGroup>
            <FilterGroup title="Organization tier">
              {(
                [
                  ["all", "All"],
                  ["1", "Tier 1"],
                  ["12", "Tier 1–2"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={`mr-1 mt-1 rounded border px-1.5 py-0.5 text-[11px] font-medium ${filters.orgTier === id ? "border-black bg-black text-white" : "border-black/20 bg-white text-black"}`}
                  onClick={() => setFilters({ ...filters, orgTier: id })}
                >
                  {label}
                </button>
              ))}
              <p className="mt-1 text-[10px] leading-snug text-neutral-600">Tier 1 is S+ and S. Tier 1–2 adds A. Directory tiers do not change Founder Signal.</p>
            </FilterGroup>
            <FilterGroup title="Organization category">
              {ORG_SECTIONS.map((section) => (
                <Check
                  key={section}
                  label={SECTION_SHORT[section]}
                  checked={filters.orgSections.includes(section)}
                  onChange={() => setFilters({ ...filters, orgSections: toggle(filters.orgSections, section) })}
                />
              ))}
            </FilterGroup>
            <FilterGroup title="Campus">
              {swatchGroups.map((group) => (
                <div key={group.id} className="mt-1.5">
                  <p className="text-[10px] font-semibold leading-tight" style={{ color: group.color }}>
                    {group.label}
                  </p>
                  {group.swatches.map((swatch) => (
                    <Check
                      key={swatch.id}
                      label={swatch.label}
                      color={swatch.color}
                      shape="circle"
                      mark="campus"
                      checked={filters.campuses.includes(swatch.id)}
                      onChange={() => setFilters({ ...filters, campuses: toggle(filters.campuses, swatch.id) })}
                    />
                  ))}
                </div>
              ))}
            </FilterGroup>
            <FilterGroup title="Sector">
              {[...new Set((shown ?? graph).nodes.map((node) => node.sector).filter((item): item is string => !!item))].sort().map((sector) => (
                <Check key={sector} label={sector} checked={filters.sectors.includes(sector)} onChange={() => setFilters({ ...filters, sectors: toggle(filters.sectors, sector) })} />
              ))}
            </FilterGroup>
            <details className="mt-3">
              <summary className="cursor-pointer text-[10px] font-semibold uppercase tracking-wide text-neutral-600">More</summary>
              <FilterGroup title="Enrollment">
                {ENROLL.map((item) => (
                  <Check
                    key={item.id}
                    label={item.label}
                    checked={filters.enroll.includes(item.id)}
                    onChange={() => setFilters({ ...filters, enroll: toggle(filters.enroll, item.id) })}
                  />
                ))}
                <p className="pt-1 text-[10px] leading-snug text-neutral-600">est. means that bucket was inferred.</p>
              </FilterGroup>
              <FilterGroup title="Signal tier">
                {[...new Set((shown ?? graph).nodes.map((node) => node.tier ?? "Untiered"))].sort().map((tier) => (
                  <Check key={tier} label={tier} checked={filters.tiers.includes(tier)} onChange={() => setFilters({ ...filters, tiers: toggle(filters.tiers, tier) })} />
                ))}
              </FilterGroup>
              <FilterGroup title="Stage">
                {[...new Set((shown ?? graph).nodes.map((node) => node.stage ?? "Unknown"))].sort().map((stage) => (
                  <Check key={stage} label={stage} checked={filters.stages.includes(stage)} onChange={() => setFilters({ ...filters, stages: toggle(filters.stages, stage) })} />
                ))}
              </FilterGroup>
              <FilterGroup title="Relationships">
                {EDGE_TYPES.map((item) => (
                  <Check
                    key={item.id}
                    label={item.label}
                    checked={filters.edgeTypes.includes(item.id)}
                    onChange={() => setFilters({ ...filters, edgeTypes: toggle(filters.edgeTypes, item.id) })}
                  />
                ))}
                <p className="pt-1 text-[10px] leading-snug text-neutral-600">Studied-at links stay hidden until you hover a node, so campus clusters stay readable.</p>
                <DrfHopFilter
                  checked={filters.drfHops}
                  disabled={filters.drfHops && !drfNear}
                  onChange={(drfHops) => setFilters({ ...filters, drfHops })}
                />
              </FilterGroup>
            </details>
          </div>
        </aside>
      )}

      <div className="absolute left-1/2 top-3 z-30 w-[min(18rem,calc(100%-26rem))] -translate-x-1/2">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && matches[0]) {
              event.preventDefault();
              choose(matches[0].id);
            }
            if (event.key === "Escape") setQuery("");
          }}
          placeholder="Search the network"
          aria-label="Search the network"
          className="h-8 w-full rounded border border-neutral-200 bg-white/90 px-2.5 text-[13px] text-black outline-none placeholder:text-neutral-400 focus:border-neutral-400"
        />
        {pinned && (
          <p className="mt-1 flex items-center justify-between gap-2 rounded border border-neutral-300 bg-white px-2 py-1 text-[11px] text-black shadow-sm">
            <span className="truncate">{pinned.label}</span>
            <button type="button" className="shrink-0 font-medium underline" onClick={() => setPinned(null)}>
              Clear
            </button>
          </p>
        )}
        {matches.length > 0 && (
          <ul className="mt-1 max-h-64 overflow-y-auto rounded-md border border-black/15 bg-white shadow-md">
            {matches.map((node) => (
              <li key={node.id}>
                <button type="button" className="flex w-full items-baseline justify-between gap-2 px-3 py-1.5 text-left text-sm hover:bg-neutral-100" onClick={() => choose(node.id)}>
                  <span className="truncate text-black">{node.label}</span>
                  <span className="shrink-0 text-[10px] uppercase tracking-wide text-neutral-600">{isUserAddedId(node.id) ? "User-added" : node.type}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div
        className="absolute bottom-4 z-30 flex flex-col overflow-hidden rounded border border-neutral-200 bg-white/90"
        style={{ right: detailOpen ? "calc(min(22rem, 100% - 1.5rem) + 0.85rem)" : "0.75rem" }}
      >
        <ZoomButton label="Zoom in" onClick={() => graphApi.current?.zoomIn()}>
          +
        </ZoomButton>
        <ZoomButton label="Zoom out" onClick={() => graphApi.current?.zoomOut()}>
          −
        </ZoomButton>
        <ZoomButton label="Fit the network" onClick={() => graphApi.current?.fit()}>
          Fit
        </ZoomButton>
      </div>

      <div className="absolute bottom-4 z-20 max-w-[min(42rem,calc(100%-5.5rem))]" style={{ left: filtersOpen ? "18.5rem" : "1rem" }}>
        {legendOpen ? (
          <div className="rounded-md bg-white/70 px-2 py-1 text-[11px] text-neutral-600 backdrop-blur-[2px]" role="region" aria-label="Network legend">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {REGIONS.map((region) => (
                <LegendItem key={region.id} shape="circle" mark="campus" color={regionSwatch(region.id)} label={region.label} />
              ))}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
              <LegendItem shape="circle" mark="person" color="#6b7280" label="Person" />
              <LegendItem shape="square" color="#6b7280" label="Startup" />
              <LegendItem shape="diamond" color="#9ca3af" label="Investor" />
              <LegendItem shape="hex" color="#9ca3af" label="Club / lab" />
              <LegendItem shape="triangle" color="#9ca3af" label="Organization" />
              <button
                type="button"
                className="ml-auto text-[10px] font-medium text-neutral-400 underline"
                aria-expanded={true}
                onClick={() => setLegendOpen(false)}
              >
                Hide
              </button>
            </div>
            <p className="mt-0.5 text-[10px] leading-snug text-neutral-400">Size is per capita. People and startups take their campus shade. Investors and organizations stay grey.</p>
          </div>
        ) : (
          <button
            type="button"
            className="h-7 rounded border border-neutral-200 bg-white/80 px-2 text-[11px] font-medium text-neutral-600"
            aria-expanded={false}
            onClick={() => setLegendOpen(true)}
          >
            Legend
          </button>
        )}
      </div>

      {detailOpen && selectedNode && (
        <aside
          className="absolute bottom-3 right-3 top-14 z-30 flex w-[min(20rem,calc(100%-1.5rem))] flex-col overflow-hidden rounded-md border border-neutral-300 bg-white text-black shadow-sm"
          style={{ ["--link" as string]: "#111111", ["--foreground" as string]: "#111111", ["--muted" as string]: "#404040" }}
        >
          <div className="flex items-start justify-between gap-2 border-b border-black/10 px-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-600">{isUserAddedId(selectedNode.id) ? "User-added" : selectedNode.type === "organization" ? "Organization" : selectedNode.type}</p>
              <h2 className="text-base font-semibold text-black">{focus?.name ?? selectedNode.label}</h2>
              <p className="mt-0.5 text-xs text-neutral-700">
                {[
                  selectedNode.year ? `Class of ${selectedNode.year}` : null,
                  enrollCaption(selectedNode.enroll, selectedNode.enrollBasis),
                  selectedNode.orgTier ? tierBandLabel(selectedNode.orgTier) : null,
                  selectedNode.sector,
                  selectedNode.stage,
                  selectedNode.type === "organization" && selectedNode.linkedFounders != null ? `${selectedNode.linkedFounders} founders` : null,
                  selectedNode.degree ? `${selectedNode.degree} links` : null,
                  signalTooltip(selectedNode),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {personLinkedIn && (
                <div className="mt-2">
                  <LinkedInOpenButton action={personLinkedIn} name={focus?.name ?? selectedNode.label} />
                </div>
              )}
            </div>
            <button type="button" className="text-xs font-medium text-black underline" onClick={() => setSelected(null)} aria-label="Close details">
              Close
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-2">
            {isUserAddedId(selectedNode.id) ? (
              <UserAddedFocus id={selectedNode.id} />
            ) : focus && focus.id === activeId ? (
              <FocusBody focus={focus} onJump={choose} />
            ) : (
              <p className="text-sm text-neutral-600">Loading…</p>
            )}
            {(selectedNode.type === "person" || selectedNode.type === "startup") && !isUserAddedId(selectedNode.id) && (
              <div className="mt-3 border-t border-black/10 pt-2">
                <WarmIntroPaths entityId={selectedNode.id} />
              </div>
            )}
          </div>
        </aside>
      )}
    </div>
  );
}

function UserAddedFocus({ id }: { id: string }) {
  const { state } = useUserPipeline();
  const startup = state.startups.find((row) => row.id === id) ?? state.startups.find((row) => row.founders.some((founder) => founder.id === id));
  const founder = startup?.founders.find((row) => row.id === id);
  if (!startup) return <p className="text-sm">This user-added record is no longer in the pipeline.</p>;
  return (
    <div className="space-y-2 text-sm text-black">
      <p>{founder ? founder.name : startup.name}</p>
      <p className="text-xs text-neutral-700">{startup.campusName}{startup.fundingStage ? ` · ${startup.fundingStage}` : ""}</p>
      {startup.description && <p>{startup.description}</p>}
      <div className="flex flex-wrap gap-2 text-xs">
        {startup.websiteUrl && (
          <a href={startup.websiteUrl} target="_blank" rel="noopener noreferrer" className="rounded-md border border-black px-2 py-1 font-medium">
            Website
          </a>
        )}
        <a href={startup.verificationUrl} target="_blank" rel="noopener noreferrer" className="rounded-md border border-black px-2 py-1 font-medium">
          Verified by user
        </a>
        <Link href={`/startup/${startup.id}`} className="font-medium underline">
          Open record
        </Link>
      </div>
    </div>
  );
}

function personRoleOk(node: MapNode, mode: PeopleMode): boolean {
  if (mode === "founder") return node.founder;
  if (mode === "potential") return node.potential && !node.founder;
  return true;
}

function personYearOk(node: MapNode, filters: Filters): boolean {
  if (filters.yearFrom == null && filters.yearTo == null) return true;
  if (node.year == null) return false;
  if (filters.yearFrom != null && node.year < filters.yearFrom) return false;
  if (filters.yearTo != null && node.year > filters.yearTo) return false;
  return true;
}

function hiddenIds(graph: MapGraph | null, filters: Filters | null, showIsolates: boolean, drfNear: Set<string> | null): Set<string> {
  const hidden = new Set<string>();
  if (!graph || !filters) return hidden;
  const allCampuses = graph.nodes.filter((node) => node.type === "campus").map((node) => node.campus).filter((id): id is string => !!id);
  const allSectors = [...new Set(graph.nodes.map((node) => node.sector).filter((item): item is string => !!item))];
  const allTiers = [...new Set(graph.nodes.map((node) => node.tier ?? "Untiered"))];
  const allStages = [...new Set(graph.nodes.map((node) => node.stage ?? "Unknown"))];
  const campusAll = filters.campuses.length === allCampuses.length;
  const sectorAll = filters.sectors.length === allSectors.length;
  const tierAll = filters.tiers.length === allTiers.length;
  const stageAll = filters.stages.length === allStages.length;
  const enrollAll = filters.enroll.length === ENROLL.length;
  const yearActive = filters.yearFrom != null || filters.yearTo != null;
  const narrowed = filters.peopleMode !== "all" || yearActive || !sectorAll;
  const startupOk = new Set<string>();
  for (const node of graph.nodes) {
    if (node.type !== "startup") continue;
    const userNode = node.id.startsWith("user_");
    const campusHit = campusAll || campusesOf(node).some((id) => filters.campuses.includes(id));
    const sectorHit = sectorAll || (node.sector != null && filters.sectors.includes(node.sector));
    const tierHit = userNode || tierAll || filters.tiers.includes(node.tier ?? "Untiered");
    const stageHit = userNode || stageAll || filters.stages.includes(node.stage ?? "Unknown");
    if (filters.nodeTypes.includes("startup") && campusHit && sectorHit && tierHit && stageHit) startupOk.add(node.id);
  }

  const sectorPeople = new Set<string>();
  if (!sectorAll) {
    for (const edge of graph.edges) {
      if (edge.type !== "founded") continue;
      if (startupOk.has(edge.target)) sectorPeople.add(edge.source);
      if (startupOk.has(edge.source)) sectorPeople.add(edge.target);
    }
  }

  const peopleOk = new Set<string>();
  for (const node of graph.nodes) {
    if (node.type !== "person") continue;
    const userPerson = node.id.startsWith("ufounder_");
    const campusHit = campusAll || campusesOf(node).some((id) => filters.campuses.includes(id));
    const tierHit = userPerson || tierAll || filters.tiers.includes(node.tier ?? "Untiered");
    const enrollHit = enrollAll || (userPerson && node.enroll == null) || (node.enroll != null && filters.enroll.includes(node.enroll));
    const sectorHit = sectorAll || sectorPeople.has(node.id);
    if (
      filters.nodeTypes.includes("person") &&
      campusHit &&
      tierHit &&
      enrollHit &&
      personRoleOk(node, filters.peopleMode) &&
      personYearOk(node, filters) &&
      sectorHit
    ) {
      peopleOk.add(node.id);
    }
  }

  if (narrowed) {
    const linked = new Set<string>();
    for (const edge of graph.edges) {
      if (peopleOk.has(edge.source)) linked.add(edge.target);
      if (peopleOk.has(edge.target)) linked.add(edge.source);
    }
    for (const id of startupOk) if (!linked.has(id)) startupOk.delete(id);
  }

  for (const node of graph.nodes) {
    if (!showIsolates && node.degree === 0) {
      hidden.add(node.id);
      continue;
    }
    if (node.type === "person") {
      if (!peopleOk.has(node.id)) hidden.add(node.id);
      continue;
    }
    if (node.type === "startup") {
      if (!startupOk.has(node.id)) hidden.add(node.id);
      continue;
    }
    if (node.type === "campus") {
      const show = filters.nodeTypes.includes("campus") && (campusAll || filters.campuses.includes(node.id));
      if (!show) hidden.add(node.id);
      continue;
    }
    if (node.type === "program") {
      const campusHit = campusAll || campusesOf(node).some((id) => filters.campuses.includes(id));
      let show = filters.nodeTypes.includes("program") && campusHit;
      if (show && narrowed) {
        show = graph.edges.some((edge) => edge.type === "member_of" && (peopleOk.has(edge.source) || peopleOk.has(edge.target)) && (edge.source === node.id || edge.target === node.id));
      }
      if (!show) hidden.add(node.id);
      continue;
    }
    if (node.type === "organization") {
      const campuses = campusesOf(node);
      const campusHit = campuses.length === 0 ? campusAll : campusAll || campuses.some((id) => filters.campuses.includes(id));
      const topTier = node.orgTier === "S+" || node.orgTier === "S";
      const tierHit = filters.orgTier === "all" || (filters.orgTier === "1" && topTier) || (filters.orgTier === "12" && (topTier || node.orgTier === "A"));
      const sections = node.orgSections ?? [];
      const sectionAll = filters.orgSections.length === ORG_SECTIONS.length;
      const sectionHit = sectionAll || sections.some((section) => filters.orgSections.includes(section));
      let show = filters.nodeTypes.includes("organization") && campusHit && tierHit && sectionHit;
      if (show && !showIsolates && (node.linkedPeople ?? 0) === 0 && (node.linkedStartups ?? 0) === 0) show = false;
      if (show && narrowed) {
        show = graph.edges.some((edge) => edge.type === "member_of" && (edge.source === node.id || edge.target === node.id) && (peopleOk.has(edge.source) || peopleOk.has(edge.target)));
      }
      if (!show) hidden.add(node.id);
      continue;
    }
    let show = filters.nodeTypes.includes("investor");
    if (show && (!campusAll || narrowed)) {
      show = graph.edges.some((edge) => edge.type === "invested_in" && edge.source === node.id && startupOk.has(edge.target));
    }
    if (!show) hidden.add(node.id);
  }
  if (drfNear) {
    for (const node of graph.nodes) {
      if (!drfNear.has(node.id)) hidden.add(node.id);
    }
  }
  return hidden;
}

function FilterGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mt-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-600">{title}</p>
      <div className="mt-1 space-y-0.5">{children}</div>
    </div>
  );
}

function Check({
  label,
  checked,
  onChange,
  color,
  shape,
  mark,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
  color?: string;
  shape?: "circle" | "square" | "diamond" | "hex" | "triangle";
  mark?: "person" | "campus" | "node";
}) {
  return (
    <label className="flex items-center gap-2 text-xs text-black">
      <input type="checkbox" checked={checked} onChange={onChange} className="accent-black" />
      {color && shape && <LegendItem shape={shape} mark={mark} color={color} label="" />}
      <span className="truncate">{label}</span>
    </label>
  );
}

function YearField({ label, value, onChange }: { label: string; value: number | null; onChange: (year: number | null) => void }) {
  return (
    <label className="block flex-1 text-[10px] font-medium text-neutral-600">
      {label}
      <input
        type="number"
        inputMode="numeric"
        min={1980}
        max={2040}
        value={value ?? ""}
        placeholder="Any"
        aria-label={`Class year ${label.toLowerCase()}`}
        onChange={(event) => {
          const raw = event.target.value.trim();
          if (!raw) {
            onChange(null);
            return;
          }
          const year = Number(raw);
          onChange(Number.isFinite(year) ? year : null);
        }}
        className="mt-0.5 w-full rounded border border-black/20 bg-white px-2 py-1 text-xs text-black"
      />
    </label>
  );
}

function ZoomButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-label={label} onClick={onClick} className="h-7 min-w-7 border-b border-neutral-200 px-1.5 text-[11px] font-medium text-neutral-700 last:border-b-0 hover:bg-neutral-50">
      {children}
    </button>
  );
}

function LegendItem({
  shape,
  color,
  label,
  title,
  mark = "node",
}: {
  shape: "circle" | "square" | "diamond" | "hex" | "triangle";
  color: string;
  label: string;
  title?: string;
  mark?: "person" | "campus" | "node";
}) {
  const fill = { fill: color };
  return (
    <span className="inline-flex items-center gap-1" title={title}>
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
        {shape === "circle" && mark === "campus" && <circle cx="7" cy="7" r="4.2" {...fill} />}
        {shape === "circle" && mark !== "campus" && <circle cx="7" cy="7" r={mark === "person" ? 1.6 : 2.3} {...fill} />}
        {shape === "square" && <rect x="3.3" y="3.3" width="7.4" height="7.4" rx="1.35" {...fill} />}
        {shape === "diamond" && <polygon points="7,1.7 12.3,7 7,12.3 1.7,7" {...fill} />}
        {shape === "hex" && <polygon points="7,1.6 11.7,4.3 11.7,9.7 7,12.4 2.3,9.7 2.3,4.3" {...fill} />}
        {shape === "triangle" && <polygon points="7,1.8 12.2,12.2 1.8,12.2" {...fill} />}
      </svg>
      {label}
    </span>
  );
}

function uniqueLinks(items: NetworkFocus["links"][number]["items"]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.id}|${item.name}|${item.role ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function FocusBody({ focus, onJump }: { focus: NetworkFocus; onJump: (id: string) => void }) {
  return (
    <div className="space-y-3 text-sm text-black">
      {focus.subtitle && <p>{focus.subtitle}</p>}
      <div className="flex flex-wrap items-center gap-1.5">
        {focus.link && focus.link.kind !== "linkedin" && focus.link.kind !== "unverified" && <PersonLinkButton link={focus.link} name={focus.name} />}
        <ProfileIconLinks links={focus.profileLinks} name={focus.name} />
        {focus.website && (
          <a href={focus.website.url} target="_blank" rel="noopener noreferrer" className="inline-flex rounded-md border border-black px-2.5 py-1 text-xs font-medium text-black">
            {focus.website.label}
          </a>
        )}
        {focus.href && focus.hrefLabel &&
          (focus.href.startsWith("/") ? (
            <Link href={focus.href} className="text-xs font-medium text-black underline">
              {focus.hrefLabel}
            </Link>
          ) : (
            <a href={focus.href} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-black underline">
              {focus.hrefLabel}
            </a>
          ))}
        {focus.hotspotHref && focus.hotspotLabel && focus.hotspotHref !== focus.href && (
          <Link href={focus.hotspotHref} className="text-xs font-medium text-black underline">
            {focus.hotspotLabel}
          </Link>
        )}
      </div>
      {focus.facts.length > 0 && (
        <dl className="grid grid-cols-1 gap-1.5 text-xs">
          {focus.facts.map((fact) => (
            <div key={fact.label}>
              <dt className="font-semibold uppercase tracking-wide text-neutral-600">{fact.label}</dt>
              <dd className="text-black">
                {fact.value}
                {fact.sourceUrl && (
                  <a href={fact.sourceUrl} target="_blank" rel="noopener noreferrer" title={fact.excerpt ?? undefined} className="ml-1 text-[10px] underline">
                    source
                  </a>
                )}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {focus.links.map((group) => (
        <div key={group.heading}>
          <h3 className="text-[10px] font-semibold uppercase tracking-wide text-neutral-600">{group.heading}</h3>
          <ul className="mt-1 space-y-1">
            {uniqueLinks(group.items).map((item) => (
              <li key={`${group.heading}-${item.id}-${item.role ?? ""}-${item.name}`} className="flex flex-wrap items-center gap-1.5 text-xs">
                <button type="button" className="text-left font-medium text-black underline" onClick={() => onJump(item.id)}>
                  {item.name}
                </button>
                {item.linkedin && <LinkedInIconButton action={item.linkedin} name={item.name} />}
                {item.role && <span className="text-neutral-600">{item.role}</span>}
                {item.pageHref && (
                  <Link href={item.pageHref} className="text-[10px] underline">
                    card
                  </Link>
                )}
                {item.sourceUrl && (
                  <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] underline">
                    {item.sourceUrl.includes("linkedin.com") ? "LinkedIn" : "source"}
                  </a>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
