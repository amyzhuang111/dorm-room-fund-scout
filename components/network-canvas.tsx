"use client";

import { useMemo, useState } from "react";
import { buildHref } from "@/lib/domain/url";
import type { NetworkEdge, NetworkGraph, NetworkNode } from "@/lib/domain/network";

const COLOR: Record<NetworkNode["type"], string> = {
  university: "#ff7a3c",
  community: "#7eb6ff",
  person: "#d5d0c6",
  project: "#f0c14a",
};

function nodeRadius(type: NetworkNode["type"], degree: number): number {
  const base = type === "university" ? 14 : type === "community" ? 10 : type === "project" ? 7 : 4.5;
  return base + Math.min(7, Math.sqrt(degree) * 1.1);
}

export function NetworkCanvas({
  graph,
  basePath,
  current,
  campusName,
}: {
  graph: NetworkGraph;
  basePath: string;
  current: Record<string, string | undefined>;
  campusName: string;
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
          className="h-auto w-full rounded-xl border border-border-c bg-[radial-gradient(circle_at_50%_42%,#1a1e28,#07080c_72%)]"
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
                  stroke={highlighted ? "#ff7a3c" : edgeDimmed(e) ? "#2a2e38" : "#5c6370"}
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
            const shape = (
              <g opacity={faded ? 0.15 : 1} style={{ transition: "opacity 160ms ease" }}>
                {n.type === "university" ? (
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
                  <text x={n.x} y={n.y + r + 12} textAnchor="middle" fontSize="11" fill="#e7e2d8">
                    {n.label.length > 22 ? n.label.slice(0, 21) + "…" : n.label}
                  </text>
                )}
              </g>
            );
            if (n.type === "project") {
              return (
                <a key={n.id} href={buildHref(basePath, current, { project: n.id })} aria-label={n.label}>
                  <g onMouseEnter={() => setHover(n.id)} onMouseLeave={() => setHover(null)}>
                    {shape}
                  </g>
                </a>
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
            <span key={l.type} className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: COLOR[l.type] }} />
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
            <p className="stat-num mt-2 text-3xl">{focusEdges.length}</p>
            <p className="ui-label">connections</p>
            {focus.sublabel && <p className="text-xs text-muted">{focus.sublabel}</p>}
            {focus.linkUrl && (
              <a href={focus.linkUrl} target="_blank" rel="noopener noreferrer" className="link-chip mt-2">
                {focus.linkLabel ?? "Link"}
              </a>
            )}
            <ul className="mt-3 max-h-[420px] space-y-2 overflow-y-auto">
              {focusEdges.map((e, i) => {
                const otherId = e.source === focus.id ? e.target : e.source;
                const other = nodeById.get(otherId);
                return (
                  <li key={i} className="rounded-md border border-border-c p-2 text-xs">
                    <p className="font-medium text-foreground">{other?.label ?? otherId}</p>
                    <p className="text-muted">{e.relationshipType.replaceAll("_", " ")}</p>
                    {e.excerpt && <p className="mt-1 text-foreground">{e.excerpt.slice(0, 220)}</p>}
                    {e.sourceUrl && (
                      <a href={e.sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-accent underline">
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
                  <li key={n.id}>
                    <button type="button" onClick={() => setSelected(n.id)} className="block w-full truncate rounded-md px-2 py-1 text-left text-xs text-foreground hover:bg-surface-2">
                      {n.label}
                    </button>
                  </li>
                ))}
            </ul>
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
        <a href={edge.sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-xs text-accent underline">
          Open source
        </a>
      )}
    </div>
  );
}
