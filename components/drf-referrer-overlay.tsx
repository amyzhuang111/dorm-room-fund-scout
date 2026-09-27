"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { NetworkSigmaHandle } from "./network-sigma";

interface ReferrerLink {
  startupId: string;
  startupName: string;
  founderIds: string[];
  campusId: string | null;
  strength: "strong" | "medium" | "weak";
  reason: string;
}

interface ReferrerAlum {
  id: string;
  name: string;
  role: string | null;
  firm: string | null;
  campusId: string | null;
  links: ReferrerLink[];
}

interface Payload {
  alumni: ReferrerAlum[];
}

interface Point {
  x: number;
  y: number;
}

interface DrawNode {
  id: string;
  name: string;
  role: string | null;
  firm: string | null;
  x: number;
  y: number;
  startupCount: number;
  reasons: { reason: string; startups: string[] }[];
  more: number;
}

interface DrawEdge {
  key: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

interface DrawRing {
  key: string;
  x: number;
  y: number;
}

interface DrawBadge {
  key: string;
  x: number;
  y: number;
}

const REST_CAP = 4;
const REASON_CAP = 6;
const PER_RING = 14;

function spin(id: string): number {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967296;
}

function reasonsOf(links: ReferrerLink[]): { reasons: { reason: string; startups: string[] }[]; more: number } {
  const groups = new Map<string, string[]>();
  for (const link of links) {
    const names = groups.get(link.reason) ?? [];
    if (!names.includes(link.startupName)) names.push(link.startupName);
    groups.set(link.reason, names);
  }
  const reasons = [...groups.entries()].slice(0, REASON_CAP).map(([reason, startups]) => ({ reason, startups }));
  return { reasons, more: Math.max(0, groups.size - reasons.length) };
}

function layoutReferrers(
  alumni: ReferrerAlum[],
  pointOf: (id: string) => Point | null,
  hidden: Set<string>,
  hovered: string | null
): { nodes: DrawNode[]; edges: DrawEdge[]; rings: DrawRing[]; badges: DrawBadge[] } {
  const visible = (id: string | null): Point | null => {
    if (!id || hidden.has(id)) return null;
    return pointOf(id);
  };
  const nodes: DrawNode[] = [];
  const edges: DrawEdge[] = [];
  const rings: DrawRing[] = [];
  const badges: DrawBadge[] = [];
  const groups = new Map<string, { alum: ReferrerAlum; links: ReferrerLink[] }[]>();
  const loose: { alum: ReferrerAlum; links: ReferrerLink[] }[] = [];

  for (const alum of alumni) {
    const links = alum.links.filter((link) => visible(link.startupId));
    if (links.length === 0) continue;
    const campus = alum.campusId ? visible(alum.campusId) : null;
    const row = { alum, links };
    if (campus && alum.campusId) {
      const list = groups.get(alum.campusId) ?? [];
      list.push(row);
      groups.set(alum.campusId, list);
    } else loose.push(row);
  }

  const place = (alum: ReferrerAlum, links: ReferrerLink[], at: Point, showBadge: boolean) => {
    const hot = hovered === alum.id;
    const drawn = hot ? links : links.slice(0, REST_CAP);
    const seen = new Set<string>();
    const addEdge = (target: string | null, kind: string) => {
      if (!target || seen.has(target)) return;
      const point = visible(target);
      if (!point) return;
      seen.add(target);
      edges.push({ key: `${alum.id}|${kind}|${target}`, x1: at.x, y1: at.y, x2: point.x, y2: point.y });
      if (hot && kind === "startup") rings.push({ key: `${alum.id}|${target}`, x: point.x, y: point.y });
    };
    for (const link of drawn) {
      addEdge(link.startupId, "startup");
      addEdge(link.campusId, "campus");
      for (const founderId of link.founderIds) addEdge(founderId, "founder");
    }
    const summary = reasonsOf(hot ? links : drawn);
    nodes.push({
      id: alum.id,
      name: alum.name,
      role: alum.role,
      firm: alum.firm,
      x: at.x,
      y: at.y,
      startupCount: links.length,
      reasons: summary.reasons,
      more: summary.more,
    });
    if (showBadge || hot) badges.push({ key: alum.id, x: at.x + 7, y: at.y - 14 });
  };

  for (const [campusId, rows] of groups) {
    const center = visible(campusId);
    if (!center) continue;
    rows.sort((a, b) => a.alum.name.localeCompare(b.alum.name));
    const markEach = rows.length <= 8;
    rows.forEach((row, index) => {
      const ring = Math.floor(index / PER_RING);
      const slot = index % PER_RING;
      const count = Math.min(PER_RING, rows.length - ring * PER_RING);
      const angle = -Math.PI / 2 + (slot / count) * Math.PI * 2;
      const radius = 36 + ring * 18;
      place(row.alum, row.links, { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius }, markEach);
    });
    if (!markEach) {
      const top = rows.reduce((best, row, index) => {
        const ring = Math.floor(index / PER_RING);
        const slot = index % PER_RING;
        const count = Math.min(PER_RING, rows.length - ring * PER_RING);
        const angle = -Math.PI / 2 + (slot / count) * Math.PI * 2;
        const y = center.y + Math.sin(angle) * (36 + ring * 18);
        return y < best.y ? { y, x: center.x + Math.cos(angle) * (36 + ring * 18) } : best;
      }, { x: center.x, y: center.y });
      badges.push({ key: `group|${campusId}`, x: top.x - 11, y: top.y - 20 });
    }
  }

  for (const row of loose) {
    const points = row.links.map((link) => visible(link.startupId)).filter((point): point is Point => !!point);
    if (points.length === 0) continue;
    const cx = points.reduce((sum, point) => sum + point.x, 0) / points.length;
    const cy = points.reduce((sum, point) => sum + point.y, 0) / points.length;
    const angle = spin(row.alum.id) * Math.PI * 2;
    const dist = 22 + spin(row.alum.id + "|") * 28;
    place(row.alum, row.links, { x: cx + Math.cos(angle) * dist, y: cy + Math.sin(angle) * dist }, true);
  }

  return { nodes, edges, rings, badges };
}

function pointIds(payload: Payload): string[] {
  const ids = new Set<string>();
  for (const alum of payload.alumni) {
    if (alum.campusId) ids.add(alum.campusId);
    for (const link of alum.links) {
      ids.add(link.startupId);
      if (link.campusId) ids.add(link.campusId);
      for (const founderId of link.founderIds) ids.add(founderId);
    }
  }
  return [...ids];
}

export function DrfReferrerOverlay({
  apiRef,
  hidden,
  mapReady,
  enabled,
  includeWeak,
}: {
  apiRef: RefObject<NetworkSigmaHandle | null>;
  hidden: Set<string>;
  mapReady: boolean;
  enabled: boolean;
  includeWeak: boolean;
}) {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [loadedWeak, setLoadedWeak] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [points, setPoints] = useState<Map<string, Point>>(() => new Map());
  const [bounds, setBounds] = useState({ w: 0, h: 0 });
  const rootRef = useRef<HTMLDivElement | null>(null);
  const clearTimer = useRef(0);
  const cache = useRef<{ warm: Payload | null; all: Payload | null }>({ warm: null, all: null });

  if (!enabled && hover !== null) setHover(null);

  useEffect(() => {
    if (!enabled) return;
    const key = includeWeak ? "all" : "warm";
    const cached = cache.current[key];
    if (cached) {
      setPayload(cached);
      setLoadedWeak(key === "all");
      setError(null);
      return;
    }
    let cancel = false;
    fetch(`/api/drf/referrer-map?weak=${includeWeak ? "1" : "0"}`)
      .then((res) => {
        if (!res.ok) throw new Error("referrers failed");
        return res.json() as Promise<Payload>;
      })
      .then((data) => {
        if (cancel) return;
        cache.current[key] = data;
        setPayload(data);
        setLoadedWeak(includeWeak);
        setError(null);
      })
      .catch(() => {
        if (!cancel) setError("Referrers could not be loaded.");
      });
    return () => {
      cancel = true;
    };
  }, [enabled, includeWeak]);

  useEffect(() => {
    if (!enabled || !mapReady || !payload) return;
    const api = apiRef.current;
    if (!api) return;
    const ids = pointIds(payload);
    const read = () => {
      const next = new Map<string, Point>();
      for (const id of ids) {
        const at = api.pointOf(id);
        if (at) next.set(id, at);
      }
      setPoints(next);
    };
    const unsubscribe = api.subscribe(read);
    return () => unsubscribe();
  }, [enabled, mapReady, payload, apiRef]);

  useEffect(() => {
    const el = rootRef.current;
    if (!el || !enabled) return;
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (!box) return;
      setBounds({ w: box.width, h: box.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [enabled]);

  const scene = useMemo(() => {
    if (!enabled || !payload || points.size === 0) return null;
    const alumni = includeWeak && !loadedWeak ? payload.alumni.map((alum) => ({ ...alum, links: alum.links.filter((link) => link.strength !== "weak") })) : payload.alumni;
    return layoutReferrers(alumni, (id) => points.get(id) ?? null, hidden, hover);
  }, [enabled, payload, points, includeWeak, loadedWeak, hidden, hover]);

  if (!enabled) return null;

  const hovered = scene?.nodes.find((node) => node.id === hover) ?? null;
  const hot = hovered != null;
  const width = 280;
  let tipLeft = hovered ? hovered.x + 16 : 0;
  let tipTop = hovered ? hovered.y - 8 : 0;
  if (hovered && bounds.w > 0) {
    if (tipLeft + width > bounds.w - 8) tipLeft = Math.max(8, hovered.x - width - 14);
    if (tipTop > bounds.h - 168) tipTop = Math.max(8, bounds.h - 168);
  }

  const firm = hovered ? [hovered.role, hovered.firm].filter(Boolean).join(", ") : "";

  return (
    <div ref={rootRef} className="pointer-events-none absolute inset-0 z-10">
      {error && <p className="absolute bottom-28 left-4 text-[11px] text-black">{error}</p>}
      {scene && (
        <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
          {scene.edges.map((edge) => (
            <line
              pointerEvents="none"
              key={edge.key}
              x1={edge.x1}
              y1={edge.y1}
              x2={edge.x2}
              y2={edge.y2}
              stroke="#111111"
              strokeWidth={hot && edge.key.startsWith(`${hover}|`) ? 1.2 : 0.7}
              strokeOpacity={hot ? (edge.key.startsWith(`${hover}|`) ? 0.8 : 0.05) : 0.18}
              strokeDasharray="2.5 3"
            />
          ))}
          {scene.rings.map((ring) => (
            <circle key={ring.key} cx={ring.x} cy={ring.y} r={8} fill="none" stroke="#111111" strokeWidth={1.6} pointerEvents="none" />
          ))}
          {scene.nodes.map((node) => {
            const active = node.id === hover;
            const badge = scene.badges.find((item) => item.key === node.id);
            const enter = () => {
              window.clearTimeout(clearTimer.current);
              setHover(node.id);
            };
            const leave = () => {
              clearTimer.current = window.setTimeout(() => setHover((current) => (current === node.id ? null : current)), 160);
            };
            return (
              <g key={node.id} pointerEvents="auto" className="cursor-pointer" onMouseEnter={enter} onMouseLeave={leave}>
                <circle cx={node.x} cy={node.y} r={9} fill="transparent" pointerEvents="all" aria-label={`${node.name}, DRF alum referrer`} />
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={active ? 6.5 : 5}
                  fill="#111111"
                  fillOpacity={active ? 1 : hot ? 0.28 : 0.62}
                  stroke="#ffffff"
                  strokeWidth={1.5}
                  pointerEvents="none"
                />
                {badge && (
                  <g transform={`translate(${badge.x} ${badge.y})`} pointerEvents="all">
                    <rect width="22" height="11" rx="2" fill="#111111" />
                    <text x="11" y="8.2" textAnchor="middle" fill="#ffffff" fontSize="7" fontWeight="700" fontFamily="Satoshi, Arial, sans-serif">
                      DRF
                    </text>
                  </g>
                )}
              </g>
            );
          })}
          {scene.badges
            .filter((badge) => badge.key.startsWith("group|"))
            .map((badge) => (
              <g key={badge.key} transform={`translate(${badge.x} ${badge.y})`} pointerEvents="none">
                <rect width="22" height="11" rx="2" fill="#111111" fillOpacity={0.92} />
                <text x="11" y="8.2" textAnchor="middle" fill="#ffffff" fontSize="7" fontWeight="700" fontFamily="Satoshi, Arial, sans-serif">
                  DRF
                </text>
              </g>
            ))}
        </svg>
      )}
      {hovered && (
        <div
          role="tooltip"
          className="pointer-events-auto absolute z-10 w-[17.5rem] rounded-md border border-neutral-300 bg-white px-2.5 py-2 text-black shadow-md"
          style={{ left: tipLeft, top: tipTop }}
          onMouseEnter={() => window.clearTimeout(clearTimer.current)}
          onMouseLeave={() => setHover(null)}
        >
          <p className="text-[13px] font-semibold leading-tight">{hovered.name}</p>
          <p className="text-[11px] text-neutral-600">{firm ? `DRF alum · ${firm}` : "DRF alum"}</p>
          <p className="mt-1 text-[11px] tabular-nums text-neutral-800">
            {hovered.startupCount.toLocaleString()} {hovered.startupCount === 1 ? "startup" : "startups"} on this map
          </p>
          <ul className="mt-1 space-y-1">
            {hovered.reasons.map((row) => {
              const sample = row.startups.slice(0, 2).join(", ");
              const extra = row.startups.length > 2 ? ` +${row.startups.length - 2}` : "";
              return (
                <li key={row.reason} className="text-[11px] leading-snug text-neutral-800">
                  {row.reason} — {sample}
                  {extra}
                </li>
              );
            })}
          </ul>
          {hovered.more > 0 && <p className="mt-1 text-[11px] text-neutral-500">+{hovered.more} more reasons</p>}
        </div>
      )}
    </div>
  );
}
