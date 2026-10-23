"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ScoutLink } from "./scout-nav";
import type { NetworkEdge, NetworkGraph, NetworkNode } from "@/lib/domain/network";
import { selectNonOverlappingLabels } from "@/lib/domain/network-layout";
import type { PersonLinkTarget } from "@/lib/domain/person-link";
import { PersonLinkButton } from "./person-link";
import { StartupCardSheet } from "./startup-directory-card";

const PERSON_LINK_KINDS = new Set(["linkedin", "likely", "unverified", "website", "github", "devpost"]);

function personTarget(node: NetworkNode | undefined): PersonLinkTarget | null {
  if (!node?.linkUrl || !node.linkKind || !PERSON_LINK_KINDS.has(node.linkKind)) return null;
  return { url: node.linkUrl, label: node.linkLabel ?? "Link", kind: node.linkKind as PersonLinkTarget["kind"] };
}

const COLOR: Record<NetworkNode["type"], string> = {
  university: "#3c3832",
  community: "#5a62e0",
  person: "#c5c9ff",
  project: "#e4c27a",
};

const CAMPUS_COLOR: Record<NetworkNode["type"], string> = {
  university: "#3c3832",
  community: "#5a62e0",
  person: "#c5c9ff",
  project: "#e4c27a",
};

function nodeRadius(type: NetworkNode["type"], degree: number): number {
  const base = type === "university" ? 14 : type === "community" ? 10 : type === "project" ? 7 : 4.5;
  return base + Math.min(7, Math.sqrt(degree) * 1.1);
}

function arcPath(radius: number, a0: number, a1: number): string {
  const x0 = Math.cos(a0) * radius;
  const y0 = Math.sin(a0) * radius;
  const x1 = Math.cos(a1) * radius;
  const y1 = Math.sin(a1) * radius;
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M ${x0} ${y0} A ${radius} ${radius} 0 ${large} 1 ${x1} ${y1}`;
}

function wedgePath(radius: number, a0: number, a1: number): string {
  const x0 = Math.cos(a0) * radius;
  const y0 = Math.sin(a0) * radius;
  const x1 = Math.cos(a1) * radius;
  const y1 = Math.sin(a1) * radius;
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M 0 0 L ${x0} ${y0} A ${radius} ${radius} 0 ${large} 1 ${x1} ${y1} Z`;
}

export function NetworkCanvas(props: {
  graph: NetworkGraph;
  basePath: string;
  current: Record<string, string | undefined>;
  campusName: string;
  /** Per-campus Discover graph: large canvas, zoom, and non-overlapping labels. */
  presentation?: "campus" | "overview";
}) {
  if (props.presentation === "campus") return <CampusNetworkCanvas {...props} />;
  return <OverviewNetworkCanvas {...props} />;
}

