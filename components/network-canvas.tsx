"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ScoutLink } from "./scout-nav";
import type { NetworkEdge, NetworkGraph, NetworkNode } from "@/lib/domain/network";
import { selectNonOverlappingLabels } from "@/lib/domain/network-layout";
import type { PersonLinkTarget } from "@/lib/domain/person-link";
import { PersonLinkButton } from "./person-link";

const PERSON_LINK_KINDS = new Set(["linkedin", "likely", "unverified", "website", "github", "devpost"]);

function personTarget(node: NetworkNode | undefined): PersonLinkTarget | null {
  if (!node?.linkUrl || !node.linkKind || !PERSON_LINK_KINDS.has(node.linkKind)) return null;
  return { url: node.linkUrl, label: node.linkLabel ?? "Link", kind: node.linkKind as PersonLinkTarget["kind"] };
}

const COLOR: Record<NetworkNode["type"], string> = {
  university: "#9378ee",
  community: "#6f5ab2",
  person: "#5c516e",
  project: "#5840a0",
};

const CAMPUS_COLOR: Record<NetworkNode["type"], string> = {
  university: "#1a1228",
  community: "#3d2a78",
  person: "#241c33",
  project: "#4c3294",
};

function nodeRadius(type: NetworkNode["type"], degree: number): number {
  const base = type === "university" ? 14 : type === "community" ? 10 : type === "project" ? 7 : 4.5;
  return base + Math.min(7, Math.sqrt(degree) * 1.1);
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
                  <text x={n.x} y={n.y + r + 12} textAnchor="middle" fontSize="11" fill="#1c1525" style={{ fontFamily: "Satoshi, Arial, sans-serif" }}>
                    {n.label.length > 22 ? n.label.slice(0, 21) + "…" : n.label}
                  </text>
                )}
              </g>
            );
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
              Hover a node to highlight its neighbours. Click a line to read the sourced relationship. Node size follows how many links that record has. Click a company to open it.
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
                    {n.type === "project" ? (
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
    for (const node of graph.nodes) {
      minX = Math.min(minX, node.x);
      minY = Math.min(minY, node.y);
      maxX = Math.max(maxX, node.x);
      maxY = Math.max(maxY, node.y);
    }
    if (!Number.isFinite(minX)) return { x: 0, y: 0, w: 960, h: 640 };
    const pad = 96;
    return { x: minX - pad, y: minY - pad, w: Math.max(240, maxX - minX + pad * 2), h: Math.max(240, maxY - minY + pad * 2) };
  }, [graph.nodes]);

  const matchIds = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return new Set(graph.nodes.filter((node) => node.label.toLowerCase().includes(q) || node.sublabel?.toLowerCase().includes(q)).map((node) => node.id));
  }, [graph.nodes, query]);

  useEffect(() => {
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
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const factor = event.deltaY > 0 ? 0.9 : 1.12;
      setZoom((current) => Math.min(5, Math.max(0.6, current * factor)));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
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

  const orbit = useMemo(() => {
    const hub = graph.nodes.find((node) => node.type === "university");
    const communities = graph.nodes.filter((node) => node.type === "community");
    if (!hub || communities.length === 0) return null;
    const radius = communities.reduce((sum, node) => sum + Math.hypot(node.x - hub.x, node.y - hub.y), 0) / communities.length;
    return { cx: hub.x, cy: hub.y, r: radius };
  }, [graph.nodes]);

  const sections = [
    { title: "Clubs and programs", nodes: graph.nodes.filter((node) => node.type === "community") },
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
              dragRef.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y };
            }}
            onPointerMove={(event) => {
              const drag = dragRef.current;
              if (!drag) return;
              setPan({
                x: drag.panX + (event.clientX - drag.x) * (bounds.w / fitted.renderW),
                y: drag.panY + (event.clientY - drag.y) * (bounds.h / fitted.renderH),
              });
            }}
            onPointerUp={() => {
              dragRef.current = null;
            }}
            onPointerLeave={() => {
              dragRef.current = null;
            }}
          >
            <rect x={bounds.x} y={bounds.y} width={bounds.w} height={bounds.h} fill="#ffffff" />
            <g transform={`translate(${cx + pan.x} ${cy + pan.y}) scale(${zoom}) translate(${-cx} ${-cy})`}>
              {orbit && <circle cx={orbit.cx} cy={orbit.cy} r={orbit.r} fill="none" stroke="#e4e0ee" strokeWidth={1.25} />}
              {graph.edges.map((edge, index) => {
                const source = nodeById.get(edge.source);
                const target = nodeById.get(edge.target);
                if (!source || !target) return null;
                const mx = (source.x + target.x) / 2;
                const my = (source.y + target.y) / 2 - 18;
                const highlighted = selectedEdge === index || (active != null && (edge.source === active || edge.target === active));
                const quiet = spoke(edge) && !highlighted;
                const d = `M ${source.x} ${source.y} Q ${mx} ${my} ${target.x} ${target.y}`;
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
                      stroke={highlighted ? "#141018" : quiet ? "#ddd8e6" : edgeDimmed(edge) ? "#e4e0ea" : "#5c5470"}
                      strokeWidth={highlighted ? 1.8 : edge.relationshipType === "founded" ? 1.35 : quiet ? 0.7 : 1}
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
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
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
                setZoom(1);
                setPan({ x: 0, y: 0 });
              }}
            >
              Fit
            </button>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-[#3a3348]">
          {graph.legend.map((item) => (
            <span key={`${item.type}-${item.label}`} className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: CAMPUS_COLOR[item.type] }} />
              {item.label}
            </span>
          ))}
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
              Clubs and programs ring the campus. People and startups sit with the group they belong to. Zoom in to read every name.
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
                          {node.type === "project" ? (
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
