"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { MapEdgeType, MapGraph, MapNode, MapNodeType } from "@/lib/domain/network-map";
import type { NetworkFocus } from "@/lib/domain/network-focus";
import { NetworkMapCanvas } from "./network-map-canvas";
import { PersonLinkButton, ProfileIconLinks } from "./person-link";

const NODE_TYPES: { id: MapNodeType; label: string }[] = [
  { id: "person", label: "People" },
  { id: "startup", label: "Startups" },
  { id: "campus", label: "Campuses" },
  { id: "investor", label: "Investors" },
  { id: "program", label: "Clubs and labs" },
];

const EDGE_TYPES: { id: MapEdgeType; label: string }[] = [
  { id: "founded", label: "Founded" },
  { id: "co_founder", label: "Co-founder" },
  { id: "studied_at", label: "Studied at" },
  { id: "invested_in", label: "Invested in" },
  { id: "member_of", label: "Member of" },
  { id: "at_campus", label: "At campus" },
];

const ENROLL: { id: string; label: string }[] = [
  { id: "current_student", label: "Current students" },
  { id: "recent_grad", label: "Recent grads" },
  { id: "older_alumni", label: "Alumni" },
  { id: "unknown", label: "Unknown" },
];

interface Filters {
  campuses: string[];
  sectors: string[];
  tiers: string[];
  stages: string[];
  enroll: string[];
  nodeTypes: MapNodeType[];
  edgeTypes: MapEdgeType[];
  potentialOnly: boolean;
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
  const [error, setError] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [filters, setFilters] = useState<Filters | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [fly, setFly] = useState<{ id: string; token: number }>({ id: "", token: 0 });
  const [focus, setFocus] = useState<NetworkFocus | null>(null);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
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
        setFilters({
          campuses,
          sectors,
          tiers,
          stages,
          enroll: ENROLL.map((item) => item.id),
          nodeTypes: NODE_TYPES.map((item) => item.id),
          edgeTypes: EDGE_TYPES.map((item) => item.id),
          potentialOnly: false,
        });
      })
      .catch(() => {
        if (!cancel) setError("The map could not be loaded.");
      });
    return () => {
      cancel = true;
    };
  }, []);

  useEffect(() => {
    if (!selected) {
      setFocus(null);
      return;
    }
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

  const hidden = useMemo(() => hiddenIds(graph, filters), [graph, filters]);
  const edgeTypes = useMemo(() => new Set(filters?.edgeTypes ?? []), [filters]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!graph || q.length < 2) return [];
    return graph.nodes.filter((node) => !hidden.has(node.id) && node.label.toLowerCase().includes(q)).slice(0, 8);
  }, [graph, query, hidden]);

  const visibleCounts = useMemo(() => {
    const counts = { person: 0, startup: 0, campus: 0, investor: 0, program: 0 };
    if (!graph) return counts;
    for (const node of graph.nodes) {
      if (!hidden.has(node.id)) counts[node.type] += 1;
    }
    return counts;
  }, [graph, hidden]);

  function choose(id: string) {
    setSelected(id);
    setFly((prev) => ({ id, token: prev.token + 1 }));
    setQuery("");
  }

  const selectedNode = graph?.nodes.find((node) => node.id === selected) ?? null;

  return (
    <div className="fixed inset-x-0 top-14 bottom-0 z-20 bg-white">
      {graph && filters ? (
        <NetworkMapCanvas
          graph={graph}
          hidden={hidden}
          edgeTypes={edgeTypes}
          selected={selected}
          flyToken={fly.token}
          flyId={fly.id || null}
          onSelect={(id) => {
            setSelected(id);
            if (id) setFly((prev) => ({ id, token: prev.token }));
          }}
        />
      ) : (
        <p className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-sm text-muted">{error ?? "Laying out the map…"}</p>
      )}

      <div className="pointer-events-none absolute inset-y-3 left-3 z-30 flex items-start gap-2">
        <button
          type="button"
          className="pointer-events-auto rounded-md border border-border-c bg-white px-2.5 py-1.5 text-xs font-medium text-foreground shadow-sm"
          aria-expanded={filtersOpen}
          onClick={() => setFiltersOpen((open) => !open)}
        >
          {filtersOpen ? "Hide filters" : "Filters"}
        </button>
        {filtersOpen && filters && graph && (
          <aside className="pointer-events-auto max-h-[calc(100%-0.5rem)] w-64 overflow-y-auto rounded-xl border border-border-c bg-white/95 p-3 shadow-sm">
            <p className="text-[11px] text-muted" style={{ fontVariantNumeric: "tabular-nums" }}>
              {visibleCounts.person.toLocaleString()} people · {visibleCounts.startup.toLocaleString()} startups · {visibleCounts.investor} investors · {visibleCounts.program} programs
            </p>
            <FilterGroup title="Node type">
              {NODE_TYPES.map((item) => (
                <Check key={item.id} label={item.label} checked={filters.nodeTypes.includes(item.id)} onChange={() => setFilters({ ...filters, nodeTypes: toggle(filters.nodeTypes, item.id) })} />
              ))}
            </FilterGroup>
            <FilterGroup title="Edges">
              {EDGE_TYPES.map((item) => (
                <Check key={item.id} label={item.label} checked={filters.edgeTypes.includes(item.id)} onChange={() => setFilters({ ...filters, edgeTypes: toggle(filters.edgeTypes, item.id) })} />
              ))}
            </FilterGroup>
            <FilterGroup title="Campus">
              {graph.nodes
                .filter((node) => node.type === "campus")
                .map((node) => (
                  <Check
                    key={node.id}
                    label={node.label}
                    checked={filters.campuses.includes(node.campus ?? "")}
                    onChange={() => setFilters({ ...filters, campuses: toggle(filters.campuses, node.campus ?? "") })}
                  />
                ))}
            </FilterGroup>
            <FilterGroup title="Sector">
              {[...new Set(graph.nodes.map((node) => node.sector).filter((item): item is string => !!item))].sort().map((sector) => (
                <Check key={sector} label={sector} checked={filters.sectors.includes(sector)} onChange={() => setFilters({ ...filters, sectors: toggle(filters.sectors, sector) })} />
              ))}
            </FilterGroup>
            <FilterGroup title="Signal tier">
              {[...new Set(graph.nodes.map((node) => node.tier ?? "Untiered"))].sort().map((tier) => (
                <Check key={tier} label={tier} checked={filters.tiers.includes(tier)} onChange={() => setFilters({ ...filters, tiers: toggle(filters.tiers, tier) })} />
              ))}
            </FilterGroup>
            <FilterGroup title="Stage">
              {[...new Set(graph.nodes.map((node) => node.stage ?? "Unknown"))].sort().map((stage) => (
                <Check key={stage} label={stage} checked={filters.stages.includes(stage)} onChange={() => setFilters({ ...filters, stages: toggle(filters.stages, stage) })} />
              ))}
            </FilterGroup>
            <FilterGroup title="Enrollment">
              {ENROLL.map((item) => (
                <Check key={item.id} label={item.label} checked={filters.enroll.includes(item.id)} onChange={() => setFilters({ ...filters, enroll: toggle(filters.enroll, item.id) })} />
              ))}
              <Check label="Potential founders only" checked={filters.potentialOnly} onChange={() => setFilters({ ...filters, potentialOnly: !filters.potentialOnly })} />
            </FilterGroup>
          </aside>
        )}
      </div>

      <div className="absolute left-1/2 top-3 z-30 w-72 -translate-x-1/2">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search people, startups, investors…"
          aria-label="Search the network"
          className="w-full rounded-md border border-border-c bg-white px-3 py-1.5 text-sm shadow-sm"
        />
        {matches.length > 0 && (
          <ul className="mt-1 max-h-64 overflow-y-auto rounded-md border border-border-c bg-white shadow-sm">
            {matches.map((node) => (
              <li key={node.id}>
                <button type="button" className="flex w-full items-baseline justify-between gap-2 px-3 py-1.5 text-left text-sm hover:bg-surface" onClick={() => choose(node.id)}>
                  <span className="truncate text-foreground">{node.label}</span>
                  <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted">{node.type}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 flex-wrap gap-2 rounded-md border border-border-c bg-white/95 px-2.5 py-1.5 text-[10px] text-muted shadow-sm">
        <Legend swatch="circle" color="#5c516e" label="Person" />
        <Legend swatch="square" color="#5840a0" label="Startup" />
        <Legend swatch="campus" color="#9378ee" label="Campus" />
        <Legend swatch="diamond" color="#2a2148" label="Investor" />
        <Legend swatch="hex" color="#7d68c9" label="Club / lab" />
      </div>

      {selectedNode && (
        <aside className="absolute bottom-3 right-3 top-16 z-30 flex w-80 flex-col overflow-hidden rounded-xl border border-border-c bg-white shadow-sm">
          <div className="flex items-start justify-between gap-2 border-b border-border-c px-3 py-2">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">{selectedNode.type}</p>
              <h2 className="text-base font-semibold text-foreground">{focus?.name ?? selectedNode.label}</h2>
            </div>
            <button type="button" className="text-xs text-muted hover:text-foreground" onClick={() => setSelected(null)} aria-label="Close details">
              Close
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-2">
            {focus && focus.id === selected ? <FocusBody focus={focus} onJump={choose} /> : <p className="text-sm text-muted">Loading…</p>}
          </div>
        </aside>
      )}
    </div>
  );
}

function hiddenIds(graph: MapGraph | null, filters: Filters | null): Set<string> {
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
  const startupOk = new Set<string>();
  for (const node of graph.nodes) {
    if (node.type !== "startup") continue;
    const campusHit = campusAll || campusesOf(node).some((id) => filters.campuses.includes(id));
    const sectorHit = sectorAll || (node.sector != null && filters.sectors.includes(node.sector));
    const tierHit = tierAll || filters.tiers.includes(node.tier ?? "Untiered");
    const stageHit = stageAll || filters.stages.includes(node.stage ?? "Unknown");
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
    const campusHit = campusAll || campusesOf(node).some((id) => filters.campuses.includes(id));
    const tierHit = tierAll || filters.tiers.includes(node.tier ?? "Untiered");
    const enrollHit = enrollAll || filters.enroll.includes(node.enroll ?? "unknown");
    const potentialHit = !filters.potentialOnly || node.potential;
    const sectorHit = sectorAll || sectorPeople.has(node.id);
    if (filters.nodeTypes.includes("person") && campusHit && tierHit && enrollHit && potentialHit && sectorHit) peopleOk.add(node.id);
  }

  if (filters.potentialOnly || !sectorAll) {
    const linked = new Set<string>();
    for (const edge of graph.edges) {
      if (peopleOk.has(edge.source)) linked.add(edge.target);
      if (peopleOk.has(edge.target)) linked.add(edge.source);
    }
    for (const id of startupOk) if (!linked.has(id)) startupOk.delete(id);
  }

  for (const node of graph.nodes) {
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
      if (show && (filters.potentialOnly || !sectorAll)) {
        show = graph.edges.some((edge) => edge.type === "member_of" && (peopleOk.has(edge.source) || peopleOk.has(edge.target)) && (edge.source === node.id || edge.target === node.id));
      }
      if (!show) hidden.add(node.id);
      continue;
    }
    let show = filters.nodeTypes.includes("investor");
    if (show && !campusAll) {
      show = graph.edges.some((edge) => edge.type === "invested_in" && edge.source === node.id && startupOk.has(edge.target));
    }
    if (show && filters.potentialOnly) {
      show = graph.edges.some((edge) => edge.type === "invested_in" && edge.source === node.id && startupOk.has(edge.target));
    }
    if (!show) hidden.add(node.id);
  }
  return hidden;
}

function FilterGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details open className="mt-3">
      <summary className="cursor-pointer text-[10px] font-semibold uppercase tracking-wide text-muted">{title}</summary>
      <div className="mt-1 space-y-0.5">{children}</div>
    </details>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <label className="flex items-center gap-2 text-xs text-foreground">
      <input type="checkbox" checked={checked} onChange={onChange} className="accent-[#9378ee]" />
      <span className="truncate">{label}</span>
    </label>
  );
}

function Legend({ swatch, color, label }: { swatch: "circle" | "square" | "campus" | "diamond" | "hex"; color: string; label: string }) {
  const shape =
    swatch === "circle" ? "rounded-full" : swatch === "diamond" ? "rotate-45 rounded-[1px]" : swatch === "hex" ? "rounded-sm" : "rounded-[2px]";
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`inline-block h-2.5 w-2.5 ${shape}`} style={{ background: color }} />
      {label}
    </span>
  );
}