function OverviewNetworkCanvas({
  graph,
  campusName,
}: {
  graph: NetworkGraph;
  basePath: string;
  current: Record<string, string | undefined>;
  campusName: string;
  presentation?: "campus" | "overview";
}) {
  const [hover, setHover] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const active = selected ?? hover;
  const peopleShown = graph.nodes.filter((n) => n.type === "person").length;

  const nodeById = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n])), [graph.nodes]);
  const neighbors = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const e of graph.edges) {
      if (!map.has(e.source)) map.set(e.source, new Set());
      if (!map.has(e.target)) map.set(e.target, new Set());
      map.get(e.source)!.add(e.target);
      map.get(e.target)!.add(e.source);
    }
    return map;
  }, [graph.edges]);

  const matchIds = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return new Set(graph.nodes.filter((n) => n.label.toLowerCase().includes(q) || n.sublabel?.toLowerCase().includes(q)).map((n) => n.id));
  }, [graph.nodes, query]);

  const focus = active ? nodeById.get(active) : undefined;
  const focusEdges = active
    ? graph.edges.filter((e) => e.source === active || e.target === active)
    : [];

  function dimmed(id: string): boolean {
    if (matchIds && !matchIds.has(id)) return true;
    if (!active) return false;
    return id !== active && !neighbors.get(active)?.has(id);
  }

  function edgeDimmed(e: NetworkEdge): boolean {
    if (!active && !matchIds) return false;
    if (active) return e.source !== active && e.target !== active;
    return !(matchIds?.has(e.source) && matchIds?.has(e.target));
  }

  return (
    <div className="flex min-h-[640px] flex-col gap-3 p-3 lg:flex-row">
      <div className="relative min-w-0 flex-1">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a person or company in this graph…"
            className="w-full max-w-sm rounded-md border border-border-c bg-surface px-3 py-1.5 text-sm"
            aria-label="Search this network"
          />
          <span className="text-xs text-muted" style={{ fontVariantNumeric: "tabular-nums" }}>
            Showing {peopleShown} of {graph.totalPeople} affiliated people · {graph.nodes.length} nodes
            {graph.omittedCount > 0 ? ` · ${graph.omittedCount} left out (generic role, or past the node cap)` : ""}
          </span>
        </div>
        <svg
          viewBox="0 0 960 640"
          role="img"
          aria-label={`Network for ${campusName}`}
          className="h-auto w-full rounded-xl border border-border-c bg-white"
        >
          {graph.edges.map((e, i) => {
            const s = nodeById.get(e.source);
            const t = nodeById.get(e.target);
            if (!s || !t) return null;
            const mx = (s.x + t.x) / 2;
            const my = (s.y + t.y) / 2 - 12;
            const highlighted = selectedEdge === i || (active != null && (e.source === active || e.target === active));
            const d = `M ${s.x} ${s.y} Q ${mx} ${my} ${t.x} ${t.y}`;
            return (
              <g key={i}>
                <path
                  d={d}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={10}
                  style={{ cursor: "pointer" }}
                  onClick={(event) => {
                    event.stopPropagation();
                    setSelected(null);
                    setSelectedEdge(i);
                  }}
                >
                  <title>{e.relationshipType.replaceAll("_", " ")}</title>
                </path>
                <path
                  d={d}
                  fill="none"
                  stroke={highlighted ? "#1c1525" : edgeDimmed(e) ? "#d9d5df" : "#b8b0c4"}
                  strokeWidth={e.relationshipType === "founded" ? 1.6 : 1}
                  opacity={edgeDimmed(e) && !highlighted ? 0.35 : 0.9}
                  pointerEvents="none"
                />
              </g>
            );
          })}
          {graph.nodes.map((n) => {
            const degree = neighbors.get(n.id)?.size ?? 0;
            const r = nodeRadius(n.type, degree);
            const faded = dimmed(n.id);
            const userAdded = n.id.startsWith("user_") || n.id.startsWith("ufounder_") || n.id.startsWith("ucampus_") || n.sublabel === "User-added";
            const shape = (
              <g opacity={faded ? 0.15 : 1} style={{ transition: "opacity 160ms ease" }}>
                {userAdded ? (
                  <rect x={n.x - r} y={n.y - r} width={r * 2} height={r * 2} rx={2} fill="#ffffff" stroke="#111111" strokeWidth={2} />
                ) : n.type === "university" ? (
                  <rect x={n.x - r} y={n.y - r} width={r * 2} height={r * 2} rx={4} fill={COLOR.university} />
                ) : n.type === "community" ? (
                  <polygon
                    points={`${n.x},${n.y - r} ${n.x + r},${n.y} ${n.x},${n.y + r} ${n.x - r},${n.y}`}
                    fill={COLOR.community}
                  />
                ) : n.type === "project" ? (
                  <rect x={n.x - r} y={n.y - r} width={r * 2} height={r * 2} rx={3} fill={COLOR.project} />
                ) : (
                  <circle cx={n.x} cy={n.y} r={r} fill={COLOR.person} />
                )}
                {(n.type !== "person" || active === n.id || matchIds?.has(n.id)) && (
                  <text x={n.x} y={n.y + r + 12} textAnchor="middle" fontSize="11" fill="#1c1525" style={{ fontFamily: "Inter, Arial, sans-serif" }}>
                    {n.label.length > 22 ? n.label.slice(0, 21) + "…" : n.label}
                  </text>
                )}
              </g>
            );
            if (n.type === "project" && !n.id.startsWith("user_")) {
              return (
                <g
                  key={n.id}
                  onMouseEnter={() => setHover(n.id)}
                  onMouseLeave={() => setHover(null)}
                  onClick={() => {
                    setSelectedEdge(null);
                    setSelected(n.id === selected ? null : n.id);
                  }}
                  style={{ cursor: "pointer" }}
                >
                  <title>{n.label}</title>
                  {shape}
                </g>
              );
            }
            if (n.type === "project") {
              return (
                <ScoutLink key={n.id} href={`/startup/${n.id}`} aria-label={n.label}>
                  <g onMouseEnter={() => setHover(n.id)} onMouseLeave={() => setHover(null)}>
                    {shape}
                  </g>
                </ScoutLink>
              );
            }
            return (
              <g
                key={n.id}
                onMouseEnter={() => setHover(n.id)}
                onMouseLeave={() => setHover(null)}
                onClick={() => {
                  setSelectedEdge(null);
                  setSelected(n.id === selected ? null : n.id);
                }}
                style={{ cursor: "pointer" }}
              >
                <title>{n.sublabel ? `${n.label} — ${n.sublabel}` : n.label}</title>
                {shape}
              </g>
            );
          })}
        </svg>
        <p className="viz-legend">Color marks the kind of record. A square outline is user-added.</p>
        <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-muted">
          {graph.legend.map((l) => (
            <span key={`${l.type}-${l.label}`} className="flex items-center gap-1.5">
              {l.label === "User-added" ? (
                <span className="inline-block h-2.5 w-2.5 rounded-sm border-2 border-black bg-white" />
              ) : (
                <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: COLOR[l.type] }} />
              )}
              {l.label}
            </span>
          ))}
        </div>
        {selected && !selected.startsWith("user_") && nodeById.get(selected)?.type === "project" && (
          <StartupCardSheet id={selected} onClose={() => setSelected(null)} className="absolute inset-0 z-30 flex justify-end max-sm:fixed max-sm:z-50" />
        )}
      </div>

      <aside className="w-full shrink-0 rounded-xl border border-border-c bg-surface p-3 lg:w-80">
        {selectedEdge != null && graph.edges[selectedEdge] ? (
          <EdgeCard edge={graph.edges[selectedEdge]} nodeById={nodeById} onClose={() => setSelectedEdge(null)} />
        ) : focus ? (
          <div>
            <p className="ui-label">{focus.type}</p>
            <h2 className="text-base font-medium text-foreground">{focus.label}</h2>
            {focus.type === "project" && (
              <Link href={`/startup/${focus.id}`} className="mt-1 inline-block text-xs font-medium text-link hover:underline">
                Open company details
              </Link>
            )}
            <p className="stat-num mt-2 text-3xl">{focusEdges.length}</p>
            <p className="ui-label">connections</p>
            {focus.sublabel && <p className="text-xs text-muted">{focus.sublabel}</p>}
            {focus.type === "person" && personTarget(focus) ? (
              <div className="mt-2">
                <PersonLinkButton name={focus.label} link={personTarget(focus)} />
              </div>
            ) : focus.linkUrl ? (
              <a href={focus.linkUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex rounded-md bg-accent px-2.5 py-1 text-[11px] font-medium text-accent-foreground">
                {focus.linkKind === "official" || focus.linkLabel === "Website" ? "Visit website" : `Open ${focus.linkLabel ?? "link"}`}
              </a>
            ) : null}
            <ul className="mt-3 max-h-[420px] space-y-2 overflow-y-auto">
              {focusEdges.map((e, i) => {
                const otherId = e.source === focus.id ? e.target : e.source;
                const other = nodeById.get(otherId);
                return (
                  <li key={i} className="rounded-md border border-border-c p-2 text-xs">
                    <p className="flex flex-wrap items-center gap-1 font-medium text-foreground">
                      {other?.label ?? otherId}
                      {other?.type === "person" && personTarget(other) && <PersonLinkButton link={personTarget(other)} name={other.label} />}
                    </p>
                    <p className="text-muted">{e.relationshipType.replaceAll("_", " ")}</p>
                    {e.excerpt && <p className="mt-1 text-foreground">{e.excerpt.slice(0, 220)}</p>}
                    {e.sourceUrl && (
                      <a href={e.sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-link underline">
                        source
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : (
          <div>
            <p className="ui-label">Network</p>
            <p className="mt-1 text-sm font-medium text-foreground">{campusName}</p>
            <p className="mt-1 text-xs text-muted">
              Hover a node to highlight its neighbours. Click a line to read the sourced relationship. Node size follows how many links that record has. Click a startup to open its card.
            </p>
            <p className="mt-3 text-xs text-muted" style={{ fontVariantNumeric: "tabular-nums" }}>
              {graph.edges.length} links · {graph.nodes.length} nodes
            </p>
            <ul className="mt-3 max-h-[480px] space-y-0.5 overflow-y-auto">
              {graph.nodes
                .filter((n) => n.type === "project" || n.type === "person")
                .slice(0, 40)
                .map((n) => (
                  <li key={n.id} className="flex items-center gap-1">
                    {n.type === "project" && !n.id.startsWith("user_") ? (
                      <button type="button" onClick={() => setSelected(n.id)} className="min-w-0 flex-1 truncate rounded-md px-2 py-1 text-left text-xs font-medium text-foreground hover:bg-surface-2 hover:text-link">
                        {n.label}
                      </button>
                    ) : n.type === "project" ? (
                      <Link href={`/startup/${n.id}`} className="min-w-0 flex-1 truncate rounded-md px-2 py-1 text-left text-xs font-medium text-foreground hover:bg-surface-2 hover:text-link">
                        {n.label}
                      </Link>
                    ) : (
                      <button type="button" onClick={() => setSelected(n.id)} className="min-w-0 flex-1 truncate rounded-md px-2 py-1 text-left text-xs text-foreground hover:bg-surface-2">
                        {n.label}
                      </button>
                    )}
                    {n.type === "person" && personTarget(n) && <PersonLinkButton name={n.label} link={personTarget(n)} />}
                    {n.type === "project" && n.linkUrl && (
                      <a href={n.linkUrl} target="_blank" rel="noopener noreferrer" className="shrink-0 text-[11px] text-link underline">
                        {n.linkLabel === "Website" ? "Visit website" : n.linkLabel ?? "Open"}
                      </a>
                    )}
                  </li>
                ))}
            </ul>
          </div>
        )}
      </aside>
    </div>
  );
}

function CampusNetworkCanvas({
  graph,
  campusName,
}: {
  graph: NetworkGraph;
  basePath: string;
  current: Record<string, string | undefined>;
  campusName: string;
  presentation?: "campus" | "overview";
}) {
  const [hover, setHover] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const panRef = useRef(pan);
  const zoomRef = useRef(zoom);
  const layerRef = useRef<SVGGElement | null>(null);
  const labelWrapRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 800, h: 640 });
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const active = selected ?? hover;
  const peopleShown = graph.nodes.filter((node) => node.type === "person").length;
  const hubId = graph.nodes.find((node) => node.type === "university")?.id ?? campusName;

  const nodeById = useMemo(() => new Map(graph.nodes.map((node) => [node.id, node])), [graph.nodes]);
  const neighbors = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const edge of graph.edges) {
      if (!map.has(edge.source)) map.set(edge.source, new Set());
      if (!map.has(edge.target)) map.set(edge.target, new Set());
      map.get(edge.source)!.add(edge.target);
      map.get(edge.target)!.add(edge.source);
    }
    return map;
  }, [graph.edges]);
  const degreeOf = (id: string) => neighbors.get(id)?.size ?? 0;

  const bounds = useMemo(() => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    const grow = (x: number, y: number) => {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    };
    for (const node of graph.nodes) grow(node.x, node.y);
    for (const guide of graph.guides ?? []) {
      if (guide.kind === "arc" && guide.radius) {
        grow(-guide.radius, -guide.radius);
        grow(guide.radius, guide.radius);
      } else if (guide.kind === "rule" && guide.radius) {
        grow(0, -guide.radius);
        grow(0, guide.radius);
      } else grow(guide.x, guide.y);
    }
    if (!Number.isFinite(minX)) return { x: 0, y: 0, w: 960, h: 640 };
    const pad = 96;
    return { x: minX - pad, y: minY - pad, w: Math.max(240, maxX - minX + pad * 2), h: Math.max(240, maxY - minY + pad * 2) };
  }, [graph.nodes, graph.guides]);

  const matchIds = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return new Set(graph.nodes.filter((node) => node.label.toLowerCase().includes(q) || node.sublabel?.toLowerCase().includes(q)).map((node) => node.id));
  }, [graph.nodes, query]);

  useEffect(() => {
    panRef.current = { x: 0, y: 0 };
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setSelected(null);
    setSelectedEdge(null);
  }, [hubId]);

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth || 1, h: el.clientHeight || 1 });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    let frame = 0;
    let pending = zoomRef.current;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const factor = event.deltaY > 0 ? 0.9 : 1.12;
      const base = frame ? pending : zoomRef.current;
      pending = Math.min(5, Math.max(0.6, base * factor));
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        setZoom(pending);
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      if (frame) cancelAnimationFrame(frame);
      el.removeEventListener("wheel", onWheel);
    };
  }, []);

  const focus = active ? nodeById.get(active) : undefined;
  const focusEdges = active ? graph.edges.filter((edge) => edge.source === active || edge.target === active) : [];
  const cx = bounds.x + bounds.w / 2;
  const cy = bounds.y + bounds.h / 2;
  const fitted = useMemo(() => {
    const vbAspect = bounds.w / bounds.h;
    const elAspect = size.w / Math.max(size.h, 1);
    if (elAspect > vbAspect) {
      const renderH = size.h;
      const renderW = size.h * vbAspect;
      return { renderW, renderH, offX: (size.w - renderW) / 2, offY: 0 };
    }
    const renderW = size.w;
    const renderH = size.w / vbAspect;
    return { renderW, renderH, offX: 0, offY: (size.h - renderH) / 2 };
  }, [bounds.w, bounds.h, size.w, size.h]);
  useLayoutEffect(() => {
    zoomRef.current = zoom;
    const next = panRef.current;
    layerRef.current?.setAttribute("transform", `translate(${cx + next.x} ${cy + next.y}) scale(${zoom}) translate(${-cx} ${-cy})`);
    const wrap = labelWrapRef.current;
    if (!wrap) return;
    const dx = (next.x - pan.x) * (fitted.renderW / Math.max(bounds.w, 1));
    const dy = (next.y - pan.y) * (fitted.renderH / Math.max(bounds.h, 1));
    wrap.style.transform = dx || dy ? `translate(${dx}px, ${dy}px)` : "";
  });

  function toScreen(x: number, y: number) {
    const zx = cx + (x - cx) * zoom + pan.x;
    const zy = cy + (y - cy) * zoom + pan.y;
    return {
      x: fitted.offX + ((zx - bounds.x) / bounds.w) * fitted.renderW,
      y: fitted.offY + ((zy - bounds.y) / bounds.h) * fitted.renderH,
    };
  }

  const labelIds = useMemo(() => {
    const scale = fitted.renderW / bounds.w;
    const prefer = new Set<string>([...(matchIds ?? []), ...(active ? [active] : [])]);
    const items = graph.nodes.flatMap((node) => {
      const forced = prefer.has(node.id);
      const structural = node.type === "university" || node.type === "community";
      const projectOk = node.type === "project" && zoom >= 1.35;
      const personOk = node.type === "person" && zoom >= 1.7;
      if (!forced && !structural && !projectOk && !personOk) return [];
      const radiusPx = nodeRadius(node.type, neighbors.get(node.id)?.size ?? 0) * scale * zoom;
      const zx = cx + (node.x - cx) * zoom + pan.x;
      const zy = cy + (node.y - cy) * zoom + pan.y;
      const sx = fitted.offX + ((zx - bounds.x) / bounds.w) * fitted.renderW;
      const sy = fitted.offY + ((zy - bounds.y) / bounds.h) * fitted.renderH;
      const priority =
        (forced ? 200 : 0) + (node.type === "university" ? 100 : node.type === "community" ? 80 : node.type === "project" ? 40 : 20);
      return [{ id: node.id, text: node.label, x: sx, y: sy + radiusPx + 3, priority }];
    });
    return new Set(selectNonOverlappingLabels(items, 12));
  }, [graph.nodes, neighbors, zoom, pan.x, pan.y, bounds, cx, cy, active, matchIds, fitted]);

  function dimmed(id: string): boolean {
    if (matchIds && !matchIds.has(id)) return true;
    if (!active) return false;
    return id !== active && !neighbors.get(active)?.has(id);
  }

  function edgeDimmed(edge: NetworkEdge): boolean {
    if (!active && !matchIds) return false;
    if (active) return edge.source !== active && edge.target !== active;
    return !(matchIds?.has(edge.source) && matchIds?.has(edge.target));
  }

  function spoke(edge: NetworkEdge): boolean {
    return nodeById.get(edge.source)?.type === "university" || nodeById.get(edge.target)?.type === "university";
  }

  const sections = [
    { title: "Outside", nodes: graph.nodes.filter((node) => node.type === "community" && node.zone === "external") },
    { title: "On campus", nodes: graph.nodes.filter((node) => node.type === "community" && node.zone !== "external") },
    { title: "People", nodes: graph.nodes.filter((node) => node.type === "person") },
    { title: "Startups", nodes: graph.nodes.filter((node) => node.type === "project") },
  ];

  return (
    <div className="flex min-h-[calc(100vh-12rem)] flex-col gap-3 p-3 lg:flex-row">
      <div className="relative min-w-0 flex-1">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find a person, club, or startup…"
            className="w-full max-w-sm rounded-md border border-border-c bg-white px-3 py-1.5 text-sm text-[#141018]"
            aria-label="Search this network"
          />
          <span className="text-xs text-[#3a3348]" style={{ fontVariantNumeric: "tabular-nums" }}>
            {campusName} · {peopleShown} people · {graph.nodes.length} nodes
          </span>
          <span className="text-xs text-[#3a3348]">Drag to pan. Scroll or use the buttons to zoom.</span>
        </div>
        <div className="relative h-[min(78vh,920px)] min-h-[560px] overflow-hidden rounded-xl border border-border-c bg-white">
          <svg
            ref={svgRef}
            viewBox={`${bounds.x} ${bounds.y} ${bounds.w} ${bounds.h}`}
            role="img"
            aria-label={`Network for ${campusName}`}
            className="h-full w-full cursor-grab bg-white active:cursor-grabbing"
            style={{ touchAction: "none" }}
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              const target = event.target as Element;
              if (target.closest("[data-node]") || target.closest("[data-zoom-control]")) return;
              svgRef.current?.setPointerCapture(event.pointerId);
              dragRef.current = { x: event.clientX, y: event.clientY, panX: panRef.current.x, panY: panRef.current.y };
            }}
            onPointerMove={(event) => {
              const drag = dragRef.current;
              if (!drag || fitted.renderW < 1 || fitted.renderH < 1) return;
              const next = {
                x: drag.panX + (event.clientX - drag.x) * (bounds.w / fitted.renderW),
                y: drag.panY + (event.clientY - drag.y) * (bounds.h / fitted.renderH),
              };
              panRef.current = next;
              layerRef.current?.setAttribute(
                "transform",
                `translate(${cx + next.x} ${cy + next.y}) scale(${zoom}) translate(${-cx} ${-cy})`,
              );
              const wrap = labelWrapRef.current;
              if (wrap) {
                const dx = (next.x - pan.x) * (fitted.renderW / bounds.w);
                const dy = (next.y - pan.y) * (fitted.renderH / bounds.h);
                wrap.style.transform = `translate(${dx}px, ${dy}px)`;
              }
            }}
            onPointerUp={() => {
              if (!dragRef.current) return;
              dragRef.current = null;
              if (labelWrapRef.current) labelWrapRef.current.style.transform = "";
              setPan({ ...panRef.current });
            }}
            onPointerLeave={() => {
              if (!dragRef.current) return;
              dragRef.current = null;
              if (labelWrapRef.current) labelWrapRef.current.style.transform = "";
              setPan({ ...panRef.current });
            }}
          >
            <rect x={bounds.x} y={bounds.y} width={bounds.w} height={bounds.h} fill="#ffffff" />
            <g ref={layerRef} transform={`translate(${cx + pan.x} ${cy + pan.y}) scale(${zoom}) translate(${-cx} ${-cy})`}>
              {(graph.guides ?? []).map((guide, index) => {
                if (guide.kind !== "fill" || guide.radius == null || guide.a0 == null || guide.a1 == null) return null;
                return (
                  <path
                    key={`fill-${index}`}
                    d={wedgePath(guide.radius, guide.a0, guide.a1)}
                    fill={guide.text === "external" ? "#eef3f8" : "#f7f1ea"}
                    stroke="none"
                  />
                );
              })}
              {(graph.guides ?? []).map((guide, index) => {
                if (guide.kind === "rule" && guide.radius) {
                  return <line key={index} x1={0} y1={-guide.radius} x2={0} y2={guide.radius} stroke="#d9d3e4" strokeWidth={1.25} />;
                }
                if (guide.kind === "arc" && guide.radius != null && guide.a0 != null && guide.a1 != null) {
                  return <path key={index} d={arcPath(guide.radius, guide.a0, guide.a1)} fill="none" stroke="#d5cfdf" strokeWidth={1.25} />;
                }
                if (guide.kind === "fill" || !guide.text) return null;
                const zone = guide.kind === "zone";
                return (
                  <text
                    key={index}
                    x={guide.x}
                    y={guide.y}
                    textAnchor="middle"
                    fill={zone ? "#141018" : "#5c5470"}
                    fontSize={zone ? 15 : 11}
                    fontWeight={zone ? 700 : 600}
                    letterSpacing={zone ? "0.12em" : "0.04em"}
                    stroke="#ffffff"
                    strokeWidth={zone ? 5 : 3}
                    paintOrder="stroke"
                    style={{ fontFamily: "Inter, Arial, sans-serif" }}
                  >
                    {guide.text}
                  </text>
                );
              })}
              {graph.edges.map((edge, index) => {
                const source = nodeById.get(edge.source);
                const target = nodeById.get(edge.target);
                if (!source || !target) return null;
                const highlighted = selectedEdge === index || (active != null && (edge.source === active || edge.target === active));
                const quiet = spoke(edge) && !highlighted;
                const outside =
                  (source.type === "community" && source.zone === "external") || (target.type === "community" && target.zone === "external");
                const resting = edge.relationshipType === "founded" ? 1.35 : quiet ? 0.7 : 1;
                // Accelerator spokes on the outside half were the darkest strokes. Half width, dark gray, still visible.
                const thin = outside && !quiet && !highlighted;
                const d = `M ${source.x} ${source.y} L ${target.x} ${target.y}`;
                return (
                  <g key={index}>
                    <path
                      d={d}
                      fill="none"
                      stroke="transparent"
                      strokeWidth={12}
                      style={{ cursor: "pointer" }}
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelected(null);
                        setSelectedEdge(index);
                      }}
                    >
                      <title>{edge.relationshipType.replaceAll("_", " ")}</title>
                    </path>
                    <path
                      d={d}
                      fill="none"
                      stroke={highlighted ? "#141018" : quiet ? "#ddd8e6" : edgeDimmed(edge) ? "#e4e0ea" : thin ? "rgba(32, 34, 38, 0.62)" : "#5c5470"}
                      strokeWidth={highlighted ? 1.8 : thin ? resting / 2 : resting}
                      opacity={edgeDimmed(edge) && !highlighted ? 0.35 : 1}
                      pointerEvents="none"
                    />
                  </g>
                );
              })}
              {graph.nodes.map((node) => {
                const radius = nodeRadius(node.type, degreeOf(node.id));
                const faded = dimmed(node.id);
                const userAdded = node.id.startsWith("user_") || node.id.startsWith("ufounder_") || node.id.startsWith("ucampus_") || node.sublabel === "User-added";
                const shape = (
                  <g data-node="" opacity={faded ? 0.12 : 1}>
                    {userAdded ? (
                      <rect x={node.x - radius} y={node.y - radius} width={radius * 2} height={radius * 2} rx={2} fill="#ffffff" stroke="#111111" strokeWidth={2} />
                    ) : node.type === "university" ? (
                      <rect x={node.x - radius} y={node.y - radius} width={radius * 2} height={radius * 2} rx={4} fill={CAMPUS_COLOR.university} />
                    ) : node.type === "community" ? (
                      <polygon
                        points={`${node.x},${node.y - radius} ${node.x + radius},${node.y} ${node.x},${node.y + radius} ${node.x - radius},${node.y}`}
                        fill={CAMPUS_COLOR.community}
                      />
                    ) : node.type === "project" ? (
                      <rect x={node.x - radius} y={node.y - radius} width={radius * 2} height={radius * 2} rx={3} fill={CAMPUS_COLOR.project} stroke="#1a1228" strokeWidth={0.6} />
                    ) : (
                      <circle cx={node.x} cy={node.y} r={radius} fill={CAMPUS_COLOR.person} />
                    )}
                  </g>
                );
                if (node.type === "project" && !node.id.startsWith("user_")) {
                  return (
                    <g
                      key={node.id}
                      data-node=""
                      onMouseEnter={() => setHover(node.id)}
                      onMouseLeave={() => setHover(null)}
                      onClick={() => {
                        setSelectedEdge(null);
                        setSelected(node.id === selected ? null : node.id);
                      }}
                      style={{ cursor: "pointer" }}
                    >
                      <title>{node.label}</title>
                      {shape}
                    </g>
                  );
                }
                if (node.type === "project") {
                  return (
                    <ScoutLink key={node.id} href={`/startup/${node.id}`} aria-label={node.label}>
                      <g data-node="" onMouseEnter={() => setHover(node.id)} onMouseLeave={() => setHover(null)}>
                        {shape}
                      </g>
                    </ScoutLink>
                  );
                }
                return (
                  <g
                    key={node.id}
                    data-node=""
                    onMouseEnter={() => setHover(node.id)}
                    onMouseLeave={() => setHover(null)}
                    onClick={() => {
                      setSelectedEdge(null);
                      setSelected(node.id === selected ? null : node.id);
                    }}
                    style={{ cursor: "pointer" }}
                  >
                    <title>{node.sublabel ? `${node.label} — ${node.sublabel}` : node.label}</title>
                    {shape}
                  </g>
                );
              })}
            </g>
          </svg>
          <div ref={labelWrapRef} className="pointer-events-none absolute inset-0 overflow-hidden">
            {graph.nodes.map((node) => {
              if (!labelIds.has(node.id)) return null;
              const radius = nodeRadius(node.type, degreeOf(node.id));
              const point = toScreen(node.x, node.y);
              const radiusPx = radius * (fitted.renderW / bounds.w) * zoom;
              const text = node.label.length > 28 ? node.label.slice(0, 27) + "…" : node.label;
              return (
                <span
                  key={node.id}
                  className="absolute -translate-x-1/2 whitespace-nowrap font-medium text-[#141018]"
                  style={{ left: point.x, top: point.y + radiusPx + 3, fontSize: 12, lineHeight: "14px" }}
                >
                  {text}
                </span>
              );
            })}
          </div>
          <div data-zoom-control="" className="absolute right-3 top-3 flex flex-col overflow-hidden rounded-md border border-[#1c1525] bg-white shadow-sm">
            <button type="button" aria-label="Zoom in" className="h-8 w-8 text-base font-semibold text-[#141018] hover:bg-[#f3f0f8]" onClick={() => setZoom((current) => Math.min(5, current * 1.25))}>
              +
            </button>
            <button type="button" aria-label="Zoom out" className="h-8 w-8 border-t border-[#1c1525] text-base font-semibold text-[#141018] hover:bg-[#f3f0f8]" onClick={() => setZoom((current) => Math.max(0.6, current / 1.25))}>
              −
            </button>
            <button
              type="button"
              aria-label="Reset pan and zoom"
              className="h-8 w-8 border-t border-[#1c1525] text-[10px] font-semibold uppercase tracking-wide text-[#141018] hover:bg-[#f3f0f8]"
              onClick={() => {
                panRef.current = { x: 0, y: 0 };
                setZoom(1);
                setPan({ x: 0, y: 0 });
              }}
            >
              Fit
            </button>
          </div>
          {selected && !selected.startsWith("user_") && nodeById.get(selected)?.type === "project" && (
            <StartupCardSheet id={selected} onClose={() => setSelected(null)} />
          )}
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[#3a3348]">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: CAMPUS_COLOR.university }} />
            Campus
          </span>
          <span>Left, OUTSIDE — accelerators, fellowships, and funds</span>
          <span>Right, ON CAMPUS — clubs, hackathons, centers, and labs</span>
          <span>Bands — S+ and S closest to campus, then A, B, C, D. A sourcing label, not a Founder Signal.</span>
        </div>
      </div>

      <aside className="w-full shrink-0 rounded-xl border border-border-c bg-white p-3 lg:w-80">
        {selectedEdge != null && graph.edges[selectedEdge] ? (
          <EdgeCard edge={graph.edges[selectedEdge]} nodeById={nodeById} onClose={() => setSelectedEdge(null)} />
        ) : focus ? (
          <div>
            <p className="ui-label">{focus.type === "community" ? "Club / program" : focus.type}</p>
            <h2 className="text-base font-medium text-[#141018]">{focus.label}</h2>
            {focus.type === "project" && (
              <Link href={`/startup/${focus.id}`} className="mt-1 inline-block text-xs font-medium text-link hover:underline">
                Open company details
              </Link>
            )}
            <p className="stat-num mt-2 text-3xl">{focusEdges.length}</p>
            <p className="ui-label">connections</p>
            {focus.sublabel && <p className="text-xs text-[#3a3348]">{focus.sublabel}</p>}
            {focus.type === "person" && personTarget(focus) ? (
              <div className="mt-2">
                <PersonLinkButton name={focus.label} link={personTarget(focus)} />
              </div>
            ) : focus.linkUrl ? (
              <a href={focus.linkUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex rounded-md bg-accent px-2.5 py-1 text-[11px] font-medium text-accent-foreground">
                {focus.linkKind === "official" || focus.linkLabel === "Website" ? "Visit website" : `Open ${focus.linkLabel ?? "link"}`}
              </a>
            ) : null}
            <ul className="mt-3 max-h-[420px] space-y-2 overflow-y-auto">
              {focusEdges.map((edge, index) => {
                const otherId = edge.source === focus.id ? edge.target : edge.source;
                const other = nodeById.get(otherId);
                return (
                  <li key={index} className="rounded-md border border-border-c bg-white p-2 text-xs">
                    <p className="flex flex-wrap items-center gap-1 font-medium text-[#141018]">
                      {other?.label ?? otherId}
                      {other?.type === "person" && personTarget(other) && <PersonLinkButton link={personTarget(other)} name={other.label} />}
                    </p>
                    <p className="text-[#3a3348]">{edge.relationshipType.replaceAll("_", " ")}</p>
                    {edge.excerpt && <p className="mt-1 text-[#141018]">{edge.excerpt.slice(0, 220)}</p>}
                    {edge.sourceUrl && (
                      <a href={edge.sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-link underline">
                        source
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : (
          <div>
            <p className="ui-label">Network</p>
            <p className="mt-1 text-sm font-medium text-[#141018]">{campusName}</p>
            <p className="mt-1 text-xs text-[#3a3348]">
              Outside programs are on the left. On-campus orgs are on the right. Each side is banded by tier, closest to the campus first. People and startups sit further out with their group. Zoom in to read every name.
            </p>
            <div className="mt-3 max-h-[560px] space-y-3 overflow-y-auto">
              {sections.map((section) => (
                <div key={section.title}>
                  <p className="ui-label">{section.title}</p>
                  <ul className="mt-1 space-y-0.5">
                    {[...section.nodes]
                      .sort((a, b) => a.label.localeCompare(b.label))
                      .map((node) => (
                        <li key={node.id} className="flex items-center gap-1">
                          {node.type === "project" && !node.id.startsWith("user_") ? (
                            <button type="button" onClick={() => setSelected(node.id)} className="min-w-0 flex-1 truncate rounded-md px-2 py-1 text-left text-xs font-medium text-[#141018] hover:bg-[#f3f0f8] hover:text-link">
                              {node.label}
                            </button>
                          ) : node.type === "project" ? (
                            <Link href={`/startup/${node.id}`} className="min-w-0 flex-1 truncate rounded-md px-2 py-1 text-left text-xs font-medium text-[#141018] hover:bg-[#f3f0f8] hover:text-link">
                              {node.label}
                            </Link>
                          ) : (
                            <button type="button" onClick={() => setSelected(node.id)} className="min-w-0 flex-1 truncate rounded-md px-2 py-1 text-left text-xs text-[#141018] hover:bg-[#f3f0f8]">
                              {node.label}
                            </button>
                          )}
                          {node.type === "person" && personTarget(node) && <PersonLinkButton name={node.label} link={personTarget(node)} />}
                          {node.type === "project" && node.linkUrl && (
                            <a href={node.linkUrl} target="_blank" rel="noopener noreferrer" className="shrink-0 text-[11px] text-link underline">
                              {node.linkLabel === "Website" ? "Visit website" : node.linkLabel ?? "Open"}
                            </a>
                          )}
                        </li>
                      ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}

function EdgeCard({
  edge,
  nodeById,
  onClose,
}: {
  edge: NetworkEdge;
  nodeById: Map<string, NetworkNode>;
  onClose: () => void;
}) {
  const source = nodeById.get(edge.source);
  const target = nodeById.get(edge.target);
  return (
    <div>
      <div className="flex items-start gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">Relationship</p>
        <button type="button" onClick={onClose} className="ml-auto text-[11px] text-muted hover:text-foreground" aria-label="Close relationship">
          ✕
        </button>
      </div>
      <h2 className="mt-1 text-sm font-medium text-foreground">
        {source?.label ?? edge.source}
        <span className="text-muted"> → </span>
        {target?.label ?? edge.target}
      </h2>
      <p className="mt-1 text-xs text-muted">{edge.relationshipType.replaceAll("_", " ")}</p>
      {edge.excerpt ? (
        <p className="mt-3 text-xs leading-relaxed text-foreground">{edge.excerpt.slice(0, 480)}</p>
      ) : (
        <p className="mt-3 text-xs text-muted">No excerpt is stored on this link.</p>
      )}
      {edge.sourceUrl && (
        <a href={edge.sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-xs text-link underline">
          Open source
        </a>
      )}
    </div>
  );
}
