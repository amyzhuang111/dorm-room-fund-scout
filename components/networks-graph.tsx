"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { GraphEdge, GraphNode, GraphPayload, NetworkKind } from "@/lib/domain/founder-networks-model";

const KIND_COLOR: Record<NetworkKind, string> = {
  accelerator: "#3c42d4",
  program: "#5b6bb8",
  lab: "#6a7a9a",
  investor: "#8a7ab0",
};

function loadGraph(): Promise<GraphPayload> {
  return fetch("/data/founder-networks-graph.json").then((res) => {
    if (!res.ok) throw new Error("graph missing");
    return res.json();
  });
}

export function NetworksGraph({
  onSelectCompany,
  onSelectNetwork,
}: {
  onSelectCompany: (id: string) => void;
  onSelectNetwork: (id: string) => void;
}) {
  const [graph, setGraph] = useState<GraphPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hover, setHover] = useState<{ id: string; label: string; ties: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 720, h: 420 });

  useEffect(() => {
    let cancelled = false;
    loadGraph()
      .then((payload) => {
        if (!cancelled) setGraph(payload);
      })
      .catch(() => {
        if (!cancelled) setError("Graph data could not be loaded.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      setSize({ w: Math.max(320, Math.floor(rect.width)), h: Math.max(320, Math.floor(rect.height)) });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const degree = useMemo(() => {
    const map = new Map<string, number>();
    if (!graph) return map;
    for (const edge of graph.edges) {
      map.set(edge.source, (map.get(edge.source) ?? 0) + 1);
      map.set(edge.target, (map.get(edge.target) ?? 0) + 1);
    }
    return map;
  }, [graph]);

  const projected = useMemo(() => {
    if (!graph) return [] as (GraphNode & { px: number; py: number })[];
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const node of graph.nodes) {
      minX = Math.min(minX, node.x);
      maxX = Math.max(maxX, node.x);
      minY = Math.min(minY, node.y);
      maxY = Math.max(maxY, node.y);
    }
    const pad = 28;
    const spanX = Math.max(1, maxX - minX);
    const spanY = Math.max(1, maxY - minY);
    return graph.nodes.map((node) => ({
      ...node,
      px: pad + ((node.x - minX) / spanX) * (size.w - pad * 2),
      py: pad + ((node.y - minY) / spanY) * (size.h - pad * 2),
    }));
  }, [graph, size]);

  const byId = useMemo(() => new Map(projected.map((node) => [node.id, node])), [projected]);

  if (error) {
    return <p className="px-4 py-8 text-sm text-[color:var(--fg-2)]">{error}</p>;
  }
  if (!graph) {
    return <p className="px-4 py-8 text-sm text-[color:var(--fg-2)]">Loading network graph…</p>;
  }

  return (
    <div ref={wrapRef} className="relative h-[420px] w-full touch-manipulation bg-white md:h-[520px]" data-networks-graph="">
      <svg width={size.w} height={size.h} className="absolute inset-0 h-full w-full" role="img" aria-label="Founder networks graph">
        {graph.edges.map((edge: GraphEdge, index) => {
          const a = byId.get(edge.source);
          const b = byId.get(edge.target);
          if (!a || !b) return null;
          const cofounder = edge.type === "cofounder";
          return (
            <line
              key={`${edge.source}-${edge.target}-${index}`}
              x1={a.px}
              y1={a.py}
              x2={b.px}
              y2={b.py}
              stroke={cofounder ? "#c4b8d8" : "#d7dced"}
              strokeWidth={cofounder ? 1.2 : 0.8}
              opacity={0.85}
            />
          );
        })}
        {projected.map((node) => {
          const fill = node.type === "network" ? KIND_COLOR[(node.kind as NetworkKind) || "program"] : "#1c2438";
          return (
            <g key={node.id}>
              <circle
                cx={node.px}
                cy={node.py}
                r={node.size}
                fill={fill}
                opacity={node.type === "network" ? 0.92 : 0.72}
                className="cursor-pointer"
                role="button"
                tabIndex={0}
                aria-label={node.label}
                onMouseEnter={() => setHover({ id: node.id, label: node.label, ties: degree.get(node.id) ?? 0 })}
                onMouseLeave={() => setHover(null)}
                onClick={() => {
                  if (node.companyId) onSelectCompany(node.companyId);
                  else if (node.networkId) onSelectNetwork(node.networkId);
                }}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.preventDefault();
                  if (node.companyId) onSelectCompany(node.companyId);
                  else if (node.networkId) onSelectNetwork(node.networkId);
                }}
                onTouchEnd={(event) => {
                  event.preventDefault();
                  if (node.companyId) onSelectCompany(node.companyId);
                  else if (node.networkId) onSelectNetwork(node.networkId);
                }}
              />
              {node.type === "network" ? (
                <text
                  x={node.px}
                  y={node.py + node.size + 11}
                  textAnchor="middle"
                  className="pointer-events-none select-none fill-[color:var(--fg)] text-[10px] font-medium"
                >
                  {node.label.length > 22 ? `${node.label.slice(0, 20)}…` : node.label}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
      {hover ? (
        <div className="pointer-events-none absolute left-3 top-3 rounded border border-[color:var(--line)] bg-white px-2.5 py-1.5 text-xs text-[color:var(--fg)] shadow-sm">
          <div className="font-medium">{hover.label}</div>
          <div className="text-[color:var(--fg-2)]">{hover.ties.toLocaleString("en-US")} ties</div>
        </div>
      ) : null}
      <div className="absolute bottom-3 left-3 right-3 flex flex-wrap items-center gap-3 rounded border border-[color:var(--line)] bg-white/95 px-3 py-2 text-[11px] text-[color:var(--fg-2)]">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#3c42d4]" /> Accelerator
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#5b6bb8]" /> Program
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#6a7a9a]" /> Lab
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#8a7ab0]" /> Investor
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full bg-[#1c2438]" /> Company
        </span>
        <span className="ml-auto">
          {graph.edgeCounts.network_tie.toLocaleString("en-US")} network ties · {graph.edgeCounts.cofounder.toLocaleString("en-US")} co-founder links
        </span>
      </div>
    </div>
  );
}