function FocusBody({ focus, onJump }: { focus: NetworkFocus; onJump: (id: string) => void }) {
  return (
    <div className="space-y-3 text-sm">
      {focus.subtitle && <p className="text-foreground">{focus.subtitle}</p>}
      <div className="flex flex-wrap items-center gap-1.5">
        {focus.link && <PersonLinkButton link={focus.link} name={focus.name} />}
        <ProfileIconLinks links={focus.profileLinks} name={focus.name} />
        {focus.website && (
          <a href={focus.website.url} target="_blank" rel="noopener noreferrer" className="inline-flex rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-accent-foreground">
            {focus.website.label}
          </a>
        )}
        {focus.href && focus.hrefLabel && (
          focus.href.startsWith("/") ? (
            <Link href={focus.href} className="text-xs font-medium text-link hover:underline">
              {focus.hrefLabel}
            </Link>
          ) : (
            <a href={focus.href} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-link hover:underline">
              {focus.hrefLabel}
            </a>
          )
        )}
        {focus.hotspotHref && focus.hotspotLabel && focus.hotspotHref !== focus.href && (
          <Link href={focus.hotspotHref} className="text-xs font-medium text-link hover:underline">
            {focus.hotspotLabel}
          </Link>
        )}
      </div>
      {focus.facts.length > 0 && (
        <dl className="grid grid-cols-1 gap-1.5 text-xs">
          {focus.facts.map((fact) => (
            <div key={fact.label}>
              <dt className="font-semibold uppercase tracking-wide text-muted">{fact.label}</dt>
              <dd className="text-foreground">
                {fact.value}
                {fact.sourceUrl && (
                  <a href={fact.sourceUrl} target="_blank" rel="noopener noreferrer" title={fact.excerpt ?? undefined} className="ml-1 text-[10px] text-link hover:underline">
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
          <h3 className="text-[10px] font-semibold uppercase tracking-wide text-muted">{group.heading}</h3>
          <ul className="mt-1 space-y-1">
            {group.items.map((item) => (
              <li key={`${group.heading}-${item.id}-${item.name}`} className="flex flex-wrap items-center gap-1.5 text-xs">
                <button type="button" className="text-left font-medium text-link hover:underline" onClick={() => onJump(item.id)}>
                  {item.name}
                </button>
                {item.role && <span className="text-muted">{item.role}</span>}
                {item.pageHref && (
                  <Link href={item.pageHref} className="text-[10px] text-link hover:underline">
                    card
                  </Link>
                )}
                {item.sourceUrl && (
                  <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] text-link hover:underline">
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
